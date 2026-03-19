"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ConnectButton, useActiveAccount, useReadContract } from "thirdweb/react";
import { defineChain, getContract, prepareContractCall, sendTransaction } from "thirdweb";
import EscrowSimulator from "@/components/EscrowSimulator";
import { client } from "@/lib/client";
import { AGENT_REGISTRY_ABI, AGENT_REGISTRY_ADDRESS } from "@/lib/contract";
import { getReputationForWallet } from "@/lib/reputationStore";
import {
  appendNotification,
  getContractsForFreelancer,
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

const NOTIFICATION_STORAGE_KEY = "agent-guild-notifications";

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

export default function FreelancerWorkspacePage() {
  const account = useActiveAccount();
  const address = account?.address;

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

  const contract = useMemo(() => {
    return getContract({
      client,
      chain: celoSepolia,
      address: AGENT_REGISTRY_ADDRESS,
      abi: AGENT_REGISTRY_ABI,
    });
  }, []);

  const { data, refetch } = useReadContract({
    contract,
    method: "getAgents",
    params: [],
  });

  useEffect(() => {
    const syncWorkflow = () => {
      const savedNotifications = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
      if (savedNotifications) {
        try {
          setNotifications(JSON.parse(savedNotifications));
        } catch (error) {
          console.error("Failed to restore notifications", error);
        }
      }

      setContracts(getContractsForFreelancer(address));
    };

    syncWorkflow();
    window.addEventListener("storage", syncWorkflow);
    window.addEventListener(getWorkflowRefreshEventName(), syncWorkflow);

    return () => {
      window.removeEventListener("storage", syncWorkflow);
      window.removeEventListener(getWorkflowRefreshEventName(), syncWorkflow);
    };
  }, [address]);

  const allAgents = (data as Agent[] | undefined) || [];
  const uniqueAgents = allAgents.filter((agent, index, arr) => {
    const owner = agent.owner.toLowerCase();
    return index === arr.findIndex((item) => item.owner.toLowerCase() === owner);
  });

  const myProfile =
    uniqueAgents.find((agent) => agent.owner.toLowerCase() === address?.toLowerCase()) || null;
  const reputation = myProfile ? getReputationForWallet(myProfile.owner) : null;
  const pendingContracts = contracts.filter((contract) => contract.status === "sent");
  const approvedContracts = contracts.filter((contract) => contract.status === "approved");
  const rejectedContracts = contracts.filter((contract) => contract.status === "rejected");

  function approveContract(contractId: string) {
    const next = updateProductContractStatus(contractId, "approved");
    if (!next) return;
    appendNotification(`Contract approved by ${next.freelancerName}. Client can now create escrow.`);
    setContracts(getContractsForFreelancer(address));
  }

  function rejectContract(contractId: string) {
    const next = updateProductContractStatus(contractId, "rejected");
    if (!next) return;
    appendNotification(`Contract rejected by ${next.freelancerName}.`);
    setContracts(getContractsForFreelancer(address));
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

    const walletExists = latestAgents.some(
      (agent) => agent.owner.toLowerCase() === address?.toLowerCase()
    );

    if (walletExists) {
      setProfileStatus(
        "This wallet already has a profile. One wallet can only create one freelancer profile in this demo."
      );
      return;
    }

    const nameExists = latestAgents.some(
      (agent) => agent.name.toLowerCase().trim() === name.toLowerCase().trim()
    );

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

      await sendTransaction({
        transaction,
        account,
      });

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
      setProfileStatus(
        "Profile creation failed. Wallet may already have a profile or username may already be taken."
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#070707] text-[#f7f4ef]">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
        <header className="border-b border-[#151515] py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[14px] font-semibold tracking-[0.18em]">AGENT GUILD</div>
              <div className="mt-2 text-[12px] uppercase tracking-[0.16em] text-[#f2b6be]">Freelancer workspace</div>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="rounded-[10px] border border-[#262626] px-4 py-2 text-sm font-medium text-[#f7f4ef] transition hover:border-[#3b3b3b]"
              >
                Back to Home
              </Link>
              <Link
                href="/client"
                className="rounded-[10px] border border-[#262626] px-4 py-2 text-sm font-medium text-[#f7f4ef] transition hover:border-[#3b3b3b]"
              >
                Client Workspace
              </Link>
              <ConnectButton client={client} chain={celoSepolia} />
            </div>
          </div>
        </header>

        <section className="py-12 sm:py-16">
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[22px] border border-[#1d1d1d] bg-[radial-gradient(circle_at_top,rgba(215,38,56,0.16),transparent_38%),linear-gradient(180deg,#111111_0%,#0a0a0a_100%)] p-6 sm:p-8">
              <div className="text-[12px] uppercase tracking-[0.16em] text-[#f2b6be]">Freelancer operations</div>
              <h1 className="mt-3 text-[34px] font-semibold tracking-[-0.04em] sm:text-[46px]">
                Build a visible identity, track funded work, and compound trust.
              </h1>
              <p className="mt-4 max-w-[620px] text-[16px] leading-8 text-[#a1a1aa]">
                The freelancer workspace keeps profile, notifications, active work, and payment visibility in one place.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-4">
                <SummaryCard label="Pending Contracts" value={`${pendingContracts.length}`} />
                <SummaryCard label="Approved Contracts" value={`${approvedContracts.length}`} />
                <SummaryCard label="Earned" value={reputation ? `$${reputation.totalEarned}` : "$0"} />
                <SummaryCard label="Guild Score" value={reputation ? `${reputation.guildScore}/100` : "0/100"} />
              </div>
            </div>

            <div className="rounded-[22px] border border-[#1d1d1d] bg-[#0d0d0d] p-6 sm:p-8">
              {!myProfile ? (
                <>
                  <div className="text-[12px] uppercase tracking-[0.16em] text-[#f2b6be]">Profile onboarding</div>
                  <h2 className="mt-3 text-[26px] font-semibold tracking-[-0.03em]">Create your freelancer profile</h2>
                  <p className="mt-3 text-[15px] leading-7 text-[#a1a1aa]">
                    This uses the existing onchain profile registration flow. We are only moving it into a dedicated workspace.
                  </p>

                  <div className="mt-6 grid gap-3">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Name *"
                      className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                    />
                    <input
                      value={skill}
                      onChange={(e) => setSkill(e.target.value)}
                      placeholder="Primary skill *"
                      className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                    />
                    <input
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(e.target.value)}
                      placeholder="Hourly rate in USD *"
                      className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                    />
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      placeholder="Short bio (optional)"
                      className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                    />
                    <input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Location (optional)"
                      className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                    />
                    <input
                      value={availability}
                      onChange={(e) => setAvailability(e.target.value)}
                      placeholder="Availability (optional)"
                      className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                    />

                    <div className="flex flex-col gap-3 pt-1 sm:flex-row">
                      <button
                        onClick={createAgent}
                        disabled={creating}
                        className="rounded-[12px] bg-[#d72638] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b91f30] disabled:opacity-60"
                      >
                        {creating ? "Creating..." : "Create Profile"}
                      </button>
                      <button
                        onClick={() => refetch()}
                        className="rounded-[12px] border border-[#262626] px-5 py-3 text-sm font-semibold text-[#f7f4ef] transition hover:border-[#3b3b3b]"
                      >
                        Refresh
                      </button>
                    </div>

                    {profileStatus && (
                      <div className="rounded-[12px] border border-[#1f1f1f] bg-[#090909] px-4 py-3 text-sm text-[#d4d4d8]">
                        {profileStatus}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="grid gap-6">
                  <div>
                    <div className="text-[12px] uppercase tracking-[0.16em] text-[#f2b6be]">Profile summary</div>
                    <h2 className="mt-3 text-[26px] font-semibold tracking-[-0.03em]">{myProfile.name}</h2>
                    <p className="mt-3 text-[15px] leading-7 text-[#a1a1aa]">{myProfile.description}</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailCard label="Primary skill" value={myProfile.skill} />
                    <DetailCard label="Rate" value={`$${myProfile.hourlyRate.toString()}/hr`} />
                    <DetailCard label="Location" value={myProfile.location} />
                    <DetailCard label="Availability" value={myProfile.availability} />
                  </div>

                  <div className="rounded-[16px] border border-[#1d1d1d] bg-[#090909] p-4">
                    <div className="text-[12px] uppercase tracking-[0.14em] text-[#71717a]">Notifications</div>
                    <div className="mt-3 grid gap-2">
                      {notifications.length === 0 ? (
                        <div className="text-sm text-[#a1a1aa]">No notifications yet. Project activity will appear here.</div>
                      ) : (
                        notifications.slice(0, 3).map((note, index) => (
                          <div key={index} className="rounded-[12px] border border-[#1d1d1d] bg-[#0d0d0d] px-3 py-3 text-sm text-[#d4d4d8]">
                            {note}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {myProfile && reputation && (
          <>
            <section className="border-t border-[#151515] py-12 sm:py-16">
              <div className="mb-8 max-w-[760px]">
                <div className="text-[12px] uppercase tracking-[0.16em] text-[#f2b6be]">Contract inbox</div>
                <h2 className="mt-3 text-[28px] font-semibold tracking-[-0.03em]">
                  Review proposed work before it enters escrow.
                </h2>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <ContractColumn
                  title="Pending Contracts"
                  emptyState="No contracts are waiting for your decision."
                  contracts={pendingContracts}
                  primaryActionLabel="Approve"
                  onPrimaryAction={approveContract}
                  secondaryActionLabel="Reject"
                  onSecondaryAction={rejectContract}
                />
                <ContractColumn
                  title="Approved Contracts"
                  emptyState="No approved contracts yet."
                  contracts={approvedContracts}
                />
                <ContractColumn
                  title="Rejected Contracts"
                  emptyState="No rejected contracts yet."
                  contracts={rejectedContracts}
                />
              </div>
            </section>

            <section className="border-t border-[#151515] py-12 sm:py-16">
              <div className="mb-8 max-w-[760px]">
                <div className="text-[12px] uppercase tracking-[0.16em] text-[#f2b6be]">Reputation and earnings</div>
                <h2 className="mt-3 text-[28px] font-semibold tracking-[-0.03em]">
                  Your economic credibility is part of the product experience.
                </h2>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Guild Score" value={`${reputation.guildScore}/100`} />
                <SummaryCard label="Completed Contracts" value={`${reputation.completedContracts}`} />
                <SummaryCard label="Total Earned" value={`$${reputation.totalEarned}`} />
                <SummaryCard
                  label="Credit Status"
                  value={reputation.creditUnlocked ? `$${reputation.creditAmount} unlocked` : "Locked"}
                />
              </div>
            </section>

            <section className="border-t border-[#151515] py-12 sm:py-16">
              <div className="mb-8 max-w-[760px]">
                <div className="text-[12px] uppercase tracking-[0.16em] text-[#f2b6be]">Project execution</div>
                <h2 className="mt-3 text-[28px] font-semibold tracking-[-0.03em]">
                  Review assigned work, submit funded projects, and track payout.
                </h2>
                <p className="mt-4 text-[15px] leading-7 text-[#a1a1aa]">
                  The underlying blockchain flow is unchanged in this slice. We are only moving it into the correct workspace.
                </p>
              </div>

              <EscrowSimulator selectedRole="freelancer" />
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[#1d1d1d] bg-[#0d0d0d] p-4">
      <div className="text-[26px] font-semibold tracking-[-0.03em] text-[#f7f4ef]">{value}</div>
      <div className="mt-2 text-[11px] uppercase tracking-[0.14em] text-[#71717a]">{label}</div>
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[#1d1d1d] bg-[#090909] p-4">
      <div className="text-[12px] uppercase tracking-[0.14em] text-[#71717a]">{label}</div>
      <div className="mt-2 text-[14px] leading-7 text-[#d4d4d8]">{value}</div>
    </div>
  );
}

function ContractColumn({
  title,
  emptyState,
  contracts,
  primaryActionLabel,
  secondaryActionLabel,
  onPrimaryAction,
  onSecondaryAction,
}: {
  title: string;
  emptyState: string;
  contracts: ProductContract[];
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  onPrimaryAction?: (id: string) => void;
  onSecondaryAction?: (id: string) => void;
}) {
  return (
    <div className="rounded-[18px] border border-[#1d1d1d] bg-[#0d0d0d] p-5">
      <div className="text-[12px] uppercase tracking-[0.14em] text-[#71717a]">{title}</div>
      {contracts.length === 0 ? (
        <div className="mt-4 text-sm text-[#a1a1aa]">{emptyState}</div>
      ) : (
        <div className="mt-4 grid gap-3">
          {contracts.map((contract) => (
            <div key={contract.id} className="rounded-[14px] border border-[#1d1d1d] bg-[#090909] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-[#f7f4ef]">{contract.clientName}</div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-[#a1a1aa]">{contract.status}</div>
              </div>
              <div className="mt-2 text-sm text-[#d4d4d8]">{contract.summary}</div>
              <div className="mt-3 text-xs text-[#71717a]">
                ${contract.budget} • {contract.clientWallet.slice(0, 6)}...{contract.clientWallet.slice(-4)}
              </div>
              {primaryActionLabel && onPrimaryAction && (
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => onPrimaryAction(contract.id)}
                    className="rounded-[10px] bg-[#d72638] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#b91f30]"
                  >
                    {primaryActionLabel}
                  </button>
                  {secondaryActionLabel && onSecondaryAction && (
                    <button
                      onClick={() => onSecondaryAction(contract.id)}
                      className="rounded-[10px] border border-[#262626] px-4 py-2 text-xs font-semibold text-[#f7f4ef] transition hover:border-[#3b3b3b]"
                    >
                      {secondaryActionLabel}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
