"use client";

import { useEffect, useMemo, useState } from "react";
import {
    formatDisplayBudget,
    formatSettlementAmountCelo,
    parseSettlementAmountCeloToWei,
    validateSettlementAmountCelo,
} from "@/lib/budget";
import { useActiveAccount, useReadContract } from "thirdweb/react";
import {
    getContract,
    parseEventLogs,
    prepareContractCall,
    prepareEvent,
    readContract,
    sendTransaction,
    waitForReceipt,
} from "thirdweb";
import { client } from "@/lib/client";
import {
    FREELANCE_ESCROW_ABI,
    FREELANCE_ESCROW_ADDRESS,
    FREELANCE_ESCROW_PROJECT_CREATED_EVENT,
} from "@/lib/contract";
import {
    getProjectCacheKey,
    getWalletCacheKey,
} from "@/lib/cacheKeys";
import { agentGuildChain, agentGuildChainId, agentGuildChainLabel } from "@/lib/networkConfig";
import {
    getReputationForWallet,
    setReputationForWallet,
} from "@/lib/reputationStore";
import {
    appendNotifications,
    getNotificationsForWallet,
    getIndexedProjectsForWallet,
    getProjectSubmission,
    getProductContractById,
    getProductContractByLinkedProjectId,
    getWorkflowRefreshEventName,
    linkProductContractToProject,
    normalizeWallet,
    ProductContract,
    saveProjectSubmission,
    syncWorkflowProjects,
    updateProductContractSettlementAmount,
} from "@/lib/workflowStore";

const ESCROW_STORAGE_KEY_PREFIX = "agent-guild-active-escrow";
const SUBMISSION_STORAGE_KEY_PREFIX = "agent-guild-submission";
const DISPUTE_STORAGE_KEY_PREFIX = "agent-guild-dispute";
const JUDGMENT_STORAGE_KEY_PREFIX = "agent-guild-dispute-judgment";
const RESOLUTION_STORAGE_KEY_PREFIX = "agent-guild-dispute-resolution";

const projectCreatedEvent = prepareEvent({
    signature: FREELANCE_ESCROW_PROJECT_CREATED_EVENT,
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

type JudgeResolution = "judge_release";
type ProjectPermissionRole = "client" | "freelancer" | "viewer" | "disconnected";

const BETA_DISPUTE_SUPPORT_COPY =
    "Mainnet beta uses support review only for disputes. Release is the only onchain final settlement right now.";
const ACTIVE_ESCROW_CACHE_SCHEMA_VERSION = 1;

type ActiveEscrowCacheEntry = {
    schemaVersion: number;
    chainId: number;
    wallet: string;
    projectId: number;
    sourceContractId: string | null;
    settlementAmountCelo: string;
    role: EscrowSimulatorProps["selectedRole"];
    clientWallet: string;
    freelancerWallet: string;
};

function normalizeProjectId(value: number | null | undefined) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
        return null;
    }

    return value;
}

function buildActiveEscrowCacheEntry(input: {
    wallet?: string | null;
    projectId: number;
    sourceContractId?: string | null;
    settlementAmountCelo?: string | null;
    role: EscrowSimulatorProps["selectedRole"];
    clientWallet?: string | null;
    freelancerWallet?: string | null;
}) {
    const wallet = normalizeWallet(input.wallet);
    const projectId = normalizeProjectId(input.projectId);

    if (!wallet || projectId === null) {
        return null;
    }

    return {
        schemaVersion: ACTIVE_ESCROW_CACHE_SCHEMA_VERSION,
        chainId: agentGuildChainId,
        wallet,
        projectId,
        sourceContractId: input.sourceContractId?.trim() || null,
        settlementAmountCelo: input.settlementAmountCelo?.trim() || "",
        role: input.role,
        clientWallet: normalizeWallet(input.clientWallet) || "",
        freelancerWallet: normalizeWallet(input.freelancerWallet) || "",
    } satisfies ActiveEscrowCacheEntry;
}

function resolveCreatedProjectIdFromReceipt({
    receipt,
    expectedClient,
    expectedFreelancer,
}: {
    receipt: Awaited<ReturnType<typeof waitForReceipt>>;
    expectedClient: string;
    expectedFreelancer: string;
}) {
    const matchingEvents = parseEventLogs({
        events: [projectCreatedEvent],
        logs: receipt.logs,
    }).filter((eventLog) => {
        const clientWallet = eventLog.args.client?.toLowerCase();
        const freelancerWallet = eventLog.args.freelancer?.toLowerCase();

        return (
            clientWallet === expectedClient.toLowerCase() &&
            freelancerWallet === expectedFreelancer.toLowerCase()
        );
    });

    if (matchingEvents.length !== 1) {
        return null;
    }

    return normalizeProjectId(Number(matchingEvents[0].args.projectId));
}

function getEscrowStateFromStatusCode(statusCode: number): EscrowStatus {
    if (statusCode === 0) return "created";
    if (statusCode === 1) return "funded";
    if (statusCode === 2) return "submitted";
    if (statusCode === 3) return "released";
    return "idle";
}

export default function EscrowSimulator({
    selectedRole,
    approvedContract = null,
    escrowSelectionNonce = 0,
}: EscrowSimulatorProps) {
    const account = useActiveAccount();
    const connectedAddress = normalizeWallet(account?.address) || undefined;
    const activeEscrowStorageKey = getWalletCacheKey(
        ESCROW_STORAGE_KEY_PREFIX,
        connectedAddress
    );

    const [clientName, setClientName] = useState("");
    const [clientWallet, setClientWallet] = useState("");
    const [freelancerName, setFreelancerName] = useState("");
    const [freelancerAddress, setFreelancerAddress] = useState("");
    const [settlementAmountCelo, setSettlementAmountCelo] = useState("");
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

    function clearActiveEscrowCache() {
        if (activeEscrowStorageKey) {
            localStorage.removeItem(activeEscrowStorageKey);
        }
    }

    function readActiveEscrowCache() {
        if (!activeEscrowStorageKey || !connectedAddress) {
            return null;
        }

        const savedEscrow = localStorage.getItem(activeEscrowStorageKey);
        if (!savedEscrow) {
            return null;
        }

        try {
            const raw = JSON.parse(savedEscrow) as Partial<ActiveEscrowCacheEntry> & {
                projectId?: number | string | null;
                chainId?: number | string | null;
            };
            const projectId = normalizeProjectId(Number(raw.projectId));
            const wallet = normalizeWallet(raw.wallet) || connectedAddress;
            const chainId = Number(raw.chainId ?? agentGuildChainId);

            if (
                projectId === null ||
                wallet !== connectedAddress ||
                chainId !== agentGuildChainId
            ) {
                clearActiveEscrowCache();
                return null;
            }

            return buildActiveEscrowCacheEntry({
                wallet,
                projectId,
                sourceContractId: raw.sourceContractId,
                settlementAmountCelo: raw.settlementAmountCelo,
                role:
                    raw.role === "client" || raw.role === "freelancer"
                        ? raw.role
                        : selectedRole,
                clientWallet: raw.clientWallet,
                freelancerWallet: raw.freelancerWallet,
            });
        } catch (err) {
            console.error("Failed to restore escrow state", err);
            clearActiveEscrowCache();
            return null;
        }
    }

    function persistActiveEscrowCache(input: {
        projectId: number;
        sourceContractId?: string | null;
        settlementAmountCelo?: string | null;
        clientWallet?: string | null;
        freelancerWallet?: string | null;
    }) {
        if (!activeEscrowStorageKey) {
            return;
        }

        const entry = buildActiveEscrowCacheEntry({
            wallet: connectedAddress,
            projectId: input.projectId,
            sourceContractId: input.sourceContractId,
            settlementAmountCelo: input.settlementAmountCelo,
            role: selectedRole,
            clientWallet: input.clientWallet,
            freelancerWallet: input.freelancerWallet,
        });

        if (!entry) {
            clearActiveEscrowCache();
            return;
        }

        localStorage.setItem(activeEscrowStorageKey, JSON.stringify(entry));
    }

    function getSubmissionStorageKey(projectId: number) {
        return getProjectCacheKey(SUBMISSION_STORAGE_KEY_PREFIX, {
            wallet: connectedAddress,
            projectId,
        });
    }

    function getDisputeStorageKey(projectId: number) {
        return getProjectCacheKey(DISPUTE_STORAGE_KEY_PREFIX, {
            wallet: connectedAddress,
            projectId,
        });
    }

    function getJudgmentStorageKey(projectId: number) {
        return getProjectCacheKey(JUDGMENT_STORAGE_KEY_PREFIX, {
            wallet: connectedAddress,
            projectId,
        });
    }

    function getResolutionStorageKey(projectId: number) {
        return getProjectCacheKey(RESOLUTION_STORAGE_KEY_PREFIX, {
            wallet: connectedAddress,
            projectId,
        });
    }

    function clearDraftEscrowContractContext() {
        setClientName("");
        setClientWallet("");
        setFreelancerName("");
        setFreelancerAddress("");
        setSettlementAmountCelo("");
        setSourceContractId(null);
    }

    function applyApprovedContractContext(contract: ProductContract) {
        setClientName(contract.clientName);
        setClientWallet(contract.clientWallet.toLowerCase());
        setFreelancerName(contract.freelancerName);
        setFreelancerAddress(contract.freelancerWallet.toLowerCase());
        setSettlementAmountCelo(contract.settlementAmountCelo ?? "");
        setSourceContractId(contract.id);
    }

    useEffect(() => {
        if (projectId !== null) return;

        if (!approvedContract) {
            clearDraftEscrowContractContext();
            return;
        }

        setClientName(approvedContract.clientName);
        setClientWallet(approvedContract.clientWallet.toLowerCase());
        setFreelancerName(approvedContract.freelancerName);
        setFreelancerAddress(approvedContract.freelancerWallet.toLowerCase());
        setSourceContractId(approvedContract.id);

        if (sourceContractId !== approvedContract.id) {
            setSettlementAmountCelo(approvedContract.settlementAmountCelo ?? "");
        }
    }, [approvedContract, projectId, sourceContractId]);

    useEffect(() => {
        if (escrowSelectionNonce === 0) return;

        clearActiveEscrowCache();
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
        clearDraftEscrowContractContext();

        if (approvedContract) {
            applyApprovedContractContext(approvedContract);
        }
    }, [activeEscrowStorageKey, approvedContract, escrowSelectionNonce]);

    const escrowContract = useMemo(() => {
        return getContract({
            client,
            chain: agentGuildChain,
            address: FREELANCE_ESCROW_ADDRESS,
            abi: FREELANCE_ESCROW_ABI as any,
        });
    }, []);

    useEffect(() => {
        setProjectId(null);
        setEscrowState("idle");
        setSubmissionLink("");
        setSubmittedWorkLink("");
        setStatus("");

        if (!activeEscrowStorageKey || !connectedAddress) {
            return;
        }

        const restoredEscrow = readActiveEscrowCache();
        if (restoredEscrow) {
            setProjectId(restoredEscrow.projectId);
            setSettlementAmountCelo(restoredEscrow.settlementAmountCelo);
            setSourceContractId(restoredEscrow.sourceContractId);
        }
    }, [activeEscrowStorageKey, connectedAddress]);

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
        let cancelled = false;

        const syncSubmission = async () => {
            setSubmissionLink("");
            setSubmittedWorkLink("");

            try {
                const sharedSubmission = await getProjectSubmission(projectId, account);
                if (cancelled) {
                    return;
                }

                if (sharedSubmission?.deliveryUrl) {
                    const submissionStorageKey = getSubmissionStorageKey(projectId);
                    if (submissionStorageKey) {
                        localStorage.setItem(
                            submissionStorageKey,
                            sharedSubmission.deliveryUrl
                        );
                    }
                    setSubmittedWorkLink(sharedSubmission.deliveryUrl);
                    return;
                }
            } catch (error) {
                console.error("Failed to load shared submission metadata", error);
            }

            const submissionStorageKey = getSubmissionStorageKey(projectId);
            const legacySubmission =
                (submissionStorageKey
                    ? localStorage.getItem(submissionStorageKey)
                    : null)?.trim() ?? "";

            if (
                legacySubmission &&
                account &&
                connectedAddress &&
                connectedAddress === effectiveFreelancerWallet &&
                effectiveClientWallet &&
                effectiveFreelancerWallet
            ) {
                try {
                    const importedSubmission = await saveProjectSubmission(
                        {
                            projectId,
                            deliveryUrl: legacySubmission,
                            clientWallet: effectiveClientWallet,
                            freelancerWallet: effectiveFreelancerWallet,
                        },
                        account
                    );

                    if (cancelled) {
                        return;
                    }

                    if (importedSubmission?.deliveryUrl) {
                        setSubmittedWorkLink(importedSubmission.deliveryUrl);
                        return;
                    }
                } catch (error) {
                    console.error("Failed to import legacy submission metadata", error);
                }
            }

            if (!cancelled && legacySubmission) {
                setSubmissionLink((currentValue) => currentValue || legacySubmission);
            }
        };

        void syncSubmission();

        const disputeStorageKey = getDisputeStorageKey(projectId);
        const savedDispute = disputeStorageKey
            ? localStorage.getItem(disputeStorageKey)
            : null;
        if (savedDispute) {
            setSavedDisputeReason(savedDispute);
            setDisputeReason(savedDispute);
        } else {
            setSavedDisputeReason("");
            setDisputeReason("");
        }
        setShowDisputeForm(false);

        const judgmentStorageKey = getJudgmentStorageKey(projectId);
        const savedJudgment = judgmentStorageKey
            ? localStorage.getItem(judgmentStorageKey)
            : null;
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

        const resolutionStorageKey = getResolutionStorageKey(projectId);
        const savedResolution = resolutionStorageKey
            ? localStorage.getItem(resolutionStorageKey)
            : null;
        if (savedResolution === "judge_release") {
            setJudgeResolution(savedResolution);
        } else {
            if (savedResolution === "judge_refund") {
                if (resolutionStorageKey) {
                    localStorage.removeItem(resolutionStorageKey);
                }
            }
            setJudgeResolution(null);
        }

        const savedEscrow = activeEscrowStorageKey
            ? localStorage.getItem(activeEscrowStorageKey)
            : null;
        if (savedEscrow) {
            try {
                const data = JSON.parse(savedEscrow);
                if (normalizeProjectId(Number(data.projectId)) === projectId) {
                    setClientName(data.clientName ?? "");
                    setClientWallet(data.clientWallet?.toLowerCase() ?? "");
                    setFreelancerName(data.freelancerName ?? "");
                    setFreelancerAddress(data.freelancerAddress ?? "");
                    setSettlementAmountCelo(data.settlementAmountCelo ?? "");
                    setSourceContractId(data.sourceContractId ?? null);
                }
            } catch (err) {
                console.error("Failed to restore escrow state", err);
            }
        }
        return () => {
            cancelled = true;
        };
    }, [
        account,
        activeEscrowStorageKey,
        approvedContract?.clientWallet,
        approvedContract?.freelancerWallet,
        clientWallet,
        connectedAddress,
        freelancerAddress,
        projectId,
    ]);

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

        if (
            connectedAddress &&
            projectId !== null &&
            connectedAddress !== nextClient &&
            connectedAddress !== nextFreelancer
        ) {
            clearActiveEscrowCache();
            setProjectId(null);
            setEscrowState("idle");
            setSubmissionLink("");
            setSubmittedWorkLink("");
            setShowDisputeForm(false);
            setDisputeReason("");
            setSavedDisputeReason("");
            setDisputeJudgment(null);
            setJudgeResolution(null);
            setStatus("Previous escrow session was cleared because it did not match this wallet.");
            clearDraftEscrowContractContext();

            if (approvedContract) {
                applyApprovedContractContext(approvedContract);
            }
            return;
        }

        setClientWallet(nextClient);
        setFreelancerAddress(nextFreelancer);
        setEscrowState(getEscrowStateFromStatusCode(statusCode));

        if (projectId === null) {
            return;
        }

        persistActiveEscrowCache({
            projectId,
            sourceContractId,
            settlementAmountCelo,
            clientWallet: nextClient,
            freelancerWallet: nextFreelancer,
        });
    }, [
        approvedContract,
        connectedAddress,
        projectData,
        projectId,
        settlementAmountCelo,
        sourceContractId,
    ]);

    function pushNotification(message: string, wallets: string[] = participantWallets) {
        appendNotifications(
            wallets.map((wallet) => ({
                wallet,
                message,
            }))
        );
    }

    async function loadMyProjects() {
        if (!connectedAddress) {
            setMyProjects([]);
            setProjectsLoaded(true);
            return;
        }

        try {
            setLoadingProjects(true);
            const indexedProjects = (
                await syncWorkflowProjects(account)
            ).projects;
            const cachedProjects =
                indexedProjects.length > 0
                    ? indexedProjects
                    : getIndexedProjectsForWallet(connectedAddress);

            if (cachedProjects.length === 0) {
                setMyProjects([]);
                setProjectsLoaded(true);
                return;
            }

            const discovered: Array<{
                projectId: number;
                client: string;
                freelancer: string;
                amount: bigint;
                status: number;
            }> = [];

            for (const indexedProject of cachedProjects) {
                const id = indexedProject.projectId;
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
    }, [connectedAddress]);

    async function refreshEscrowUi(nextProjectId?: number) {
        const targetProjectId = normalizeProjectId(
            nextProjectId ?? projectId
        );

        if (targetProjectId !== null && targetProjectId !== projectId) {
            setProjectId(targetProjectId);
        }

        if (targetProjectId !== null && targetProjectId === projectId) {
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

        if (approvedContract) {
            const approvedClient = approvedContract.clientWallet.toLowerCase();
            if (connectedAddress !== approvedClient) {
                setStatus("Only the client wallet on this approved contract can create escrow.");
                return;
            }
        }

        const selectedSourceContract = approvedContract;
        if (!selectedSourceContract) {
            setStatus("Select an approved contract before creating escrow.");
            return;
        }

        const normalizedSettlementAmount = effectiveSettlementAmountCelo.trim();
        const settlementAmountError = validateSettlementAmountCelo(
            normalizedSettlementAmount
        );

        if (!clientName || !freelancerName || !freelancerAddress) {
            setStatus("Fill client name, freelancer name, and freelancer wallet.");
            return;
        }

        if (settlementAmountError) {
            setStatus(settlementAmountError);
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

            const transactionResult = await sendTransaction({
                transaction: tx,
                account,
            });

            const receipt = await waitForReceipt({
                client,
                chain: agentGuildChain,
                transactionHash: transactionResult.transactionHash,
            });
            const createdProjectId = resolveCreatedProjectIdFromReceipt({
                receipt,
                expectedClient: connectedAddress ?? "",
                expectedFreelancer: freelancerAddress,
            });

            if (createdProjectId === null) {
                setStatus(
                    "Escrow transaction confirmed, but the created project ID could not be verified from the receipt. This deployment must emit ProjectCreated before the app can link escrow safely."
                );
                await refreshEscrowUi();
                return;
            }

            setProjectId(createdProjectId);
            setEscrowState("created");
            setClientWallet(connectedAddress ?? "");
            setSubmissionLink("");
            setSubmittedWorkLink("");
            const contractWithSettlement =
                await updateProductContractSettlementAmount(
                    selectedSourceContract.id,
                    normalizedSettlementAmount,
                    account
                );
            const linkedContract =
                contractWithSettlement
                    ? await linkProductContractToProject(
                        contractWithSettlement.id,
                        createdProjectId,
                        account
                    )
                    : await linkProductContractToProject(
                        selectedSourceContract.id,
                        createdProjectId,
                        account
                    );

            if (linkedContract) {
                applyApprovedContractContext(linkedContract);
            }

            persistActiveEscrowCache({
                projectId: createdProjectId,
                sourceContractId: linkedContract?.id ?? selectedSourceContract.id,
                settlementAmountCelo: normalizedSettlementAmount,
                clientWallet: connectedAddress ?? selectedSourceContract.clientWallet,
                freelancerWallet: selectedSourceContract.freelancerWallet,
            });

            const message = `Escrow created for ${selectedSourceContract.freelancerName}. Client should fund ${normalizedSettlementAmount} CELO into Project #${createdProjectId}.`;
            setStatus(`Escrow project created onchain. Project ID: ${createdProjectId}`);
            pushNotification(message);
            await refreshEscrowUi(createdProjectId);
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

        const settlementAmountError = validateSettlementAmountCelo(
            effectiveSettlementAmountCelo
        );
        if (settlementAmountError) {
            setStatus(settlementAmountError);
            return;
        }

        try {
            setBusy(true);
            setStatus("Depositing CELO into escrow...");

            const tx = prepareContractCall({
                contract: escrowContract,
                method: "function deposit(uint256 _projectId)",
                params: [BigInt(projectId)],
                value: parseSettlementAmountCeloToWei(
                    effectiveSettlementAmountCelo
                ),
            });

            await sendTransaction({
                transaction: tx,
                account,
            });

            await refetchProjectData();
            setEscrowState("funded");
            setStatus("Escrow funded successfully.");
            pushNotification(
                `Escrow funded with ${effectiveSettlementAmountCelo} CELO. Freelancer can now submit work for Project #${projectId}.`
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

        let submittedOnchain = false;

        try {
            setBusy(true);
            setStatus("Submitting work to escrow contract...");

            const tx = prepareContractCall({
                contract: escrowContract,
                method: "function submitWork(uint256 _projectId)",
                params: [BigInt(projectId)],
            });

            const transactionResult = await sendTransaction({
                transaction: tx,
                account,
            });
            await waitForReceipt({
                client,
                chain: agentGuildChain,
                transactionHash: transactionResult.transactionHash,
            });
            submittedOnchain = true;

            await refetchProjectData();
            setEscrowState("submitted");

            const syncedSubmission = await saveProjectSubmission(
                {
                    projectId,
                    deliveryUrl: submissionLink.trim(),
                    clientWallet: effectiveClientWallet,
                    freelancerWallet: effectiveFreelancerWallet,
                    txHash: transactionResult.transactionHash,
                },
                account
            );

            const sharedDeliveryUrl =
                syncedSubmission?.deliveryUrl ?? submissionLink.trim();
            const submissionStorageKey = getSubmissionStorageKey(projectId);
            if (submissionStorageKey) {
                localStorage.setItem(
                    submissionStorageKey,
                    sharedDeliveryUrl
                );
            }
            setSubmittedWorkLink(sharedDeliveryUrl);
            setStatus("Work submitted successfully.");
            pushNotification(
                `Work submitted for Project #${projectId}. Client can now review the shared delivery and release payment.`
            );
            await refreshEscrowUi();
        } catch (error) {
            console.error(error);
            if (submittedOnchain) {
                setStatus(
                    "Work reached escrow, but the delivery link did not sync. Use Sync Delivery Link so the client can review it."
                );
            } else {
                setStatus("Submit work failed.");
            }
        } finally {
            setBusy(false);
        }
    }

    async function syncSubmittedDelivery() {
        if (!account) {
            setStatus("Connect your wallet first.");
            return;
        }

        if (projectId === null) {
            setStatus("Select a project first.");
            return;
        }

        if (!isFreelancer) {
            setStatus("Only the assigned freelancer can sync delivery metadata.");
            return;
        }

        if (!submissionLink.trim()) {
            setStatus("Add the delivery link you want the client to review.");
            return;
        }

        try {
            setBusy(true);
            setStatus("Syncing delivery link for the client...");

            const syncedSubmission = await saveProjectSubmission(
                {
                    projectId,
                    deliveryUrl: submissionLink.trim(),
                    clientWallet: effectiveClientWallet,
                    freelancerWallet: effectiveFreelancerWallet,
                },
                account
            );

            if (!syncedSubmission?.deliveryUrl) {
                throw new Error("Shared delivery metadata could not be saved.");
            }

            const submissionStorageKey = getSubmissionStorageKey(projectId);
            if (submissionStorageKey) {
                localStorage.setItem(
                    submissionStorageKey,
                    syncedSubmission.deliveryUrl
                );
            }
            setSubmittedWorkLink(syncedSubmission.deliveryUrl);
            setStatus("Delivery link synced. The client can now review this project.");
            pushNotification(
                `Delivery metadata synced for Project #${projectId}.`
            );
        } catch (error) {
            console.error(error);
            setStatus("Delivery link sync failed.");
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
                const resolutionStorageKey = getResolutionStorageKey(projectId);
                if (resolutionStorageKey) {
                    localStorage.setItem(
                        resolutionStorageKey,
                        resolutionSource
                    );
                }
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
            const totalEarned =
                previous.totalEarned +
                Number.parseFloat(effectiveSettlementAmountCelo || "0");
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

            if (activeEscrowStorageKey) {
                localStorage.removeItem(activeEscrowStorageKey);
            }
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
            setSettlementAmountCelo("");
        }
        setStatus("");
    }

    function saveDisputeReason() {
        if (projectId === null) {
            setStatus("Select a project first.");
            return;
        }

        if (!isReviewStage || !isClient) {
            setStatus("Support review is only available to the client during the review stage.");
            return;
        }

        if (!disputeReason.trim()) {
            setStatus("Enter a support review reason before submitting.");
            return;
        }

        const nextReason = disputeReason.trim();
        const disputeStorageKey = getDisputeStorageKey(projectId);
        if (!disputeStorageKey) {
            setStatus("Support review cache is unavailable for this wallet.");
            return;
        }

        localStorage.setItem(disputeStorageKey, nextReason);
        setSavedDisputeReason(nextReason);
        setShowDisputeForm(false);
        setStatus("Support review request saved. Run AI support review for a non-settling recommendation.");
        pushNotification(
            `Support review opened for Project #${projectId}. The case is ready for AI review.`
        );
    }

    async function judgeDispute() {
        if (projectId === null) {
            setStatus("Select a project first.");
            return;
        }

        if (!savedDisputeReason.trim()) {
            setStatus("Save a support review reason before judging.");
            return;
        }

        if (!submittedWorkLink.trim()) {
            setStatus("A submitted work link is required for AI support review.");
            return;
        }

        const reviewContextContract =
            getProductContractByLinkedProjectId(projectId) ??
            (sourceContractId ? getProductContractById(sourceContractId) : null);

        if (
            !reviewContextContract?.summary ||
            !Array.isArray(reviewContextContract.milestones) ||
            reviewContextContract.milestones.length === 0
        ) {
            setStatus(
                "The linked contract context is missing for this project. Reopen the current project from the active wallet and try again."
            );
            return;
        }

        try {
            setJudgingDispute(true);
            setStatus("AI support review is evaluating the case...");

            const res = await fetch("/api/judge-dispute", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    contractSummary: reviewContextContract.summary,
                    milestones: reviewContextContract.milestones,
                    submittedWorkLink,
                    disputeReason: savedDisputeReason,
                }),
            });

            const result = await res.json();

            if (!res.ok) {
                throw new Error(result?.error || "AI support review failed.");
            }

            const judgmentStorageKey = getJudgmentStorageKey(projectId);
            if (judgmentStorageKey) {
                localStorage.setItem(
                    judgmentStorageKey,
                    JSON.stringify(result)
                );
            }
            setDisputeJudgment(result);
            setStatus("AI support recommendation ready. Refund outcomes remain non-settling in beta.");
            pushNotification(
                `AI support review completed for Project #${projectId}.`
            );
        } catch (error: any) {
            console.error(error);
            setStatus(error?.message || "AI support review failed.");
        } finally {
            setJudgingDispute(false);
        }
    }

    async function resolveJudgeRelease() {
        if (!disputeJudgment || disputeJudgment.verdict !== "release_funds") {
            setStatus("AI support review has not recommended release for this project.");
            return;
        }

        await approveAndRelease("judge_release");
    }

    function verdictLabel(verdict: DisputeJudgment["verdict"]) {
        if (verdict === "release_funds") return "Release Funds";
        return "Do Not Release Onchain";
    }

    const isClientWorkspace = selectedRole === "client";
    const isFreelancerWorkspace = selectedRole === "freelancer";
    const preCreateSourceContract = projectId === null ? approvedContract : null;
    const activeProjectContract =
        projectId !== null ? getProductContractByLinkedProjectId(projectId) : null;
    const effectiveEscrowContract = activeProjectContract ?? preCreateSourceContract;
    const effectiveDisplayBudget = effectiveEscrowContract
        ? formatDisplayBudget(effectiveEscrowContract.displayBudget)
        : "Not set";
    const effectiveSettlementAmountCelo =
        projectId === null
            ? settlementAmountCelo.trim()
            : effectiveEscrowContract?.settlementAmountCelo?.trim() ||
                settlementAmountCelo.trim();
    const settlementAmountError =
        effectiveSettlementAmountCelo
            ? validateSettlementAmountCelo(effectiveSettlementAmountCelo)
            : null;
    const preFundingCopy =
        projectId !== null &&
            escrowState === "created" &&
            isClient &&
            effectiveSettlementAmountCelo &&
            !settlementAmountError
            ? `You are about to fund ${effectiveSettlementAmountCelo} CELO`
            : null;
    const effectiveFreelancerName =
        effectiveEscrowContract?.freelancerName ||
        freelancerName ||
        approvedContract?.freelancerName ||
        "Pending";
    const sourceContractMarkerLabel =
        projectId === null
            ? "Current escrow source contract"
            : "Escrow source contract";
    const sourceContractMarkerCopy =
        projectId === null
            ? "Selected approved contract. Pre-create escrow details come only from this agreement."
            : activeProjectContract
                ? "Project-linked contract. Active project state is now the source of truth."
                : "Contract context is being restored from the active project.";
    const primaryColumnClass = isFreelancerWorkspace
        ? "order-2 lg:order-2"
        : "order-2 lg:order-1";
    const secondaryColumnClass = isFreelancerWorkspace
        ? "order-1 lg:order-1"
        : "order-1 lg:order-2";
    const finalResolutionLabel =
        judgeResolution === "judge_release"
            ? "Resolved by Judge: Release"
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
        "Review / Support",
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
    const needsSubmissionSync =
        projectId !== null &&
        escrowState === "submitted" &&
        isFreelancer &&
        !submittedWorkLink.trim();
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
                        : disputeJudgment?.verdict === "refund_client" && escrowState === "submitted"
                            ? "AI support review recommends not releasing funds onchain. Beta mode does not support onchain refunds."
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
                            : escrowState === "submitted" && !needsSubmissionSync
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
                                        ? disputeJudgment.verdict === "release_funds"
                                            ? "Support review recommends release. The client can still choose whether to settle onchain."
                                            : "Support review recommends holding release. Refunds are not executable onchain in beta."
                                        : "A support review request has been submitted. Run AI support review for a non-settling recommendation."
                                    : "Work has been submitted and is waiting for client review."
                                : "The project has reached its final resolved state.");

    useEffect(() => {
        if (!activeProjectContract || projectId === null) return;

        applyApprovedContractContext(activeProjectContract);
    }, [activeProjectContract?.id, projectId]);

    useEffect(() => {
        if (!effectiveEscrowContract || projectId === null) return;

        const contractSettlementAmount =
            effectiveEscrowContract.settlementAmountCelo?.trim() ?? "";
        if (!contractSettlementAmount || settlementAmountCelo === contractSettlementAmount) {
            return;
        }

        setSettlementAmountCelo(contractSettlementAmount);

        persistActiveEscrowCache({
            projectId,
            sourceContractId: effectiveEscrowContract.id,
            settlementAmountCelo: contractSettlementAmount,
            clientWallet: effectiveClientWallet,
            freelancerWallet: effectiveFreelancerWallet,
        });
    }, [
        effectiveClientWallet,
        effectiveEscrowContract?.id,
        effectiveEscrowContract?.settlementAmountCelo,
        effectiveFreelancerWallet,
        projectId,
        settlementAmountCelo,
    ]);

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
                        : `Create a real escrow project, deposit CELO, review delivery, and release funds on ${agentGuildChainLabel}.`}
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

                        <div className="mt-6 grid gap-3 sm:grid-cols-4">
                            <MiniStateCard label="Project" value={projectId ? `#${projectId}` : "Not created"} />
                            <MiniStateCard
                                label="Freelancer"
                                value={effectiveFreelancerName}
                            />
                            <MiniStateCard label="Contract value" value={effectiveDisplayBudget} />
                            <MiniStateCard
                                label="Settlement amount"
                                value={formatSettlementAmountCelo(effectiveSettlementAmountCelo)}
                            />
                        </div>

                        {effectiveEscrowContract && (
                            <div className="mt-6 rounded-[16px] border border-[#4c1d24] bg-[#160b0d] p-4">
                                <div className="text-[12px] uppercase tracking-[0.12em] text-[#f2b6be]">
                                    {sourceContractMarkerLabel}
                                </div>
                                <div className="mt-2 text-[18px] font-semibold tracking-[-0.02em] text-[#f8fafc]">
                                    Contract {effectiveEscrowContract.id.slice(0, 8)}
                                </div>
                                <div className="mt-2 text-[13px] leading-6 text-[#f6c8ce]">
                                    {sourceContractMarkerCopy}
                                </div>
                                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                                    <MiniStateCard label="Client" value={effectiveEscrowContract.clientName} />
                                    <MiniStateCard
                                        label="Freelancer"
                                        value={effectiveEscrowContract.freelancerName}
                                    />
                                    <MiniStateCard
                                        label="Contract value"
                                        value={formatDisplayBudget(effectiveEscrowContract.displayBudget)}
                                    />
                                    <MiniStateCard
                                        label="Settlement amount"
                                        value={formatSettlementAmountCelo(effectiveSettlementAmountCelo)}
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
                                {!preCreateSourceContract && (
                                    <div className="rounded-[12px] border border-[#1f1f1f] bg-[#111111] px-4 py-3 text-sm text-[#d1d5db]">
                                        Escrow creation unlocks only after a freelancer approves a contract.
                                    </div>
                                )}

                                {preCreateSourceContract ? (
                                    <div className="grid gap-3 sm:grid-cols-3">
                                        <div className="rounded-[12px] border border-[#1f1f1f] bg-[#111111] p-4">
                                            <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                                                Freelancer
                                            </div>
                                            <div className="mt-2 text-[15px] font-semibold text-[#f8fafc]">
                                                {preCreateSourceContract.freelancerName}
                                            </div>
                                            <div className="mt-2 text-[13px] break-all text-[#9ca3af]">
                                                {preCreateSourceContract.freelancerWallet}
                                            </div>
                                        </div>

                                        <div className="rounded-[12px] border border-[#1f1f1f] bg-[#111111] p-4">
                                            <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                                                Contract value
                                            </div>
                                            <div className="mt-2 text-[15px] font-semibold text-[#f8fafc]">
                                                {formatDisplayBudget(preCreateSourceContract.displayBudget)}
                                            </div>
                                            <div className="mt-2 text-[13px] text-[#9ca3af]">
                                                {preCreateSourceContract.milestones.length} milestones agreed
                                            </div>
                                        </div>

                                        <div className="rounded-[12px] border border-[#1f1f1f] bg-[#111111] p-4">
                                            <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                                                Settlement amount
                                            </div>
                                            <div className="mt-2 text-[15px] font-semibold text-[#f8fafc]">
                                                {formatSettlementAmountCelo(effectiveSettlementAmountCelo)}
                                            </div>
                                            <div className="mt-2 text-[13px] text-[#9ca3af]">
                                                Set the CELO amount you actually want to fund onchain.
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
                                            value={settlementAmountCelo}
                                            onChange={(e) => setSettlementAmountCelo(e.target.value)}
                                            placeholder="Settlement amount in CELO e.g 0.01"
                                            className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#6f1d26]"
                                        />
                                    </>
                                )}

                                {preCreateSourceContract && projectId === null && (
                                    <input
                                        value={settlementAmountCelo}
                                        onChange={(e) => setSettlementAmountCelo(e.target.value)}
                                        placeholder="Settlement amount in CELO e.g 0.01"
                                        className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#6f1d26]"
                                    />
                                )}

                                {settlementAmountError && (projectId === null || escrowState === "created") ? (
                                    <div className="rounded-[12px] border border-[#4c1d24] bg-[#160b0d] px-4 py-3 text-sm text-[#f2b6be]">
                                        {settlementAmountError}
                                    </div>
                                ) : null}

                                <div className="flex flex-col gap-3 pt-2">
                                    {projectId === null && preCreateSourceContract && (
                                        <button
                                            onClick={createEscrowProject}
                                            disabled={busy}
                                            className="rounded-[10px] bg-[#d72638] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b91f30] disabled:opacity-60"
                                        >
                                            {busy ? "Processing..." : "Create Onchain Escrow"}
                                        </button>
                                    )}

                                    {preFundingCopy && (
                                        <div className="rounded-[12px] border border-[#1f3b28] bg-[#0d1912] px-4 py-3 text-sm text-[#9be2b0]">
                                            {preFundingCopy}
                                        </div>
                                    )}

                                    {projectId !== null && escrowState === "created" && isClient && (
                                        <button
                                            onClick={depositFunds}
                                            disabled={busy || !!settlementAmountError || !effectiveSettlementAmountCelo}
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
                                                    {showDisputeForm ? "Close Support Review" : "Open Support Review"}
                                                </button>
                                            </div>

                                            {showDisputeForm && (
                                                <div className="grid gap-3">
                                                    <textarea
                                                        value={disputeReason}
                                                        onChange={(e) => setDisputeReason(e.target.value)}
                                                        placeholder="Explain why this submission needs support review"
                                                        rows={4}
                                                        className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#6f1d26]"
                                                    />

                                                    <div className="flex flex-col gap-3 sm:flex-row">
                                                        <button
                                                            onClick={saveDisputeReason}
                                                            type="button"
                                                            className="rounded-[10px] bg-[#d72638] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b91f30]"
                                                        >
                                                            Save Support Review
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
                                                        Support review saved
                                                    </div>
                                                    <div className="mt-2 text-sm leading-7 text-[#d1d5db]">
                                                        The review request is saved. Run AI support review to generate a non-settling recommendation from the contract, milestones, and submitted work.
                                                    </div>
                                                    <div className="mt-3 rounded-[10px] border border-[#3f2c11] bg-[#18120a] px-3 py-3 text-xs leading-6 text-[#facc15]">
                                                        {BETA_DISPUTE_SUPPORT_COPY}
                                                    </div>
                                                    <button
                                                        onClick={judgeDispute}
                                                        type="button"
                                                        disabled={judgingDispute}
                                                        className="mt-4 rounded-[10px] bg-[#d72638] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b91f30] disabled:opacity-50"
                                                    >
                                                        {judgingDispute ? "Running AI Support Review..." : "Run AI Support Review"}
                                                    </button>
                                                </div>
                                            )}

                                            {disputeJudgment && (
                                                <div className="rounded-[12px] border border-[#1f3b28] bg-[#0d1912] px-4 py-4 text-sm text-[#9be2b0]">
                                                    AI support review completed. See the support rail for the recommendation, confidence, and reasoning.
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {canResolveFromJudgment && disputeJudgment && (
                                        <div className="rounded-[12px] border border-[#4c1d24] bg-[#160b0d] px-4 py-4">
                                            <div className="text-[12px] uppercase tracking-[0.12em] text-[#f2b6be]">
                                                AI support recommendation
                                            </div>
                                            <div className="mt-2 text-[16px] font-semibold text-[#f8fafc]">
                                                {verdictLabel(disputeJudgment.verdict)}
                                            </div>
                                            <div className="mt-2 text-sm leading-7 text-[#d1d5db]">
                                                {disputeJudgment.verdict === "release_funds"
                                                    ? `Confidence ${disputeJudgment.confidence}%. Release remains the only onchain settlement path in beta.`
                                                    : `Confidence ${disputeJudgment.confidence}%. This is a non-settling recommendation only. Beta mode does not execute refunds onchain.`}
                                            </div>

                                            {disputeJudgment.verdict === "release_funds" ? (
                                                <button
                                                    onClick={resolveJudgeRelease}
                                                    disabled={busy}
                                                    className="mt-4 rounded-[10px] bg-[#d72638] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b91f30] disabled:opacity-50"
                                                >
                                                    {busy ? "Resolving..." : "Release Funds Onchain"}
                                                </button>
                                            ) : (
                                                <div className="mt-4 rounded-[10px] border border-[#3f2c11] bg-[#18120a] px-4 py-3 text-sm leading-7 text-[#facc15]">
                                                    Refunds are not executable onchain in mainnet beta. Use this recommendation for offchain support review only.
                                                </div>
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
                            Submit delivery when this wallet is the assigned freelancer, then keep the shared delivery link synced so the client can review it from any device.
                        </div>

                        {!freelancerActionBlockedReason &&
                        projectId !== null &&
                        (escrowState === "funded" || needsSubmissionSync) &&
                        isFreelancer ? (
                            <div className="mt-4 grid gap-3">
                                <input
                                    value={submissionLink}
                                    onChange={(e) => setSubmissionLink(e.target.value)}
                                    placeholder="Work submission link (GitHub, Figma, Drive)"
                                    className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#6f1d26]"
                                />

                                <button
                                    onClick={needsSubmissionSync ? syncSubmittedDelivery : submitWork}
                                    disabled={busy}
                                    className="rounded-[10px] border border-[#2c2c2c] px-5 py-3 text-sm font-semibold text-[#f8fafc] transition hover:border-[#3a3a3a] disabled:opacity-50"
                                >
                                    {needsSubmissionSync ? "Sync Delivery Link" : "Submit Work"}
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
                                    <MiniStateCard label="Support review reason" value={savedDisputeReason} />
                                )}
                                {!savedDisputeReason && isReviewStage && (
                                    <MiniStateCard label="Support review status" value="No support review submitted" />
                                )}
                                {judgeResolution === "judge_release" && (
                                    <MiniStateCard label="Final outcome" value="Resolved by Judge: Release" accent />
                                )}
                                {disputeJudgment?.verdict === "refund_client" && !judgeResolution && (
                                    <MiniStateCard
                                        label="Support recommendation"
                                        value="Do not release onchain"
                                    />
                                )}
                            </div>
                        </div>

                        <div className="rounded-[12px] border border-[#1f1f1f] bg-[#111111] p-4">
                            <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                                AI Support Review
                            </div>
                            {!hasSubmittedDispute ? (
                                <div className="mt-2 text-[14px] text-[#9ca3af]">
                                    No support review submitted yet.
                                </div>
                            ) : !disputeJudgment ? (
                                <div className="mt-2 text-[14px] text-[#9ca3af]">
                                    Support review submitted. Run AI support review from the main workflow panel to get a non-settling recommendation.
                                </div>
                            ) : (
                                <div className="mt-2 grid gap-3">
                                    <div>
                                        <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                                            Recommendation
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

                                    {disputeJudgment.verdict === "refund_client" && (
                                        <div className="rounded-[10px] border border-[#3f2c11] bg-[#18120a] px-3 py-3 text-sm leading-7 text-[#facc15]">
                                            This recommendation does not settle funds onchain. Release is the only executable beta settlement path.
                                        </div>
                                    )}

                                    {judgeResolution && (
                                        <div>
                                            <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                                                Final outcome
                                            </div>
                                            <div className="mt-1 text-[15px] font-semibold text-[#f8fafc]">
                                                Resolved by Judge: Release
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
                                        {connectedAddress
                                            ? "No notifications for this wallet yet."
                                            : "Connect a wallet to see wallet-scoped notifications."}
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
