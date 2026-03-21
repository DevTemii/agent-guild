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
import { getReputationForWallet } from "@/lib/reputationStore";
import {
  appendNotificationForWallet,
  appendNotifications,
  FREELANCER_CONTRACT_RECEIVED_NOTIFICATION,
  getContractsForFreelancer,
  getNotificationsForWallet,
  getWorkflowRefreshEventName,
  ProductContract,
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

type FreelancerView = "overview" | "inbox" | "active" | "earnings";
type InboxFilter = "pending" | "approved" | "rejected";

const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  rpc: "https://forno.celo-sepolia.celo-testnet.org",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
});

export default function FreelancerWorkspacePage() {
  const account = useActiveAccount();
  const connectedAddress = account?.address?.toLowerCase() ?? null;
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
  const [activeView, setActiveView] = useState<FreelancerView>("overview");
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
    const syncWorkflow = () => {
      if (!connectedAddress) {
        setNotifications([]);
        setContracts([]);
        return;
      }
      const nextContracts = getContractsForFreelancer(connectedAddress);
      const nextNotifications = getNotificationsForWallet(connectedAddress);
      const hasPendingContract = nextContracts.some((entry) => entry.status === "sent");
      const hasPendingNotification = nextNotifications.includes(FREELANCER_CONTRACT_RECEIVED_NOTIFICATION);

      setContracts(nextContracts);
      if (hasPendingContract && !hasPendingNotification) {
        setNotifications(appendNotificationForWallet(connectedAddress, FREELANCER_CONTRACT_RECEIVED_NOTIFICATION));
        return;
      }
      setNotifications(nextNotifications);
    };

    syncWorkflow();
    window.addEventListener("storage", syncWorkflow);
    window.addEventListener(getWorkflowRefreshEventName(), syncWorkflow);
    return () => {
      window.removeEventListener("storage", syncWorkflow);
      window.removeEventListener(getWorkflowRefreshEventName(), syncWorkflow);
    };
  }, [connectedAddress]);

  const allAgents = (data as Agent[] | undefined) || [];
  const uniqueAgents = allAgents.filter((agent, index, arr) => {
    const owner = agent.owner.toLowerCase();
    return index === arr.findIndex((item) => item.owner.toLowerCase() === owner);
  });
  const myProfile = uniqueAgents.find((agent) => agent.owner.toLowerCase() === connectedAddress) || null;
  const reputation = connectedAddress ? getReputationForWallet(connectedAddress) : null;
  const sortedContracts = [...contracts].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  const pendingContracts = sortedContracts.filter((entry) => entry.status === "sent");
  const approvedContracts = sortedContracts.filter((entry) => entry.status === "approved");
  const rejectedContracts = sortedContracts.filter((entry) => entry.status === "rejected");
  const linkedContracts = approvedContracts.filter((entry) => (entry.linkedProjectId ?? 0) > 0);
  const currentTask = pendingContracts[0] ?? linkedContracts[0] ?? approvedContracts[0] ?? null;
  const inboxContracts =
    inboxFilter === "pending" ? pendingContracts : inboxFilter === "approved" ? approvedContracts : rejectedContracts;

  function approveContract(contractId: string) {
    const next = updateProductContractStatus(contractId, "approved");
    if (!next) return;
    appendNotifications([
      { wallet: next.freelancerWallet, message: `You approved ${next.clientName}'s contract and unlocked escrow setup.` },
      { wallet: next.clientWallet, message: `${next.freelancerName} approved your contract. Escrow can now be created.` },
    ]);
    if (connectedAddress) setContracts(getContractsForFreelancer(connectedAddress));
    setInboxFilter("approved");
  }

  function rejectContract(contractId: string) {
    const next = updateProductContractStatus(contractId, "rejected");
    if (!next) return;
    appendNotifications([
      { wallet: next.freelancerWallet, message: `You rejected ${next.clientName}'s contract.` },
      { wallet: next.clientWallet, message: `${next.freelancerName} rejected your contract.` },
    ]);
    if (connectedAddress) setContracts(getContractsForFreelancer(connectedAddress));
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
    const walletExists = latestAgents.some((agent) => agent.owner.toLowerCase() === connectedAddress);
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
          setActiveView("inbox");
          setInboxFilter("pending");
        },
      };
    }
    if (linkedContracts.length > 0) {
      return {
        eyebrow: "Active work",
        title: "A linked project needs delivery attention.",
        description: "Open Active Work to monitor funded scope, submit work, and track the current project state.",
        actionLabel: "Open Active Work",
        onAction: () => setActiveView("active"),
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
    if (approvedContracts.length > 0) {
      return {
        eyebrow: "Waiting",
        title: "Approved work is waiting for client escrow setup.",
        description: "The contract is approved. The next change will come when the client creates and funds the matching project.",
        actionLabel: "Open Active Work",
        onAction: () => setActiveView("active"),
      };
    }
    return {
      eyebrow: "Ready",
      title: "Keep your profile and inbox ready for the next opportunity.",
      description: "This workspace stays focused on incoming contracts, active delivery, and the reputation you build after outcomes resolve.",
      actionLabel: "Open Inbox",
      onAction: () => setActiveView("inbox"),
    };
  }, [connectedAddress, pendingContracts.length, linkedContracts.length, myProfile, approvedContracts.length]);

  const navItems: WorkspaceNavItem[] = [
    { id: "overview", label: "Overview", badge: myProfile ? undefined : "Setup", hint: "Current task, notifications, and profile status." },
    { id: "inbox", label: "Inbox", badge: `${pendingContracts.length}`, hint: "Review incoming contracts and decide." },
    { id: "active", label: "Active Work", badge: `${linkedContracts.length}`, hint: "Track funded work and submit delivery." },
    { id: "earnings", label: "Earnings / History", badge: `${reputation?.completedContracts ?? 0}`, hint: "Review earnings, reputation, and stored work history." },
  ];

  return (
    <WorkspaceShell
      workspaceLabel="Freelancer workspace"
      title="Track incoming work, active delivery, and reputation from one dashboard."
      description="The freelancer dashboard keeps your contract inbox, current project state, and earnings history in focused panels instead of one long scrolling page."
      navItems={navItems}
      activeItem={activeView}
      onItemChange={(id) => setActiveView(id as FreelancerView)}
      headerActions={
        <>
          <Link href="/" className="rounded-[10px] border border-[#262626] px-4 py-2 text-sm font-medium text-[#f7f4ef] transition hover:border-[#3b3b3b]">Back to Home</Link>
          <Link href="/client" className="rounded-[10px] border border-[#262626] px-4 py-2 text-sm font-medium text-[#f7f4ef] transition hover:border-[#3b3b3b]">Client Workspace</Link>
          <ConnectButton client={client} chain={celoSepolia} />
        </>
      }
      metricStrip={<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><SummaryCard label="Pending" value={`${pendingContracts.length}`} /><SummaryCard label="Approved" value={`${approvedContracts.length}`} /><SummaryCard label="Active Links" value={`${linkedContracts.length}`} /><SummaryCard label="Earned" value={`$${reputation?.totalEarned ?? 0}`} /></div>}
      focusArea={<SectionNotice eyebrow={nextAction.eyebrow} title={nextAction.title} description={nextAction.description} action={nextAction.actionLabel ? <button type="button" onClick={nextAction.onAction} className="rounded-[12px] bg-[#d72638] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b91f30]">{nextAction.actionLabel}</button> : null} />}
      mainArea={
        <>
          {activeView === "overview" ? (
            <div className="grid gap-6">
              <WorkspacePanel title={!myProfile ? "Complete freelancer setup" : "Current operating state"} subtitle={!myProfile ? "Create your onchain freelancer profile here. Wallet activity remains visible even before public profile setup is complete." : "Your profile, active contracts, and delivery state now live in focused dashboard views."}>
                {!myProfile ? (
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
                    <SummaryCard label="Approved Contracts" value={`${approvedContracts.length}`} />
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
                            ? `Project #${contract.linkedProjectId}`
                            : "Waiting for escrow funding"
                      }
                    />
                  ) : (
                    <EmptyState copy="No current task yet. Incoming contracts and funded work will appear here first." />
                  )}
                </WorkspacePanel>
                <WorkspacePanel title="Workload snapshot" subtitle="Keep the inbox and active work lanes visible at a glance.">
                  <div className="grid gap-3">
                    <PipelineRow label="Pending decisions" value={`${pendingContracts.length}`} tone="amber" />
                    <PipelineRow label="Approved contracts" value={`${approvedContracts.length}`} tone="neutral" />
                    <PipelineRow label="Linked projects" value={`${linkedContracts.length}`} tone="red" />
                    <PipelineRow label="Rejected" value={`${rejectedContracts.length}`} tone="green" />
                  </div>
                </WorkspacePanel>
              </div>
            </div>
          ) : null}
          {activeView === "inbox" ? (
            <div className="grid gap-6">
              <WorkspacePanel title="Contract inbox" subtitle="Keep only one inbox state visible at a time so review stays focused." action={<SegmentedControl items={[{ id: "pending", label: `Pending (${pendingContracts.length})` }, { id: "approved", label: `Approved (${approvedContracts.length})` }, { id: "rejected", label: `Rejected (${rejectedContracts.length})` }]} activeId={inboxFilter} onChange={(id) => setInboxFilter(id as InboxFilter)} />}>
                <ContractCardList
                  contracts={inboxContracts}
                  variant="freelancer"
                  emptyState={inboxFilter === "pending" ? "No contracts are waiting for your decision." : inboxFilter === "approved" ? "No approved contracts yet." : "No rejected contracts yet."}
                  nextActionLabel={(contract) =>
                    contract.status === "sent"
                      ? "Approve or reject"
                      : contract.linkedProjectId
                        ? `Project #${contract.linkedProjectId}`
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
          ) : null}
          {activeView === "active" ? (
            <div className="grid gap-6">
              {!myProfile ? <WorkspacePanel title="Profile note" subtitle="Wallet permissions still govern active work, but your public freelancer profile is not complete yet."><EmptyState copy="You can still inspect project state for this wallet. Finish profile setup in Overview to appear in the public talent registry." /></WorkspacePanel> : null}
              <div id="freelancer-active-work"><EscrowSimulator selectedRole="freelancer" /></div>
            </div>
          ) : null}
          {activeView === "earnings" ? (
            <div className="grid gap-6">
              <WorkspacePanel title="Earnings and reputation" subtitle="Reputation is part of the product, not a separate afterthought.">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <SummaryCard label="Guild Score" value={`${reputation?.guildScore ?? 0}/100`} />
                  <SummaryCard label="Completed Contracts" value={`${reputation?.completedContracts ?? 0}`} />
                  <SummaryCard label="Total Earned" value={`$${reputation?.totalEarned ?? 0}`} />
                  <SummaryCard label="Credit Status" value={reputation?.creditUnlocked ? `$${reputation.creditAmount} unlocked` : "Locked"} />
                </div>
              </WorkspacePanel>
              <WorkspacePanel title="Work history" subtitle="Keep contract outcomes and project links visible in one archive.">
                <ContractCardList
                  contracts={[...linkedContracts, ...rejectedContracts]}
                  variant="freelancer"
                  emptyState="No historical work records yet."
                  nextActionLabel={(contract) =>
                    contract.linkedProjectId ? `Project #${contract.linkedProjectId}` : contract.status === "rejected" ? "Archived" : "Stored"
                  }
                />
              </WorkspacePanel>
            </div>
          ) : null}
        </>
      }
      supportArea={
        <>
          <WorkspacePanel title="Notifications" subtitle="Recent workflow updates for this connected wallet.">
            <NotificationList notifications={notifications} emptyCopy="No notifications yet. Contract and project activity will appear here." />
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
                <DetailCard label="Budget" value={`$${currentTask.budget}`} />
                <DetailCard label="Status" value={currentTask.status} />
                {currentTask.linkedProjectId ? <DetailCard label="Project" value={`#${currentTask.linkedProjectId}`} /> : null}
              </div>
            ) : (
              <div className="grid gap-3">
                <DetailCard label="Total earned" value={`$${reputation?.totalEarned ?? 0}`} />
                <DetailCard label="Completed" value={`${reputation?.completedContracts ?? 0}`} />
                <DetailCard label="Guild score" value={`${reputation?.guildScore ?? 0}/100`} />
              </div>
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
