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
import {
    appendNotifications,
    getNotificationsForWallet,
    getProductContractById,
    getProductContractByLinkedProjectId,
    getWorkflowRefreshEventName,
    linkProductContractToProject,
    ProductContract,
} from "@/lib/workflowStore";

const ESCROW_STORAGE_KEY = "agent-guild-active-escrow";
const CONTRACT_STORAGE_KEY = "agent-guild-generated-contract";
const DISPUTE_STORAGE_KEY_PREFIX = "agent-guild-dispute";
const JUDGMENT_STORAGE_KEY_PREFIX = "agent-guild-dispute-judgment";
const RESOLUTION_STORAGE_KEY_PREFIX = "agent-guild-dispute-resolution";

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
    escrowSelectionNonce?: number;
};

type DisputeJudgment = {
    verdict: "release_funds" | "refund_client";
    confidence: number;
    reasoning: string;
};

type JudgeResolution = "judge_release" | "judge_refund";
type ProjectPermissionRole = "client" | "freelancer" | "viewer" | "disconnected";

function toWeiFromCelo(value: string) {
    const num = Number(value);
    if (!num || num <= 0) return BigInt(0);
    return BigInt(Math.floor(num * 1e18));
}

function normalizeProjectId(value: number | null | undefined) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
        return null;
    }

    return value;
}

function getEscrowStateFromStatusCode(statusCode: number): EscrowStatus {
    if (statusCode === 0) return "created";
    if (statusCode === 1) return "funded";
    if (statusCode === 2) return "submitted";
    if (statusCode === 3) return "released";
    return "idle";
}

function getContractBudgetValue(contract: ProductContract) {
    return String(contract.budget);
}

export default function EscrowSimulator({
    selectedRole,
    approvedContract = null,
    escrowSelectionNonce = 0,
}: EscrowSimulatorProps) {
    const account = useActiveAccount();
    const connectedAddress = account?.address?.toLowerCase();

    const [clientName, setClientName] = useState("");
    const [clientWallet, setClientWallet] = useState("");
    const [freelancerName, setFreelancerName] = useState("");
    const [freelancerAddress, setFreelancerAddress] = useState("");
    const [budget, setBudget] = useState("");
    const [sourceContractId, setSourceContractId] = useState<string | null>(null);
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
    const [judgeResolution, setJudgeResolution] = useState<JudgeResolution | null>(null);

    function applyApprovedContractContext(contract: ProductContract) {
        setClientName(contract.clientName);
        setClientWallet(contract.clientWallet.toLowerCase());
        setFreelancerName(contract.freelancerName);
        setFreelancerAddress(contract.freelancerWallet.toLowerCase());
        setBudget(getContractBudgetValue(contract));
        setSourceContractId(contract.id);
    }

    useEffect(() => {
        if (!approvedContract || projectId !== null) return;

        applyApprovedContractContext(approvedContract);
    }, [approvedContract, projectId]);

    useEffect(() => {
        if (!approvedContract || escrowSelectionNonce === 0) return;

        localStorage.removeItem(ESCROW_STORAGE_KEY);
        setProjectId(null);
        setEscrowState("idle");
        setStatus("");
        setSubmissionLink("");
        setSubmittedWorkLink("");
        setShowDisputeForm(false);
        setDisputeReason("");
        setSavedDisputeReason("");
        setDisputeJudgment(null);
        setJudgeResolution(null);
        applyApprovedContractContext(approvedContract);
    }, [approvedContract, escrowSelectionNonce]);

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
                const restoredProjectId = normalizeProjectId(Number(data.projectId));
                setProjectId(restoredProjectId);
                setClientName(data.clientName ?? "");
                setClientWallet(data.clientWallet?.toLowerCase() ?? "");
                setFreelancerName(data.freelancerName ?? "");
                setFreelancerAddress(data.freelancerAddress ?? "");
                setBudget(data.budget ?? "");
                setSourceContractId(data.sourceContractId ?? null);

                if (restoredProjectId === null) {
                    localStorage.removeItem(ESCROW_STORAGE_KEY);
                }
            } catch (err) {
                console.error("Failed to restore escrow state", err);
            }
        }
    }, []);

    useEffect(() => {
        const syncNotifications = () => {
            if (!connectedAddress) {
                setNotifications([]);
                return;
            }

            setNotifications(getNotificationsForWallet(connectedAddress));
        };

        syncNotifications();
        window.addEventListener("storage", syncNotifications);
        window.addEventListener(getWorkflowRefreshEventName(), syncNotifications);

        return () => {
            window.removeEventListener("storage", syncNotifications);
            window.removeEventListener(getWorkflowRefreshEventName(), syncNotifications);
        };
    }, [connectedAddress]);

    useEffect(() => {
        if (projectId === null) {
            setSubmittedWorkLink("");
            setSavedDisputeReason("");
            setDisputeReason("");
            setShowDisputeForm(false);
            setDisputeJudgment(null);
            setJudgeResolution(null);
            setEscrowState("idle");
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

        const savedResolution = localStorage.getItem(
            `${RESOLUTION_STORAGE_KEY_PREFIX}-${projectId}`
        );
        if (savedResolution === "judge_release" || savedResolution === "judge_refund") {
            setJudgeResolution(savedResolution);
        } else {
            setJudgeResolution(null);
        }

        const savedEscrow = localStorage.getItem(ESCROW_STORAGE_KEY);
        if (savedEscrow) {
            try {
                const data = JSON.parse(savedEscrow);
                if (normalizeProjectId(Number(data.projectId)) === projectId) {
                    setClientName(data.clientName ?? "");
                    setClientWallet(data.clientWallet?.toLowerCase() ?? "");
                    setFreelancerName(data.freelancerName ?? "");
                    setFreelancerAddress(data.freelancerAddress ?? "");
                    setBudget(data.budget ?? "");
                    setSourceContractId(data.sourceContractId ?? null);
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
        params: projectId !== null ? [BigInt(projectId)] : [BigInt(1)],
        queryOptions: {
            enabled: projectId !== null,
        },
    });

    const onchainClient =
        projectData ? String((projectData as any)[0]).toLowerCase() : "";
    const onchainFreelancer =
        projectData ? String((projectData as any)[1]).toLowerCase() : "";
    const fallbackClientWallet = projectId !== null
        ? (clientWallet || approvedContract?.clientWallet.toLowerCase() || "")
        : approvedContract?.clientWallet.toLowerCase() || "";
    const fallbackFreelancerWallet = projectId !== null
        ? (freelancerAddress.toLowerCase() || approvedContract?.freelancerWallet.toLowerCase() || "")
        : approvedContract?.freelancerWallet.toLowerCase() || "";
    const effectiveClientWallet = onchainClient || fallbackClientWallet;
    const effectiveFreelancerWallet = onchainFreelancer || fallbackFreelancerWallet;

    const isClient = !!connectedAddress && connectedAddress === effectiveClientWallet;
    const isFreelancer =
        !!connectedAddress && connectedAddress === effectiveFreelancerWallet;
    const participantWallets = Array.from(
        new Set(
            [
                connectedAddress,
                clientWallet,
                approvedContract?.clientWallet,
                approvedContract?.freelancerWallet,
                onchainClient,
                onchainFreelancer,
                freelancerAddress,
            ]
                .map((wallet) => wallet?.toLowerCase().trim())
                .filter((wallet): wallet is string => !!wallet)
        )
    );

    useEffect(() => {
        if (!projectData) return;

        const nextClient = String((projectData as any)[0]).toLowerCase();
        const nextFreelancer = String((projectData as any)[1]).toLowerCase();
        const statusCode = Number((projectData as any)[3]);

        setClientWallet(nextClient);
        setFreelancerAddress(nextFreelancer);
        setEscrowState(getEscrowStateFromStatusCode(statusCode));
    }, [projectData]);

    function pushNotification(message: string, wallets: string[] = participantWallets) {
        appendNotifications(
            wallets.map((wallet) => ({
                wallet,
                message,
            }))
        );
    }

    async function loadMyProjects(projectCountOverride?: number) {
        if (!connectedAddress) {
            setMyProjects([]);
            setProjectsLoaded(true);
            return;
        }

        const total = projectCountOverride ?? Number(projectCountData ?? BigInt(0));

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
        const latestKnownCount = normalizeProjectId(
            Number(latestProjectCount?.data ?? projectCountData ?? BigInt(0))
        );
        const targetProjectId = normalizeProjectId(
            nextProjectId ??
                (projectId !== null
                    ? projectId
                    : latestKnownCount ?? 0)
        );

        if (targetProjectId !== null && targetProjectId !== projectId) {
            setProjectId(targetProjectId);
        }

        if (targetProjectId !== null && targetProjectId === projectId) {
            await refetchProjectData();
        }

        await loadMyProjects(latestKnownCount ?? undefined);
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

        if (approvedContract) {
            const approvedClient = approvedContract.clientWallet.toLowerCase();
            if (connectedAddress !== approvedClient) {
                setStatus("Only the client wallet on this approved contract can create escrow.");
                return;
            }
        }

        if (!clientName || !freelancerName || !freelancerAddress || !effectiveBudget) {
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
            const latestCount = normalizeProjectId(
                Number(latest?.data ?? projectCountData ?? BigInt(0))
            );

            if (latestCount === null) {
                setStatus(
                    "Escrow was created, but the new project ID could not be resolved yet. Select the real project from My Projects."
                );
                await refreshEscrowUi();
                return;
            }

            setProjectId(latestCount);
            setEscrowState("created");
            setClientWallet(connectedAddress ?? "");
            setSubmissionLink("");
            setSubmittedWorkLink("");
            const linkedContract =
                sourceContractId !== null
                    ? linkProductContractToProject(sourceContractId, latestCount)
                    : null;

            if (linkedContract) {
                applyApprovedContractContext(linkedContract);
            }

            localStorage.setItem(
                ESCROW_STORAGE_KEY,
                JSON.stringify({
                    projectId: latestCount,
                    clientName,
                    clientWallet: connectedAddress ?? "",
                    freelancerName,
                    freelancerAddress,
                    budget: effectiveBudget,
                    sourceContractId: linkedContract?.id ?? sourceContractId,
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

        if (!isClient) {
            setStatus("Only the client wallet can fund this escrow.");
            return;
        }

        if (escrowState !== "created") {
            setStatus("Escrow can only be funded after it has been created.");
            return;
        }

        try {
            setBusy(true);
            setStatus("Depositing CELO into escrow...");

            const tx = prepareContractCall({
                contract: escrowContract,
                method: "function deposit(uint256 _projectId)",
                params: [BigInt(projectId)],
                value: toWeiFromCelo(effectiveBudget),
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

        if (!isFreelancer) {
            setStatus("Only the assigned freelancer can submit work for this project.");
            return;
        }

        if (escrowState !== "funded") {
            setStatus("Work can only be submitted after the escrow has been funded.");
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

    async function approveAndRelease(resolutionSource?: JudgeResolution) {
        if (!account) {
            setStatus("Connect your wallet first.");
            return;
        }

        if (projectId === null) {
            setStatus("Create escrow project first.");
            return;
        }

        if (!isClient) {
            setStatus("Only the client wallet can release funds for this project.");
            return;
        }

        if (escrowState !== "submitted") {
            setStatus("Funds can only be released after work has been submitted.");
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
            if (projectId !== null && resolutionSource) {
                localStorage.setItem(
                    `${RESOLUTION_STORAGE_KEY_PREFIX}-${projectId}`,
                    resolutionSource
                );
                setJudgeResolution(resolutionSource);
            }
            setStatus(
                resolutionSource === "judge_release"
                    ? "Project resolved by judge in favor of release."
                    : "Payment released onchain."
            );

            const previous = getReputationForWallet(freelancerAddress);
            const completedContracts = previous.completedContracts + 1;
            const guildScore = Math.min(completedContracts * 10, 100);
            const totalEarned = previous.totalEarned + Number(effectiveBudget);
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
                resolutionSource === "judge_release"
                    ? `Project #${projectId} resolved by judge in favor of release.`
                    : `Payment released for Project #${projectId}. Freelancer has been paid.`
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

    function projectStatusLabel(status: number) {
        if (status === 0) return "Created";
        if (status === 1) return "Funded";
        if (status === 2) return "Submitted";
        if (status === 3) return "Released";
        if (status === 4) return "Cancelled";
        return "Unknown";
    }

    function selectProject(nextProjectId: number) {
        const normalizedProjectId = normalizeProjectId(nextProjectId);
        if (normalizedProjectId === null) {
            setStatus("Invalid project selected.");
            return;
        }

        const nextProject = myProjects.find(
            (project) => project.projectId === normalizedProjectId
        );
        const linkedContract = getProductContractByLinkedProjectId(normalizedProjectId);

        setProjectId(normalizedProjectId);
        if (nextProject) {
            setClientWallet(nextProject.client);
            setFreelancerAddress(nextProject.freelancer);
            setEscrowState(getEscrowStateFromStatusCode(nextProject.status));
        }
        if (linkedContract) {
            applyApprovedContractContext(linkedContract);
        } else {
            setSourceContractId(null);
            setClientName("");
            setFreelancerName("");
            setBudget("");
        }
        setStatus("");
    }

    function saveDisputeReason() {
        if (projectId === null) {
            setStatus("Select a project first.");
            return;
        }

        if (!isReviewStage || !isClient) {
            setStatus("Disputes are only available to the client during the review stage.");
            return;
        }

        if (!disputeReason.trim()) {
            setStatus("Enter a dispute reason before submitting.");
            return;
        }

        const nextReason = disputeReason.trim();
        localStorage.setItem(
            `${DISPUTE_STORAGE_KEY_PREFIX}-${projectId}`,
            nextReason
        );
        setSavedDisputeReason(nextReason);
        setShowDisputeForm(false);
        setStatus("Dispute submitted. Run the AI judge to review the case.");
        pushNotification(
            `Dispute raised for Project #${projectId}. The case is ready for AI review.`
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

    async function resolveJudgeRelease() {
        if (!disputeJudgment || disputeJudgment.verdict !== "release_funds") {
            setStatus("AI judge has not recommended release for this project.");
            return;
        }

        await approveAndRelease("judge_release");
    }

    function resolveJudgeRefund() {
        if (projectId === null) {
            setStatus("Select a project first.");
            return;
        }

        if (!disputeJudgment || disputeJudgment.verdict !== "refund_client") {
            setStatus("AI judge has not recommended refund for this project.");
            return;
        }

        localStorage.setItem(
            `${RESOLUTION_STORAGE_KEY_PREFIX}-${projectId}`,
            "judge_refund"
        );
        setJudgeResolution("judge_refund");
        setStatus(
            "Project resolved by judge in favor of refund. Current contract does not execute refunds onchain yet."
        );
        pushNotification(
            `Project #${projectId} resolved by judge in favor of refund recommendation.`
        );
    }

    function verdictLabel(verdict: DisputeJudgment["verdict"]) {
        if (verdict === "release_funds") return "Release Funds";
        return "Refund Client";
    }

    const isClientWorkspace = selectedRole === "client";
    const isFreelancerWorkspace = selectedRole === "freelancer";
    const selectedSourceContract =
        (approvedContract && approvedContract.id === sourceContractId
            ? approvedContract
            : sourceContractId
                ? getProductContractById(sourceContractId)
                : null) ?? null;
    const activeProjectContract = getProductContractByLinkedProjectId(projectId);
    const effectiveEscrowContract = activeProjectContract ?? selectedSourceContract;
    const effectiveBudget = effectiveEscrowContract
        ? getContractBudgetValue(effectiveEscrowContract)
        : budget;
    const effectiveFreelancerName =
        effectiveEscrowContract?.freelancerName ||
        freelancerName ||
        approvedContract?.freelancerName ||
        "Pending";
    const primaryColumnClass = isFreelancerWorkspace
        ? "order-2 lg:order-2"
        : "order-2 lg:order-1";
    const secondaryColumnClass = isFreelancerWorkspace
        ? "order-1 lg:order-1"
        : "order-1 lg:order-2";
    const finalResolutionLabel =
        judgeResolution === "judge_release"
            ? "Resolved by Judge: Release"
            : judgeResolution === "judge_refund"
                ? "Resolved by Judge: Refund"
                : "Released / Resolved";
    const actualRole: ProjectPermissionRole =
        !connectedAddress
            ? "disconnected"
            : projectId === null && approvedContract
                ? connectedAddress === approvedContract.clientWallet.toLowerCase()
                    ? "client"
                    : connectedAddress === approvedContract.freelancerWallet.toLowerCase()
                        ? "freelancer"
                        : "viewer"
                : isClient
                    ? "client"
                    : isFreelancer
                        ? "freelancer"
                        : "viewer";
    const activeStageIndex =
        judgeResolution || escrowState === "released"
            ? 5
            : escrowState === "submitted"
                ? 4
                : escrowState === "funded"
                    ? 2
                    : escrowState === "created"
                        ? 1
                        : 0;
    const timelineSteps = [
        "Contract Approved",
        "Escrow Created",
        "Escrow Funded",
        "Work Submitted",
        "Review / Dispute",
        finalResolutionLabel,
    ];
    const currentRoleLabel =
        actualRole === "disconnected"
            ? "Disconnected"
            : actualRole === "client"
                ? "Client"
                : actualRole === "freelancer"
                    ? "Freelancer"
                    : "Viewer";
    const isReviewStage = projectId !== null && escrowState === "submitted";
    const canOpenDispute = isReviewStage && isClient && !disputeJudgment && !judgeResolution;
    const hasSubmittedDispute = !!savedDisputeReason.trim();
    const canResolveFromJudgment =
        isReviewStage && isClient && !!disputeJudgment && !judgeResolution;
    const roleExplainer =
        actualRole === "client"
            ? "This wallet controls client-side actions for the current contract or project."
            : actualRole === "freelancer"
                ? "This wallet is the assigned freelancer and can only act when the project reaches freelancer stages."
                : actualRole === "viewer"
                    ? "This wallet can inspect project state and outcomes, but cannot perform restricted actions."
                    : "Connect the wallet that owns this contract or project to unlock actions.";
    const clientActionBlockedReason =
        actualRole === "disconnected"
            ? "Connect the client wallet to unlock client actions."
            : actualRole === "freelancer"
                ? "This wallet is the freelancer on the current contract or project. Only the client can manage escrow and review decisions."
                : actualRole === "viewer"
                    ? "Viewer wallets can inspect project status, but only the client can create escrow, fund it, or resolve review."
                    : !approvedContract && projectId === null
                        ? "Client actions unlock after an approved contract is selected or a project is chosen."
                        : null;
    const clientStateReason =
        actualRole !== "client"
            ? null
            : projectId === null && approvedContract
                ? "This wallet is ready to create escrow for the approved contract."
                : projectId === null
                    ? "Select an approved contract or project to determine the next client action."
                    : judgeResolution === "judge_release"
                        ? "Client resolution is complete. Funds were released in favor of the judge verdict."
                        : judgeResolution === "judge_refund"
                            ? "Client resolution is complete. Refund was recorded as a product-layer judge outcome."
                            : escrowState === "funded"
                                ? "The client is waiting for the freelancer to submit work."
                                : escrowState === "released"
                                    ? "The project is already resolved and no further client action is available."
                                    : null;
    const freelancerActionBlockedReason =
        actualRole === "disconnected"
            ? "Connect the assigned freelancer wallet to unlock freelancer actions."
            : actualRole === "client"
                ? "This wallet is the client on the current contract or project. Only the assigned freelancer can submit work."
                : actualRole === "viewer"
                    ? "Viewer wallets can inspect project status, but only the assigned freelancer can submit delivery."
                    : projectId === null
                        ? "Select a project to see whether the freelancer stage is unlocked."
                        : escrowState === "created"
                            ? "Freelancer actions unlock after the client funds escrow."
                            : escrowState === "submitted"
                                ? "Work has already been submitted. The freelancer is now waiting for client review."
                                : escrowState === "released"
                                    ? "The project is already resolved and no further freelancer action is available."
                                    : escrowState !== "funded"
                                        ? "Freelancer actions unlock only after the client has funded escrow."
                            : null;
    const primaryMessage =
        status ||
        (judgeResolution === "judge_release"
            ? "The dispute has been resolved by judge in favor of release, and payout has been completed onchain."
            : judgeResolution === "judge_refund"
                ? "The dispute has been resolved by judge in favor of refund. This is currently a product-layer resolution because refunds are not executable onchain yet."
                : projectId === null && approvedContract
                    ? "The contract is approved and ready to move onchain."
                    : projectId === null
                        ? "Waiting for an approved contract or a selected project to continue."
                        : escrowState === "created"
                            ? "Escrow exists onchain and is ready for the funding step."
                            : escrowState === "funded"
                                ? "Escrow is funded. The freelancer can now submit delivery."
                                : escrowState === "submitted"
                                    ? hasSubmittedDispute
                                        ? disputeJudgment
                                            ? "A dispute was raised and the AI judge has returned a review outcome. Resolve the project using the recommended path."
                                            : "A dispute has been submitted. Run the AI judge to generate a verdict."
                                        : "Work has been submitted and is waiting for client review."
                                    : "The project has reached its final resolved state.");

    useEffect(() => {
        if (!activeProjectContract || projectId === null) return;

        applyApprovedContractContext(activeProjectContract);
    }, [activeProjectContract?.id, projectId]);

    useEffect(() => {
        if (!effectiveEscrowContract) return;

        const contractBudget = getContractBudgetValue(effectiveEscrowContract);
        if (budget === contractBudget) return;

        console.warn("Escrow budget drift detected. Re-syncing to approved contract budget.", {
            contractId: effectiveEscrowContract.id,
            budget,
            contractBudget,
        });
        setBudget(contractBudget);

        const savedEscrow = localStorage.getItem(ESCROW_STORAGE_KEY);
        if (!savedEscrow) return;

        try {
            const data = JSON.parse(savedEscrow);
            if (
                data.sourceContractId !== effectiveEscrowContract.id &&
                normalizeProjectId(Number(data.projectId)) !== projectId
            ) {
                return;
            }

            localStorage.setItem(
                ESCROW_STORAGE_KEY,
                JSON.stringify({
                    ...data,
                    budget: contractBudget,
                })
            );
        } catch (error) {
            console.error("Failed to sync escrow budget invariant", error);
        }
    }, [effectiveEscrowContract?.id, budget, projectId]);

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
                    <div className="rounded-[18px] border border-[#1f1f1f] bg-[radial-gradient(circle_at_top,rgba(215,38,56,0.14),transparent_38%),linear-gradient(180deg,#121212_0%,#0b0b0b_100%)] p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <div className="text-[12px] uppercase tracking-[0.14em] text-[#f2b6be]">
                                    Active project state
                                </div>
                                <h3 className="mt-3 text-[24px] font-semibold tracking-[-0.03em] text-[#f8fafc]">
                                    {timelineSteps[activeStageIndex]}
                                </h3>
                                <p className="mt-3 max-w-[640px] text-[14px] leading-7 text-[#9ca3af]">
                                    {primaryMessage}
                                </p>
                                <p className="mt-3 max-w-[640px] text-[13px] leading-7 text-[#71717a]">
                                    Workspace selection changes emphasis only. Real permissions follow wallet ownership on the active contract or project.
                                </p>
                            </div>

                            <div className="rounded-[14px] border border-[#1f1f1f] bg-[#111111] px-4 py-3">
                                <div className="text-[11px] uppercase tracking-[0.12em] text-[#6b7280]">
                                    Permission role
                                </div>
                                <div className="mt-3">
                                    <RoleBadge role={actualRole} />
                                </div>
                                <div className="mt-3 max-w-[240px] text-[12px] leading-6 text-[#9ca3af]">
                                    {roleExplainer}
                                </div>
                            </div>
                        </div>

                        <div className="mt-6">
                            <TimelineRail steps={timelineSteps} activeIndex={activeStageIndex} />
                        </div>

                        <div className="mt-6 grid gap-3 sm:grid-cols-3">
                            <MiniStateCard label="Project" value={projectId ? `#${projectId}` : "Not created"} />
                            <MiniStateCard
                                label="Freelancer"
                                value={effectiveFreelancerName}
                            />
                            <MiniStateCard label="Budget" value={effectiveBudget ? `${effectiveBudget} CELO` : "Pending"} />
                        </div>

                        {effectiveEscrowContract && (
                            <div className="mt-6 rounded-[16px] border border-[#4c1d24] bg-[#160b0d] p-4">
                                <div className="text-[12px] uppercase tracking-[0.12em] text-[#f2b6be]">
                                    Escrow source contract
                                </div>
                                <div className="mt-2 text-[18px] font-semibold tracking-[-0.02em] text-[#f8fafc]">
                                    Contract {effectiveEscrowContract.id.slice(0, 8)}
                                </div>
                                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                    <MiniStateCard label="Client" value={effectiveEscrowContract.clientName} />
                                    <MiniStateCard
                                        label="Freelancer"
                                        value={effectiveEscrowContract.freelancerName}
                                    />
                                    <MiniStateCard
                                        label="Budget"
                                        value={`${effectiveBudget} CELO`}
                                    />
                                </div>
                                <p className="mt-4 text-[13px] leading-6 text-[#d4d4d8]">
                                    {effectiveEscrowContract.summary}
                                </p>
                            </div>
                        )}
                    </div>

                    <div
                        className={`rounded-[16px] border border-[#1f1f1f] bg-[#0b0b0b] p-5 ${
                            actualRole !== "client" ? "opacity-80" : ""
                        }`}
                    >
                        <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                            Client permissions
                        </div>
                        <div className="mt-3 text-[14px] leading-7 text-[#9ca3af]">
                            Create escrow, fund work, review submitted delivery, and resolve the project only when this wallet is the client.
                        </div>

                        {clientActionBlockedReason ? (
                            <div className="mt-4 rounded-[12px] border border-[#1f1f1f] bg-[#111111] px-4 py-3 text-sm text-[#d1d5db]">
                                {clientActionBlockedReason}
                            </div>
                        ) : (
                            <div className="mt-4 grid gap-3">
                                {!selectedSourceContract && (
                                    <div className="rounded-[12px] border border-[#1f1f1f] bg-[#111111] px-4 py-3 text-sm text-[#d1d5db]">
                                        Escrow creation unlocks only after a freelancer approves a contract.
                                    </div>
                                )}

                                {selectedSourceContract ? (
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="rounded-[12px] border border-[#1f1f1f] bg-[#111111] p-4">
                                            <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                                                Freelancer
                                            </div>
                                            <div className="mt-2 text-[15px] font-semibold text-[#f8fafc]">
                                                {freelancerName}
                                            </div>
                                            <div className="mt-2 text-[13px] break-all text-[#9ca3af]">
                                                {freelancerAddress}
                                            </div>
                                        </div>

                                        <div className="rounded-[12px] border border-[#1f1f1f] bg-[#111111] p-4">
                                            <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                                                Escrow Budget
                                            </div>
                                            <div className="mt-2 text-[15px] font-semibold text-[#f8fafc]">
                                                {effectiveBudget} CELO
                                            </div>
                                            <div className="mt-2 text-[13px] text-[#9ca3af]">
                                                {selectedSourceContract.milestones.length} milestones agreed
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <input
                                            value={clientName}
                                            onChange={(e) => setClientName(e.target.value)}
                                            placeholder="Client name"
                                            className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#6f1d26]"
                                        />

                                        <input
                                            value={freelancerName}
                                            onChange={(e) => setFreelancerName(e.target.value)}
                                            placeholder="Freelancer profile name"
                                            className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#6f1d26]"
                                        />

                                        <input
                                            value={freelancerAddress}
                                            onChange={(e) => setFreelancerAddress(e.target.value)}
                                            placeholder="Freelancer wallet address"
                                            className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#6f1d26]"
                                        />

                                        <input
                                            value={budget}
                                            onChange={(e) => setBudget(e.target.value)}
                                            placeholder="Budget in CELO e.g 0.01"
                                            className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#6f1d26]"
                                        />
                                    </>
                                )}

                                <div className="flex flex-col gap-3 pt-2">
                                    {projectId === null && selectedSourceContract && (
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

                                    {canOpenDispute && (
                                        <div className="grid gap-3">
                                            <div className="flex flex-col gap-3 sm:flex-row">
                                                <button
                                                    onClick={() => approveAndRelease()}
                                                    disabled={busy}
                                                    className="rounded-[10px] bg-[#d72638] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b91f30] disabled:opacity-50"
                                                >
                                                    Approve & Release
                                                </button>

                                                <button
                                                    onClick={() => setShowDisputeForm((prev) => !prev)}
                                                    disabled={busy}
                                                    className="rounded-[10px] border border-[#7f1d1d] px-5 py-3 text-sm font-semibold text-[#fecaca] transition hover:border-[#991b1b] disabled:opacity-50"
                                                >
                                                    {showDisputeForm ? "Close Dispute" : "Open Dispute"}
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
                                                            className="rounded-[10px] bg-[#d72638] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b91f30]"
                                                        >
                                                            Submit Dispute
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

                                            {hasSubmittedDispute && !disputeJudgment && (
                                                <div className="rounded-[12px] border border-[#4c1d24] bg-[#160b0d] px-4 py-4">
                                                    <div className="text-[12px] uppercase tracking-[0.12em] text-[#f2b6be]">
                                                        Dispute submitted
                                                    </div>
                                                    <div className="mt-2 text-sm leading-7 text-[#d1d5db]">
                                                        The dispute reason is saved. Run the AI judge to evaluate the contract, milestones, and submitted work.
                                                    </div>
                                                    <button
                                                        onClick={judgeDispute}
                                                        type="button"
                                                        disabled={judgingDispute}
                                                        className="mt-4 rounded-[10px] bg-[#d72638] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b91f30] disabled:opacity-50"
                                                    >
                                                        {judgingDispute ? "Running AI Judge..." : "Run AI Judge"}
                                                    </button>
                                                </div>
                                            )}

                                            {disputeJudgment && (
                                                <div className="rounded-[12px] border border-[#1f3b28] bg-[#0d1912] px-4 py-4 text-sm text-[#9be2b0]">
                                                    AI judge review completed. See the support rail for verdict, confidence, and reasoning.
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {canResolveFromJudgment && disputeJudgment && (
                                        <div className="rounded-[12px] border border-[#4c1d24] bg-[#160b0d] px-4 py-4">
                                            <div className="text-[12px] uppercase tracking-[0.12em] text-[#f2b6be]">
                                                AI judge recommendation
                                            </div>
                                            <div className="mt-2 text-[16px] font-semibold text-[#f8fafc]">
                                                {verdictLabel(disputeJudgment.verdict)}
                                            </div>
                                            <div className="mt-2 text-sm leading-7 text-[#d1d5db]">
                                                Confidence {disputeJudgment.confidence}%. Choose the resolution path that matches the judge verdict.
                                            </div>

                                            {disputeJudgment.verdict === "release_funds" ? (
                                                <button
                                                    onClick={resolveJudgeRelease}
                                                    disabled={busy}
                                                    className="mt-4 rounded-[10px] bg-[#d72638] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b91f30] disabled:opacity-50"
                                                >
                                                    {busy ? "Resolving..." : "Resolve Project In Favor Of Release"}
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={resolveJudgeRefund}
                                                    type="button"
                                                    className="mt-4 rounded-[10px] bg-[#d72638] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b91f30]"
                                                >
                                                    Resolve Project In Favor Of Refund
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {clientStateReason && (
                                    <div className="rounded-[12px] border border-[#1f1f1f] bg-[#111111] px-4 py-3 text-sm text-[#d1d5db]">
                                        {clientStateReason}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div
                        className={`rounded-[16px] border border-[#1f1f1f] bg-[#0b0b0b] p-5 ${
                            actualRole !== "freelancer" ? "opacity-80" : ""
                        }`}
                    >
                        <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                            Freelancer permissions
                        </div>
                        <div className="mt-3 text-[14px] leading-7 text-[#9ca3af]">
                            Submit delivery only when this wallet is the assigned freelancer and the project reaches the funded stage.
                        </div>

                        {!freelancerActionBlockedReason && projectId !== null && escrowState === "funded" && isFreelancer ? (
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
                                {freelancerActionBlockedReason || "Freelancer actions are not available on this project right now."}
                            </div>
                        )}
                    </div>

                </div>

                <div className={`rounded-[16px] border border-[#1f1f1f] bg-[#0b0b0b] p-5 ${secondaryColumnClass}`}>
                    <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                        Support panels
                    </div>

                    <div className="mt-4 grid gap-4">
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
                                Review context
                            </div>
                            <div className="mt-3 grid gap-3">
                                <MiniStateCard label="Project ID" value={projectId ? `#${projectId}` : "Not created"} />
                                <MiniStateCard label="Current role" value={currentRoleLabel} />
                                {submittedWorkLink && (
                                    <MiniStateCard label="Submitted work" value={submittedWorkLink} accent />
                                )}
                                {savedDisputeReason && (
                                    <MiniStateCard label="Dispute reason" value={savedDisputeReason} />
                                )}
                                {!savedDisputeReason && isReviewStage && (
                                    <MiniStateCard label="Dispute status" value="No dispute submitted" />
                                )}
                                {judgeResolution === "judge_release" && (
                                    <MiniStateCard label="Final outcome" value="Resolved by Judge: Release" accent />
                                )}
                                {judgeResolution === "judge_refund" && (
                                    <MiniStateCard label="Final outcome" value="Resolved by Judge: Refund" accent />
                                )}
                            </div>
                        </div>

                        <div className="rounded-[12px] border border-[#1f1f1f] bg-[#111111] p-4">
                            <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                                AI Judge
                            </div>
                            {!hasSubmittedDispute ? (
                                <div className="mt-2 text-[14px] text-[#9ca3af]">
                                    No dispute submitted yet.
                                </div>
                            ) : !disputeJudgment ? (
                                <div className="mt-2 text-[14px] text-[#9ca3af]">
                                    Dispute submitted. Run the AI judge from the main workflow panel to get a verdict.
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

                                    {judgeResolution && (
                                        <div>
                                            <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                                                Final outcome
                                            </div>
                                            <div className="mt-1 text-[15px] font-semibold text-[#f8fafc]">
                                                {judgeResolution === "judge_release"
                                                    ? "Resolved by Judge: Release"
                                                    : "Resolved by Judge: Refund"}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

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
                    </div>
                </div>
            </div>
        </section>
    );
}

function TimelineRail({
    steps,
    activeIndex,
}: {
    steps: string[];
    activeIndex: number;
}) {
    return (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {steps.map((step, index) => {
                const state =
                    index < activeIndex
                        ? "complete"
                        : index === activeIndex
                            ? "current"
                            : "upcoming";
                const tone =
                    state === "complete"
                        ? "border-[#1f3b28] bg-[#0d1912] text-[#9be2b0]"
                        : state === "current"
                            ? "border-[#4c1d24] bg-[#160b0d] text-[#f2b6be]"
                            : "border-[#1f1f1f] bg-[#111111] text-[#9ca3af]";

                return (
                    <div key={step} className={`rounded-[14px] border px-4 py-4 ${tone}`}>
                        <div className="text-[10px] uppercase tracking-[0.14em]">
                            {state}
                        </div>
                        <div className="mt-2 text-[13px] font-semibold leading-6">{step}</div>
                    </div>
                );
            })}
        </div>
    );
}

function MiniStateCard({
    label,
    value,
    accent = false,
}: {
    label: string;
    value: string;
    accent?: boolean;
}) {
    return (
        <div className={`rounded-[12px] border p-4 ${accent ? "border-[#4c1d24] bg-[#160b0d]" : "border-[#1f1f1f] bg-[#111111]"}`}>
            <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">{label}</div>
            <div className={`mt-2 break-all text-[14px] ${accent ? "text-[#f2b6be]" : "text-[#f8fafc]"}`}>
                {value}
            </div>
        </div>
    );
}

function RoleBadge({ role }: { role: ProjectPermissionRole }) {
    const tone =
        role === "client"
            ? "border-[#4c1d24] bg-[#160b0d] text-[#f2b6be]"
            : role === "freelancer"
                ? "border-[#1f3b28] bg-[#0d1912] text-[#9be2b0]"
                : role === "viewer"
                    ? "border-[#2a2a2a] bg-[#111111] text-[#d1d5db]"
                    : "border-[#2a2a2a] bg-[#111111] text-[#9ca3af]";

    return (
        <span className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-medium uppercase tracking-[0.12em] ${tone}`}>
            {role}
        </span>
    );
}
