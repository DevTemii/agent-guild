"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ConnectButton,
  useActiveAccount,
  useReadContract,
} from "thirdweb/react";
import {
  defineChain,
  getContract,
  prepareContractCall,
  sendTransaction,
} from "thirdweb";
import { client } from "@/lib/client";
import {
  AGENT_REGISTRY_ABI,
  AGENT_REGISTRY_ADDRESS,
} from "@/lib/contract";
import { getReputation } from "@/lib/reputation";
import { clearAllReputation } from "@/lib/reputationStore";
import EscrowSimulator from "@/components/EscrowSimulator";

const chain = defineChain(44787); // Celo Alfajores testnet

type Agent = {
  owner: string;
  name: string;
  description: string;
  skill: string;
  hourlyRate: bigint;
  location: string;
  availability: string;
};

type GeneratedContract = {
  clientName: string;
  projectDescription: string;
  budget: number;
  summary: string;
  milestones: {
    title: string;
    amount: number;
  }[];
};

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

export default function Home() {
  const account = useActiveAccount();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [skill, setSkill] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [location, setLocation] = useState("");
  const [availability, setAvailability] = useState("");

  const [clientName, setClientName] = useState("");
  const [projectBrief, setProjectBrief] = useState("");
  const [budget, setBudget] = useState("");
  const [generatedContract, setGeneratedContract] =
    useState<GeneratedContract | null>(null);

  const [creating, setCreating] = useState(false);
  const [generatingContract, setGeneratingContract] = useState(false);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const contract = useMemo(() => {
    return getContract({
      client,
      chain: celoSepolia,
      address: AGENT_REGISTRY_ADDRESS,
      abi: AGENT_REGISTRY_ABI as any,
    });
  }, []);

  const { data, isLoading, refetch } = useReadContract({
    contract,
    method:
      "function getAgents() view returns ((address owner,string name,string description,string skill,uint256 hourlyRate,string location,string availability)[])",
    params: [],
  });

  useEffect(() => {
    const onFocus = () => setRefreshKey((v) => v + 1);
    const onStorage = () => setRefreshKey((v) => v + 1);

    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const allAgents = (data as Agent[] | undefined) || [];

  const agents = allAgents.filter((agent) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;

    return (
      agent.name.toLowerCase().includes(q) ||
      agent.skill.toLowerCase().includes(q) ||
      agent.location.toLowerCase().includes(q)
    );
  });

  const totalContracts = allAgents.reduce((sum, agent) => {
    const rep = getReputation(agent.name);
    return sum + rep.completedContracts;
  }, 0);

  const totalVolume = allAgents.reduce((sum, agent) => {
    const rep = getReputation(agent.name);
    return sum + rep.totalEarned;
  }, 0);

  const verifiedFreelancers = allAgents.length;

  async function handleGenerateContract() {
    if (!clientName || !projectBrief || !budget) {
      setStatus(
        "Fill client name, project brief, and budget to generate contract."
      );
      return;
    }

    try {
      setGeneratingContract(true);
      setStatus("Generating AI contract...");

      const res = await fetch("/api/generate-contract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientName,
          projectDescription: projectBrief,
          budget: Number(budget),
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result?.error || "Failed to generate contract.");
      }

      setGeneratedContract(result);
      setStatus("AI contract generated successfully.");
    } catch (error) {
      console.error(error);
      setStatus("AI contract generation failed.");
    } finally {
      setGeneratingContract(false);
    }
  }

  async function createAgent() {
    if (!account) {
      setStatus("Connect your wallet first.");
      return;
    }

    if (!name || !skill || !hourlyRate) {
      setStatus("Fill name, skill, and hourly rate.");
      return;
    }

    const nameExists = allAgents.some(
      (agent) => agent.name.toLowerCase().trim() === name.toLowerCase().trim()
    );

    if (nameExists) {
      setStatus("Username already exists. Choose another name.");
      return;
    }

    try {
      setCreating(true);
      setStatus("Waiting for wallet confirmation...");

      const transaction = prepareContractCall({
        contract,
        method:
          "function registerAgent(string _name, string _description, string _skill, uint256 _hourlyRate, string _location, string _availability)",
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

      setStatus("Agent profile created successfully.");
      setName("");
      setDescription("");
      setSkill("");
      setHourlyRate("");
      setLocation("");
      setAvailability("");

      await refetch();
      setRefreshKey((v) => v + 1);
    } catch (error) {
      console.error(error);
      setStatus(
        "Profile creation failed. Wallet may already have a profile or username may already be taken."
      );
    } finally {
      setCreating(false);
    }
  }

  function handleResetDemo() {
    clearAllReputation();
    window.location.reload();
  }

  return (
    <main className="min-h-screen bg-[#0b0b0b] text-[#f8fafc]">
      <div className="mx-auto max-w-[1100px] px-4 sm:px-6">
        <header className="border-b border-[#1a1a1a]">
          <div className="mx-auto flex max-w-[1100px] items-center justify-between px-4 py-4 sm:px-6">
            <div className="text-[14px] font-semibold tracking-[0.02em]">
              Agent Guild
            </div>

            <ConnectButton client={client} chain={celoSepolia} />
          </div>
        </header>

        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-[820px] text-center">
            <div className="inline-flex rounded-full border border-[#1f1f1f] bg-[#111111] px-3 py-1 text-[12px] font-medium text-[#9ca3af]">
              Infrastructure for freelancer identity, escrow, and reputation
            </div>

            <h1 className="mt-6 text-[40px] font-bold leading-[1.02] tracking-[-0.02em] text-[#f8fafc] sm:text-[52px] lg:text-[64px]">
              The Onchain Workforce Protocol
            </h1>

            <p className="mx-auto mt-6 max-w-[680px] text-[15px] leading-7 text-[#9ca3af] sm:text-[16px]">
              Freelancers create verifiable identities, generate contracts with
              AI, simulate escrow payments, build onchain reputation, and unlock
              credit over time.
            </p>

            <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href="#create"
                className="rounded-[10px] bg-[#38bdf8] px-5 py-3 text-sm font-semibold text-black transition hover:bg-[#0ea5e9]"
              >
                Create Profile
              </a>

              <a
                href="#registry"
                className="rounded-[10px] border border-[#2c2c2c] px-5 py-3 text-sm font-semibold text-[#f8fafc] transition hover:border-[#3a3a3a]"
              >
                Explore Registry
              </a>

              <button
                onClick={handleResetDemo}
                className="rounded-[10px] border border-[#2c2c2c] px-5 py-3 text-sm font-semibold text-[#f8fafc] transition hover:border-[#3a3a3a]"
              >
                Reset Demo
              </button>
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <span className="rounded-full border border-[#1f1f1f] bg-[#111111] px-3 py-1 text-[12px] text-[#9ca3af]">
                AgentScan Ready
              </span>
              <span className="rounded-full border border-[#1f1f1f] bg-[#111111] px-3 py-1 text-[12px] text-[#9ca3af]">
                Thirdweb Powered
              </span>
              <span className="rounded-full border border-[#1f1f1f] bg-[#111111] px-3 py-1 text-[12px] text-[#9ca3af]">
                ERC-8004 Compatible
              </span>
              <span className="rounded-full border border-[#1f1f1f] bg-[#111111] px-3 py-1 text-[12px] text-[#9ca3af]">
                Self Verification Ready
              </span>
            </div>
          </div>
        </section>

        <section className="border-y border-[#1a1a1a] py-10">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            <Stat label="Agents Created" value={`${allAgents.length}`} />
            <Stat label="Contracts Completed" value={`${totalContracts}`} />
            <Stat label="Total Volume" value={`$${totalVolume}`} />
            <Stat label="Verified Freelancers" value={`${verifiedFreelancers}`} />
          </div>
        </section>

        <section className="py-16 sm:py-24">
          <div className="mb-8">
            <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#38bdf8]">
              How it works
            </div>
            <h2 className="mt-3 text-[26px] font-semibold tracking-[-0.02em] text-[#f8fafc] sm:text-[30px]">
              From identity to economic actor
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StepCard
              number="01"
              title="Create identity"
              body="Create a verifiable freelancer profile linked to your wallet."
            />
            <StepCard
              number="02"
              title="Generate contract"
              body="Turn a client brief into a structured milestone-based agreement."
            />
            <StepCard
              number="03"
              title="Lock escrow"
              body="Simulate payment protection through milestone release flow."
            />
            <StepCard
              number="04"
              title="Build reputation"
              body="Completed work updates score, earnings, and credit eligibility."
            />
          </div>
        </section>

        <section className="border-t border-[#1a1a1a] py-16 sm:py-24">
          <div className="rounded-[16px] border border-[#1f1f1f] bg-[#111111] p-6 text-center sm:p-10">
            <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#38bdf8]">
              Trust equation
            </div>

            <h2 className="mt-4 text-[26px] font-semibold tracking-[-0.02em] sm:text-[34px]">
              Trust(agent) = Work × Reputation
            </h2>

            <p className="mx-auto mt-4 max-w-[720px] text-[15px] leading-7 text-[#9ca3af]">
              Every completed contract increases visible economic credibility.
              Reputation becomes the layer that can unlock long-term financial
              access.
            </p>
          </div>
        </section>

        <section id="create" className="py-16 sm:py-24">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[16px] border border-[#1f1f1f] bg-[#111111] p-6">
              <div className="mb-6">
                <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#38bdf8]">
                  Onboarding
                </div>
                <h2 className="mt-3 text-[26px] font-semibold tracking-[-0.02em] sm:text-[30px]">
                  Create freelancer profile
                </h2>
                <p className="mt-3 text-[15px] leading-7 text-[#9ca3af]">
                  Fast onboarding. Only name, skill, and hourly rate are required.
                </p>
              </div>

              <div className="grid gap-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name *"
                  className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#38bdf8]"
                />

                <input
                  value={skill}
                  onChange={(e) => setSkill(e.target.value)}
                  placeholder="Primary skill *"
                  className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#38bdf8]"
                />

                <input
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  placeholder="Hourly rate in USD *"
                  className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#38bdf8]"
                />

                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short bio (optional)"
                  rows={4}
                  className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#38bdf8]"
                />

                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Location (optional)"
                  className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#38bdf8]"
                />

                <input
                  value={availability}
                  onChange={(e) => setAvailability(e.target.value)}
                  placeholder="Availability (optional)"
                  className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#38bdf8]"
                />

                <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                  <button
                    onClick={createAgent}
                    disabled={creating}
                    className="rounded-[10px] bg-[#38bdf8] px-5 py-3 text-sm font-semibold text-black transition hover:bg-[#0ea5e9] disabled:opacity-60"
                  >
                    {creating ? "Creating..." : "Create Profile"}
                  </button>

                  <button
                    onClick={() => {
                      refetch();
                      setRefreshKey((v) => v + 1);
                    }}
                    className="rounded-[10px] border border-[#2c2c2c] px-5 py-3 text-sm font-semibold text-[#f8fafc] transition hover:border-[#3a3a3a]"
                  >
                    Refresh
                  </button>
                </div>

                {status && (
                  <div className="rounded-[12px] border border-[#1f1f1f] bg-[#0b0b0b] px-4 py-3 text-sm text-[#d1d5db]">
                    {status}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[16px] border border-[#1f1f1f] bg-[#111111] p-6">
              <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#38bdf8]">
                Identity layer
              </div>
              <h3 className="mt-3 text-[22px] font-semibold tracking-[-0.02em]">
                What this profile unlocks
              </h3>

              <div className="mt-6 grid gap-4">
                <InfoBlock
                  title="Onchain identity"
                  body="A wallet-linked freelancer profile that can be discovered publicly."
                />
                <InfoBlock
                  title="Contract flow"
                  body="Use your profile as the identity layer for AI-generated agreements and escrow."
                />
                <InfoBlock
                  title="Reputation growth"
                  body="Completed work updates score, earnings, and future credit eligibility."
                />
              </div>
            </div>
          </div>
        </section>

        <section id="ai" className="border-t border-[#1a1a1a] py-16 sm:py-24">
          <div className="mb-8">
            <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#38bdf8]">
              Contract intelligence
            </div>
            <h2 className="mt-3 text-[26px] font-semibold tracking-[-0.02em] sm:text-[30px]">
              AI contract generator
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[16px] border border-[#1f1f1f] bg-[#111111] p-6">
              <div className="grid gap-3">
                <input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Client name"
                  className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#38bdf8]"
                />

                <textarea
                  value={projectBrief}
                  onChange={(e) => setProjectBrief(e.target.value)}
                  placeholder="Project description"
                  rows={5}
                  className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#38bdf8]"
                />

                <input
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="Budget in USD"
                  className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#38bdf8]"
                />

                <button
                  onClick={handleGenerateContract}
                  className="mt-1 rounded-[10px] bg-[#38bdf8] px-5 py-3 text-sm font-semibold text-black transition hover:bg-[#0ea5e9]"
                >
                  {generatingContract ? "Generating..." : "Generate Contract"}
                </button>
              </div>
            </div>

            <div className="rounded-[16px] border border-[#1f1f1f] bg-[#111111] p-6">
              {!generatedContract ? (
                <p className="text-sm text-[#9ca3af]">
                  No contract generated yet.
                </p>
              ) : (
                <div className="grid gap-6">
                  <div>
                    <div className="text-[12px] uppercase tracking-[0.12em] text-[#9ca3af]">
                      Client
                    </div>
                    <div className="mt-2 text-sm">{generatedContract.clientName}</div>
                  </div>

                  <div>
                    <div className="text-[12px] uppercase tracking-[0.12em] text-[#9ca3af]">
                      Summary
                    </div>
                    <p className="mt-2 text-sm leading-7 text-[#d1d5db]">
                      {generatedContract.summary}
                    </p>
                  </div>

                  <div>
                    <div className="text-[12px] uppercase tracking-[0.12em] text-[#9ca3af]">
                      Milestones
                    </div>

                    <div className="mt-3 grid gap-3">
                      {generatedContract.milestones.map((milestone, index) => (
                        <div
                          key={index}
                          className="rounded-[12px] border border-[#1f1f1f] bg-[#0b0b0b] p-4"
                        >
                          <div className="text-sm font-semibold text-[#f8fafc]">
                            {milestone.title}
                          </div>
                          <div className="mt-1 text-sm text-[#9ca3af]">
                            ${milestone.amount}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-[12px] uppercase tracking-[0.12em] text-[#9ca3af]">
                      Total Budget
                    </div>
                    <div className="mt-2 text-sm font-semibold text-[#f8fafc]">
                      ${generatedContract.budget}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section id="escrow" className="border-t border-[#1a1a1a] py-16 sm:py-24">
          <EscrowSimulator />
        </section>

        <section id="registry" className="border-t border-[#1a1a1a] py-16 sm:py-24">
          <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#38bdf8]">
                Marketplace layer
              </div>
              <h2 className="mt-3 text-[26px] font-semibold tracking-[-0.02em] sm:text-[30px]">
                Talent registry
              </h2>
              <p className="mt-3 max-w-[620px] text-[15px] leading-7 text-[#9ca3af]">
                Search through freelancer identities, work signals, and economic
                reputation.
              </p>
            </div>

            <div className="w-full sm:max-w-[260px]">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search skill or location"
                className="w-full rounded-[12px] border border-[#2a2a2a] bg-[#0b0b0b] px-4 py-3 text-sm outline-none placeholder:text-[#6b7280] focus:border-[#38bdf8]"
              />
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-[#9ca3af]">Loading profiles...</p>
          ) : agents.length === 0 ? (
            <div className="rounded-[16px] border border-dashed border-[#2d2d2d] bg-[#111111] px-6 py-10 text-center text-sm text-[#9ca3af]">
              No profiles yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {agents.map((agent, index) => {
                const isMine =
                  account?.address?.toLowerCase() ===
                  agent.owner?.toLowerCase();

                const reputation = getReputation(agent.name);

                return (
                  <Link
                    key={`${agent.owner}-${index}-${refreshKey}`}
                    href={`/agent/${index}`}
                    className="block h-full"
                  >
                    <div className="flex h-full flex-col rounded-[16px] border border-[#1f1f1f] bg-[#111111] p-6 transition hover:-translate-y-[2px] hover:border-[#2c2c2c]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-[18px] font-semibold tracking-[-0.02em] text-[#f8fafc]">
                            {agent.name}
                          </h3>
                          <p className="mt-2 text-[14px] text-[#9ca3af]">
                            {agent.skill}
                          </p>
                        </div>

                        {isMine && (
                          <span className="rounded-full border border-[#123246] bg-[#0f1e28] px-3 py-1 text-[11px] font-medium text-[#7dd3fc]">
                            My Profile
                          </span>
                        )}
                      </div>

                      <p className="mt-4 text-[14px] leading-7 text-[#d1d5db]">
                        {agent.description}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Tag text={agent.location} />
                        <Tag text={agent.availability} />
                        <Tag text={`$${agent.hourlyRate.toString()}/hr`} />
                      </div>

                      <div className="mt-6 grid grid-cols-2 gap-3">
                        <MetricMini
                          label="Guild Score"
                          value={`${reputation.guildScore}/100`}
                        />
                        <MetricMini
                          label="Completed"
                          value={`${reputation.completedContracts}`}
                        />
                        <MetricMini
                          label="Earned"
                          value={`$${reputation.totalEarned}`}
                        />
                        <MetricMini
                          label="Credit"
                          value={
                            reputation.creditUnlocked
                              ? `$${reputation.creditAmount}`
                              : "Locked"
                          }
                        />
                      </div>

                      <div className="mt-6 border-t border-[#1a1a1a] pt-4 text-[12px] text-[#6b7280]">
                        Owner: {shortenAddress(agent.owner)}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <footer className="border-t border-[#1a1a1a] py-10 text-sm text-[#6b7280]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>Agent Guild</div>
            <div className="flex flex-wrap gap-4">
              <span>Built on Celo</span>
              <span>Powered by Thirdweb</span>
              <span>ERC-8004 compatible</span>
              <span>Self verification ready</span>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-[28px] font-semibold tracking-[-0.02em] text-[#f8fafc] sm:text-[32px]">
        {value}
      </div>
      <div className="mt-2 text-[11px] uppercase tracking-[0.14em] text-[#6b7280]">
        {label}
      </div>
    </div>
  );
}

function StepCard({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[16px] border border-[#1f1f1f] bg-[#111111] p-6 transition hover:-translate-y-[2px] hover:border-[#2c2c2c]">
      <div className="text-[22px] font-semibold tracking-[-0.02em] text-[#38bdf8]">
        {number}
      </div>
      <h3 className="mt-4 text-[18px] font-semibold tracking-[-0.02em] text-[#f8fafc]">
        {title}
      </h3>
      <p className="mt-3 text-[14px] leading-7 text-[#9ca3af]">{body}</p>
    </div>
  );
}

function InfoBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[12px] border border-[#1f1f1f] bg-[#0b0b0b] p-4">
      <h4 className="text-[16px] font-semibold tracking-[-0.02em] text-[#f8fafc]">
        {title}
      </h4>
      <p className="mt-2 text-[14px] leading-7 text-[#9ca3af]">{body}</p>
    </div>
  );
}

function Tag({ text }: { text: string }) {
  return (
    <span className="rounded-full border border-[#1f1f1f] bg-[#0b0b0b] px-3 py-1 text-[12px] text-[#9ca3af]">
      {text}
    </span>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-[#1f1f1f] bg-[#0b0b0b] p-3">
      <div className="text-[11px] uppercase tracking-[0.12em] text-[#6b7280]">
        {label}
      </div>
      <div className="mt-2 text-[14px] font-semibold text-[#f8fafc]">
        {value}
      </div>
    </div>
  );
}

function shortenAddress(address: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}