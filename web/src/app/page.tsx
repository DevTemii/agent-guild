"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ConnectButton, useActiveAccount, useReadContract } from "thirdweb/react";
import { defineChain, getContract } from "thirdweb";
import { client } from "@/lib/client";
import { AGENT_REGISTRY_ABI, AGENT_REGISTRY_ADDRESS } from "@/lib/contract";
import { getReputation } from "@/lib/reputation";
import { getReputationForWallet } from "@/lib/reputationStore";

type Agent = {
  owner: string;
  name: string;
  description: string;
  skill: string;
  hourlyRate: bigint;
  location: string;
  availability: string;
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
  const [search, setSearch] = useState("");

  const contract = useMemo(() => {
    return getContract({
      client,
      chain: celoSepolia,
      address: AGENT_REGISTRY_ADDRESS,
      abi: AGENT_REGISTRY_ABI,
    });
  }, []);

  const { data, isLoading } = useReadContract({
    contract,
    method: "getAgents",
    params: [],
  });

  const allAgents = (data as Agent[] | undefined) || [];
  const uniqueAgents = allAgents.filter((agent, index, arr) => {
    const owner = agent.owner.toLowerCase();
    return index === arr.findIndex((item) => item.owner.toLowerCase() === owner);
  });

  const agents = uniqueAgents.filter((agent) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;

    return (
      agent.name.toLowerCase().includes(q) ||
      agent.skill.toLowerCase().includes(q) ||
      agent.location.toLowerCase().includes(q)
    );
  });

  const totalContracts = uniqueAgents.reduce((sum, agent) => {
    const rep = getReputation(agent.owner);
    return sum + rep.completedContracts;
  }, 0);

  const totalVolume = uniqueAgents.reduce((sum, agent) => {
    const rep = getReputationForWallet(agent.owner);
    return sum + rep.totalEarned;
  }, 0);

  return (
    <main className="min-h-screen bg-[#070707] text-[#f7f4ef]">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
        <header className="sticky top-0 z-20 border-b border-[#181818]/90 bg-[#070707]/90 backdrop-blur">
          <div className="flex items-center justify-between py-4">
            <Link href="/" className="text-[14px] font-semibold tracking-[0.18em] text-[#f7f4ef]">
              AGENT GUILD
            </Link>

            <div className="hidden items-center gap-6 text-[13px] text-[#a1a1aa] md:flex">
              <a href="#how-it-works" className="transition hover:text-[#f7f4ef]">
                How it works
              </a>
              <a href="#roles" className="transition hover:text-[#f7f4ef]">
                Workspaces
              </a>
              <a href="#registry" className="transition hover:text-[#f7f4ef]">
                Talent
              </a>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/client"
                className="hidden rounded-[10px] border border-[#242424] px-4 py-2 text-sm font-medium text-[#f7f4ef] transition hover:border-[#373737] sm:inline-flex"
              >
                Client Workspace
              </Link>
              <ConnectButton client={client} chain={celoSepolia} />
            </div>
          </div>
        </header>

        <section className="relative overflow-hidden py-16 sm:py-24">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(215,38,56,0.22),transparent_40%),radial-gradient(circle_at_80%_20%,rgba(120,26,36,0.18),transparent_30%)]" />
          <div className="relative grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="inline-flex rounded-full border border-[#2a1619] bg-[#160b0d] px-3 py-1 text-[12px] font-medium text-[#f2b6be]">
                AI contracts, onchain escrow, and reputation for modern agent work
              </div>

              <h1 className="mt-6 max-w-[760px] text-[42px] font-bold leading-[0.97] tracking-[-0.04em] text-[#f7f4ef] sm:text-[58px] lg:text-[72px]">
                The work operating system for AI-native client and freelancer teams.
              </h1>

              <p className="mt-6 max-w-[640px] text-[16px] leading-8 text-[#a1a1aa] sm:text-[17px]">
                Agent Guild turns agreements into structured contracts, routes payment through onchain
                escrow, coordinates delivery, and compounds visible reputation after every completed outcome.
              </p>

              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/client"
                  className="inline-flex items-center justify-center rounded-[12px] bg-[#d72638] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b91f30]"
                >
                  Continue as Client
                </Link>
                <Link
                  href="/freelancer"
                  className="inline-flex items-center justify-center rounded-[12px] border border-[#242424] px-5 py-3 text-sm font-semibold text-[#f7f4ef] transition hover:border-[#373737]"
                >
                  Continue as Freelancer
                </Link>
                <a
                  href="#registry"
                  className="inline-flex items-center justify-center rounded-[12px] border border-[#242424] px-5 py-3 text-sm font-semibold text-[#f7f4ef] transition hover:border-[#373737]"
                >
                  Explore Talent
                </a>
              </div>
            </div>

            <div className="rounded-[24px] border border-[#1e1e1e] bg-[linear-gradient(180deg,#111111_0%,#0a0a0a_100%)] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] sm:p-8">
              <div className="grid gap-4 sm:grid-cols-2">
                <HeroMetric label="Verified talent" value={`${uniqueAgents.length}`} />
                <HeroMetric label="Completed outcomes" value={`${totalContracts}`} />
                <HeroMetric label="Tracked volume" value={`$${totalVolume}`} />
                <HeroMetric label="Network" value="Celo Sepolia" />
              </div>

              <div className="mt-6 rounded-[18px] border border-[#1e1e1e] bg-[#0d0d0d] p-5">
                <div className="text-[12px] uppercase tracking-[0.16em] text-[#f2b6be]">
                  Live trust stack
                </div>
                <div className="mt-4 grid gap-3">
                  <SignalRow title="Identity" body="Wallet-linked freelancer profiles create a visible trust layer before payment begins." />
                  <SignalRow title="Execution" body="Contracts, escrow funding, submission, and release flow through a structured lifecycle." />
                  <SignalRow title="Reputation" body="Completed work updates score, earnings, and credit readiness over time." />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-[#151515] py-8">
          <div className="flex flex-wrap items-center justify-between gap-4 text-[12px] uppercase tracking-[0.14em] text-[#71717a]">
            <span>Built for AI agent workflows</span>
            <span>Escrow-protected delivery</span>
            <span>Role-based workspaces</span>
            <span>Reputation-backed outcomes</span>
          </div>
        </section>

        <section className="py-16 sm:py-24">
          <div className="max-w-[760px]">
            <SectionEyebrow>Why it matters</SectionEyebrow>
            <h2 className="mt-3 text-[30px] font-semibold tracking-[-0.03em] text-[#f7f4ef] sm:text-[42px]">
              Most freelance infrastructure was not built for AI-native delivery.
            </h2>
            <p className="mt-4 text-[16px] leading-8 text-[#a1a1aa]">
              Clients need clearer scoping, payment assurance, and auditability. Freelancers need a way to
              prove reliability, get paid cleanly, and build portable economic trust. Agent Guild packages the
              full workflow into one coordinated system.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <ValueCard
              title="Cleaner execution"
              body="Move from loose chat threads to structured contracts, accountable delivery, and clear release decisions."
            />
            <ValueCard
              title="Protected payment"
              body="Escrow holds the economic center of gravity so both sides operate from a more trusted starting point."
            />
            <ValueCard
              title="Compounding trust"
              body="Each completed contract feeds a visible reputation layer that becomes more useful over time."
            />
          </div>
        </section>

        <section id="how-it-works" className="border-t border-[#151515] py-16 sm:py-24">
          <div className="mb-8 max-w-[720px]">
            <SectionEyebrow>How it works</SectionEyebrow>
            <h2 className="mt-3 text-[30px] font-semibold tracking-[-0.03em] text-[#f7f4ef] sm:text-[42px]">
              From agreement to release in one product flow.
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StepCard number="01" title="Generate contract" body="Clients turn a brief into a structured agreement with milestones and budget context." />
            <StepCard number="02" title="Send for approval" body="Freelancers review the proposed work and accept or reject before money moves." />
            <StepCard number="03" title="Create and fund escrow" body="Approved work moves into escrow so payment is locked before execution." />
            <StepCard number="04" title="Submit and review" body="Freelancers deliver work, and clients review the submission against the agreement." />
            <StepCard number="05" title="Resolve and grow reputation" body="Release or dispute outcomes feed into an economic reputation trail." />
          </div>
        </section>

        <section className="border-t border-[#151515] py-16 sm:py-24">
          <div className="mb-8 max-w-[720px]">
            <SectionEyebrow>Platform capabilities</SectionEyebrow>
            <h2 className="mt-3 text-[30px] font-semibold tracking-[-0.03em] text-[#f7f4ef] sm:text-[42px]">
              Designed to feel like a real work system, not a crypto control panel.
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FeatureCard title="Client workspace" body="Draft contracts, manage freelancers, fund escrow, review deliveries, and resolve outcomes in one place." />
            <FeatureCard title="Freelancer workspace" body="Register a visible identity, review incoming work, submit deliverables, and track payment status." />
            <FeatureCard title="AI dispute review" body="Disputed submissions can be evaluated with structured contract context and delivery evidence." />
            <FeatureCard title="Reputation engine" body="Visible score, earnings, completed contracts, and credit readiness grow after successful releases." />
          </div>
        </section>

        <section id="roles" className="border-t border-[#151515] py-16 sm:py-24">
          <div className="rounded-[24px] border border-[#1e1e1e] bg-[linear-gradient(180deg,#111111_0%,#0a0a0a_100%)] p-6 sm:p-8">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-[18px] border border-[#1e1e1e] bg-[#0d0d0d] p-6">
                <SectionEyebrow>For clients</SectionEyebrow>
                <h3 className="mt-3 text-[24px] font-semibold tracking-[-0.03em] text-[#f7f4ef]">
                  Hire with structure, not improvisation.
                </h3>
                <p className="mt-3 text-[15px] leading-7 text-[#a1a1aa]">
                  Move from brief to contract to escrow-backed execution, with clean review and release logic.
                </p>
                <div className="mt-6 grid gap-3">
                  <Bullet text="Generate contract drafts from project briefs" />
                  <Bullet text="Route approved work into funded escrow" />
                  <Bullet text="Review delivery and handle disputes with AI support" />
                </div>
                <Link
                  href="/client"
                  className="mt-6 inline-flex rounded-[12px] bg-[#d72638] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b91f30]"
                >
                  Open Client Workspace
                </Link>
              </div>

              <div className="rounded-[18px] border border-[#1e1e1e] bg-[#0d0d0d] p-6">
                <SectionEyebrow>For freelancers</SectionEyebrow>
                <h3 className="mt-3 text-[24px] font-semibold tracking-[-0.03em] text-[#f7f4ef]">
                  Build identity, deliver work, and get paid with more confidence.
                </h3>
                <p className="mt-3 text-[15px] leading-7 text-[#a1a1aa]">
                  Create a visible profile, review inbound work clearly, and submit funded projects through a cleaner flow.
                </p>
                <div className="mt-6 grid gap-3">
                  <Bullet text="Create a wallet-linked freelancer profile" />
                  <Bullet text="Approve or reject proposed work before escrow begins" />
                  <Bullet text="Track earnings and reputation after each completed outcome" />
                </div>
                <Link
                  href="/freelancer"
                  className="mt-6 inline-flex rounded-[12px] border border-[#262626] px-5 py-3 text-sm font-semibold text-[#f7f4ef] transition hover:border-[#3b3b3b]"
                >
                  Open Freelancer Workspace
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="registry" className="border-t border-[#151515] py-16 sm:py-24">
          <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-[700px]">
              <SectionEyebrow>Registry preview</SectionEyebrow>
              <h2 className="mt-3 text-[30px] font-semibold tracking-[-0.03em] text-[#f7f4ef] sm:text-[42px]">
                Discover wallet-linked talent with visible economic signals.
              </h2>
              <p className="mt-4 text-[16px] leading-8 text-[#a1a1aa]">
                Browse freelancer profiles, reputation signals, and availability before moving into the client workflow.
              </p>
            </div>

            <div className="w-full sm:max-w-[280px]">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search skill or location"
                className="w-full rounded-[12px] border border-[#242424] bg-[#0b0b0b] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="rounded-[18px] border border-[#1e1e1e] bg-[#0d0d0d] px-6 py-10 text-center text-sm text-[#a1a1aa]">
              Loading talent registry...
            </div>
          ) : agents.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-[#242424] bg-[#0d0d0d] px-6 py-10 text-center text-sm text-[#a1a1aa]">
              No freelancer profiles are visible yet.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {agents.map((agent, index) => {
                const isMine = account?.address?.toLowerCase() === agent.owner.toLowerCase();
                const reputation = getReputationForWallet(agent.owner);

                return (
                  <Link key={`${agent.owner}-${index}`} href={`/agent/${index}`} className="block h-full">
                    <div className="flex h-full flex-col rounded-[18px] border border-[#1e1e1e] bg-[#0d0d0d] p-6 transition hover:-translate-y-[2px] hover:border-[#323232]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-[19px] font-semibold tracking-[-0.03em] text-[#f7f4ef]">
                            {agent.name}
                          </h3>
                          <p className="mt-2 text-[14px] text-[#a1a1aa]">{agent.skill}</p>
                        </div>

                        {isMine && (
                          <span className="rounded-full border border-[#4c1d24] bg-[#1d0d10] px-3 py-1 text-[11px] font-medium text-[#f2b6be]">
                            My Profile
                          </span>
                        )}
                      </div>

                      <p className="mt-4 text-[14px] leading-7 text-[#d4d4d8]">{agent.description}</p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Tag text={agent.location} />
                        <Tag text={agent.availability} />
                        <Tag text={`$${agent.hourlyRate.toString()}/hr`} />
                      </div>

                      <div className="mt-6 grid grid-cols-2 gap-3">
                        <MetricMini label="Guild Score" value={`${reputation.guildScore}/100`} />
                        <MetricMini label="Completed" value={`${reputation.completedContracts}`} />
                        <MetricMini label="Earned" value={`$${reputation.totalEarned}`} />
                        <MetricMini label="Credit" value={reputation.creditUnlocked ? `$${reputation.creditAmount}` : "Locked"} />
                      </div>

                      <div className="mt-6 border-t border-[#181818] pt-4 text-[12px] text-[#71717a]">
                        Owner: {shortenAddress(agent.owner)}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="border-t border-[#151515] py-16 sm:py-24">
          <div className="rounded-[24px] border border-[#1e1e1e] bg-[radial-gradient(circle_at_top,rgba(215,38,56,0.18),transparent_38%),linear-gradient(180deg,#111111_0%,#0a0a0a_100%)] p-8 text-center sm:p-10">
            <SectionEyebrow>Start the workflow</SectionEyebrow>
            <h2 className="mt-3 text-[30px] font-semibold tracking-[-0.03em] text-[#f7f4ef] sm:text-[42px]">
              Choose the workspace that matches how you operate.
            </h2>
            <p className="mx-auto mt-4 max-w-[720px] text-[16px] leading-8 text-[#a1a1aa]">
              Clients manage agreement and payment. Freelancers manage identity, acceptance, delivery, and reputation.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/client"
                className="inline-flex items-center justify-center rounded-[12px] bg-[#d72638] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b91f30]"
              >
                Continue as Client
              </Link>
              <Link
                href="/freelancer"
                className="inline-flex items-center justify-center rounded-[12px] border border-[#262626] px-5 py-3 text-sm font-semibold text-[#f7f4ef] transition hover:border-[#3b3b3b]"
              >
                Continue as Freelancer
              </Link>
            </div>
          </div>
        </section>

        <footer className="border-t border-[#151515] py-10 text-sm text-[#71717a]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>Agent Guild</div>
            <div className="flex flex-wrap gap-4">
              <span>AI-native workflow infrastructure</span>
              <span>Escrow-backed execution</span>
              <span>Built on Celo</span>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[#1c1c1c] bg-[#0d0d0d] p-4">
      <div className="text-[24px] font-semibold tracking-[-0.03em] text-[#f7f4ef]">{value}</div>
      <div className="mt-2 text-[11px] uppercase tracking-[0.14em] text-[#71717a]">{label}</div>
    </div>
  );
}

function SignalRow({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[14px] border border-[#1c1c1c] bg-[#090909] p-4">
      <div className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#f2b6be]">{title}</div>
      <p className="mt-2 text-[14px] leading-7 text-[#a1a1aa]">{body}</p>
    </div>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] font-medium uppercase tracking-[0.16em] text-[#f2b6be]">{children}</div>;
}

function ValueCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[18px] border border-[#1e1e1e] bg-[#0d0d0d] p-6">
      <h3 className="text-[20px] font-semibold tracking-[-0.03em] text-[#f7f4ef]">{title}</h3>
      <p className="mt-3 text-[15px] leading-7 text-[#a1a1aa]">{body}</p>
    </div>
  );
}

function StepCard({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div className="rounded-[18px] border border-[#1e1e1e] bg-[#0d0d0d] p-6 transition hover:-translate-y-[2px] hover:border-[#323232]">
      <div className="text-[22px] font-semibold tracking-[-0.03em] text-[#d72638]">{number}</div>
      <h3 className="mt-4 text-[18px] font-semibold tracking-[-0.03em] text-[#f7f4ef]">{title}</h3>
      <p className="mt-3 text-[14px] leading-7 text-[#a1a1aa]">{body}</p>
    </div>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[18px] border border-[#1e1e1e] bg-[#0d0d0d] p-6">
      <h3 className="text-[18px] font-semibold tracking-[-0.03em] text-[#f7f4ef]">{title}</h3>
      <p className="mt-3 text-[14px] leading-7 text-[#a1a1aa]">{body}</p>
    </div>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 text-[14px] leading-7 text-[#d4d4d8]">
      <span className="mt-2 h-2 w-2 rounded-full bg-[#d72638]" />
      <span>{text}</span>
    </div>
  );
}

function Tag({ text }: { text: string }) {
  return (
    <span className="rounded-full border border-[#1f1f1f] bg-[#090909] px-3 py-1 text-[12px] text-[#a1a1aa]">
      {text}
    </span>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[#1f1f1f] bg-[#090909] p-3">
      <div className="text-[11px] uppercase tracking-[0.12em] text-[#71717a]">{label}</div>
      <div className="mt-2 text-[14px] font-semibold text-[#f7f4ef]">{value}</div>
    </div>
  );
}

function shortenAddress(address: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
