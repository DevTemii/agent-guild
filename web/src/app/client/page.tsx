"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ConnectButton, useActiveAccount, useReadContract } from "thirdweb/react";
import { defineChain, getContract } from "thirdweb";
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
  PipelineRow,
  SegmentedControl,
  SetupGate,
  SummaryCard,
} from "@/components/workspace/WorkspacePrimitives";
import { client } from "@/lib/client";
import { AGENT_REGISTRY_ABI, AGENT_REGISTRY_ADDRESS } from "@/lib/contract";
import {
  appendNotifications,
  createDraftContract,
  getContractsForClient,
  getNotificationsForWallet,
  getWorkflowRefreshEventName,
  ProductContract,
  sendProductContract,
} from "@/lib/workflowStore";

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

type ClientView = "overview" | "contracts" | "active" | "history";
type ContractFilter = "draft" | "sent" | "approved" | "rejected";

const PROFILE_STORAGE_KEY = "agent-guild-client-profile";
const CONTRACT_STORAGE_KEY = "agent-guild-generated-contract";

const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  rpc: "https://forno.celo-sepolia.celo-testnet.org",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
});

export default function ClientWorkspacePage() {
  const account = useActiveAccount();
  const connectedAddress = account?.address?.toLowerCase() ?? null;
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [operatingFocus, setOperatingFocus] = useState("");
  const [savedProfile, setSavedProfile] = useState<ClientProfile | null>(null);
  const [onboardingStatus, setOnboardingStatus] = useState("");
  const [clientName, setClientName] = useState("");
  const [projectBrief, setProjectBrief] = useState("");
  const [budget, setBudget] = useState("");
  const [generatingContract, setGeneratingContract] = useState(false);
  const [contractStatus, setContractStatus] = useState("");
  const [notifications, setNotifications] = useState<string[]>([]);
  const [freelancerSearch, setFreelancerSearch] = useState("");
  const [selectedFreelancerWallet, setSelectedFreelancerWallet] = useState("");
  const [customFreelancerWallet, setCustomFreelancerWallet] = useState("");
  const [contracts, setContracts] = useState<ProductContract[]>([]);
  const [selectedApprovedContractId, setSelectedApprovedContractId] = useState<string | null>(null);
  const [escrowSelectionNonce, setEscrowSelectionNonce] = useState(0);
  const [activeView, setActiveView] = useState<ClientView>("overview");
  const [contractFilter, setContractFilter] = useState<ContractFilter>("draft");

  const registryContract = useMemo(
    () =>
      getContract({
        client,
        chain: celoSepolia,
        address: AGENT_REGISTRY_ADDRESS,
        abi: AGENT_REGISTRY_ABI,
      }),
    []
  );

  const { data } = useReadContract({ contract: registryContract, method: "getAgents", params: [] });
  const allAgents = (data as Agent[] | undefined) || [];
  const availableTalent = allAgents.filter((agent, index, arr) => {
    const owner = agent.owner.toLowerCase();
    return index === arr.findIndex((item) => item.owner.toLowerCase() === owner);
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
    availableTalent.find((agent) => agent.owner.toLowerCase() === selectedFreelancerWallet) ?? null;

  useEffect(() => {
    const savedProfileRaw = localStorage.getItem(PROFILE_STORAGE_KEY);
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
  }, []);

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

    const syncWorkflow = () => {
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

    syncWorkflow();
    window.addEventListener("storage", syncWorkflow);
    window.addEventListener(getWorkflowRefreshEventName(), syncWorkflow);
    return () => {
      window.removeEventListener("storage", syncWorkflow);
      window.removeEventListener(getWorkflowRefreshEventName(), syncWorkflow);
    };
  }, [connectedAddress]);

  function saveClientProfile() {
    if (!companyName.trim() || !contactName.trim()) {
      setOnboardingStatus("Add company name and contact name to continue.");
      return;
    }
    const nextProfile = {
      companyName: companyName.trim(),
      contactName: contactName.trim(),
      operatingFocus: operatingFocus.trim() || "AI operations",
    };
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(nextProfile));
    setSavedProfile(nextProfile);
    setClientName(nextProfile.companyName);
    setOnboardingStatus("Client workspace created.");
  }

  async function handleGenerateContract() {
    if (!clientName || !projectBrief || !budget) {
      setContractStatus("Fill client name, project brief, and budget to generate contract.");
      return;
    }
    if (!connectedAddress) {
      setContractStatus("Connect your wallet first.");
      return;
    }
    const freelancerWallet = selectedFreelancer?.owner?.toLowerCase() || customFreelancerWallet.trim().toLowerCase();
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
        body: JSON.stringify({ clientName, projectDescription: projectBrief, budget: Number(budget) }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || result?.message || "Failed to generate contract.");
      localStorage.setItem(CONTRACT_STORAGE_KEY, JSON.stringify(result));
      const draft = createDraftContract({
        clientWallet: connectedAddress,
        clientName,
        freelancerWallet,
        freelancerName,
        projectBrief,
        budget: Number(budget),
        summary: result.summary,
        milestones: result.milestones,
      });
      appendNotifications([{ wallet: connectedAddress, message: `Contract draft created for ${draft.freelancerName}.` }]);
      setContracts(getContractsForClient(connectedAddress));
      setContractStatus("AI contract generated and saved as draft.");
      setContractFilter("draft");
      setActiveView("contracts");
    } catch (error) {
      console.error(error);
      setContractStatus(error instanceof Error ? error.message : "AI contract generation failed.");
    } finally {
      setGeneratingContract(false);
    }
  }

  function sendContract(contractId: string) {
    const next = sendProductContract(contractId);
    if (!next) {
      setContractStatus("Unable to send this contract. Confirm the freelancer wallet is saved correctly.");
      return;
    }
    appendNotifications([{ wallet: connectedAddress, message: `Contract sent to ${next.freelancerName} for approval.` }]);
    setContracts(getContractsForClient(connectedAddress));
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
  const historyContracts = [...linkedContracts, ...rejectedContracts].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  const selectedApprovedContract =
    approvedContracts.find((contract) => contract.id === selectedApprovedContractId && !contract.linkedProjectId) ?? null;
  const filteredContracts =
    contractFilter === "draft"
      ? draftContracts
      : contractFilter === "sent"
        ? sentContracts
        : contractFilter === "approved"
          ? approvedContracts
          : rejectedContracts;

  function selectApprovedContractForEscrow(contractId: string, shouldFocusEscrow = false) {
    setSelectedApprovedContractId(contractId);
    setEscrowSelectionNonce((current) => current + 1);
    if (shouldFocusEscrow) setActiveView("active");
  }

  const nextAction = useMemo(() => {
    if (!connectedAddress) {
      return {
        eyebrow: "Connection",
        title: "Connect the client wallet to activate this dashboard.",
        description: "Wallet connection controls contract ownership, escrow permissions, and notification history.",
        actionLabel: undefined,
        onAction: undefined,
      };
    }
    if (!savedProfile) {
      return {
        eyebrow: "Setup",
        title: "Create your client workspace before starting the next engagement.",
        description: "Save company identity once, then the rest of the dashboard can stay focused on agreements and execution.",
        actionLabel: undefined,
        onAction: undefined,
      };
    }
    if (unusedApprovedContracts.length > 0) {
      return {
        eyebrow: "Next action",
        title: "Move approved work into escrow.",
        description: "An approved contract is ready. Create escrow next so funding, delivery, and review stay attached to the same agreement.",
        actionLabel: "Open Active Projects",
        onAction: () => setActiveView("active"),
      };
    }
    if (draftContracts.length > 0) {
      return {
        eyebrow: "Next action",
        title: "Send the next draft for approval.",
        description: "The agreement is written. Send it to the freelancer so approval can happen before escrow begins.",
        actionLabel: "Review Drafts",
        onAction: () => {
          setActiveView("contracts");
          setContractFilter("draft");
        },
      };
    }
    if (sentContracts.length > 0) {
      return {
        eyebrow: "Waiting",
        title: "Freelancer approval is the current blocker.",
        description: "Sent contracts are waiting on an approval or rejection before they can become active projects.",
        actionLabel: "Open Sent Contracts",
        onAction: () => {
          setActiveView("contracts");
          setContractFilter("sent");
        },
      };
    }
    if (linkedContracts.length > 0) {
      return {
        eyebrow: "Active work",
        title: "A linked project is already in motion.",
        description: "Use Active Projects to fund escrow, review delivery, or resolve the current project without reopening every section.",
        actionLabel: "Open Active Projects",
        onAction: () => setActiveView("active"),
      };
    }
    return {
      eyebrow: "Ready",
      title: "Create the next agreement.",
      description: "Start in Contracts to choose a freelancer, generate the agreement, and begin the next work cycle from a clean operating state.",
      actionLabel: "Open Contracts",
      onAction: () => setActiveView("contracts"),
    };
  }, [connectedAddress, savedProfile, unusedApprovedContracts.length, draftContracts.length, sentContracts.length, linkedContracts.length]);

  const navItems: WorkspaceNavItem[] = [
    { id: "overview", label: "Overview", badge: savedProfile ? undefined : "Setup", hint: "Current state and recent activity." },
    { id: "contracts", label: "Contracts", badge: `${contracts.length}`, hint: "Draft, send, and track approvals." },
    { id: "active", label: "Active Projects", badge: `${linkedContracts.length}`, hint: "Run escrow and review flow." },
    { id: "history", label: "History", badge: `${historyContracts.length}`, hint: "Review linked and archived work." },
  ];

  return (
    <WorkspaceShell
      workspaceLabel="Client workspace"
      title="Operate agreements, escrow, and delivery from one dashboard."
      description="The client dashboard keeps only the current workflow state in front of you: draft the next agreement, move approved work into escrow, and resolve projects without carrying the whole system on one long page."
      navItems={navItems}
      activeItem={activeView}
      onItemChange={(id) => setActiveView(id as ClientView)}
      headerActions={
        <>
          <Link href="/" className="rounded-[10px] border border-[#262626] px-4 py-2 text-sm font-medium text-[#f7f4ef] transition hover:border-[#3b3b3b]">Back to Home</Link>
          <Link href="/freelancer" className="rounded-[10px] border border-[#262626] px-4 py-2 text-sm font-medium text-[#f7f4ef] transition hover:border-[#3b3b3b]">Freelancer Workspace</Link>
          <ConnectButton client={client} chain={celoSepolia} />
        </>
      }
      metricStrip={<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><SummaryCard label="Drafts" value={`${draftContracts.length}`} /><SummaryCard label="Sent" value={`${sentContracts.length}`} /><SummaryCard label="Escrow Ready" value={`${unusedApprovedContracts.length}`} /><SummaryCard label="History" value={`${historyContracts.length}`} /></div>}
      focusArea={<SectionNotice eyebrow={nextAction.eyebrow} title={nextAction.title} description={nextAction.description} action={nextAction.actionLabel ? <button type="button" onClick={nextAction.onAction} className="rounded-[12px] bg-[#d72638] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b91f30]">{nextAction.actionLabel}</button> : null} />}
      mainArea={
        <>
          {activeView === "overview" ? (
            <div className="grid gap-6">
              <WorkspacePanel title={!savedProfile ? "Complete workspace setup" : "Current workspace state"} subtitle={!savedProfile ? "Save a lightweight client identity first so contracts, notifications, and escrow records are clearly attributed." : "The client dashboard keeps agreements, approvals, and active projects in one operating view."}>
                {!savedProfile ? (
                  <div className="grid gap-3">
                    <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company or team name" className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]" />
                    <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Primary contact name" className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]" />
                    <input value={operatingFocus} onChange={(e) => setOperatingFocus(e.target.value)} placeholder="What are you hiring for?" className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]" />
                    <button type="button" onClick={saveClientProfile} className="rounded-[12px] bg-[#d72638] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b91f30]">Create Client Workspace</button>
                    {onboardingStatus ? <InlineNotice message={onboardingStatus} /> : null}
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard label="Contract Drafts" value={`${draftContracts.length}`} />
                    <SummaryCard label="Awaiting Approval" value={`${sentContracts.length}`} />
                    <SummaryCard label="Escrow Ready" value={`${unusedApprovedContracts.length}`} />
                    <SummaryCard label="Active Project Links" value={`${linkedContracts.length}`} />
                  </div>
                )}
              </WorkspacePanel>
              {savedProfile ? <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]"><WorkspacePanel title="Recent workflow" subtitle="The latest contract and project signals live here first."><ContractCardList contracts={sortedContracts.slice(0, 3)} variant="client" emptyState="No contracts yet. Generate the first agreement in Contracts." nextActionLabel={(contract) => contract.status === "draft" ? "Ready to send" : contract.status === "sent" ? "Waiting for freelancer approval" : contract.linkedProjectId ? `Project #${contract.linkedProjectId}` : "Escrow unlocked"} /></WorkspacePanel><WorkspacePanel title="Pipeline snapshot" subtitle="Keep the current deal flow visible without opening every section."><div className="grid gap-3"><PipelineRow label="Drafts" value={`${draftContracts.length}`} tone="neutral" /><PipelineRow label="Sent for approval" value={`${sentContracts.length}`} tone="amber" /><PipelineRow label="Approved and ready" value={`${unusedApprovedContracts.length}`} tone="red" /><PipelineRow label="Linked to projects" value={`${linkedContracts.length}`} tone="green" /></div></WorkspacePanel></div> : null}
            </div>
          ) : null}
          {activeView === "contracts" ? (
            savedProfile ? (
              <div className="grid gap-6">
                <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
                  <WorkspacePanel title="Contract studio" subtitle="Generate the agreement first, then send it to the freelancer for approval.">
                    <div className="grid gap-3">
                      <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client name" className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]" />
                      <textarea value={projectBrief} onChange={(e) => setProjectBrief(e.target.value)} rows={5} placeholder="Project description" className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]" />
                      <input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Budget in USD" className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]" />
                      <button type="button" onClick={handleGenerateContract} className="rounded-[12px] bg-[#d72638] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b91f30]">{generatingContract ? "Generating..." : "Generate And Save Draft"}</button>
                      {contractStatus ? <InlineNotice message={contractStatus} /> : null}
                    </div>
                  </WorkspacePanel>
                  <WorkspacePanel title="Freelancer selection" subtitle="Choose from the registry first so wallet identity and profile context are pulled in automatically." action={<div className="rounded-full border border-[#1d1d1d] bg-[#090909] px-3 py-1 text-[12px] text-[#a1a1aa]">{availableTalent.length} profiles</div>}>
                    <div className="grid gap-4">
                      <input value={freelancerSearch} onChange={(e) => setFreelancerSearch(e.target.value)} placeholder="Search freelancer by name, skill, or location" className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]" />
                      <div className="grid max-h-[280px] gap-3 overflow-y-auto pr-1">
                        {filteredTalent.slice(0, 8).map((agent) => {
                          const isSelected = selectedFreelancerWallet === agent.owner.toLowerCase();
                          return (
                            <button key={agent.owner} type="button" onClick={() => setSelectedFreelancerWallet(agent.owner.toLowerCase())} className={`rounded-[14px] border p-4 text-left transition ${isSelected ? "border-[#6f1d26] bg-[#160b0d]" : "border-[#1d1d1d] bg-[#090909] hover:border-[#363636]"}`}>
                              <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-[#f7f4ef]">{agent.name}</div><div className="mt-1 text-sm text-[#a1a1aa]">{agent.skill}</div></div><div className="rounded-full border border-[#232323] bg-[#0d0d0d] px-3 py-1 text-[11px] text-[#a1a1aa]">${agent.hourlyRate.toString()}/hr</div></div>
                              <div className="mt-3 text-xs text-[#71717a]">{agent.location} • {agent.availability}</div>
                            </button>
                          );
                        })}
                        {filteredTalent.length === 0 ? <EmptyState copy="No matching freelancers found in the registry." /> : null}
                      </div>
                      {selectedFreelancer ? <div className="rounded-[16px] border border-[#4c1d24] bg-[#160b0d] p-4"><div className="text-[12px] uppercase tracking-[0.14em] text-[#f2b6be]">Selected freelancer</div><div className="mt-3 text-[18px] font-semibold text-[#f7f4ef]">{selectedFreelancer.name}</div><div className="mt-2 text-sm text-[#d4d4d8]">{selectedFreelancer.description}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><MetadataPill label="Wallet" value={shortAddress(selectedFreelancer.owner)} /><MetadataPill label="Skill" value={selectedFreelancer.skill} /><MetadataPill label="Rate" value={`$${selectedFreelancer.hourlyRate.toString()}/hr`} /><MetadataPill label="Availability" value={selectedFreelancer.availability} /></div></div> : <div className="rounded-[16px] border border-[#1d1d1d] bg-[#090909] p-4"><div className="text-[12px] uppercase tracking-[0.14em] text-[#71717a]">Fallback</div><input value={customFreelancerWallet} onChange={(e) => { setSelectedFreelancerWallet(""); setCustomFreelancerWallet(e.target.value); }} placeholder="If needed, enter freelancer wallet manually" className="mt-3 w-full rounded-[12px] border border-[#242424] bg-[#0d0d0d] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]" /></div>}
                    </div>
                  </WorkspacePanel>
                </div>
                <WorkspacePanel title="Contracts" subtitle="Keep only one contract state in view at a time so the workspace stays focused." action={<SegmentedControl items={[{ id: "draft", label: `Drafts (${draftContracts.length})` }, { id: "sent", label: `Sent (${sentContracts.length})` }, { id: "approved", label: `Approved (${approvedContracts.length})` }, { id: "rejected", label: `Rejected (${rejectedContracts.length})` }]} activeId={contractFilter} onChange={(id) => setContractFilter(id as ContractFilter)} />}>
                  <ContractCardList contracts={filteredContracts} variant="client" emptyState={contractFilter === "draft" ? "No drafts yet." : contractFilter === "sent" ? "No sent contracts yet." : contractFilter === "approved" ? "No approved contracts yet." : "No rejected contracts yet."} selectedId={selectedApprovedContractId} selectable={contractFilter === "approved"} onSelect={(id) => selectApprovedContractForEscrow(id)} actionLabel={contractFilter === "draft" ? "Send To Freelancer" : contractFilter === "approved" ? "Create Escrow For This Contract" : undefined} onAction={(id) => contractFilter === "draft" ? sendContract(id) : selectApprovedContractForEscrow(id, true)} nextActionLabel={(contract) => contract.linkedProjectId ? `Escrow created for Project #${contract.linkedProjectId}` : contract.status === "draft" ? "Ready to send" : contract.status === "sent" ? "Waiting for freelancer approval" : contract.status === "approved" ? "Escrow unlocked" : "Needs revision"} />
                </WorkspacePanel>
              </div>
            ) : <SetupGate copy="Create your client workspace in Overview before drafting and sending contracts." />
          ) : null}
          {activeView === "active" ? (
            savedProfile ? (
              <div className="grid gap-6">
                {selectedApprovedContract ? <WorkspacePanel title="Escrow source" subtitle="The selected approved contract is now the source of truth for pre-create escrow details."><div className="grid gap-3 sm:grid-cols-3"><MetadataPill label="Client" value={selectedApprovedContract.clientName} /><MetadataPill label="Freelancer" value={selectedApprovedContract.freelancerName} /><MetadataPill label="Budget" value={`$${selectedApprovedContract.budget}`} /></div><div className="mt-4 rounded-[16px] border border-[#1f1f1f] bg-[#090909] px-4 py-4 text-sm leading-7 text-[#d4d4d8]">{selectedApprovedContract.summary}</div></WorkspacePanel> : linkedContracts.length > 0 ? <WorkspacePanel title="Active project links" subtitle="Approved contracts that already produced an escrow project stay here for quick reference."><ContractCardList contracts={linkedContracts.slice(0, 3)} variant="client" emptyState="No active project links yet." nextActionLabel={(contract) => contract.linkedProjectId ? `Project #${contract.linkedProjectId}` : "Project linked"} /></WorkspacePanel> : <SetupGate copy="No approved contract is selected yet. Approve a contract in the Contracts tab to unlock escrow creation." />}
                <div id="escrow-workspace"><EscrowSimulator selectedRole="client" approvedContract={selectedApprovedContract} escrowSelectionNonce={escrowSelectionNonce} /></div>
              </div>
            ) : <SetupGate copy="Create your client workspace in Overview before managing active projects." />
          ) : null}
          {activeView === "history" ? <div className="grid gap-6"><WorkspacePanel title="Escrow-linked records" subtitle="Approved contracts move here once they have already been used to create a project."><ContractCardList contracts={linkedContracts} variant="client" emptyState="No escrow-linked records yet." nextActionLabel={(contract) => contract.linkedProjectId ? `Project #${contract.linkedProjectId}` : "Stored"} /></WorkspacePanel><WorkspacePanel title="Archived decisions" subtitle="Rejected contracts stay visible here so the deal history remains audit-friendly."><ContractCardList contracts={rejectedContracts} variant="client" emptyState="No archived contract decisions yet." nextActionLabel={() => "Archived"} /></WorkspacePanel></div> : null}
        </>
      }
      supportArea={<><WorkspacePanel title="Notifications" subtitle="Recent workflow updates for this connected wallet."><NotificationList notifications={notifications} emptyCopy="No notifications yet. Contract and project activity will appear here." /></WorkspacePanel><WorkspacePanel title="Workspace profile" subtitle="Client identity and operating context.">{savedProfile ? <div className="grid gap-3"><DetailCard label="Company" value={savedProfile.companyName} /><DetailCard label="Primary contact" value={savedProfile.contactName} /><DetailCard label="Operating focus" value={savedProfile.operatingFocus} />{connectedAddress ? <DetailCard label="Connected wallet" value={shortAddress(connectedAddress)} /> : null}</div> : <EmptyState copy="No client profile saved yet. Finish setup from Overview." />}</WorkspacePanel><WorkspacePanel title="Current selection" subtitle="Keep the current contract and freelancer context visible.">{selectedApprovedContract ? <div className="grid gap-3"><DetailCard label="Approved contract" value={selectedApprovedContract.id.slice(0, 8)} /><DetailCard label="Freelancer" value={selectedApprovedContract.freelancerName} /><DetailCard label="Budget" value={`$${selectedApprovedContract.budget}`} /></div> : selectedFreelancer ? <div className="grid gap-3"><DetailCard label="Selected freelancer" value={selectedFreelancer.name} /><DetailCard label="Skill" value={selectedFreelancer.skill} /><DetailCard label="Wallet" value={shortAddress(selectedFreelancer.owner)} /></div> : <EmptyState copy="No active selection yet. Pick a freelancer or approved contract to keep context here." />}</WorkspacePanel></>}
    />
  );
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
