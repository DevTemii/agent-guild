"use client";

import { useEffect, useMemo, useState } from "react";
import { useActiveAccount, useReadContract } from "thirdweb/react";
import {
    defineChain,
    getContract,
    prepareContractCall,
    sendTransaction,
} from "thirdweb";
import { client } from "@/lib/client";
import {
    FREELANCE_ESCROW_ABI,
    FREELANCE_ESCROW_ADDRESS,
} from "@/lib/contract";
import {
    getReputationForWallet,
    setReputationForWallet,
} from "@/lib/reputationStore";

const ESCROW_STORAGE_KEY = "agent-guild-active-escrow";
const CONTRACT_STORAGE_KEY = "agent-guild-contract";

const celoSepolia = defineChain({
    id: 11142220,
    name: "Celo Sepolia",
    rpc: "https://forno.celo-sepolia.celo-testnet.org",
    nativeCurrency: {
        name: "CELO",
        symbol: "CELO",
        decimals: 18,
    },
});

type EscrowStatus = "idle" | "created" | "funded" | "submitted" | "released";

function toWeiFromCelo(value: string) {
    const num = Number(value);
    if (!num || num <= 0) return BigInt(0);
    return BigInt(Math.floor(num * 1e18));
}

export default function EscrowSimulator() {
    const account = useActiveAccount();
    const connectedAddress = account?.address?.toLowerCase();

    const [clientName, setClientName] = useState("");
    const [freelancerName, setFreelancerName] = useState("");
    const [freelancerAddress, setFreelancerAddress] = useState("");
    const [budget, setBudget] = useState("");
    const [projectId, setProjectId] = useState<number | null>(null);
    const [status, setStatus] = useState("");
    const [escrowState, setEscrowState] = useState<EscrowStatus>("idle");
    const [busy, setBusy] = useState(false);

    const escrowContract = useMemo(() => {
        return getContract({
            client,
            chain: celoSepolia,
            address: FREELANCE_ESCROW_ADDRESS,
            abi: FREELANCE_ESCROW_ABI as any,
        });
    }, []);

    useEffect(() => {
        const saved = localStorage.getItem(ESCROW_STORAGE_KEY);
        if (!saved) return;

        try {
            const data = JSON.parse(saved);
            setProjectId(data.projectId ?? null);
            setClientName(data.clientName ?? "");
            setFreelancerName(data.freelancerName ?? "");
            setFreelancerAddress(data.freelancerAddress ?? "");
            setBudget(data.budget ?? "");
        } catch (err) {
            console.error("Failed to restore escrow state", err);
        }
    }, []);

    const { data: projectCountData, refetch: refetchProjectCount } = useReadContract({
        contract: escrowContract,
        method: "function projectCount() view returns (uint256)",
        params: [],
    });

    const { data: projectData, refetch: refetchProjectData } = useReadContract({
        contract: escrowContract,
        method:
            "function getProject(uint256 _projectId) view returns (address client, address freelancer, uint256 amount, uint8 status)",
        params: projectId !== null ? [BigInt(projectId)] : [BigInt(0)],
        queryOptions: {
            enabled: projectId !== null,
        },
    });

    const onchainClient =
        projectData ? String((projectData as any)[0]).toLowerCase() : "";
    const onchainFreelancer =
        projectData ? String((projectData as any)[1]).toLowerCase() : "";

    const isClient = !!connectedAddress && connectedAddress === onchainClient;
    const isFreelancer =
        !!connectedAddress && connectedAddress === onchainFreelancer;

    useEffect(() => {
        if (!projectData) return;

        const statusCode = Number((projectData as any)[3]);

        if (statusCode === 0) setEscrowState("created");
        if (statusCode === 1) setEscrowState("funded");
        if (statusCode === 2) setEscrowState("submitted");
        if (statusCode === 3) setEscrowState("released");
    }, [projectData]);

    async function createEscrowProject() {
        if (!account) {
            setStatus("Connect your wallet first.");
            return;
        }

        if (!clientName || !freelancerName || !freelancerAddress || !budget) {
            setStatus("Fill client name, freelancer name, freelancer wallet, and budget.");
            return;
        }

        try {
            setBusy(true);
            setStatus("Creating real escrow project onchain...");

            const tx = prepareContractCall({
                contract: escrowContract,
                method: "function createProject(address _freelancer) returns (uint256)",
                params: [freelancerAddress as `0x${string}`],
            });

            await sendTransaction({
                transaction: tx,
                account,
            });

            const latest = await refetchProjectCount();
            const latestCount = Number(latest?.data ?? projectCountData ?? BigInt(0));

            setProjectId(latestCount);
            setEscrowState("created");

            localStorage.removeItem(CONTRACT_STORAGE_KEY);
            localStorage.setItem(
                ESCROW_STORAGE_KEY,
                JSON.stringify({
                    projectId: latestCount,
                    clientName,
                    freelancerName,
                    freelancerAddress,
                    budget,
                })
            );

            setStatus(`Escrow project created onchain. Project ID: ${latestCount}`);
        } catch (error) {
            console.error(error);
            setStatus("Failed to create escrow project.");
        } finally {
            setBusy(false);
        }
    }

    async function depositFunds() {
        if (!account) {
            setStatus("Connect your wallet first.");
            return;
        }

        if (projectId === null) {
            setStatus("Create escrow project first.");
            return;
        }

        try {
            setBusy(true);
            setStatus("Depositing CELO into escrow...");

            const tx = prepareContractCall({
                contract: escrowContract,
                method: "function deposit(uint256 _projectId)",
                params: [BigInt(projectId)],
                value: toWeiFromCelo(budget),
            });

            await sendTransaction({
                transaction: tx,
                account,
            });

            await refetchProjectData();
            setEscrowState("funded");
            setStatus("Escrow funded successfully.");
        } catch (error) {
            console.error(error);
            setStatus("Deposit failed.");
        } finally {
            setBusy(false);
        }
    }

    async function submitWork() {
        if (!account) {
            setStatus("Connect your wallet first.");
            return;
        }

        if (projectId === null) {
            setStatus("Create escrow project first.");
            return;
        }

        try {
            setBusy(true);
            setStatus("Submitting work to escrow contract...");

            const tx = prepareContractCall({
                contract: escrowContract,
                method: "function submitWork(uint256 _projectId)",
                params: [BigInt(projectId)],
            });

            await sendTransaction({
                transaction: tx,
                account,
            });

            await refetchProjectData();
            setEscrowState("submitted");
            setStatus("Work submitted successfully.");
        } catch (error) {
            console.error(error);
            setStatus("Submit work failed.");
        } finally {
            setBusy(false);
        }
    }

    async function approveAndRelease() {
        if (!account) {
            setStatus("Connect your wallet first.");
            return;
        }

        if (projectId === null) {
            setStatus("Create escrow project first.");
            return;
        }

        try {
            setBusy(true);
            setStatus("Approving milestone and releasing payment...");

            const tx = prepareContractCall({
                contract: escrowContract,
                method: "function approveAndRelease(uint256 _projectId)",
                params: [BigInt(projectId)],
            });

            await sendTransaction({
                transaction: tx,
                account,
            });

            await refetchProjectData();
            setEscrowState("released");
            setStatus("Payment released onchain.");

            const previous = getReputationForWallet(freelancerAddress);
            const completedContracts = previous.completedContracts + 1;
            const guildScore = Math.min(completedContracts * 10, 100);
            const totalEarned = previous.totalEarned + Number(budget);
            const creditUnlocked = completedContracts >= 3;
            const creditAmount = creditUnlocked ? 200 : 0;

            setReputationForWallet(freelancerAddress, {
                completedContracts,
                guildScore,
                totalEarned,
                creditUnlocked,
                creditAmount,
            });

            localStorage.removeItem(ESCROW_STORAGE_KEY);
        } catch (error) {
            console.error(error);
            setStatus("Approve and release failed.");
        } finally {
            setBusy(false);
        }
    }

    function stateLabel() {
        if (escrowState === "idle") return "No project";
        if (escrowState === "created") return "Created";
        if (escrowState === "funded") return "Funded";
        if (escrowState === "submitted") return "Work Submitted";
        if (escrowState === "released") return "Released";
        return "Unknown";
    }

    function helperText() {
        if (escrowState === "idle") {
            return "Create a new escrow project to begin the workflow.";
        }
        if (escrowState === "created") {
            return "Escrow created. Client should fund the project.";
        }
        if (escrowState === "funded") {
            return "Escrow funded. Freelancer can now submit work.";
        }
        if (escrowState === "submitted") {
            return "Work submitted. Client can now review and release payment.";
        }
        if (escrowState === "released") {
            return "Payment released successfully.";
        }
        return "";
    }
    function getNotifications() {
        const items: string[] = [];

        if (escrowState === "created") {
            items.push("Escrow created. Client should fund the project.");
        }

        if (escrowState === "funded") {
            items.push("Escrow funded. Freelancer can now submit work.");
        }

        if (escrowState === "submitted") {
            items.push("Work submitted. Client can now review and release payment.");
        }

        if (escrowState === "released") {
            items.push("Payment released successfully.");
        }

        return items;
    }

    const notifications = getNotifications();
    return (

        <section className="rounded-[16px] border border-[#1f1f1f] bg-[#111111] p-6">
            <div className="mb-6">
                <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#38bdf8]">
                    Real escrow
                </div>
                <div className="rounded-[12px] border border-[#1f1f1f] bg-[#111111] p-4">
                    <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                        Notifications
                    </div>

                    <div className="mt-3 space-y-3">
                        {notifications.length === 0 ? (
                            <div className="text-[14px] text-[#9ca3af]">
                                No active notifications yet.
                            </div>
                        ) : (
                            notifications.map((note, index) => (
                                <div
                                    key={index}
                                    className="rounded-[10px] border border-[#1f1f1f] bg-[#0b0b0b] px-3 py-3 text-[14px] text-[#d1d5db]"
                                >
                                    {note}
                                </div>
                            ))
                        )}
                    </div>
                </div>
                <h2 className="mt-3 text-[26px] font-semibold tracking-[-0.02em] sm:text-[30px]">
                    Onchain escrow flow
                </h2>
                <p className="mt-3 text-[15px] leading-7 text-[#9ca3af]">
                    Create a real escrow project, deposit CELO, submit work, and release funds on Celo Sepolia.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="grid gap-3">
                    <input
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        placeholder="Client name"
                        className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#38bdf8]"
                    />

                    <input
                        value={freelancerName}
                        onChange={(e) => setFreelancerName(e.target.value)}
                        placeholder="Freelancer profile name"
                        className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#38bdf8]"
                    />

                    <input
                        value={freelancerAddress}
                        onChange={(e) => setFreelancerAddress(e.target.value)}
                        placeholder="Freelancer wallet address"
                        className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#38bdf8]"
                    />

                    <input
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        placeholder="Budget in CELO e.g 0.01"
                        className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#38bdf8]"
                    />

                    <div className="flex flex-col gap-3 pt-2">
                        {projectId === null && (
                            <button
                                onClick={createEscrowProject}
                                disabled={busy}
                                className="rounded-[10px] bg-[#38bdf8] px-5 py-3 text-sm font-semibold text-black transition hover:bg-[#0ea5e9] disabled:opacity-60"
                            >
                                {busy ? "Processing..." : "Create Onchain Escrow"}
                            </button>
                        )}

                        {projectId !== null && escrowState === "created" && isClient && (
                            <button
                                onClick={depositFunds}
                                disabled={busy}
                                className="rounded-[10px] border border-[#2c2c2c] px-5 py-3 text-sm font-semibold text-[#f8fafc] transition hover:border-[#3a3a3a] disabled:opacity-50"
                            >
                                Deposit Funds
                            </button>
                        )}

                        {projectId !== null && escrowState === "funded" && isFreelancer && (
                            <button
                                onClick={submitWork}
                                disabled={busy}
                                className="rounded-[10px] border border-[#2c2c2c] px-5 py-3 text-sm font-semibold text-[#f8fafc] transition hover:border-[#3a3a3a] disabled:opacity-50"
                            >
                                Submit Work
                            </button>
                        )}

                        {projectId !== null && escrowState === "submitted" && isClient && (
                            <button
                                onClick={approveAndRelease}
                                disabled={busy}
                                className="rounded-[10px] border border-[#2c2c2c] px-5 py-3 text-sm font-semibold text-[#f8fafc] transition hover:border-[#3a3a3a] disabled:opacity-50"
                            >
                                Approve & Release
                            </button>
                        )}
                    </div>

                    {(status || helperText()) && (
                        <div className="rounded-[12px] border border-[#1f1f1f] bg-[#0b0b0b] px-4 py-3 text-sm text-[#d1d5db]">
                            {status || helperText()}
                        </div>
                    )}
                </div>

                <div className="rounded-[16px] border border-[#1f1f1f] bg-[#0b0b0b] p-5">
                    <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                        Escrow state
                    </div>

                    <div className="mt-4 grid gap-4">
                        <div className="rounded-[12px] border border-[#1f1f1f] bg-[#111111] p-4">
                            <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                                Project ID
                            </div>
                            <div className="mt-2 text-[15px] font-semibold">
                                {projectId ?? "Not created yet"}
                            </div>
                        </div>

                        <div className="rounded-[12px] border border-[#1f1f1f] bg-[#111111] p-4">
                            <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                                Status
                            </div>
                            <div className="mt-2 text-[15px] font-semibold">{stateLabel()}</div>
                        </div>

                        <div className="rounded-[12px] border border-[#1f1f1f] bg-[#111111] p-4">
                            <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                                Current role
                            </div>
                            <div className="mt-2 text-[14px] text-[#d1d5db]">
                                {!connectedAddress && "Connect wallet"}
                                {connectedAddress && isClient && "Client"}
                                {connectedAddress && isFreelancer && "Freelancer"}
                                {connectedAddress && !isClient && !isFreelancer && "Viewer"}
                            </div>
                        </div>

                        <div className="rounded-[12px] border border-[#1f1f1f] bg-[#111111] p-4">
                            <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                                Contract
                            </div>
                            <div className="mt-2 break-all text-[14px] text-[#d1d5db]">
                                {FREELANCE_ESCROW_ADDRESS}
                            </div>
                        </div>

                        <div className="rounded-[12px] border border-[#1f1f1f] bg-[#111111] p-4">
                            <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                                Network
                            </div>
                            <div className="mt-2 text-[14px] text-[#d1d5db]">
                                Celo Sepolia
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}