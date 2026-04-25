"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ConnectButton, useActiveAccount, useReadContract } from "thirdweb/react";
import { getContract } from "thirdweb";
import EscrowSimulator from "@/components/EscrowSimulator";
import {
  SectionNotice,
  WorkspaceNavItem,
  WorkspacePanel,
  WorkspaceShell,
} from "@/components/workspace/WorkspaceShell";
import {
  ContractCardList,
  DetailCard,
  EmptyState,
  InlineNotice,
  MetadataPill,
  NotificationList,
  SegmentedControl,
  SetupGate,
  SummaryCard,
} from "@/components/workspace/WorkspacePrimitives";
import { client } from "@/lib/client";
import { AGENT_REGISTRY_ABI, AGENT_REGISTRY_ADDRESS } from "@/lib/contract";
import { getContractCacheKey, getWalletCacheKey } from "@/lib/cacheKeys";
import { agentGuildChain } from "@/lib/networkConfig";
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
  buildDisplayBudget,
  formatDisplayBudget,
  formatSettlementAmountCelo,
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

type ClientView = "create" | "contracts" | "escrow";
type ContractFilter = "draft" | "sent" | "approved" | "rejected";

const PROFILE_STORAGE_KEY_PREFIX = "agent-guild-client-profile";
const GENERATED_CONTRACT_STORAGE_KEY_PREFIX = "agent-guild-generated-contract";

export default function ClientWorkspacePage() {
  const account = useActiveAccount();
  const connectedAddress = normalizeWallet(account?.address) || null;
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
  const [activeView, setActiveView] = useState<ClientView>("create");
  const [hasManualViewSelection, setHasManualViewSelection] = useState(false);
  const [contractFilter, setContractFilter] = useState<ContractFilter>("draft");

  const registryContract = useMemo(
    () =>
      getContract({
        client,
        chain: agentGuildChain,
        address: AGENT_REGISTRY_ADDRESS,
        abi: AGENT_REGISTRY_ABI,
      }),
    []
  );

  const { data } = useReadContract({ contract: registryContract, method: "getAgents", params: [] });
  const allAgents = (data as Agent[] | undefined) || [];
  const availableTalent = allAgents.filter((agent, index, arr) => {
    const owner = normalizeWallet(agent.owner);
    return index === arr.findIndex((item) => normalizeWallet(item.owner) === owner);
  });
  const filteredTalent = availableTalent.filter((agent) => {
    const query = freelancerSearch.toLowerCase().trim();
    if (!query) return true;
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
    if (!savedProfileRaw) return;

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
    if (selectedFreelancer) setCustomFreelancerWallet("");
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
        if (currentId && availableApprovedContracts.some((contract) => contract.id === currentId)) return currentId;
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
    setOnboardingStatus("Client workspace created.");
  }

  async function handleGenerateContract() {
    if (!clientName || !projectBrief || !displayBudgetAmountUsd) {
      setContractStatus("Fill client name, project brief, and contract value to generate contract.");
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
      setContractStatus("Select a freelancer profile or enter a wallet before generating a contract.");
      return;
    }

    try {
      setGeneratingContract(true);
      setContractStatus("Generating AI contract...");
      const res = await fetch("/api/generate-contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName,
          projectDescription: projectBrief,
          displayBudgetAmountUsd: Number(displayBudgetAmountUsd),
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || result?.message || "Failed to generate contract.");
      const draft = await createDraftContract(
        {
          clientWallet: connectedAddress,
          clientName,
          freelancerWallet,
          freelancerName,
          projectBrief,
          displayBudget: buildDisplayBudget(Number(displayBudgetAmountUsd)),
          settlementAmountCelo: null,
          summary: result.summary,
          milestones: result.milestones,
        },
        account
      );
      const generatedContractStorageKey = getContractCacheKey(
        GENERATED_CONTRACT_STORAGE_KEY_PREFIX,
        {
          wallet: connectedAddress,
          contractId: draft.id,
        }
      );
      if (generatedContractStorageKey) {
        localStorage.setItem(generatedContractStorageKey, JSON.stringify(result));
      }
      await syncWorkflowState(account);
      setContracts(getContractsForClient(connectedAddress));
      setNotifications(getNotificationsForWallet(connectedAddress));
      setContractStatus("AI contract generated and saved as draft.");
      setContractFilter("draft");
      openClientView("contracts");
    } catch (error) {
      console.error(error);
      setContractStatus(error instanceof Error ? error.message : "AI contract generation failed.");
    } finally {
      setGeneratingContract(false);
    }
  }

  async function sendContract(contractId: string) {
    const next = await sendProductContract(contractId, account);
    if (!next) {
      setContractStatus("Unable to send this contract. Confirm the freelancer wallet is saved correctly.");
      return;
    }
    await syncWorkflowState(account);
    setContracts(getContractsForClient(connectedAddress));
    setNotifications(getNotificationsForWallet(connectedAddress));
    setContractStatus(`Contract sent to ${next.freelancerName}.`);
    setContractFilter("sent");
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
  const filteredContracts =
    contractFilter === "draft"
      ? draftContracts
      : contractFilter === "sent"
        ? sentContracts
        : contractFilter === "approved"
          ? unusedApprovedContracts
          : rejectedContracts;

  function selectApprovedContractForEscrow(contractId: string, shouldFocusEscrow = false) {
    const nextContract = unusedApprovedContracts.find((contract) => contract.id === contractId) ?? null;
    if (!nextContract) {
      if (shouldFocusEscrow) openClientView("escrow");
      return;
    }

    setSelectedApprovedContractId(nextContract.id);
    setEscrowSelectionNonce((current) => current + 1);
    if (shouldFocusEscrow) openClientView("escrow");
  }

  function openClientView(view: ClientView) {
    setHasManualViewSelection(true);
    setActiveView(view);
  }

  const recommendedView = useMemo<ClientView>(() => {
    if (!connectedAddress || !savedProfile) return "create";
    if (unusedApprovedContracts.length > 0 || linkedContracts.length > 0) return "escrow";
    if (draftContracts.length > 0 || sentContracts.length > 0) return "contracts";
    return "create";
  }, [
    connectedAddress,
    draftContracts.length,
    linkedContracts.length,
    savedProfile,
    sentContracts.length,
    unusedApprovedContracts.length,
  ]);

  useEffect(() => {
    if (hasManualViewSelection) return;
    setActiveView(recommendedView);
  }, [hasManualViewSelection, recommendedView]);

  const nextAction = useMemo(() => {
    if (!connectedAddress) {
      return {
        eyebrow: "Connect",
        title: "Connect the client wallet to start this flow.",
        description: "Wallet connection controls contract ownership, escrow permissions, and payout release.",
        actionLabel: undefined,
        onAction: undefined,
      };
    }
    if (!savedProfile) {
      return {
        eyebrow: "Setup",
        title: "Save your client identity first.",
        description: "This keeps contract drafts, escrow actions, and wallet-scoped activity tied to one operator.",
        actionLabel: "Open Create",
        onAction: () => openClientView("create"),
      };
    }
    if (unusedApprovedContracts.length > 0) {
      return {
        eyebrow: "Next",
        title: "Fund the approved contract in escrow.",
        description: "The agreement is approved and ready for the onchain step now.",
        actionLabel: "Open Escrow",
        onAction: () => openClientView("escrow"),
      };
    }
    if (draftContracts.length > 0) {
      return {
        eyebrow: "Next",
        title: "Send the next draft to the freelancer.",
        description: "The contract is written. Move it out for approval before funding.",
        actionLabel: "Open Contracts",
        onAction: () => {
          openClientView("contracts");
          setContractFilter("draft");
        },
      };
    }
    if (sentContracts.length > 0) {
      return {
        eyebrow: "Waiting",
        title: "Freelancer approval is the current blocker.",
        description: "Sent contracts must be approved before escrow can begin.",
        actionLabel: "View Sent",
        onAction: () => {
          openClientView("contracts");
          setContractFilter("sent");
        },
      };
    }
    if (linkedContracts.length > 0) {
      return {
        eyebrow: "Active",
        title: "Review delivery or release payout.",
        description: "Your linked project is already in motion inside escrow.",
        actionLabel: "Open Escrow",
        onAction: () => openClientView("escrow"),
      };
    }
    return {
      eyebrow: "Create",
      title: "Write the next contract.",
      description: "Pick a freelancer, add the brief, and generate the agreement in one pass.",
      actionLabel: "Open Create",
      onAction: () => openClientView("create"),
    };
  }, [
    connectedAddress,
    draftContracts.length,
    linkedContracts.length,
    savedProfile,
    sentContracts.length,
    unusedApprovedContracts.length,
  ]);

  const navItems: WorkspaceNavItem[] = [
    { id: "create", label: "Create" },
    { id: "contracts", label: "Contracts", badge: `${contracts.length}` },
    { id: "escrow", label: "Escrow", badge: `${linkedContracts.length + unusedApprovedContracts.length}` },
  ];

  return (
    <WorkspaceShell
      workspaceLabel="Client"
      title="Create, send, fund, and release."
      description="One MiniPay-style client flow for contracts, escrow, delivery review, and payout."
      navItems={navItems}
      activeItem={activeView}
      onItemChange={(id) => openClientView(id as ClientView)}
      headerActions={
        <>
          <Link
            href="/freelancer"
            className="rounded-[12px] border border-[#262626] px-4 py-3 text-sm font-semibold text-[#f7f4ef] transition hover:border-[#3b3b3b]"
          >
            Freelancer
          </Link>
          <ConnectButton client={client} chain={agentGuildChain} />
        </>
      }
      metricStrip={
        <div className="grid gap-3 grid-cols-3">
          <SummaryCard label="Drafts" value={`${draftContracts.length}`} />
          <SummaryCard label="Waiting" value={`${sentContracts.length}`} />
          <SummaryCard label="Escrow" value={`${unusedApprovedContracts.length + linkedContracts.length}`} />
        </div>
      }
      focusArea={
        <SectionNotice
          eyebrow={nextAction.eyebrow}
          title={nextAction.title}
          description={nextAction.description}
          action={
            nextAction.actionLabel ? (
              <button
                type="button"
                onClick={nextAction.onAction}
                className="w-full rounded-[16px] bg-[#d72638] px-5 py-4 text-base font-semibold text-white transition hover:bg-[#b91f30]"
              >
                {nextAction.actionLabel}
              </button>
            ) : null
          }
        />
      }
      mainArea={
        <>
          {activeView === "create" ? (
            !connectedAddress ? (
              <SetupGate copy="Connect the client wallet first to create contracts in this app flow." />
            ) : (
              <>
                {!savedProfile ? (
                  <WorkspacePanel
                    title="Client identity"
                    subtitle="Save this once so contracts and escrow actions stay tied to the right wallet."
                  >
                    <div className="grid gap-3">
                      <input
                        value={companyName}
                        onChange={(event) => setCompanyName(event.target.value)}
                        placeholder="Company or team name"
                        className="w-full rounded-[14px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                      />
                      <input
                        value={contactName}
                        onChange={(event) => setContactName(event.target.value)}
                        placeholder="Primary contact name"
                        className="w-full rounded-[14px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                      />
                      <input
                        value={operatingFocus}
                        onChange={(event) => setOperatingFocus(event.target.value)}
                        placeholder="What are you hiring for?"
                        className="w-full rounded-[14px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                      />
                      <button
                        type="button"
                        onClick={saveClientProfile}
                        className="w-full rounded-[16px] bg-[#d72638] px-5 py-4 text-base font-semibold text-white transition hover:bg-[#b91f30]"
                      >
                        Save Client Identity
                      </button>
                      {onboardingStatus ? <InlineNotice message={onboardingStatus} /> : null}
                    </div>
                  </WorkspacePanel>
                ) : (
                  <WorkspacePanel title="Client ready" subtitle="This wallet is ready to create the next agreement.">
                    <div className="grid gap-3 grid-cols-2">
                      <DetailCard label="Company" value={savedProfile.companyName} />
                      <DetailCard label="Contact" value={savedProfile.contactName} />
                    </div>
                  </WorkspacePanel>
                )}

                <WorkspacePanel
                  title="Pick freelancer"
                  subtitle="Use the curated beta directory first, or enter a trusted wallet directly."
                >
                  <div className="grid gap-4">
                    <input
                      value={freelancerSearch}
                      onChange={(event) => setFreelancerSearch(event.target.value)}
                      placeholder="Search by name, skill, or location"
                      className="w-full rounded-[14px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                    />

                    <div className="grid gap-3">
                      {filteredTalent.slice(0, 4).map((agent) => {
                        const normalizedAgentOwner = normalizeWallet(agent.owner);
                        const isSelected = normalizeWallet(selectedFreelancerWallet) === normalizedAgentOwner;

                        return (
                          <button
                            key={agent.owner}
                            type="button"
                            onClick={() => setSelectedFreelancerWallet(normalizedAgentOwner)}
                            className={`rounded-[16px] border p-4 text-left transition ${
                              isSelected
                                ? "border-[#6f1d26] bg-[#160b0d]"
                                : "border-[#1d1d1d] bg-[#090909] hover:border-[#363636]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-base font-semibold text-[#f7f4ef]">{agent.name}</div>
                                <div className="mt-1 text-sm text-[#a1a1aa]">{agent.skill}</div>
                              </div>
                              <div className="rounded-full border border-[#232323] bg-[#0d0d0d] px-3 py-1 text-[11px] text-[#d4d4d8]">
                                ${agent.hourlyRate.toString()}/hr
                              </div>
                            </div>
                            <div className="mt-3 text-xs text-[#71717a]">
                              {agent.location} - {agent.availability}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {filteredTalent.length === 0 ? (
                      <EmptyState copy="No matching freelancers found in the curated directory." />
                    ) : null}

                    {selectedFreelancer ? (
                      <div className="rounded-[18px] border border-[#4c1d24] bg-[#160b0d] p-4">
                        <div className="text-[11px] uppercase tracking-[0.14em] text-[#f2b6be]">
                          Selected freelancer
                        </div>
                        <div className="mt-3 text-lg font-semibold text-[#f7f4ef]">
                          {selectedFreelancer.name}
                        </div>
                        <div className="mt-3 grid gap-3 grid-cols-2">
                          <MetadataPill label="Wallet" value={shortAddress(selectedFreelancer.owner)} />
                          <MetadataPill label="Skill" value={selectedFreelancer.skill} />
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-[18px] border border-[#1d1d1d] bg-[#090909] p-4">
                        <div className="text-[11px] uppercase tracking-[0.14em] text-[#71717a]">
                          Direct wallet fallback
                        </div>
                        <div className="mt-2 text-sm leading-6 text-[#a1a1aa]">
                          Use this only when you already trust the freelancer wallet outside the directory.
                        </div>
                        <input
                          value={customFreelancerWallet}
                          onChange={(event) => {
                            setSelectedFreelancerWallet("");
                            setCustomFreelancerWallet(event.target.value);
                          }}
                          placeholder="Enter freelancer wallet"
                          className="mt-3 w-full rounded-[14px] border border-[#242424] bg-[#0d0d0d] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                        />
                      </div>
                    )}
                  </div>
                </WorkspacePanel>

                <WorkspacePanel
                  title="Create contract"
                  subtitle="Write the brief, set the display value, and generate one draft."
                >
                  <div className="grid gap-3">
                    <input
                      value={clientName}
                      onChange={(event) => setClientName(event.target.value)}
                      placeholder="Client name"
                      className="w-full rounded-[14px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                    />
                    <textarea
                      value={projectBrief}
                      onChange={(event) => setProjectBrief(event.target.value)}
                      rows={5}
                      placeholder="Project description"
                      className="w-full rounded-[14px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                    />
                    <input
                      value={displayBudgetAmountUsd}
                      onChange={(event) => setDisplayBudgetAmountUsd(event.target.value)}
                      placeholder="Contract value (USD)"
                      className="w-full rounded-[14px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                    />
                    <button
                      type="button"
                      onClick={handleGenerateContract}
                      className="w-full rounded-[16px] bg-[#d72638] px-5 py-4 text-base font-semibold text-white transition hover:bg-[#b91f30]"
                    >
                      {generatingContract ? "Generating..." : "Generate Draft"}
                    </button>
                    {contractStatus ? <InlineNotice message={contractStatus} /> : null}
                  </div>
                </WorkspacePanel>
              </>
            )
          ) : null}

          {activeView === "contracts" ? (
            savedProfile ? (
              <WorkspacePanel
                title="Contracts"
                subtitle="Keep one contract state in view at a time."
                action={
                  <SegmentedControl
                    items={[
                      { id: "draft", label: `Drafts (${draftContracts.length})` },
                      { id: "sent", label: `Sent (${sentContracts.length})` },
                      { id: "approved", label: `Approved (${unusedApprovedContracts.length})` },
                      { id: "rejected", label: `Rejected (${rejectedContracts.length})` },
                    ]}
                    activeId={contractFilter}
                    onChange={(id) => setContractFilter(id as ContractFilter)}
                  />
                }
              >
                <ContractCardList
                  contracts={filteredContracts}
                  variant="client"
                  emptyState={
                    contractFilter === "draft"
                      ? "No drafts yet."
                      : contractFilter === "sent"
                        ? "No sent contracts yet."
                        : contractFilter === "approved"
                          ? "No approved contracts ready for escrow."
                          : "No rejected contracts yet."
                  }
                  selectedId={selectedApprovedContractId}
                  selectable={contractFilter === "approved"}
                  onSelect={(id) => selectApprovedContractForEscrow(id)}
                  actionLabel={
                    contractFilter === "draft"
                      ? "Send To Freelancer"
                      : contractFilter === "approved"
                        ? "Open In Escrow"
                        : undefined
                  }
                  onAction={(id) =>
                    contractFilter === "draft" ? sendContract(id) : selectApprovedContractForEscrow(id, true)
                  }
                  nextActionLabel={(contract) =>
                    contract.linkedProjectId
                      ? `Project #${contract.linkedProjectId}`
                      : contract.status === "draft"
                        ? "Ready to send"
                        : contract.status === "sent"
                          ? "Waiting for approval"
                          : contract.status === "approved"
                            ? "Fund in escrow"
                            : "Archived"
                  }
                />
              </WorkspacePanel>
            ) : (
              <SetupGate copy="Save your client identity in Create before managing contracts." />
            )
          ) : null}

          {activeView === "escrow" ? (
            savedProfile ? (
              <>
                {selectedApprovedContract ? (
                  <WorkspacePanel
                    title="Escrow source contract"
                    subtitle="This approved contract is the source of truth before project creation."
                  >
                    <div className="grid gap-3 grid-cols-2">
                      <MetadataPill label="Freelancer" value={selectedApprovedContract.freelancerName} />
                      <MetadataPill
                        label="Contract value"
                        value={formatDisplayBudget(selectedApprovedContract.displayBudget)}
                      />
                      <MetadataPill
                        label="Settlement amount"
                        value={formatSettlementAmountCelo(selectedApprovedContract.settlementAmountCelo)}
                      />
                      <MetadataPill label="Contract ID" value={selectedApprovedContract.id.slice(0, 8)} />
                    </div>
                    <div className="mt-4 rounded-[16px] border border-[#1f1f1f] bg-[#090909] px-4 py-4 text-sm leading-7 text-[#d4d4d8]">
                      {selectedApprovedContract.summary}
                    </div>
                  </WorkspacePanel>
                ) : linkedContracts.length > 0 ? (
                  <WorkspacePanel
                    title="Linked projects"
                    subtitle="Approved contracts that already produced escrow projects stay here."
                  >
                    <ContractCardList
                      contracts={linkedContracts.slice(0, 2)}
                      variant="client"
                      emptyState="No linked projects are associated with this wallet yet."
                      nextActionLabel={(contract) =>
                        contract.linkedProjectId ? `Project #${contract.linkedProjectId}` : "Project linked"
                      }
                    />
                  </WorkspacePanel>
                ) : (
                  <SetupGate copy="Approve a contract in Contracts to unlock escrow creation." />
                )}

                <div id="escrow-workspace">
                  <EscrowSimulator
                    selectedRole="client"
                    approvedContract={selectedApprovedContract}
                    escrowSelectionNonce={escrowSelectionNonce}
                  />
                </div>
              </>
            ) : (
              <SetupGate copy="Save your client identity in Create before entering escrow." />
            )
          ) : null}
        </>
      }
      supportArea={
        <>
          <WorkspacePanel title="Notifications" subtitle="Recent updates for this wallet.">
            <NotificationList
              notifications={notifications}
              emptyCopy={
                connectedAddress
                  ? "No notifications for this wallet yet."
                  : "Connect a wallet to see wallet-scoped notifications."
              }
            />
          </WorkspacePanel>
          <WorkspacePanel title="Profile" subtitle="Saved client identity for this wallet.">
            {savedProfile ? (
              <div className="grid gap-3">
                <DetailCard label="Company" value={savedProfile.companyName} />
                <DetailCard label="Contact" value={savedProfile.contactName} />
                <DetailCard label="Focus" value={savedProfile.operatingFocus} />
              </div>
            ) : (
              <EmptyState copy="No client identity saved yet." />
            )}
          </WorkspacePanel>
          <WorkspacePanel title="Current context" subtitle="Keep the active contract context close by.">
            {selectedApprovedContract ? (
              <div className="grid gap-3">
                <DetailCard label="Freelancer" value={selectedApprovedContract.freelancerName} />
                <DetailCard
                  label="Contract value"
                  value={formatDisplayBudget(selectedApprovedContract.displayBudget)}
                />
                <DetailCard
                  label="Settlement amount"
                  value={formatSettlementAmountCelo(selectedApprovedContract.settlementAmountCelo)}
                />
              </div>
            ) : selectedFreelancer ? (
              <div className="grid gap-3">
                <DetailCard label="Freelancer" value={selectedFreelancer.name} />
                <DetailCard label="Skill" value={selectedFreelancer.skill} />
                <DetailCard label="Wallet" value={shortAddress(selectedFreelancer.owner)} />
              </div>
            ) : (
              <EmptyState copy="No current contract or freelancer selected." />
            )}
          </WorkspacePanel>
        </>
      }
    />
  );
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
