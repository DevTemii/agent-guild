"use client";

import { useEffect, useMemo, useState } from "react";
import { useActiveAccount, useReadContract } from "thirdweb/react";
import {
    defineChain,
    getContract,
    prepareContractCall,
    readContract,
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
import { ProductContract } from "@/lib/workflowStore";

const ESCROW_STORAGE_KEY = "agent-guild-active-escrow";
const CONTRACT_STORAGE_KEY = "agent-guild-generated-contract";
const NOTIFICATION_STORAGE_KEY = "agent-guild-notifications";
const DISPUTE_STORAGE_KEY_PREFIX = "agent-guild-dispute";
const JUDGMENT_STORAGE_KEY_PREFIX = "agent-guild-dispute-judgment";

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

type EscrowSimulatorProps = {
    selectedRole: "client" | "freelancer" | null;
    approvedContract?: ProductContract | null;
};

type DisputeJudgment = {
    verdict: "release_funds" | "refund_client";
    confidence: number;
    reasoning: string;
};

function toWeiFromCelo(value: string) {
    const num = Number(value);
    if (!num || num <= 0) return BigInt(0);
    return BigInt(Math.floor(num * 1e18));
}

export default function EscrowSimulator({
    selectedRole,
    approvedContract = null,
}: EscrowSimulatorProps) {
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
    const [myProjects, setMyProjects] = useState<
        Array<{
            projectId: number;
            client: string;
            freelancer: string;
            amount: bigint;
            status: number;
        }>
    >([]);
    const [loadingProjects, setLoadingProjects] = useState(false);
    const [projectsLoaded, setProjectsLoaded] = useState(false);

    const [submissionLink, setSubmissionLink] = useState("");
    const [submittedWorkLink, setSubmittedWorkLink] = useState("");
    const [notifications, setNotifications] = useState<string[]>([]);
    const [showDisputeForm, setShowDisputeForm] = useState(false);
    const [disputeReason, setDisputeReason] = useState("");
    const [savedDisputeReason, setSavedDisputeReason] = useState("");
    const [judgingDispute, setJudgingDispute] = useState(false);
    const [disputeJudgment, setDisputeJudgment] = useState<DisputeJudgment | null>(
        null
    );

    useEffect(() => {
        if (!approvedContract || projectId !== null) return;

        setClientName(approvedContract.clientName);
        setFreelancerName(approvedContract.freelancerName);
        setFreelancerAddress(approvedContract.freelancerWallet);
        setBudget(String(approvedContract.budget));
    }, [approvedContract, projectId]);

    const escrowContract = useMemo(() => {
        return getContract({
            client,
            chain: celoSepolia,
            address: FREELANCE_ESCROW_ADDRESS,
            abi: FREELANCE_ESCROW_ABI as any,
        });
    }, []);

    useEffect(() => {
        const savedEscrow = localStorage.getItem(ESCROW_STORAGE_KEY);
        if (savedEscrow) {
            try {
                const data = JSON.parse(savedEscrow);
                setProjectId(data.projectId ?? null);
                setClientName(data.clientName ?? "");
                setFreelancerName(data.freelancerName ?? "");
                setFreelancerAddress(data.freelancerAddress ?? "");
                setBudget(data.budget ?? "");
            } catch (err) {
                console.error("Failed to restore escrow state", err);
            }
        }

        const savedNotifications = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
        if (savedNotifications) {
            try {
                setNotifications(JSON.parse(savedNotifications));
            } catch (err) {
                console.error("Failed to restore notifications", err);
            }
        }
    }, []);

    useEffect(() => {
        if (projectId === null) {
            setSubmittedWorkLink("");
            setSavedDisputeReason("");
            setDisputeReason("");
            setShowDisputeForm(false);
            setDisputeJudgment(null);
            return;
        }

        const savedSubmission = localStorage.getItem(
            `agent-guild-submission-${projectId}`
        );

        if (savedSubmission) {
            setSubmittedWorkLink(savedSubmission);
        } else {
            setSubmittedWorkLink("");
        }

        const savedDispute = localStorage.getItem(
            `${DISPUTE_STORAGE_KEY_PREFIX}-${projectId}`
        );
        if (savedDispute) {
            setSavedDisputeReason(savedDispute);
            setDisputeReason(savedDispute);
        } else {
            setSavedDisputeReason("");
            setDisputeReason("");
        }
        setShowDisputeForm(false);

        const savedJudgment = localStorage.getItem(
            `${JUDGMENT_STORAGE_KEY_PREFIX}-${projectId}`
        );
        if (savedJudgment) {
            try {
                setDisputeJudgment(JSON.parse(savedJudgment));
            } catch (err) {
                console.error("Failed to restore dispute judgment", err);
                setDisputeJudgment(null);
            }
        } else {
            setDisputeJudgment(null);
        }

        const savedEscrow = localStorage.getItem(ESCROW_STORAGE_KEY);
        if (savedEscrow) {
            try {
                const data = JSON.parse(savedEscrow);
                if (data.projectId === projectId) {
                    setClientName(data.clientName ?? "");
                    setFreelancerName(data.freelancerName ?? "");
                    setFreelancerAddress(data.freelancerAddress ?? "");
                    setBudget(data.budget ?? "");
                }
            } catch (err) {
                console.error("Failed to restore escrow state", err);
            }
        }
    }, [projectId]);

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

    function pushNotification(message: string) {
        setNotifications((prev) => {
            const next = [message, ...prev].slice(0, 8);
            localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    }

    async function loadMyProjects() {
        if (!connectedAddress) {
            setMyProjects([]);
            setProjectsLoaded(true);
            return;
        }

        const total = Number(projectCountData ?? BigInt(0));

        if (!total || total < 1) {
            setMyProjects([]);
            setProjectsLoaded(true);
            return;
        }

        try {
            setLoadingProjects(true);

            const discovered: Array<{
                projectId: number;
                client: string;
                freelancer: string;
                amount: bigint;
                status: number;
            }> = [];

            for (let id = 1; id <= total; id++) {
                const result = await readContract({
                    contract: escrowContract,
                    method:
                        "function getProject(uint256 _projectId) view returns (address client, address freelancer, uint256 amount, uint8 status)",
                    params: [BigInt(id)],
                });

                const client = String((result as any)[0]).toLowerCase();
                const freelancer = String((result as any)[1]).toLowerCase();
                const amount = (result as any)[2] as bigint;
                const status = Number((result as any)[3]);

                if (
                    client === connectedAddress ||
                    freelancer === connectedAddress
                ) {
                    discovered.push({
                        projectId: id,
                        client,
                        freelancer,
                        amount,
                        status,
                    });
                }
            }

            setMyProjects(discovered);
            setProjectsLoaded(true);
        } catch (error) {
            console.error("Failed to load wallet projects", error);
            setMyProjects([]);
            setProjectsLoaded(true);
        } finally {
            setLoadingProjects(false);
        }
    }

    useEffect(() => {
        if (!connectedAddress) {
            setMyProjects([]);
            setProjectsLoaded(true);
            return;
        }

        loadMyProjects();
    }, [connectedAddress, projectCountData]);

    async function refreshEscrowUi(nextProjectId?: number) {
        const latestProjectCount = await refetchProjectCount();
        const targetProjectId =
            nextProjectId ??
            (projectId !== null
                ? projectId
                : Number(latestProjectCount?.data ?? BigInt(0)) || null);

        if (targetProjectId !== null) {
            await refetchProjectData();
        }

        await loadMyProjects();
        window.dispatchEvent(new Event("agent-guild:refresh"));
    }

    async function createEscrowProject() {
        if (!account) {
            setStatus("Connect your wallet first.");
            return;
        }

        if (selectedRole === "client" && !approvedContract) {
            setStatus("A freelancer-approved contract is required before escrow can be created.");
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
            setSubmissionLink("");
            setSubmittedWorkLink("");

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

            const message = `Escrow created for ${freelancerName}. Client should fund Project #${latestCount}.`;
            setStatus(`Escrow project created onchain. Project ID: ${latestCount}`);
            pushNotification(message);
            await refreshEscrowUi(latestCount);
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
            pushNotification(
                `Escrow funded. Freelancer can now submit work for Project #${projectId}.`
            );
            await refreshEscrowUi();
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

        if (!submissionLink.trim()) {
            setStatus("Freelancer must submit a work link.");
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

            localStorage.setItem(
                `agent-guild-submission-${projectId}`,
                submissionLink.trim()
            );
            setSubmittedWorkLink(submissionLink.trim());

            await refetchProjectData();
            setEscrowState("submitted");
            setStatus("Work submitted successfully.");
            pushNotification(
                `Work submitted for Project #${projectId}. Client can now review and release payment.`
            );
            await refreshEscrowUi();
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

            pushNotification(
                `Payment released for Project #${projectId}. Freelancer has been paid.`
            );

            localStorage.removeItem(ESCROW_STORAGE_KEY);
            await refreshEscrowUi();
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

    function projectStatusLabel(status: number) {
        if (status === 0) return "Created";
        if (status === 1) return "Funded";
        if (status === 2) return "Submitted";
        if (status === 3) return "Released";
        if (status === 4) return "Cancelled";
        return "Unknown";
    }

    function selectProject(nextProjectId: number) {
        setProjectId(nextProjectId);
        setStatus("");
    }

    function saveDisputeReason() {
        if (projectId === null) {
            setStatus("Select a project first.");
            return;
        }

        if (!disputeReason.trim()) {
            setStatus("Enter a dispute reason before saving.");
            return;
        }

        const nextReason = disputeReason.trim();
        localStorage.setItem(
            `${DISPUTE_STORAGE_KEY_PREFIX}-${projectId}`,
            nextReason
        );
        setSavedDisputeReason(nextReason);
        setShowDisputeForm(false);
        setStatus("Dispute reason saved locally.");
        pushNotification(
            `Dispute raised for Project #${projectId}. Review reason has been saved.`
        );
    }

    async function judgeDispute() {
        if (projectId === null) {
            setStatus("Select a project first.");
            return;
        }

        if (!savedDisputeReason.trim()) {
            setStatus("Save a dispute reason before judging.");
            return;
        }

        if (!submittedWorkLink.trim()) {
            setStatus("A submitted work link is required for the AI judge.");
            return;
        }

        const savedContract = localStorage.getItem(CONTRACT_STORAGE_KEY);
        if (!savedContract) {
            setStatus("Generate a contract first so the AI judge has contract context.");
            return;
        }

        let contractData: {
            summary?: string;
            milestones?: Array<{ title: string; amount: number }>;
        } | null = null;

        try {
            contractData = JSON.parse(savedContract);
        } catch (err) {
            console.error("Failed to parse saved contract", err);
            setStatus("Saved contract data is invalid. Generate a new contract first.");
            return;
        }

        if (
            !contractData?.summary ||
            !Array.isArray(contractData.milestones) ||
            contractData.milestones.length === 0
        ) {
            setStatus("Saved contract data is incomplete. Generate a new contract first.");
            return;
        }

        try {
            setJudgingDispute(true);
            setStatus("AI judge is reviewing the dispute...");

            const res = await fetch("/api/judge-dispute", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    contractSummary: contractData.summary,
                    milestones: contractData.milestones,
                    submittedWorkLink,
                    disputeReason: savedDisputeReason,
                }),
            });

            const result = await res.json();

            if (!res.ok) {
                throw new Error(result?.error || "AI dispute judge failed.");
            }

            localStorage.setItem(
                `${JUDGMENT_STORAGE_KEY_PREFIX}-${projectId}`,
                JSON.stringify(result)
            );
            setDisputeJudgment(result);
            setStatus("AI dispute judgment ready.");
            pushNotification(
                `AI dispute judgment completed for Project #${projectId}.`
            );
        } catch (error: any) {
            console.error(error);
            setStatus(error?.message || "AI dispute judge failed.");
        } finally {
            setJudgingDispute(false);
        }
    }

    function verdictLabel(verdict: DisputeJudgment["verdict"]) {
        if (verdict === "release_funds") return "Release Funds";
        return "Refund Client";
    }

    const isClientWorkspace = selectedRole === "client";
    const isFreelancerWorkspace = selectedRole === "freelancer";
    const primaryColumnClass = isFreelancerWorkspace
        ? "order-2 lg:order-2"
        : "order-2 lg:order-1";
    const secondaryColumnClass = isFreelancerWorkspace
        ? "order-1 lg:order-1"
        : "order-1 lg:order-2";

    return (
        <section className="rounded-[16px] border border-[#1f1f1f] bg-[#111111] p-6">
            <div className="mb-6">
                <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#f2b6be]">
                    {isFreelancerWorkspace ? "Freelancer workspace" : "Client workspace"}
                </div>
                <h2 className="mt-3 text-[26px] font-semibold tracking-[-0.02em] sm:text-[30px]">
                    {isFreelancerWorkspace
                        ? "Assigned work and payout tracking"
                        : "Onchain escrow flow"}
                </h2>
                <p className="mt-3 text-[15px] leading-7 text-[#9ca3af]">
                    {isFreelancerWorkspace
                        ? "Pick a project from your assigned list, submit work when funded, and monitor whether payment has been released."
                        : "Create a real escrow project, deposit CELO, review delivery, and release funds on Celo Sepolia."}
                </p>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.95fr_1.05fr]">
                <div className={`grid gap-4 ${primaryColumnClass}`}>
                    <div
                        className={`rounded-[16px] border border-[#1f1f1f] bg-[#0b0b0b] p-5 ${
                            isFreelancerWorkspace ? "opacity-80" : ""
                        }`}
                    >
                        <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                            Client actions
                        </div>
                        <div className="mt-3 text-[14px] leading-7 text-[#9ca3af]">
                            Create escrow, fund work, review submitted delivery, and release payment when the connected wallet is the actual client.
                        </div>

                        {isFreelancerWorkspace ? (
                            <div className="mt-4 rounded-[12px] border border-[#1f1f1f] bg-[#111111] px-4 py-3 text-sm text-[#d1d5db]">
                                Escrow creation belongs to the client. Select one of your assigned projects from My Projects to continue as a freelancer.
                            </div>
                        ) : (
                            <div className="mt-4 grid gap-3">
                                {approvedContract ? (
                                    <div className="rounded-[12px] border border-[#4c1d24] bg-[#160b0d] px-4 py-3 text-sm text-[#f2b6be]">
                                        Approved contract selected for {approvedContract.freelancerName}. Escrow can now be created from this agreement.
                                    </div>
                                ) : (
                                    <div className="rounded-[12px] border border-[#1f1f1f] bg-[#111111] px-4 py-3 text-sm text-[#d1d5db]">
                                        Escrow creation unlocks only after a freelancer approves a contract.
                                    </div>
                                )}

                                <input
                                    value={clientName}
                                    onChange={(e) => setClientName(e.target.value)}
                                    placeholder="Client name"
                                    readOnly={!!approvedContract}
                                    className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#6f1d26]"
                                />

                                <input
                                    value={freelancerName}
                                    onChange={(e) => setFreelancerName(e.target.value)}
                                    placeholder="Freelancer profile name"
                                    readOnly={!!approvedContract}
                                    className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#6f1d26]"
                                />

                                <input
                                    value={freelancerAddress}
                                    onChange={(e) => setFreelancerAddress(e.target.value)}
                                    placeholder="Freelancer wallet address"
                                    readOnly={!!approvedContract}
                                    className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#6f1d26]"
                                />

                                <input
                                    value={budget}
                                    onChange={(e) => setBudget(e.target.value)}
                                    placeholder="Budget in CELO e.g 0.01"
                                    readOnly={!!approvedContract}
                                    className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#6f1d26]"
                                />

                                <div className="flex flex-col gap-3 pt-2">
                                    {projectId === null && approvedContract && (
                                        <button
                                            onClick={createEscrowProject}
                                            disabled={busy}
                                            className="rounded-[10px] bg-[#d72638] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b91f30] disabled:opacity-60"
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

                                    {projectId !== null && escrowState === "submitted" && isClient && (
                                        <div className="grid gap-3">
                                            <div className="flex flex-col gap-3 sm:flex-row">
                                                <button
                                                    onClick={approveAndRelease}
                                                    disabled={busy}
                                                    className="rounded-[10px] border border-[#2c2c2c] px-5 py-3 text-sm font-semibold text-[#f8fafc] transition hover:border-[#3a3a3a] disabled:opacity-50"
                                                >
                                                    Approve & Release
                                                </button>

                                                <button
                                                    onClick={() => setShowDisputeForm((prev) => !prev)}
                                                    disabled={busy}
                                                    className="rounded-[10px] border border-[#7f1d1d] px-5 py-3 text-sm font-semibold text-[#fecaca] transition hover:border-[#991b1b] disabled:opacity-50"
                                                >
                                                    Dispute Work
                                                </button>
                                            </div>

                                            {showDisputeForm && (
                                                <div className="grid gap-3">
                                                    <textarea
                                                        value={disputeReason}
                                                        onChange={(e) => setDisputeReason(e.target.value)}
                                                        placeholder="Explain why this submission is being disputed"
                                                        rows={4}
                                                        className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#6f1d26]"
                                                    />

                                                    <div className="flex flex-col gap-3 sm:flex-row">
                                                        <button
                                                            onClick={saveDisputeReason}
                                                            type="button"
                                                            className="rounded-[10px] border border-[#2c2c2c] px-5 py-3 text-sm font-semibold text-[#f8fafc] transition hover:border-[#3a3a3a]"
                                                        >
                                                            Save Dispute
                                                        </button>

                                                        <button
                                                            onClick={() => setShowDisputeForm(false)}
                                                            type="button"
                                                            className="rounded-[10px] border border-[#2c2c2c] px-5 py-3 text-sm font-semibold text-[#9ca3af] transition hover:border-[#3a3a3a]"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {savedDisputeReason && (
                                                <button
                                                    onClick={judgeDispute}
                                                    type="button"
                                                    disabled={judgingDispute}
                                                    className="rounded-[10px] border border-[#2c2c2c] px-5 py-3 text-sm font-semibold text-[#f8fafc] transition hover:border-[#3a3a3a] disabled:opacity-50"
                                                >
                                                    {judgingDispute ? "Judging..." : "Judge Dispute"}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div
                        className={`rounded-[16px] border border-[#1f1f1f] bg-[#0b0b0b] p-5 ${
                            isClientWorkspace ? "opacity-80" : ""
                        }`}
                    >
                        <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                            Freelancer actions
                        </div>
                        <div className="mt-3 text-[14px] leading-7 text-[#9ca3af]">
                            Review assigned projects, submit a delivery link once work is funded, and track whether payment has been released.
                        </div>

                        {projectId !== null && escrowState === "funded" && isFreelancer ? (
                            <div className="mt-4 grid gap-3">
                                <input
                                    value={submissionLink}
                                    onChange={(e) => setSubmissionLink(e.target.value)}
                                    placeholder="Work submission link (GitHub, Figma, Drive)"
                                    className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#6f1d26]"
                                />

                                <button
                                    onClick={submitWork}
                                    disabled={busy}
                                    className="rounded-[10px] border border-[#2c2c2c] px-5 py-3 text-sm font-semibold text-[#f8fafc] transition hover:border-[#3a3a3a] disabled:opacity-50"
                                >
                                    Submit Work
                                </button>
                            </div>
                        ) : (
                            <div className="mt-4 rounded-[12px] border border-[#1f1f1f] bg-[#111111] px-4 py-3 text-sm text-[#d1d5db]">
                                {projectId === null
                                    ? "Select a project from My Projects to view your freelancer workspace."
                                    : !isClient && !isFreelancer
                                        ? "This wallet is not involved in the selected project. You can view its status, but only the client or assigned freelancer can take action."
                                        : escrowState === "funded"
                                            ? "This wallet is not the assigned freelancer for the selected project."
                                            : "Select a funded project from My Projects to unlock the submission flow."}
                            </div>
                        )}
                    </div>

                    {(status || helperText()) && (
                        <div className="rounded-[12px] border border-[#1f1f1f] bg-[#0b0b0b] px-4 py-3 text-sm text-[#d1d5db]">
                            {status || helperText()}
                        </div>
                    )}
                </div>

                <div className={`rounded-[16px] border border-[#1f1f1f] bg-[#0b0b0b] p-5 ${secondaryColumnClass}`}>
                    <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                        {isFreelancerWorkspace ? "Assigned projects" : "Escrow state"}
                    </div>

                    <div className="mt-4 grid gap-4">
                        <div className="rounded-[12px] border border-[#1f1f1f] bg-[#111111] p-4">
                            <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                                Inbox
                            </div>

                            <div className="mt-3 space-y-3">
                                {notifications.length === 0 ? (
                                    <div className="text-[14px] text-[#9ca3af]">
                                        No notifications yet.
                                    </div>
                                ) : (
                                    notifications.slice(0, 4).map((note, index) => (
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

                        <div className="rounded-[12px] border border-[#1f1f1f] bg-[#111111] p-4">
                            <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                                My Projects
                            </div>

                            <div className="mt-3 space-y-3">
                                {!connectedAddress ? (
                                    <div className="text-[14px] text-[#9ca3af]">
                                        Connect wallet to discover your escrow projects.
                                    </div>
                                ) : loadingProjects ? (
                                    <div className="text-[14px] text-[#9ca3af]">
                                        Loading projects...
                                    </div>
                                ) : projectsLoaded && myProjects.length === 0 ? (
                                    <div className="text-[14px] text-[#9ca3af]">
                                        No escrow projects found for this wallet.
                                    </div>
                                ) : (
                                    myProjects.map((project) => {
                                        const isSelected = projectId === project.projectId;
                                        const role =
                                            project.client === connectedAddress
                                                ? "Client"
                                                : "Freelancer";

                                        return (
                                            <button
                                                key={project.projectId}
                                                type="button"
                                                onClick={() => selectProject(project.projectId)}
                                                className={`w-full rounded-[10px] border px-3 py-3 text-left transition ${isSelected
                                                    ? "border-[#6f1d26] bg-[#1a0e10]"
                                                    : "border-[#1f1f1f] bg-[#0b0b0b] hover:border-[#2c2c2c]"
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="text-[14px] font-medium text-[#f8fafc]">
                                                        Project #{project.projectId}
                                                    </div>
                                                    <div className="text-[12px] text-[#9ca3af]">
                                                        {role}
                                                    </div>
                                                </div>

                                                <div className="mt-2 text-[13px] text-[#9ca3af]">
                                                    {projectStatusLabel(project.status)}
                                                </div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>

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
                                Review State
                            </div>
                            <div className="mt-2 text-[15px] font-semibold">
                                {savedDisputeReason ? "Disputed" : "No dispute raised"}
                            </div>
                            {savedDisputeReason && (
                                <div className="mt-3 text-[14px] leading-7 text-[#d1d5db]">
                                    {savedDisputeReason}
                                </div>
                            )}
                        </div>

                        <div className="rounded-[12px] border border-[#1f1f1f] bg-[#111111] p-4">
                            <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                                AI Judge
                            </div>
                            {!disputeJudgment ? (
                                <div className="mt-2 text-[14px] text-[#9ca3af]">
                                    No AI judgment yet.
                                </div>
                            ) : (
                                <div className="mt-2 grid gap-3">
                                    <div>
                                        <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                                            Verdict
                                        </div>
                                        <div className="mt-1 text-[15px] font-semibold text-[#f8fafc]">
                                            {verdictLabel(disputeJudgment.verdict)}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                                            Confidence
                                        </div>
                                        <div className="mt-1 text-[15px] font-semibold text-[#f8fafc]">
                                            {disputeJudgment.confidence}%
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                                            Reasoning
                                        </div>
                                        <div className="mt-1 text-[14px] leading-7 text-[#d1d5db]">
                                            {disputeJudgment.reasoning}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {projectId !== null && (
                            <div className="rounded-[12px] border border-[#1f1f1f] bg-[#111111] p-4">
                                <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                                    Submitted Work
                                </div>

                                <div className="mt-2 break-all text-[14px] text-[#f2b6be]">
                                    {submittedWorkLink || "No work submitted yet"}
                                </div>
                            </div>
                        )}

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
