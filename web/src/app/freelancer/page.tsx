"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ConnectButton, useActiveAccount, useReadContract } from "thirdweb/react";
import { getContract, prepareContractCall, sendTransaction } from "thirdweb";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
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
  NotificationList,
  SegmentedControl,
  SummaryCard,
} from "@/components/workspace/WorkspacePrimitives";
import { client } from "@/lib/client";
import { AGENT_REGISTRY_ABI, AGENT_REGISTRY_ADDRESS } from "@/lib/contract";
import { agentGuildChain } from "@/lib/networkConfig";
import { agentGuildRuntimeConfig } from "@/lib/runtimeConfig";
import { formatDisplayBudget, formatSettlementAmountCelo } from "@/lib/budget";
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

type FreelancerView = "inbox" | "active" | "profile";
type InboxFilter = "pending" | "approved" | "rejected";

export default function FreelancerWorkspacePage() {
  if (!agentGuildRuntimeConfig.valid || !client) {
    return (
      <ConfigErrorScreen
        title="Freelancer app unavailable"
        description="Agent Guild could not load wallet and contract configuration on this device, so freelancer actions stay disabled until the public runtime values are fixed."
        errors={agentGuildRuntimeConfig.errors}
      />
    );
  }

  return <ConfiguredFreelancerWorkspacePage />;
}

function ConfiguredFreelancerWorkspacePage() {
  const thirdwebClient = client!;
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
        client: thirdwebClient,
        chain: agentGuildChain,
        address: AGENT_REGISTRY_ADDRESS,
        abi: AGENT_REGISTRY_ABI,
      }),
    [thirdwebClient]
  );

  const { data, refetch } = useReadContract({ contract, method: "getAgents", params: [] });
  const { data: betaAccessData } = useReadContract({
    contract,
    method: "betaAllowed",
    params: [connectedAddress as `0x${string}`],
    queryOptions: {
      enabled: !!connectedAddress,
    },
  });

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
  const isAllowlistedForBeta = Boolean(betaAccessData);
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
    if (!connectedAddress) return "profile";
    if (pendingContracts.length > 0) return "inbox";
    if (linkedContracts.length > 0 || unusedApprovedContracts.length > 0) return "active";
    return "profile";
  }, [connectedAddress, linkedContracts.length, pendingContracts.length, unusedApprovedContracts.length]);

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
    if (!isAllowlistedForBeta) {
      setProfileStatus("This wallet is not allowlisted for the curated beta directory yet.");
      return;
    }

    const latest = await refetch();
    const latestAgents = (latest.data as Agent[] | undefined) || allAgents;
    const walletExists = latestAgents.some((agent) => normalizeWallet(agent.owner) === connectedAddress);
    if (walletExists) {
      setProfileStatus("This wallet already has a profile. One wallet can only create one freelancer profile in this beta.");
      return;
    }
    const nameExists = latestAgents.some((agent) => agent.name.toLowerCase().trim() === name.toLowerCase().trim());
    if (nameExists) {
      setProfileStatus("This profile name is already taken. Choose a different name for this beta.");
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
      setProfileStatus("Profile creation failed. Wallet may already have a profile or name may already be taken.");
    } finally {
      setCreating(false);
    }
  }

  const nextAction = useMemo(() => {
    if (!connectedAddress) {
      return {
        eyebrow: "Connect",
        title: "Connect the freelancer wallet to open your flow.",
        description: "Inbox access, project permissions, and payout tracking are all wallet-scoped.",
        actionLabel: undefined,
        onAction: undefined,
      };
    }
    if (pendingContracts.length > 0) {
      return {
        eyebrow: "Next",
        title: "Review the next pending contract.",
        description: "Approve or reject first, then wait for the client to fund escrow.",
        actionLabel: "Open Inbox",
        onAction: () => {
          openFreelancerView("inbox");
          setInboxFilter("pending");
        },
      };
    }
    if (linkedContracts.length > 0) {
      return {
        eyebrow: "Active",
        title: "Submit work for the funded project.",
        description: "Your linked project is ready for delivery or release tracking.",
        actionLabel: "Open Active",
        onAction: () => openFreelancerView("active"),
      };
    }
    if (!myProfile) {
      return {
        eyebrow: "Profile",
        title: "Create your curated beta profile.",
        description: isAllowlistedForBeta
          ? "This wallet can publish one profile for client discovery."
          : "This wallet can still review work, but profile publishing is limited to allowlisted wallets.",
        actionLabel: "Open Profile",
        onAction: () => openFreelancerView("profile"),
      };
    }
    if (unusedApprovedContracts.length > 0) {
      return {
        eyebrow: "Waiting",
        title: "Approved work is waiting for client funding.",
        description: "The contract is approved. The next change happens when the client opens escrow.",
        actionLabel: "Open Active",
        onAction: () => openFreelancerView("active"),
      };
    }
    return {
      eyebrow: "Ready",
      title: "Stay ready for the next incoming contract.",
      description: "Keep your inbox clear and your profile visible for the next client flow.",
      actionLabel: "Open Inbox",
      onAction: () => openFreelancerView("inbox"),
    };
  }, [
    connectedAddress,
    isAllowlistedForBeta,
    linkedContracts.length,
    myProfile,
    pendingContracts.length,
    unusedApprovedContracts.length,
  ]);

  const navItems: WorkspaceNavItem[] = [
    { id: "inbox", label: "Inbox", badge: `${pendingContracts.length}` },
    { id: "active", label: "Active", badge: `${linkedContracts.length + unusedApprovedContracts.length}` },
    { id: "profile", label: "Profile" },
  ];

  return (
    <WorkspaceShell
      workspaceLabel="Freelancer"
      title="Review, submit, and track payout."
      description="One MiniPay-style freelancer flow for contract decisions, funded work, and release tracking."
      navItems={navItems}
      activeItem={activeView}
      onItemChange={(id) => openFreelancerView(id as FreelancerView)}
      headerActions={
        <>
          <Link
            href="/client"
            className="rounded-[12px] border border-[#262626] px-4 py-3 text-sm font-semibold text-[#f7f4ef] transition hover:border-[#3b3b3b]"
          >
            Client
          </Link>
          <ConnectButton client={thirdwebClient} chain={agentGuildChain} />
        </>
      }
      metricStrip={
        <div className="grid gap-3 grid-cols-3">
          <SummaryCard label="Pending" value={`${pendingContracts.length}`} />
          <SummaryCard label="Active" value={`${linkedContracts.length}`} />
          <SummaryCard label="Earned" value={`${reputation?.totalEarned ?? 0} CELO`} />
        </div>
      }
      focusArea={
        <SectionNotice
          eyebrow={nextAction.eyebrow}
          title={nextAction.title}
          description={nextAction.description}
          action={
            !connectedAddress ? (
              <ConnectButton client={thirdwebClient} chain={agentGuildChain} />
            ) : nextAction.actionLabel ? (
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
          {activeView === "inbox" ? (
            !connectedAddress ? (
              <WalletSignInPanel
                title="Sign in to open the freelancer inbox"
                description="Pending contracts and approval actions are scoped to the connected freelancer wallet."
                walletClient={thirdwebClient}
              />
            ) : (
              <WorkspacePanel
                title="Contract inbox"
                subtitle="Keep one inbox state visible at a time so review stays focused."
                action={
                  <SegmentedControl
                    items={[
                      { id: "pending", label: `Pending (${pendingContracts.length})` },
                      { id: "approved", label: `Approved (${unusedApprovedContracts.length})` },
                      { id: "rejected", label: `Rejected (${rejectedContracts.length})` },
                    ]}
                    activeId={inboxFilter}
                    onChange={(id) => setInboxFilter(id as InboxFilter)}
                  />
                }
              >
                <ContractCardList
                  contracts={inboxContracts}
                  variant="freelancer"
                  emptyState={
                    inboxFilter === "pending"
                      ? "No pending contracts are assigned to this wallet."
                      : inboxFilter === "approved"
                        ? "No approved contracts are assigned to this wallet."
                        : "No rejected contracts are assigned to this wallet."
                  }
                  nextActionLabel={(contractEntry) =>
                    contractEntry.status === "sent"
                      ? "Approve or reject"
                      : contractEntry.linkedProjectId
                        ? `Project #${contractEntry.linkedProjectId}`
                        : contractEntry.status === "approved"
                          ? "Wait for escrow funding"
                          : "Archived"
                  }
                  footer={
                    inboxFilter === "pending"
                      ? (contractEntry) => (
                          <div className="flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={() => approveContract(contractEntry.id)}
                              className="rounded-[12px] bg-[#d72638] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#b91f30]"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => rejectContract(contractEntry.id)}
                              className="rounded-[12px] border border-[#262626] px-4 py-3 text-sm font-semibold text-[#f7f4ef] transition hover:border-[#3b3b3b]"
                            >
                              Reject
                            </button>
                          </div>
                        )
                      : undefined
                  }
                />
              </WorkspacePanel>
            )
          ) : null}

          {activeView === "active" ? (
            !connectedAddress ? (
              <WalletSignInPanel
                title="Sign in to manage active work"
                description="Project permissions and submit-work actions only unlock after the freelancer wallet is connected."
                walletClient={thirdwebClient}
              />
            ) : (
              <>
                {currentTask ? (
                  <WorkspacePanel
                    title="Current work"
                    subtitle="Keep the current contract or linked project visible while you move through delivery."
                  >
                    <ContractCardList
                      contracts={[currentTask]}
                      variant="freelancer"
                      nextActionLabel={(contractEntry) =>
                        contractEntry.status === "sent"
                          ? "Approve or reject"
                          : contractEntry.linkedProjectId
                            ? `Project #${contractEntry.linkedProjectId}`
                            : "Waiting for client funding"
                      }
                    />
                  </WorkspacePanel>
                ) : (
                  <WorkspacePanel
                    title="No active project"
                    subtitle="Active work will appear here once a contract is approved and linked into escrow."
                  >
                    <EmptyState copy="No linked project is assigned to this wallet yet." />
                  </WorkspacePanel>
                )}

                <div id="freelancer-active-work">
                  <EscrowSimulator selectedRole="freelancer" />
                </div>
              </>
            )
          ) : null}

          {activeView === "profile" ? (
            !connectedAddress ? (
              <WalletSignInPanel
                title="Sign in as freelancer"
                description="Connect the wallet you use for freelancer contracts, inbox access, and delivery."
                walletClient={thirdwebClient}
              />
            ) : myProfile ? (
              <>
                <WorkspacePanel title="Profile" subtitle="This curated beta profile is what clients see first.">
                  <div className="grid gap-3">
                    <DetailCard label="Name" value={myProfile.name} />
                    <DetailCard label="Skill" value={myProfile.skill} />
                    <DetailCard label="Rate" value={`$${myProfile.hourlyRate.toString()}/hr`} />
                    <DetailCard label="Availability" value={myProfile.availability} />
                  </div>
                </WorkspacePanel>
                <WorkspacePanel title="Reputation" subtitle="Track the visible work outcome signals tied to this wallet.">
                  <div className="grid gap-3 grid-cols-2">
                    <SummaryCard label="Earned" value={`${reputation?.totalEarned ?? 0} CELO`} />
                    <SummaryCard label="Completed" value={`${reputation?.completedContracts ?? 0}`} />
                  </div>
                </WorkspacePanel>
              </>
            ) : (
              <WorkspacePanel
                title="Create freelancer profile"
                subtitle="The beta directory is curated. Only allowlisted wallets can publish one profile."
              >
                <div className="grid gap-3">
                  <div className="rounded-[14px] border border-[#1f1f1f] bg-[#111111] px-4 py-4 text-sm leading-6 text-[#d1d5db]">
                    {isAllowlistedForBeta
                      ? "This wallet is allowlisted for the curated beta directory and can publish one profile."
                      : "This wallet is not allowlisted for profile creation in the curated beta directory yet."}
                  </div>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Name"
                    className="w-full rounded-[14px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                  />
                  <input
                    value={skill}
                    onChange={(event) => setSkill(event.target.value)}
                    placeholder="Primary skill"
                    className="w-full rounded-[14px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                  />
                  <input
                    value={hourlyRate}
                    onChange={(event) => setHourlyRate(event.target.value)}
                    placeholder="Hourly rate in USD"
                    className="w-full rounded-[14px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                  />
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={4}
                    placeholder="Short bio"
                    className="w-full rounded-[14px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                  />
                  <input
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder="Location"
                    className="w-full rounded-[14px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                  />
                  <input
                    value={availability}
                    onChange={(event) => setAvailability(event.target.value)}
                    placeholder="Availability"
                    className="w-full rounded-[14px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                  />
                  <button
                    type="button"
                    onClick={createAgent}
                    disabled={creating}
                    className="w-full rounded-[16px] bg-[#d72638] px-5 py-4 text-base font-semibold text-white transition hover:bg-[#b91f30] disabled:opacity-60"
                  >
                    {creating ? "Creating..." : "Create Profile"}
                  </button>
                  {profileStatus ? <InlineNotice message={profileStatus} /> : null}
                </div>
              </WorkspacePanel>
            )
          ) : null}
        </>
      }
      supportArea={
        <>
          <WorkspacePanel title="Notifications" subtitle="Recent workflow updates for this wallet.">
            <NotificationList
              notifications={notifications}
              emptyCopy={
                connectedAddress
                  ? "No notifications for this wallet yet."
                  : "Connect a wallet to see wallet-scoped notifications."
              }
            />
          </WorkspacePanel>
          <WorkspacePanel title="Current snapshot" subtitle="Keep the current contract context visible.">
            {currentTask ? (
              <div className="grid gap-3">
                <DetailCard label="Client" value={currentTask.clientName} />
                <DetailCard label="Contract value" value={formatDisplayBudget(currentTask.displayBudget)} />
                <DetailCard
                  label="Settlement amount"
                  value={formatSettlementAmountCelo(currentTask.settlementAmountCelo)}
                />
                <DetailCard label="Status" value={currentTask.status} />
              </div>
            ) : (
              <EmptyState copy="No current contract or project is assigned to this wallet." />
            )}
          </WorkspacePanel>
        </>
      }
    />
  );
}

function WalletSignInPanel({
  title,
  description,
  walletClient,
}: {
  title: string;
  description: string;
  walletClient: Exclude<typeof client, null>;
}) {
  return (
    <div className="rounded-[20px] border border-[#4c1d24] bg-[#160b0d] p-5">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[#f2b6be]">Freelancer access</div>
      <div className="mt-3 text-[22px] font-semibold tracking-[-0.04em] text-[#f7f4ef]">{title}</div>
      <p className="mt-3 text-sm leading-7 text-[#e6c7cb]">{description}</p>
      <div className="mt-5">
        <ConnectButton client={walletClient} chain={agentGuildChain} />
      </div>
    </div>
  );
}
