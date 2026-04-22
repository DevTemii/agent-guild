"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ConnectButton, useActiveAccount, useReadContract } from "thirdweb/react";
import { defineChain, getContract, prepareContractCall, sendTransaction } from "thirdweb";
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
  SummaryCard,
} from "@/components/workspace/WorkspacePrimitives";
import { client } from "@/lib/client";
import { AGENT_REGISTRY_ABI, AGENT_REGISTRY_ADDRESS } from "@/lib/contract";
import {
  formatDisplayBudget,
  formatSettlementAmountCelo,
} from "@/lib/budget";
import { getReputationForWallet } from "@/lib/reputationStore";
import {
  getContractsForFreelancer,
  getNotificationsForWallet,
  getWorkflowRefreshEventName,
  normalizeWallet,
  ProductContract,
  syncWorkflowState,
  updateProductContractStatus,
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

type FreelancerView = "overview" | "inbox" | "active";
type InboxFilter = "pending" | "approved" | "rejected";

const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  rpc: "https://forno.celo-sepolia.celo-testnet.org",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
});

export default function FreelancerWorkspacePage() {
  const account = useActiveAccount();
  const connectedAddress = normalizeWallet(account?.address) || null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [skill, setSkill] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [location, setLocation] = useState("");
  const [availability, setAvailability] = useState("");
  const [creating, setCreating] = useState(false);
  const [profileStatus, setProfileStatus] = useState("");
  const [notifications, setNotifications] = useState<string[]>([]);
  const [contracts, setContracts] = useState<ProductContract[]>([]);
  const [activeView, setActiveView] = useState<FreelancerView>("inbox");
  const [hasManualViewSelection, setHasManualViewSelection] = useState(false);
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("pending");

  const contract = useMemo(
    () =>
      getContract({
        client,
        chain: celoSepolia,
        address: AGENT_REGISTRY_ADDRESS,
        abi: AGENT_REGISTRY_ABI,
      }),
    []
  );

  const { data, refetch } = useReadContract({ contract, method: "getAgents", params: [] });

  useEffect(() => {
    const syncWorkflow = async () => {
      if (!connectedAddress) {
        setNotifications([]);
        setContracts([]);
        return;
      }
      await syncWorkflowState(account);
      const nextContracts = getContractsForFreelancer(connectedAddress);
      const nextNotifications = getNotificationsForWallet(connectedAddress);

      setContracts(nextContracts);
      setNotifications(nextNotifications);
    };

    void syncWorkflow();
    window.addEventListener("storage", syncWorkflow);
    window.addEventListener(getWorkflowRefreshEventName(), syncWorkflow);
    return () => {
      window.removeEventListener("storage", syncWorkflow);
      window.removeEventListener(getWorkflowRefreshEventName(), syncWorkflow);
    };
  }, [account, connectedAddress]);

  const allAgents = (data as Agent[] | undefined) || [];
  const uniqueAgents = allAgents.filter((agent, index, arr) => {
    const owner = normalizeWallet(agent.owner);
    return index === arr.findIndex((item) => normalizeWallet(item.owner) === owner);
  });
  const myProfile = uniqueAgents.find((agent) => normalizeWallet(agent.owner) === connectedAddress) || null;
  const reputation = connectedAddress ? getReputationForWallet(connectedAddress) : null;
  const sortedContracts = [...contracts].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  const pendingContracts = sortedContracts.filter((entry) => entry.status === "sent");
  const approvedContracts = sortedContracts.filter((entry) => entry.status === "approved");
  const rejectedContracts = sortedContracts.filter((entry) => entry.status === "rejected");
  const unusedApprovedContracts = approvedContracts.filter((entry) => !(entry.linkedProjectId ?? 0));
  const linkedContracts = approvedContracts.filter((entry) => (entry.linkedProjectId ?? 0) > 0);
  const currentTask = pendingContracts[0] ?? linkedContracts[0] ?? approvedContracts[0] ?? null;
  const inboxContracts =
    inboxFilter === "pending" ? pendingContracts : inboxFilter === "approved" ? unusedApprovedContracts : rejectedContracts;

  function openFreelancerView(view: FreelancerView) {
    setHasManualViewSelection(true);
    setActiveView(view);
  }

  const recommendedView = useMemo<FreelancerView>(() => {
    if (!connectedAddress) return "overview";
    if (pendingContracts.length > 0) return "inbox";
    if (linkedContracts.length > 0 || unusedApprovedContracts.length > 0) return "active";
    if (!myProfile) return "overview";
    return "inbox";
  }, [connectedAddress, pendingContracts.length, linkedContracts.length, unusedApprovedContracts.length, myProfile]);

  useEffect(() => {
    if (hasManualViewSelection) return;
    setActiveView(recommendedView);
  }, [hasManualViewSelection, recommendedView]);

  async function approveContract(contractId: string) {
    const next = await updateProductContractStatus(contractId, "approved", account);
    if (!next) return;
    await syncWorkflowState(account);
    if (connectedAddress) setContracts(getContractsForFreelancer(connectedAddress));
    if (connectedAddress) setNotifications(getNotificationsForWallet(connectedAddress));
    setInboxFilter("approved");
  }

  async function rejectContract(contractId: string) {
    const next = await updateProductContractStatus(contractId, "rejected", account);
    if (!next) return;
    await syncWorkflowState(account);
    if (connectedAddress) setContracts(getContractsForFreelancer(connectedAddress));
    if (connectedAddress) setNotifications(getNotificationsForWallet(connectedAddress));
    setInboxFilter("rejected");
  }

  async function createAgent() {
    if (!account) {
      setProfileStatus("Connect your wallet first.");
      return;
    }
    if (!name || !skill || !hourlyRate) {
      setProfileStatus("Fill name, skill, and hourly rate.");
      return;
    }

    const latest = await refetch();
    const latestAgents = (latest.data as Agent[] | undefined) || allAgents;
    const walletExists = latestAgents.some((agent) => normalizeWallet(agent.owner) === connectedAddress);
    if (walletExists) {
      setProfileStatus("This wallet already has a profile. One wallet can only create one freelancer profile in this demo.");
      return;
    }
    const nameExists = latestAgents.some((agent) => agent.name.toLowerCase().trim() === name.toLowerCase().trim());
    if (nameExists) {
      setProfileStatus("This profile name is already taken. Choose a different name for this demo.");
      return;
    }

    try {
      setCreating(true);
      setProfileStatus("Waiting for wallet confirmation...");
      const transaction = prepareContractCall({
        contract,
        method: "registerAgent",
        params: [
          name,
          description || "Freelancer profile",
          skill,
          BigInt(hourlyRate),
          location || "Not specified",
          availability || "Open",
        ],
      });
      await sendTransaction({ transaction, account });
      setProfileStatus("Freelancer profile created successfully.");
      setName("");
      setDescription("");
      setSkill("");
      setHourlyRate("");
      setLocation("");
      setAvailability("");
      await refetch();
    } catch (error) {
      console.error(error);
      setProfileStatus("Profile creation failed. Wallet may already have a profile or username may already be taken.");
    } finally {
      setCreating(false);
    }
  }

  const nextAction = useMemo(() => {
    if (!connectedAddress) {
      return {
        eyebrow: "Connection",
        title: "Connect the freelancer wallet to activate this dashboard.",
        description: "Wallet identity drives contract inbox visibility, active project permissions, and your stored reputation.",
        actionLabel: undefined,
        onAction: undefined,
      };
    }
    if (pendingContracts.length > 0) {
      return {
        eyebrow: "Next action",
        title: "Review the next incoming contract.",
        description: "Approve or reject the pending contract before work can move into escrow.",
        actionLabel: "Open Inbox",
        onAction: () => {
          openFreelancerView("inbox");
          setInboxFilter("pending");
        },
      };
    }
    if (linkedContracts.length > 0) {
      return {
        eyebrow: "Active work",
        title: "A linked project needs delivery attention.",
        description: "Open Active to monitor funded scope, submit work, and track the current project state.",
        actionLabel: "Open Active",
        onAction: () => openFreelancerView("active"),
      };
    }
    if (!myProfile) {
      return {
        eyebrow: "Setup",
        title: "Create your freelancer profile to complete the workspace.",
        description: "Wallet activity is already tracked here, but a public profile is what makes you discoverable in the registry.",
        actionLabel: undefined,
        onAction: undefined,
      };
    }
    if (unusedApprovedContracts.length > 0) {
      return {
        eyebrow: "Waiting",
        title: "Approved work is waiting for client escrow setup.",
        description: "The contract is approved. The next change will come when the client creates and funds the matching project.",
        actionLabel: "Open Active",
        onAction: () => openFreelancerView("active"),
      };
    }
    return {
      eyebrow: "Ready",
      title: "Keep your profile and inbox ready for the next opportunity.",
      description: "This workspace stays focused on incoming contracts, active delivery, and the reputation you build after outcomes resolve.",
      actionLabel: "Open Inbox",
      onAction: () => openFreelancerView("inbox"),
    };
  }, [connectedAddress, pendingContracts.length, linkedContracts.length, myProfile, unusedApprovedContracts.length]);

  const navItems: WorkspaceNavItem[] = [
    { id: "overview", label: "Now", badge: myProfile ? undefined : "Setup", hint: "Immediate actions and setup." },
    { id: "inbox", label: "Inbox", badge: `${pendingContracts.length}`, hint: "Review incoming contracts and decide." },
    { id: "active", label: "Active", badge: `${linkedContracts.length}`, hint: "Track funded work and submit delivery." },
  ];

  return (
    <WorkspaceShell
      workspaceLabel="Freelancer workspace"
      title="Freelancer dashboard for review and submit."
      description="This route is the freelancer mini app: review contracts, track active delivery, and build reputation from a compact mobile-first workspace."
      navItems={navItems}
      activeItem={activeView}
      onItemChange={(id) => openFreelancerView(id as FreelancerView)}
      headerActions={
        <>
          <Link href="/client" className="rounded-[10px] border border-[#262626] px-4 py-2 text-sm font-medium text-[#f7f4ef] transition hover:border-[#3b3b3b]">Switch to Client</Link>
          <ConnectButton client={client} chain={celoSepolia} />
        </>
      }
      metricStrip={<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><SummaryCard label="Pending" value={`${pendingContracts.length}`} /><SummaryCard label="Approved" value={`${unusedApprovedContracts.length}`} /><SummaryCard label="Active Links" value={`${linkedContracts.length}`} /><SummaryCard label="Earned" value={`${reputation?.totalEarned ?? 0} CELO`} /></div>}
      focusArea={<SectionNotice eyebrow={nextAction.eyebrow} title={nextAction.title} description={nextAction.description} action={!connectedAddress ? <ConnectButton client={client} chain={celoSepolia} /> : nextAction.actionLabel ? <button type="button" onClick={nextAction.onAction} className="rounded-[12px] bg-[#d72638] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b91f30]">{nextAction.actionLabel}</button> : null} />}
      mainArea={
        <>
          {activeView === "overview" ? (
            <div className="grid gap-6">
              <WorkspacePanel title={!myProfile ? "Complete freelancer setup" : "Current operating state"} subtitle={!myProfile ? "Create your onchain freelancer profile here. Wallet activity remains visible even before public profile setup is complete." : "Your profile, active contracts, and delivery state now live in focused dashboard views."}>
                {!connectedAddress ? (
                  <WalletSignInPanel
                    title="Sign in as freelancer"
                    description="Connect the wallet you use for freelancer contracts, inbox access, and active project delivery."
                  />
                ) : !myProfile ? (
                  <div className="grid gap-3">
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name *" className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]" />
                    <input value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="Primary skill *" className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]" />
                    <input value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder="Hourly rate in USD *" className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]" />
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Short bio (optional)" className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]" />
                    <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)" className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]" />
                    <input value={availability} onChange={(e) => setAvailability(e.target.value)} placeholder="Availability (optional)" className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]" />
                    <div className="flex flex-wrap gap-3">
                      <button type="button" onClick={createAgent} disabled={creating} className="rounded-[12px] bg-[#d72638] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b91f30] disabled:opacity-60">{creating ? "Creating..." : "Create Profile"}</button>
                      <button type="button" onClick={() => refetch()} className="rounded-[12px] border border-[#262626] px-5 py-3 text-sm font-semibold text-[#f7f4ef] transition hover:border-[#3b3b3b]">Refresh</button>
                    </div>
                    {profileStatus ? <InlineNotice message={profileStatus} /> : null}
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard label="Pending Contracts" value={`${pendingContracts.length}`} />
                    <SummaryCard label="Approved Contracts" value={`${unusedApprovedContracts.length}`} />
                    <SummaryCard label="Completed Contracts" value={`${reputation?.completedContracts ?? 0}`} />
                    <SummaryCard label="Guild Score" value={`${reputation?.guildScore ?? 0}/100`} />
                  </div>
                )}
              </WorkspacePanel>
              <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                <WorkspacePanel title="Current task" subtitle="Keep the most relevant contract or project at the center of the workspace.">
                  {currentTask ? (
                    <ContractCardList
                      contracts={[currentTask]}
                      variant="freelancer"
                      nextActionLabel={(contract) =>
                        contract.status === "sent"
                          ? "Approve or reject"
                          : contract.linkedProjectId
                            ? `Linked to Project #${contract.linkedProjectId}`
                            : "Waiting for escrow funding"
                      }
                    />
                  ) : (
                    <EmptyState copy="No current contracts or linked projects are assigned to this wallet yet." />
                  )}
                </WorkspacePanel>
                <WorkspacePanel title="Workload snapshot" subtitle="Keep the inbox and active work lanes visible at a glance.">
                  <div className="grid gap-3">
                    <PipelineRow label="Pending decisions" value={`${pendingContracts.length}`} tone="amber" />
                    <PipelineRow label="Approved contracts" value={`${unusedApprovedContracts.length}`} tone="neutral" />
                    <PipelineRow label="Linked projects" value={`${linkedContracts.length}`} tone="red" />
                    <PipelineRow label="Rejected" value={`${rejectedContracts.length}`} tone="green" />
                  </div>
                </WorkspacePanel>
              </div>
            </div>
          ) : null}
          {activeView === "inbox" ? (
            !connectedAddress ? (
              <WalletSignInPanel
                title="Sign in to open the freelancer inbox"
                description="Pending contracts and approval actions are scoped to the connected freelancer wallet."
              />
            ) : (
            <div className="grid gap-6">
              <WorkspacePanel title="Contract inbox" subtitle="Keep only one inbox state visible at a time so review stays focused." action={<SegmentedControl items={[{ id: "pending", label: `Pending (${pendingContracts.length})` }, { id: "approved", label: `Approved (${unusedApprovedContracts.length})` }, { id: "rejected", label: `Rejected (${rejectedContracts.length})` }]} activeId={inboxFilter} onChange={(id) => setInboxFilter(id as InboxFilter)} />}>
                <ContractCardList
                  contracts={inboxContracts}
                  variant="freelancer"
                  emptyState={inboxFilter === "pending" ? "No pending contracts are assigned to this wallet." : inboxFilter === "approved" ? "No approved contracts are assigned to this wallet." : "No rejected contracts are assigned to this wallet."}
                  nextActionLabel={(contract) =>
                    contract.status === "sent"
                      ? "Approve or reject"
                      : contract.linkedProjectId
                        ? `Linked to Project #${contract.linkedProjectId}`
                        : contract.status === "approved"
                          ? "Wait for client escrow setup"
                          : "Archived"
                  }
                  footer={
                    inboxFilter === "pending"
                      ? (contractEntry) => (
                          <div className="flex flex-wrap gap-3">
                            <button type="button" onClick={() => approveContract(contractEntry.id)} className="rounded-[10px] bg-[#d72638] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#b91f30]">Approve</button>
                            <button type="button" onClick={() => rejectContract(contractEntry.id)} className="rounded-[10px] border border-[#262626] px-4 py-2 text-xs font-semibold text-[#f7f4ef] transition hover:border-[#3b3b3b]">Reject</button>
                          </div>
                        )
                      : undefined
                  }
                />
              </WorkspacePanel>
            </div>
            )
          ) : null}
          {activeView === "active" ? (
            !connectedAddress ? (
              <WalletSignInPanel
                title="Sign in to manage active work"
                description="Project permissions and submit-work actions only unlock after the freelancer wallet is connected."
              />
            ) : (
            <div className="grid gap-6">
              {!myProfile ? <WorkspacePanel title="Profile note" subtitle="Wallet permissions still govern active work, but your public freelancer profile is not complete yet."><EmptyState copy="You can still inspect project state for this wallet. Finish profile setup in Now to appear in the public talent registry." /></WorkspacePanel> : null}
              <div id="freelancer-active-work"><EscrowSimulator selectedRole="freelancer" /></div>
            </div>
            )
          ) : null}
        </>
      }
      supportArea={
        <>
          <WorkspacePanel title="Notifications" subtitle="Recent workflow updates for this connected wallet.">
            <NotificationList notifications={notifications} emptyCopy={connectedAddress ? "No notifications for this wallet yet." : "Connect a wallet to see wallet-scoped notifications."} />
          </WorkspacePanel>
          <WorkspacePanel title="Profile summary" subtitle="Registry identity and wallet context.">
            {myProfile ? (
              <div className="grid gap-3">
                <DetailCard label="Name" value={myProfile.name} />
                <DetailCard label="Primary skill" value={myProfile.skill} />
                <DetailCard label="Rate" value={`$${myProfile.hourlyRate.toString()}/hr`} />
                <DetailCard label="Availability" value={myProfile.availability} />
                {connectedAddress ? <DetailCard label="Connected wallet" value={shortAddress(connectedAddress)} /> : null}
              </div>
            ) : (
              <EmptyState copy="No public freelancer profile yet. Wallet activity and inbox state still remain visible." />
            )}
          </WorkspacePanel>
          <WorkspacePanel title="Current snapshot" subtitle="Keep the current contract and earnings context visible.">
            {currentTask ? (
              <div className="grid gap-3">
                <DetailCard label="Client" value={currentTask.clientName} />
                <DetailCard label="Contract value" value={formatDisplayBudget(currentTask.displayBudget)} />
                <DetailCard label="Settlement amount" value={formatSettlementAmountCelo(currentTask.settlementAmountCelo)} />
                <DetailCard label="Status" value={currentTask.status} />
                {currentTask.linkedProjectId ? <DetailCard label="Project" value={`#${currentTask.linkedProjectId}`} /> : null}
              </div>
            ) : (
              <div className="grid gap-3">
                <DetailCard label="Total earned" value={`${reputation?.totalEarned ?? 0} CELO`} />
                <DetailCard label="Completed" value={`${reputation?.completedContracts ?? 0}`} />
                <DetailCard label="Guild score" value={`${reputation?.guildScore ?? 0}/100`} />
              </div>
            )}
          </WorkspacePanel>
          <WorkspacePanel title="Earnings and history" subtitle="Completed work stays secondary while beta focuses on the live loop.">
            <div className="grid gap-3">
              <DetailCard label="Total earned" value={`${reputation?.totalEarned ?? 0} CELO`} />
              <DetailCard label="Completed contracts" value={`${reputation?.completedContracts ?? 0}`} />
              <DetailCard label="Archived records" value={`${linkedContracts.length + rejectedContracts.length}`} />
            </div>
          </WorkspacePanel>
        </>
      }
    />
  );
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function WalletSignInPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[16px] border border-[#4c1d24] bg-[#160b0d] p-5">
      <div className="text-[12px] uppercase tracking-[0.14em] text-[#f2b6be]">Freelancer access</div>
      <div className="mt-3 text-[20px] font-semibold tracking-[-0.03em] text-[#f7f4ef]">{title}</div>
      <p className="mt-3 max-w-[620px] text-sm leading-7 text-[#e6c7cb]">{description}</p>
      <div className="mt-5">
        <ConnectButton client={client} chain={celoSepolia} />
      </div>
    </div>
  );
}
