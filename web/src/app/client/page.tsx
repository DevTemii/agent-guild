"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useActiveAccount, useReadContract } from "thirdweb/react";
import { getContract } from "thirdweb";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
import EscrowSimulator from "@/components/EscrowSimulator";
import { MiniPayWalletButton, MiniPayWalletSheet } from "@/components/wallet/MiniPayWalletSheet";
import { WorkspaceNavItem, WorkspacePanel, WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import {
  ContractCardList,
  DealEventList,
  DealStageCard,
  DetailCard,
  EmptyState,
  InlineNotice,
  MetadataPill,
} from "@/components/workspace/WorkspacePrimitives";
import { client } from "@/lib/client";
import { AGENT_REGISTRY_ABI, AGENT_REGISTRY_ADDRESS } from "@/lib/contract";
import { getContractCacheKey, getWalletCacheKey } from "@/lib/cacheKeys";
import { agentGuildChain } from "@/lib/networkConfig";
import { agentGuildRuntimeConfig } from "@/lib/runtimeConfig";
import {
  createDraftContract,
  getContractsForClient,
  getNotificationsForWallet,
  getWorkflowRefreshEventName,
  normalizeWallet,
  ProductContract,
  sendProductContract,
  syncWorkflowState,
} from "@/lib/workflowStore";
import {
  buildDisplayBudgetFromInput,
  formatDisplayBudget,
  formatSettlementAmountCelo,
  validateUsdAmountInput,
} from "@/lib/budget";

type Agent = {
  owner: string;
  name: string;
  description: string;
  skill: string;
  hourlyRate: bigint;
  location: string;
  availability: string;
};

type ClientProfile = {
  companyName: string;
  contactName: string;
  operatingFocus: string;
};

type ClientView = "home" | "deal" | "profile";
type ClientStage = "connect" | "create" | "wait" | "fund" | "review";

const PROFILE_STORAGE_KEY_PREFIX = "agent-guild-client-profile";
const GENERATED_CONTRACT_STORAGE_KEY_PREFIX = "agent-guild-generated-contract";

export default function ClientWorkspacePage() {
  if (!agentGuildRuntimeConfig.valid || !client) {
    return (
      <ConfigErrorScreen
        title="Client app unavailable"
        description="Agent Guild could not load wallet and contract configuration on this device, so client actions stay disabled until the public runtime values are fixed."
        errors={agentGuildRuntimeConfig.errors}
      />
    );
  }

  return <ConfiguredClientWorkspacePage />;
}

function ConfiguredClientWorkspacePage() {
  const thirdwebClient = client!;
  const account = useActiveAccount();
  const connectedAddress = normalizeWallet(account?.address) || null;
  const [walletSheetOpen, setWalletSheetOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [operatingFocus, setOperatingFocus] = useState("");
  const [savedProfile, setSavedProfile] = useState<ClientProfile | null>(null);
  const [onboardingStatus, setOnboardingStatus] = useState("");
  const [clientName, setClientName] = useState("");
  const [projectBrief, setProjectBrief] = useState("");
  const [displayBudgetAmountUsd, setDisplayBudgetAmountUsd] = useState("");
  const [generatingContract, setGeneratingContract] = useState(false);
  const [contractStatus, setContractStatus] = useState("");
  const [notifications, setNotifications] = useState<string[]>([]);
  const [freelancerSearch, setFreelancerSearch] = useState("");
  const [selectedFreelancerWallet, setSelectedFreelancerWallet] = useState("");
  const [customFreelancerWallet, setCustomFreelancerWallet] = useState("");
  const [contracts, setContracts] = useState<ProductContract[]>([]);
  const [selectedApprovedContractId, setSelectedApprovedContractId] = useState<string | null>(null);
  const [escrowSelectionNonce, setEscrowSelectionNonce] = useState(0);
  const [activeView, setActiveView] = useState<ClientView>("home");
  const [hasManualViewSelection, setHasManualViewSelection] = useState(false);

  const registryContract = useMemo(
    () =>
      getContract({
        client: thirdwebClient,
        chain: agentGuildChain,
        address: AGENT_REGISTRY_ADDRESS,
        abi: AGENT_REGISTRY_ABI,
      }),
    [thirdwebClient]
  );

  const { data } = useReadContract({ contract: registryContract, method: "getAgents", params: [] });
  const allAgents = (data as Agent[] | undefined) || [];
  const availableTalent = allAgents.filter((agent, index, arr) => {
    const owner = normalizeWallet(agent.owner);
    return index === arr.findIndex((item) => normalizeWallet(item.owner) === owner);
  });
  const filteredTalent = availableTalent.filter((agent) => {
    const query = freelancerSearch.toLowerCase().trim();
    if (!query) {
      return true;
    }

    return (
      agent.name.toLowerCase().includes(query) ||
      agent.skill.toLowerCase().includes(query) ||
      agent.location.toLowerCase().includes(query)
    );
  });
  const selectedFreelancer =
    availableTalent.find((agent) => normalizeWallet(agent.owner) === normalizeWallet(selectedFreelancerWallet)) ?? null;

  useEffect(() => {
    setSavedProfile(null);
    setCompanyName("");
    setContactName("");
    setOperatingFocus("");
    setClientName("");

    const profileStorageKey = getWalletCacheKey(PROFILE_STORAGE_KEY_PREFIX, connectedAddress);
    if (!profileStorageKey) {
      return;
    }

    const savedProfileRaw = localStorage.getItem(profileStorageKey);
    if (!savedProfileRaw) {
      return;
    }

    try {
      const parsed = JSON.parse(savedProfileRaw) as ClientProfile;
      setSavedProfile(parsed);
      setCompanyName(parsed.companyName);
      setContactName(parsed.contactName);
      setOperatingFocus(parsed.operatingFocus);
      setClientName(parsed.companyName);
    } catch (error) {
      console.error("Failed to restore client profile", error);
    }
  }, [connectedAddress]);

  useEffect(() => {
    if (selectedFreelancer) {
      setCustomFreelancerWallet("");
    }
  }, [selectedFreelancer]);

  useEffect(() => {
    if (!connectedAddress) {
      setContracts([]);
      setNotifications([]);
      setSelectedApprovedContractId(null);
      return;
    }

    const syncWorkflow = async () => {
      await syncWorkflowState(account);

      const nextContracts = getContractsForClient(connectedAddress);
      setContracts(nextContracts);
      const availableApprovedContracts = nextContracts.filter(
        (contract) => contract.status === "approved" && !contract.linkedProjectId
      );
      setSelectedApprovedContractId((currentId) => {
        if (currentId && availableApprovedContracts.some((contract) => contract.id === currentId)) {
          return currentId;
        }

        return availableApprovedContracts[0]?.id ?? null;
      });
      setNotifications(getNotificationsForWallet(connectedAddress));
    };

    void syncWorkflow();
    window.addEventListener("storage", syncWorkflow);
    window.addEventListener(getWorkflowRefreshEventName(), syncWorkflow);
    return () => {
      window.removeEventListener("storage", syncWorkflow);
      window.removeEventListener(getWorkflowRefreshEventName(), syncWorkflow);
    };
  }, [account, connectedAddress]);

  function saveClientProfile() {
    const profileStorageKey = getWalletCacheKey(PROFILE_STORAGE_KEY_PREFIX, connectedAddress);

    if (!profileStorageKey) {
      setOnboardingStatus("Connect your wallet before saving a client profile.");
      return;
    }

    if (!companyName.trim() || !contactName.trim()) {
      setOnboardingStatus("Add company name and contact name to continue.");
      return;
    }

    const nextProfile = {
      companyName: companyName.trim(),
      contactName: contactName.trim(),
      operatingFocus: operatingFocus.trim() || "AI operations",
    };

    localStorage.setItem(profileStorageKey, JSON.stringify(nextProfile));
    setSavedProfile(nextProfile);
    setClientName(nextProfile.companyName);
    setOnboardingStatus("Client profile saved.");
  }

  async function handleGenerateContract() {
    if (!clientName || !projectBrief || !displayBudgetAmountUsd) {
      setContractStatus("Add the client name, project brief, and contract value first.");
      return;
    }
    if (!connectedAddress) {
      setContractStatus("Connect your wallet first.");
      return;
    }

    const freelancerWallet =
      normalizeWallet(selectedFreelancer?.owner) || normalizeWallet(customFreelancerWallet);
    const freelancerName = selectedFreelancer?.name?.trim() || "Custom freelancer";
    if (!freelancerWallet) {
      setContractStatus("Select a freelancer or enter a trusted wallet before creating the deal.");
      return;
    }

    const displayBudgetError = validateUsdAmountInput(displayBudgetAmountUsd);
    if (displayBudgetError) {
      setContractStatus(displayBudgetError);
      return;
    }

    try {
      setGeneratingContract(true);
      setContractStatus("Creating the deal...");
      const res = await fetch("/api/generate-contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName,
          projectDescription: projectBrief,
          displayBudgetAmountUsd: displayBudgetAmountUsd.trim(),
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result?.error || result?.message || "Failed to generate contract.");
      }

      const draft = await createDraftContract(
        {
          clientWallet: connectedAddress,
          clientName,
          freelancerWallet,
          freelancerName,
          projectBrief,
          displayBudget: buildDisplayBudgetFromInput(displayBudgetAmountUsd),
          settlementAmountCelo: null,
          summary: result.summary,
          milestones: result.milestones,
        },
        account
      );

      const generatedContractStorageKey = getContractCacheKey(GENERATED_CONTRACT_STORAGE_KEY_PREFIX, {
        wallet: connectedAddress,
        contractId: draft.id,
      });

      if (generatedContractStorageKey) {
        localStorage.setItem(generatedContractStorageKey, JSON.stringify(result));
      }

      await syncWorkflowState(account);
      setContracts(getContractsForClient(connectedAddress));
      setNotifications(getNotificationsForWallet(connectedAddress));
      setContractStatus("Deal created. Send it when you are ready.");
      openClientView("deal");
    } catch (error) {
      console.error(error);
      const nextStatus =
        error instanceof Error
          ? error.message === "Failed to create workflow challenge."
            ? "Could not start a secure wallet session for contract creation. Reconnect MiniPay and try again."
            : error.message
          : "AI contract generation failed.";
      setContractStatus(nextStatus);
    } finally {
      setGeneratingContract(false);
    }
  }

  async function sendContract(contractId: string) {
    const next = await sendProductContract(contractId, account);
    if (!next) {
      setContractStatus("Unable to send this deal. Confirm the freelancer wallet is saved correctly.");
      return;
    }

    await syncWorkflowState(account);
    setContracts(getContractsForClient(connectedAddress));
    setNotifications(getNotificationsForWallet(connectedAddress));
    setContractStatus(`Deal sent to ${next.freelancerName}.`);
  }

  const sortedContracts = [...contracts].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  const draftContracts = sortedContracts.filter((contract) => contract.status === "draft");
  const sentContracts = sortedContracts.filter((contract) => contract.status === "sent");
  const approvedContracts = sortedContracts.filter((contract) => contract.status === "approved");
  const rejectedContracts = sortedContracts.filter((contract) => contract.status === "rejected");
  const unusedApprovedContracts = approvedContracts.filter((contract) => !contract.linkedProjectId);
  const linkedContracts = approvedContracts.filter((contract) => (contract.linkedProjectId ?? 0) > 0);
  const selectedApprovedContract =
    approvedContracts.find((contract) => contract.id === selectedApprovedContractId && !contract.linkedProjectId) ?? null;

  function selectApprovedContractForEscrow(contractId: string) {
    const nextContract = unusedApprovedContracts.find((contract) => contract.id === contractId) ?? null;
    if (!nextContract) {
      return;
    }

    setSelectedApprovedContractId(nextContract.id);
    setEscrowSelectionNonce((current) => current + 1);
    openClientView("deal");
  }

  function openClientView(view: ClientView) {
    setHasManualViewSelection(true);
    setActiveView(view);
  }

  const clientStage = useMemo<ClientStage>(() => {
    if (!connectedAddress) return "connect";
    if (!savedProfile) return "create";
    if (linkedContracts.length > 0) return "review";
    if (unusedApprovedContracts.length > 0) return "fund";
    if (sentContracts.length > 0) return "wait";
    return "create";
  }, [connectedAddress, linkedContracts.length, savedProfile, sentContracts.length, unusedApprovedContracts.length]);

  const recommendedView = useMemo<ClientView>(() => {
    if (clientStage === "connect") return "home";
    if (clientStage === "create" && !savedProfile) return "profile";
    if (clientStage === "create") return "deal";
    return "home";
  }, [clientStage, savedProfile]);

  useEffect(() => {
    if (hasManualViewSelection) {
      return;
    }

    setActiveView(recommendedView);
  }, [hasManualViewSelection, recommendedView]);

  const stageCopy = useMemo(() => {
    switch (clientStage) {
      case "connect":
        return {
          eyebrow: "Connect",
          title: "Connect your MiniPay wallet",
          body: "Secure payment, deal ownership, and payout release all follow the connected wallet.",
          actionLabel: "Connect Wallet",
          onAction: () => setWalletSheetOpen(true),
        };
      case "create":
        return {
          eyebrow: "Step 1",
          title: "Create the deal",
          body: "Write the work, choose the freelancer, and prepare the agreement in one guided flow.",
          actionLabel: "Open Deal",
          onAction: () => openClientView("deal"),
        };
      case "wait":
        return {
          eyebrow: "Step 2",
          title: "Waiting for approval",
          body: "The freelancer needs to approve the deal before you can secure payment.",
          actionLabel: "View Deal",
          onAction: () => openClientView("deal"),
        };
      case "fund":
        return {
          eyebrow: "Step 3",
          title: "Secure payment",
          body: "The deal is approved. The next move is to lock payment in escrow.",
          actionLabel: "Secure Payment",
          onAction: () => openClientView("deal"),
        };
      case "review":
        return {
          eyebrow: "Step 4",
          title: "Review work and confirm payout",
          body: "Follow the submitted work, confirm the outcome, and release funds when the deal is complete.",
          actionLabel: "Open Deal",
          onAction: () => openClientView("deal"),
        };
    }
  }, [clientStage]);

  const timelineEvents = useMemo(() => {
    const events: Array<{ id: string; speaker: string; message: string; tone?: "neutral" | "accent" | "success" }> = [];

    if (savedProfile) {
      events.push({
        id: "profile",
        speaker: "You",
        message: `${savedProfile.companyName} is ready to create and manage deals from this wallet.`,
      });
    }

    if (draftContracts[0]) {
      events.push({
        id: `draft-${draftContracts[0].id}`,
        speaker: "You",
        message: `You created a contract for ${draftContracts[0].freelancerName}.`,
        tone: "accent",
      });
    }

    if (sentContracts[0]) {
      events.push({
        id: `sent-${sentContracts[0].id}`,
        speaker: "Deal",
        message: `${sentContracts[0].freelancerName} still needs to approve the deal.`,
      });
    }

    if (unusedApprovedContracts[0]) {
      events.push({
        id: `approved-${unusedApprovedContracts[0].id}`,
        speaker: "Freelancer",
        message: `${unusedApprovedContracts[0].freelancerName} approved the deal. Payment is ready to secure.`,
        tone: "accent",
      });
    }

    if (linkedContracts[0]?.linkedProjectId) {
      events.push({
        id: `linked-${linkedContracts[0].id}`,
        speaker: "Escrow",
        message: `Payment secured for Project #${linkedContracts[0].linkedProjectId}. Work can now be reviewed and paid out here.`,
        tone: "success",
      });
    }

    return events.slice(0, 4);
  }, [draftContracts, linkedContracts, savedProfile, sentContracts, unusedApprovedContracts]);

  const navItems: WorkspaceNavItem[] = [
    { id: "home", label: "Home" },
    { id: "deal", label: "Deal" },
    { id: "profile", label: "Profile" },
  ];

  return (
    <>
      <WorkspaceShell
        workspaceLabel="Client"
        title="Secure freelance payments"
        description="Create a deal, secure payment, review work, and release funds in one guided flow."
        navItems={navItems}
        activeItem={activeView}
        onItemChange={(id) => openClientView(id as ClientView)}
        headerActions={
          <>
            <Link
              href="/freelancer"
              className="inline-flex min-h-[52px] items-center justify-center rounded-[16px] border border-[#252525] bg-[#0d0d0d] px-4 py-3 text-sm font-semibold text-[#f7f4ef] transition hover:border-[#393939]"
            >
              Freelancer
            </Link>
            <MiniPayWalletButton onClick={() => setWalletSheetOpen(true)} />
          </>
        }
        focusArea={
          <DealStageCard
            eyebrow={stageCopy.eyebrow}
            title={stageCopy.title}
            body={stageCopy.body}
            cta={
              <button
                type="button"
                onClick={stageCopy.onAction}
                className="min-h-[56px] w-full rounded-[18px] bg-[#d72638] px-5 py-4 text-base font-semibold text-white transition hover:bg-[#b91f30]"
              >
                {stageCopy.actionLabel}
              </button>
            }
          />
        }
        mainArea={
          <>
            {activeView === "home" ? (
              <>
                <WorkspacePanel title="Deal updates" subtitle="Follow the payment flow like a conversation.">
                  <DealEventList events={timelineEvents} />
                </WorkspacePanel>

                <WorkspacePanel title="What happens next" subtitle="Keep the current action simple and immediate.">
                  <div className="grid gap-3">
                    <DetailCard label="Current step" value={stageCopy.title} />
                    <DetailCard label="Next action" value={stageCopy.actionLabel} />
                  </div>
                </WorkspacePanel>
              </>
            ) : null}

            {activeView === "deal" ? (
              <>
                {!connectedAddress ? (
                  <WorkspacePanel title="Connect wallet" subtitle="The client wallet controls deals and payouts.">
                    <button
                      type="button"
                      onClick={() => setWalletSheetOpen(true)}
                      className="min-h-[56px] w-full rounded-[18px] bg-[#d72638] px-5 py-4 text-base font-semibold text-white transition hover:bg-[#b91f30]"
                    >
                      Connect Wallet
                    </button>
                  </WorkspacePanel>
                ) : null}

                {connectedAddress && !savedProfile ? (
                  <WorkspacePanel title="Client profile" subtitle="Save this once before creating your first deal.">
                    <div className="grid gap-3">
                      <input
                        value={companyName}
                        onChange={(event) => setCompanyName(event.target.value)}
                        placeholder="Company or team name"
                        className="min-h-[52px] w-full rounded-[16px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                      />
                      <input
                        value={contactName}
                        onChange={(event) => setContactName(event.target.value)}
                        placeholder="Primary contact"
                        className="min-h-[52px] w-full rounded-[16px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                      />
                      <input
                        value={operatingFocus}
                        onChange={(event) => setOperatingFocus(event.target.value)}
                        placeholder="What are you hiring for?"
                        className="min-h-[52px] w-full rounded-[16px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                      />
                      <button
                        type="button"
                        onClick={saveClientProfile}
                        className="min-h-[56px] w-full rounded-[18px] bg-[#d72638] px-5 py-4 text-base font-semibold text-white transition hover:bg-[#b91f30]"
                      >
                        Save Client Profile
                      </button>
                      {onboardingStatus ? <InlineNotice message={onboardingStatus} /> : null}
                    </div>
                  </WorkspacePanel>
                ) : null}

                {connectedAddress && savedProfile ? (
                  <>
                    {(clientStage === "create" || draftContracts.length > 0) ? (
                      <>
                        <WorkspacePanel title="Choose freelancer" subtitle="Pick from the beta directory or enter a trusted wallet.">
                          <div className="grid gap-3">
                            <input
                              value={freelancerSearch}
                              onChange={(event) => setFreelancerSearch(event.target.value)}
                              placeholder="Search by name, skill, or location"
                              className="min-h-[52px] w-full rounded-[16px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                            />

                            <div className="grid gap-3">
                              {filteredTalent.slice(0, 3).map((agent) => {
                                const normalizedAgentOwner = normalizeWallet(agent.owner);
                                const isSelected = normalizeWallet(selectedFreelancerWallet) === normalizedAgentOwner;

                                return (
                                  <button
                                    key={agent.owner}
                                    type="button"
                                    onClick={() => setSelectedFreelancerWallet(normalizedAgentOwner)}
                                    className={`rounded-[20px] border p-4 text-left transition ${
                                      isSelected
                                        ? "border-[#6f1d26] bg-[#160b0d]"
                                        : "border-[#1d1d1d] bg-[#090909] hover:border-[#363636]"
                                    }`}
                                  >
                                    <div className="text-base font-semibold text-[#f7f4ef]">{agent.name}</div>
                                    <div className="mt-2 text-sm leading-6 text-[#a1a1aa]">
                                      {agent.skill} · {agent.location}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>

                            {filteredTalent.length === 0 ? (
                              <EmptyState copy="No matching freelancers found in the beta directory." />
                            ) : null}

                            {!selectedFreelancer ? (
                              <input
                                value={customFreelancerWallet}
                                onChange={(event) => {
                                  setSelectedFreelancerWallet("");
                                  setCustomFreelancerWallet(event.target.value);
                                }}
                                placeholder="Trusted freelancer wallet"
                                className="min-h-[52px] w-full rounded-[16px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                              />
                            ) : (
                              <div className="rounded-[18px] border border-[#4c1d24] bg-[#160b0d] p-4">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f2b6be]">
                                  Selected freelancer
                                </div>
                                <div className="mt-2 text-[18px] font-semibold text-[#f7f4ef]">{selectedFreelancer.name}</div>
                                <div className="mt-3 text-sm leading-6 text-[#f6c8ce]">{selectedFreelancer.skill}</div>
                              </div>
                            )}
                          </div>
                        </WorkspacePanel>

                        <WorkspacePanel title="Create contract" subtitle="Turn the work into one simple deal.">
                          <div className="grid gap-3">
                            <input
                              value={clientName}
                              onChange={(event) => setClientName(event.target.value)}
                              placeholder="Client name"
                              className="min-h-[52px] w-full rounded-[16px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                            />
                            <textarea
                              value={projectBrief}
                              onChange={(event) => setProjectBrief(event.target.value)}
                              rows={4}
                              placeholder="What should be delivered?"
                              className="w-full rounded-[16px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm leading-7 text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                            />
                            <input
                              value={displayBudgetAmountUsd}
                              onChange={(event) => setDisplayBudgetAmountUsd(event.target.value)}
                              placeholder="Contract value (USD)"
                              className="min-h-[52px] w-full rounded-[16px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                            />
                            <button
                              type="button"
                              onClick={handleGenerateContract}
                              className="min-h-[56px] w-full rounded-[18px] bg-[#d72638] px-5 py-4 text-base font-semibold text-white transition hover:bg-[#b91f30]"
                            >
                              {generatingContract ? "Creating..." : "Create Contract"}
                            </button>
                            {contractStatus ? <InlineNotice message={contractStatus} /> : null}
                          </div>
                        </WorkspacePanel>

                        {draftContracts.length > 0 ? (
                          <WorkspacePanel title="Ready to send" subtitle="Move the next deal out for approval.">
                            <ContractCardList
                              contracts={draftContracts}
                              variant="client"
                              actionLabel="Send Deal"
                              onAction={sendContract}
                              nextActionLabel={() => "Send to freelancer"}
                            />
                          </WorkspacePanel>
                        ) : null}
                      </>
                    ) : null}

                    {clientStage === "wait" ? (
                      <WorkspacePanel title="Waiting for approval" subtitle="The freelancer needs to approve this deal before payment can be secured.">
                        <ContractCardList
                          contracts={sentContracts}
                          variant="client"
                          emptyState="No pending approvals right now."
                          nextActionLabel={() => "Waiting for approval"}
                        />
                      </WorkspacePanel>
                    ) : null}

                    {(clientStage === "fund" || clientStage === "review") ? (
                      <>
                        {selectedApprovedContract ? (
                          <WorkspacePanel title="Current deal" subtitle="This approved contract is the source of truth for the next payment step.">
                            <div className="grid gap-3">
                              <MetadataPill label="Freelancer" value={selectedApprovedContract.freelancerName} />
                              <MetadataPill label="Contract value" value={formatDisplayBudget(selectedApprovedContract.displayBudget)} />
                              <MetadataPill
                                label="Settlement amount"
                                value={formatSettlementAmountCelo(selectedApprovedContract.settlementAmountCelo)}
                              />
                              <div className="rounded-[18px] border border-[#1d1d1d] bg-[#090909] px-4 py-4 text-sm leading-7 text-[#d4d4d8]">
                                {selectedApprovedContract.summary}
                              </div>
                            </div>
                          </WorkspacePanel>
                        ) : linkedContracts.length > 0 ? (
                          <WorkspacePanel title="Active deal" subtitle="Your current project is already inside the payment flow.">
                            <ContractCardList
                              contracts={linkedContracts.slice(0, 1)}
                              variant="client"
                              nextActionLabel={(contract) =>
                                contract.linkedProjectId ? `Project #${contract.linkedProjectId}` : "Deal active"
                              }
                            />
                          </WorkspacePanel>
                        ) : null}

                        <div id="client-deal-workspace">
                          <EscrowSimulator
                            selectedRole="client"
                            approvedContract={selectedApprovedContract}
                            escrowSelectionNonce={escrowSelectionNonce}
                          />
                        </div>
                      </>
                    ) : null}

                    {unusedApprovedContracts.length > 0 && clientStage !== "fund" ? (
                      <WorkspacePanel title="Approved deals" subtitle="Secure payment from the deal you want to move forward.">
                        <ContractCardList
                          contracts={unusedApprovedContracts}
                          variant="client"
                          actionLabel="Secure Payment"
                          onAction={selectApprovedContractForEscrow}
                          nextActionLabel={() => "Payment ready"}
                        />
                      </WorkspacePanel>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}

            {activeView === "profile" ? (
              <>
                <WorkspacePanel title="Client profile" subtitle="This wallet identity is used for the deals you create.">
                  {savedProfile ? (
                    <div className="grid gap-3">
                      <DetailCard label="Company" value={savedProfile.companyName} />
                      <DetailCard label="Contact" value={savedProfile.contactName} />
                      <DetailCard label="Focus" value={savedProfile.operatingFocus} />
                    </div>
                  ) : (
                    <EmptyState copy="No client profile saved on this wallet yet." />
                  )}
                </WorkspacePanel>

                <WorkspacePanel title="Recent updates" subtitle="Wallet-scoped reminders and deal updates.">
                  {notifications.length > 0 ? (
                    <DealEventList
                      events={notifications.slice(0, 4).map((note, index) => ({
                        id: `note-${index}`,
                        speaker: "Update",
                        message: note,
                      }))}
                    />
                  ) : (
                    <EmptyState copy="No updates for this wallet yet." />
                  )}
                </WorkspacePanel>

                {rejectedContracts.length > 0 ? (
                  <WorkspacePanel title="Closed deals" subtitle="Rejected deals stay here for reference.">
                    <ContractCardList
                      contracts={rejectedContracts}
                      variant="client"
                      nextActionLabel={() => "Closed"}
                    />
                  </WorkspacePanel>
                ) : null}
              </>
            ) : null}
          </>
        }
      />

      <MiniPayWalletSheet
        open={walletSheetOpen}
        onClose={() => setWalletSheetOpen(false)}
      />
    </>
  );
}
