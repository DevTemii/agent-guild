"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useReadContract } from "thirdweb/react";
import { getContract, prepareContractCall, sendTransaction, waitForReceipt } from "thirdweb";
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
} from "@/components/workspace/WorkspacePrimitives";
import { client } from "@/lib/client";
import {
  AGENT_REGISTRY_ABI,
  AGENT_REGISTRY_ADDRESS,
  AGENT_REGISTRY_REGISTER_AGENT_SIGNATURE,
} from "@/lib/contract";
import { agentGuildChain, agentGuildChainId, agentGuildChainLabel } from "@/lib/networkConfig";
import { agentGuildRuntimeConfig } from "@/lib/runtimeConfig";
import { useAgentWalletSession } from "@/lib/walletSession";
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

type FreelancerView = "home" | "deal" | "profile";
type FreelancerStage = "connect" | "review" | "wait" | "submit" | "ready";

function extractRawErrorMessage(error: unknown): string {
  const messages: string[] = [];
  const visited = new Set<unknown>();

  function visit(value: unknown) {
    if (!value || visited.has(value)) {
      return;
    }
    visited.add(value);

    if (typeof value === "string") {
      messages.push(value);
      return;
    }

    if (value instanceof Error) {
      if (value.message) {
        messages.push(value.message);
      }

      const details = value as Error & {
        shortMessage?: string;
        reason?: string;
        details?: string;
        cause?: unknown;
      };

      if (details.shortMessage) messages.push(details.shortMessage);
      if (details.reason) messages.push(details.reason);
      if (details.details) messages.push(details.details);
      if (details.cause) visit(details.cause);
      return;
    }

    if (typeof value === "object") {
      const record = value as {
        message?: string;
        shortMessage?: string;
        reason?: string;
        details?: string;
        cause?: unknown;
      };

      if (record.message) messages.push(record.message);
      if (record.shortMessage) messages.push(record.shortMessage);
      if (record.reason) messages.push(record.reason);
      if (record.details) messages.push(record.details);
      if (record.cause) visit(record.cause);
      return;
    }
  }

  visit(error);

  const uniqueMessages = [...new Set(messages.map((message) => message.trim()).filter(Boolean))];
  if (uniqueMessages.length > 0) {
    return uniqueMessages.join(" | ");
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown profile creation error.";
  }
}

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
  const walletSession = useAgentWalletSession();
  const account = walletSession.thirdwebAccount;
  const connectedAddress = walletSession.address;
  const activeChainId = walletSession.externalChainId;
  const providerChainId = walletSession.providerChainId;
  const [walletSheetOpen, setWalletSheetOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [skill, setSkill] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [location, setLocation] = useState("");
  const [availability, setAvailability] = useState("");
  const [creating, setCreating] = useState(false);
  const [profileStatus, setProfileStatus] = useState("");
  const [profileTxHash, setProfileTxHash] = useState<string | null>(null);
  const [profileRawError, setProfileRawError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [contracts, setContracts] = useState<ProductContract[]>([]);
  const [activeView, setActiveView] = useState<FreelancerView>("home");
  const [hasManualViewSelection, setHasManualViewSelection] = useState(false);

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

  const resolvedChainId = walletSession.isMiniPay ? providerChainId : activeChainId;

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
  const currentTask = pendingContracts[0] ?? linkedContracts[0] ?? unusedApprovedContracts[0] ?? null;

  function openFreelancerView(view: FreelancerView) {
    setHasManualViewSelection(true);
    setActiveView(view);
  }

  const freelancerStage = useMemo<FreelancerStage>(() => {
    if (!connectedAddress) return "connect";
    if (pendingContracts.length > 0) return "review";
    if (linkedContracts.length > 0) return "submit";
    if (unusedApprovedContracts.length > 0) return "wait";
    return "ready";
  }, [connectedAddress, linkedContracts.length, pendingContracts.length, unusedApprovedContracts.length]);

  const recommendedView = useMemo<FreelancerView>(() => {
    if (freelancerStage === "connect") return "home";
    if (!myProfile && freelancerStage === "ready") return "profile";
    if (freelancerStage === "review" || freelancerStage === "submit" || freelancerStage === "wait") return "deal";
    return "home";
  }, [freelancerStage, myProfile]);

  useEffect(() => {
    if (hasManualViewSelection) {
      return;
    }
    setActiveView(recommendedView);
  }, [hasManualViewSelection, recommendedView]);

  async function approveContract(contractId: string) {
    const next = await updateProductContractStatus(contractId, "approved", account);
    if (!next) return;
    await syncWorkflowState(account);
    if (connectedAddress) setContracts(getContractsForFreelancer(connectedAddress));
    if (connectedAddress) setNotifications(getNotificationsForWallet(connectedAddress));
  }

  async function rejectContract(contractId: string) {
    const next = await updateProductContractStatus(contractId, "rejected", account);
    if (!next) return;
    await syncWorkflowState(account);
    if (connectedAddress) setContracts(getContractsForFreelancer(connectedAddress));
    if (connectedAddress) setNotifications(getNotificationsForWallet(connectedAddress));
  }

  async function createAgent() {
    if (!account) {
      const message = "Connect your wallet first.";
      setProfileRawError(message);
      setProfileStatus(message);
      return;
    }
    if (!name || !skill || !hourlyRate) {
      const message = "Fill name, skill, and hourly rate.";
      setProfileRawError(message);
      setProfileStatus(message);
      return;
    }

    if (resolvedChainId !== agentGuildChainId) {
      const message = `Wrong network detected. Connected chain is ${resolvedChainId ?? "unknown"}. Switch to ${agentGuildChainLabel} (${agentGuildChainId}).`;
      setProfileRawError(message);
      setProfileStatus(message);
      return;
    }

    const normalizedHourlyRate = hourlyRate.trim();
    if (!/^\d+$/.test(normalizedHourlyRate)) {
      const message = "Hourly rate must be a whole USD amount, like 25.";
      setProfileRawError(message);
      setProfileStatus(message);
      return;
    }
    const latest = await refetch();
    const latestAgents = (latest.data as Agent[] | undefined) || allAgents;
    const walletExists = latestAgents.some((agent) => normalizeWallet(agent.owner) === connectedAddress);
    if (walletExists) {
      const message = "This wallet already has a freelancer profile in this beta.";
      setProfileRawError(message);
      setProfileStatus(message);
      return;
    }

    const profileArgs = [
      name.trim(),
      (description || "Freelancer profile").trim(),
      skill.trim(),
      BigInt(normalizedHourlyRate),
      (location || "Not specified").trim(),
      (availability || "Open").trim(),
    ] as const;

    console.log("Agent Guild create profile write", {
      wallet: connectedAddress,
      chainId: resolvedChainId,
      hookChainId: activeChainId,
      providerChainId,
      contractAddress: AGENT_REGISTRY_ADDRESS,
      functionName: AGENT_REGISTRY_REGISTER_AGENT_SIGNATURE,
      args: profileArgs,
    });

    try {
      setCreating(true);
      setProfileTxHash(null);
      setProfileRawError(null);
      setProfileStatus("Saving your freelancer profile...");
      const transaction = prepareContractCall({
        contract,
        method: "registerAgent",
        params: profileArgs,
      });

      const transactionResult = await sendTransaction({ transaction, account });
      const transactionHash = transactionResult.transactionHash;
      setProfileTxHash(transactionHash);

      console.log("Agent Guild create profile tx submitted", {
        wallet: connectedAddress,
        chainId: resolvedChainId,
        hookChainId: activeChainId,
        providerChainId,
        contractAddress: AGENT_REGISTRY_ADDRESS,
        functionName: AGENT_REGISTRY_REGISTER_AGENT_SIGNATURE,
        transactionHash,
      });

      setProfileStatus("Waiting for profile confirmation...");

      await waitForReceipt({
        client: thirdwebClient,
        chain: agentGuildChain,
        transactionHash,
      });

      setProfileStatus("Freelancer profile created successfully.");
      setName("");
      setDescription("");
      setSkill("");
      setHourlyRate("");
      setLocation("");
      setAvailability("");
      await refetch();
    } catch (error: unknown) {
      const rawMessage = extractRawErrorMessage(error);
      console.error("Agent Guild create profile failed", {
        wallet: connectedAddress,
        chainId: resolvedChainId,
        hookChainId: activeChainId,
        providerChainId,
        contractAddress: AGENT_REGISTRY_ADDRESS,
        functionName: AGENT_REGISTRY_REGISTER_AGENT_SIGNATURE,
        rawError: rawMessage,
        error,
      });
      setProfileRawError(rawMessage);
      setProfileStatus(rawMessage);
    } finally {
      setCreating(false);
    }
  }

  const stageCopy = useMemo(() => {
    switch (freelancerStage) {
      case "connect":
        return {
          eyebrow: "Connect",
          title: "Connect your MiniPay wallet",
          body: "Use the freelancer wallet that should review deals, submit work, and track payout.",
          actionLabel: "Connect Wallet",
          onAction: () => setWalletSheetOpen(true),
        };
      case "review":
        return {
          eyebrow: "Step 1",
          title: "Review the contract",
          body: "Read the deal and decide if you want to approve it for the next payment step.",
          actionLabel: "Open Deal",
          onAction: () => openFreelancerView("deal"),
        };
      case "wait":
        return {
          eyebrow: "Step 3",
          title: "Waiting for funding",
          body: "You approved the deal. The client now needs to secure payment before work starts.",
          actionLabel: "View Deal",
          onAction: () => openFreelancerView("deal"),
        };
      case "submit":
        return {
          eyebrow: "Step 4",
          title: "Submit work",
          body: "Payment is secured. Share the delivery link and track when funds are released.",
          actionLabel: "Open Deal",
          onAction: () => openFreelancerView("deal"),
        };
      case "ready":
        return {
          eyebrow: "Ready",
          title: "Stay ready for the next deal",
          body: "Keep your profile clean and your wallet connected so you can move quickly when a client sends work.",
          actionLabel: "Open Profile",
          onAction: () => openFreelancerView("profile"),
        };
    }
  }, [freelancerStage]);

  const timelineEvents = useMemo(() => {
    const events: Array<{ id: string; speaker: string; message: string; tone?: "neutral" | "accent" | "success" }> = [];

    if (myProfile) {
      events.push({
        id: "profile",
        speaker: "You",
        message: `${myProfile.name} is visible in the beta directory for new deals.`,
      });
    }

    if (pendingContracts[0]) {
      events.push({
        id: `pending-${pendingContracts[0].id}`,
        speaker: "Client",
        message: `${pendingContracts[0].clientName} sent you a contract to review.`,
        tone: "accent",
      });
    }

    if (unusedApprovedContracts[0]) {
      events.push({
        id: `approved-${unusedApprovedContracts[0].id}`,
        speaker: "You",
        message: `You approved the deal with ${unusedApprovedContracts[0].clientName}. Payment is still waiting to be secured.`,
      });
    }

    if (linkedContracts[0]?.linkedProjectId) {
      events.push({
        id: `linked-${linkedContracts[0].id}`,
        speaker: "Escrow",
        message: `Payment secured for Project #${linkedContracts[0].linkedProjectId}. Submit work and track payout from here.`,
        tone: "success",
      });
    }

    return events.slice(0, 4);
  }, [linkedContracts, myProfile, pendingContracts, unusedApprovedContracts]);

  const navItems: WorkspaceNavItem[] = [
    { id: "home", label: "Home" },
    { id: "deal", label: "Deal" },
    { id: "profile", label: "Profile" },
  ];

  return (
    <>
      <WorkspaceShell
        workspaceLabel="Freelancer"
        title="Review, deliver, get paid"
        description="Approve the deal, submit work, and track payout in one guided MiniPay flow."
        navItems={navItems}
        activeItem={activeView}
        onItemChange={(id) => openFreelancerView(id as FreelancerView)}
        headerActions={
          <>
            <Link
              href="/client"
              className="inline-flex min-h-[52px] items-center justify-center rounded-[16px] border border-[#252525] bg-[#0d0d0d] px-4 py-3 text-sm font-semibold text-[#f7f4ef] transition hover:border-[#393939]"
            >
              Client
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
                <WorkspacePanel title="Deal updates" subtitle="Stay inside the payment conversation.">
                  <DealEventList events={timelineEvents} />
                </WorkspacePanel>

                <WorkspacePanel title="Current status" subtitle="One main action per state keeps the flow clean.">
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
                  <WorkspacePanel title="Connect wallet" subtitle="Use the freelancer wallet assigned to the deal.">
                    <button
                      type="button"
                      onClick={() => setWalletSheetOpen(true)}
                      className="min-h-[56px] w-full rounded-[18px] bg-[#d72638] px-5 py-4 text-base font-semibold text-white transition hover:bg-[#b91f30]"
                    >
                      Connect Wallet
                    </button>
                  </WorkspacePanel>
                ) : null}

                {connectedAddress && pendingContracts.length > 0 ? (
                  <WorkspacePanel title="Review contract" subtitle="Approve the deal when the work and payment terms look right.">
                    <ContractCardList
                      contracts={pendingContracts}
                      variant="freelancer"
                      emptyState="No pending deals are assigned to this wallet."
                      nextActionLabel={() => "Approve or reject"}
                      footer={(contractEntry) => (
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => approveContract(contractEntry.id)}
                            className="min-h-[44px] rounded-[14px] bg-[#d72638] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#b91f30]"
                          >
                            Approve Deal
                          </button>
                          <button
                            type="button"
                            onClick={() => rejectContract(contractEntry.id)}
                            className="min-h-[44px] rounded-[14px] border border-[#2c2c2c] px-4 py-2 text-sm font-semibold text-[#f7f4ef] transition hover:border-[#3a3a3a]"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    />
                  </WorkspacePanel>
                ) : null}

                {connectedAddress && pendingContracts.length === 0 && (linkedContracts.length > 0 || unusedApprovedContracts.length > 0) ? (
                  <>
                    {currentTask ? (
                      <WorkspacePanel title="Current deal" subtitle="Keep the active payment flow visible while you work.">
                        <ContractCardList
                          contracts={[currentTask]}
                          variant="freelancer"
                          nextActionLabel={(contractEntry) =>
                            contractEntry.linkedProjectId
                              ? `Project #${contractEntry.linkedProjectId}`
                              : "Waiting for funding"
                          }
                        />
                      </WorkspacePanel>
                    ) : null}

                    <div id="freelancer-deal-workspace">
                      <EscrowSimulator selectedRole="freelancer" />
                    </div>
                  </>
                ) : null}

                {connectedAddress &&
                pendingContracts.length === 0 &&
                linkedContracts.length === 0 &&
                unusedApprovedContracts.length === 0 ? (
                  <WorkspacePanel title="No active deal" subtitle="The next client contract will appear here.">
                    <EmptyState copy="No deal is assigned to this wallet yet." />
                  </WorkspacePanel>
                ) : null}
              </>
            ) : null}

            {activeView === "profile" ? (
              <>
                {!connectedAddress ? (
                  <WorkspacePanel title="Connect wallet" subtitle="Use the wallet you want clients and payouts tied to.">
                    <button
                      type="button"
                      onClick={() => setWalletSheetOpen(true)}
                      className="min-h-[56px] w-full rounded-[18px] bg-[#d72638] px-5 py-4 text-base font-semibold text-white transition hover:bg-[#b91f30]"
                    >
                      Connect Wallet
                    </button>
                  </WorkspacePanel>
                ) : myProfile ? (
                  <>
                    <WorkspacePanel title="Freelancer profile" subtitle="This is the identity clients see first.">
                      <div className="grid gap-3">
                        <DetailCard label="Name" value={myProfile.name} />
                        <DetailCard label="Skill" value={myProfile.skill} />
                        <DetailCard label="Rate" value={`$${myProfile.hourlyRate.toString()}/hr`} />
                        <DetailCard label="Availability" value={myProfile.availability} />
                      </div>
                    </WorkspacePanel>

                    <WorkspacePanel title="Payout snapshot" subtitle="Keep payout progress and updates close.">
                      <div className="grid gap-3">
                        <DetailCard label="Total earned" value={`${reputation?.totalEarned ?? 0} CELO`} />
                        <DetailCard label="Completed deals" value={`${reputation?.completedContracts ?? 0}`} />
                      </div>
                    </WorkspacePanel>

                    <WorkspacePanel title="Updates" subtitle="Wallet-scoped reminders and deal changes.">
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
                  </>
                ) : (
                  <WorkspacePanel title="Create freelancer profile" subtitle="Publish one beta profile for clients to discover.">
                    <div className="grid gap-3">
                      <div className="rounded-[18px] border border-[#1d1d1d] bg-[#090909] px-4 py-4 text-sm leading-7 text-[#d4d4d8]">
                        Any wallet can publish one freelancer profile during beta. Admin moderation tools still control directory oversight.
                      </div>
                      <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Name"
                        className="min-h-[52px] w-full rounded-[16px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                      />
                      <input
                        value={skill}
                        onChange={(event) => setSkill(event.target.value)}
                        placeholder="Primary skill"
                        className="min-h-[52px] w-full rounded-[16px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                      />
                      <input
                        value={hourlyRate}
                        onChange={(event) => setHourlyRate(event.target.value)}
                        placeholder="Hourly rate in USD"
                        className="min-h-[52px] w-full rounded-[16px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                      />
                      <textarea
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        rows={4}
                        placeholder="Short bio"
                        className="w-full rounded-[16px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm leading-7 text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                      />
                      <input
                        value={location}
                        onChange={(event) => setLocation(event.target.value)}
                        placeholder="Location"
                        className="min-h-[52px] w-full rounded-[16px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                      />
                      <input
                        value={availability}
                        onChange={(event) => setAvailability(event.target.value)}
                        placeholder="Availability"
                        className="min-h-[52px] w-full rounded-[16px] border border-[#242424] bg-[#090909] px-4 py-4 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                      />
                      <button
                        type="button"
                        onClick={createAgent}
                        disabled={creating}
                        className="min-h-[56px] w-full rounded-[18px] bg-[#d72638] px-5 py-4 text-base font-semibold text-white transition hover:bg-[#b91f30] disabled:opacity-60"
                      >
                        {creating ? "Saving..." : "Create Profile"}
                      </button>
                      {profileStatus ? <InlineNotice message={profileStatus} /> : null}
                    </div>
                  </WorkspacePanel>
                )}

                <WorkspacePanel title="Create profile debug" subtitle="Temporary contract write diagnostics for beta.">
                  <div className="grid gap-3">
                    <DetailCard label="Chain" value={activeChainId ? `${activeChainId}` : "Not connected"} />
                    <DetailCard label="Provider chain" value={providerChainId ? `${providerChainId}` : "Not detected"} />
                    <DetailCard label="isMiniPay" value={walletSession.isMiniPay ? "true" : "false"} />
                    <DetailCard label="wallet source" value={walletSession.walletSource || "Not connected"} />
                    <DetailCard label="wallet connected" value={walletSession.walletConnected ? "true" : "false"} />
                    <DetailCard label="Wallet" value={connectedAddress || "Not connected"} />
                    <DetailCard label="provider detected" value={walletSession.providerDetected ? "true" : "false"} />
                    <DetailCard label="provider source" value={walletSession.providerSource || "Not detected"} />
                    <DetailCard
                      label="raw provider chainId"
                      value={
                        walletSession.rawProviderChainId !== null
                          ? `${walletSession.rawProviderChainId}`
                          : "Not detected"
                      }
                    />
                    <DetailCard
                      label="normalized chainId"
                      value={walletSession.normalizedChainId ? `${walletSession.normalizedChainId}` : "Not detected"}
                    />
                    <DetailCard label="Registry address" value={AGENT_REGISTRY_ADDRESS} />
                    <DetailCard label="Function" value={AGENT_REGISTRY_REGISTER_AGENT_SIGNATURE} />
                    <DetailCard label="Tx hash" value={profileTxHash || "No profile tx submitted yet"} />
                    <DetailCard label="session active" value={walletSession.sessionActive ? "true" : "false"} />
                    <DetailCard label="Raw error" value={profileRawError || walletSession.rawWalletError || "No error captured"} />
                  </div>
                </WorkspacePanel>

                {rejectedContracts.length > 0 ? (
                  <WorkspacePanel title="Closed deals" subtitle="Rejected deals stay here for reference.">
                    <ContractCardList
                      contracts={rejectedContracts}
                      variant="freelancer"
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
