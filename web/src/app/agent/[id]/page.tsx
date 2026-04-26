"use client";

import Link from "next/link";
import { use, useMemo } from "react";
import { useReadContract } from "thirdweb/react";
import { getContract } from "thirdweb";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
import { client } from "@/lib/client";
import {
  AGENT_REGISTRY_ABI,
  AGENT_REGISTRY_ADDRESS,
} from "@/lib/contract";
import {
  agentGuildChain,
  getExplorerAddressUrl,
} from "@/lib/networkConfig";
import { agentGuildRuntimeConfig } from "@/lib/runtimeConfig";
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

type AgentRegistryReadResult = readonly Agent[];

export default function AgentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!agentGuildRuntimeConfig.valid || !client) {
    return (
      <ConfigErrorScreen
        title="Agent profile unavailable"
        description="Agent Guild could not load wallet and contract configuration on this device, so profile reads stay disabled until the public runtime values are fixed."
        errors={agentGuildRuntimeConfig.errors}
      />
    );
  }

  return <ConfiguredAgentProfilePage params={params} />;
}

function ConfiguredAgentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const thirdwebClient = client!;
  const resolvedParams = use(params);
  const id = Number(resolvedParams.id);

  const contract = useMemo(() => {
    return getContract({
      client: thirdwebClient,
      chain: agentGuildChain,
      address: AGENT_REGISTRY_ADDRESS,
      abi: AGENT_REGISTRY_ABI,
    });
  }, [thirdwebClient, AGENT_REGISTRY_ADDRESS]);

  const { data, isLoading } = useReadContract({
    contract,
    method: "getAgents",
    params: [],
  });

  const agents = (data as AgentRegistryReadResult | undefined) || [];
  const agent = agents[id];

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#0b0b0b] text-[#f8fafc]">
        <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6">
          <p className="text-sm text-[#9ca3af]">Loading profile...</p>
        </div>
      </main>
    );
  }

  if (!agent) {
    return (
      <main className="min-h-screen bg-[#0b0b0b] text-[#f8fafc]">
        <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6">
          <Link
            href="/"
            className="inline-block text-sm text-[#38bdf8] transition hover:text-[#0ea5e9]"
          >
            ← Back to registry
          </Link>
          <h1 className="mt-6 text-[32px] font-semibold tracking-[-0.02em]">
            Agent not found
          </h1>
        </div>
      </main>
    );
  }

  const reputation = getReputationForWallet(agent.owner);

  return (
    <main className="min-h-screen bg-[#0b0b0b] text-[#f8fafc]">
      <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-block text-sm text-[#38bdf8] transition hover:text-[#0ea5e9]"
          >
            ← Back to registry
          </Link>
        </div>

        <section className="rounded-[16px] border border-[#1f1f1f] bg-[#111111] p-6 sm:p-8">
          <div className="inline-flex rounded-full border border-[#1f1f1f] bg-[#0b0b0b] px-3 py-1 text-[12px] text-[#9ca3af]">
            Freelancer Profile
          </div>

          <h1 className="mt-5 text-[34px] font-bold leading-[1.02] tracking-[-0.02em] sm:text-[48px]">
            {agent.name}
          </h1>

          <p className="mt-4 max-w-[760px] text-[15px] leading-7 text-[#9ca3af] sm:text-[16px]">
            {agent.description}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Tag text={agent.skill} />
            <Tag text={`$${agent.hourlyRate.toString()}/hr`} />
            <Tag text={agent.location} />
            <Tag text={agent.availability} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-[#123246] bg-[#0f1e28] px-3 py-1 text-[12px] font-medium text-[#7dd3fc]">
              Open freelancer profile
            </span>
            <span className="rounded-full border border-[#1f1f1f] bg-[#0b0b0b] px-3 py-1 text-[12px] text-[#9ca3af]">
              Wallet-owned profile
            </span>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 pt-8 md:grid-cols-2">
          <div className="rounded-[16px] border border-[#1f1f1f] bg-[#111111] p-6">
            <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#38bdf8]">
              Profile details
            </div>

            <div className="mt-5 space-y-4">
              <InfoRow label="Primary Skill" value={agent.skill} />
              <InfoRow
                label="Hourly Rate"
                value={`$${agent.hourlyRate.toString()}/hr`}
              />
              <InfoRow label="Location" value={agent.location} />
              <InfoRow label="Availability" value={agent.availability} />
            </div>
          </div>

          <div className="rounded-[16px] border border-[#1f1f1f] bg-[#111111] p-6">
            <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#38bdf8]">
              Ownership
            </div>

            <div className="mt-5 space-y-4">
              <InfoRow label="Owner Wallet" value={shortAddress(agent.owner)} />
              <div>
                <div className="mb-2 text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
                  Explorer
                </div>
                <div className="flex flex-col gap-2">
                  <a
                    href={getExplorerAddressUrl(agent.owner)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-[#38bdf8] transition hover:text-[#0ea5e9]"
                  >
                    View owner on Celoscan
                  </a>
                  <a
                    href={getExplorerAddressUrl(AGENT_REGISTRY_ADDRESS)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-[#38bdf8] transition hover:text-[#0ea5e9]"
                  >
                    View contract on Celoscan
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="pt-8">
          <div className="rounded-[16px] border border-[#1f1f1f] bg-[#111111] p-6">
            <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#38bdf8]">
              Agent identity
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
              <InfoBlock
                title="Standard"
                body="Wallet-owned freelancer profile"
              />
              <InfoBlock title="Agent ID" body={agent.owner} />
              <InfoBlock title="Verification" body="Owned by the connected wallet" />
            </div>
          </div>
        </section>

        <section className="pt-8">
          <div className="mb-5">
            <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#38bdf8]">
              Reputation
            </div>
            <h2 className="mt-3 text-[26px] font-semibold tracking-[-0.02em]">
              Economic reputation
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Guild Score"
              value={`${reputation.guildScore}/100`}
            />
            <MetricCard
              label="Completed Contracts"
              value={`${reputation.completedContracts}`}
            />
            <MetricCard
              label="Total Earned"
              value={`${reputation.totalEarned} CELO`}
            />
            <MetricCard
              label="Credit Status"
              value={
                reputation.creditUnlocked
                  ? `$${reputation.creditAmount} Unlocked`
                  : "Locked"
              }
            />
          </div>
        </section>

        <section className="border-t border-[#1a1a1a] pt-8 mt-10">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-[16px] border border-[#1f1f1f] bg-[#111111] p-6">
              <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#38bdf8]">
                Work history
              </div>
              <h3 className="mt-3 text-[20px] font-semibold tracking-[-0.02em]">
                Activity snapshot
              </h3>
              <p className="mt-3 text-[15px] leading-7 text-[#9ca3af]">
                This freelancer profile accumulates reputation through completed
                milestone-based work and visible earnings over time.
              </p>
            </div>

            <div className="rounded-[16px] border border-[#1f1f1f] bg-[#111111] p-6">
              <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#38bdf8]">
                Credit progression
              </div>
              <h3 className="mt-3 text-[20px] font-semibold tracking-[-0.02em]">
                Financial unlocks
              </h3>
              <p className="mt-3 text-[15px] leading-7 text-[#9ca3af]">
                Reputation feeds into credit eligibility. Once a freelancer
                proves consistent delivery, the protocol can unlock financing
                opportunities.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function shortAddress(address: string) {
  return address.slice(0, 6) + "..." + address.slice(-4);
}

function Tag({ text }: { text: string }) {
  return (
    <span className="rounded-full border border-[#1f1f1f] bg-[#0b0b0b] px-3 py-1 text-[12px] text-[#9ca3af]">
      {text}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
        {label}
      </div>
      <div className="break-words text-[14px] leading-7 text-[#f8fafc]">
        {value}
      </div>
    </div>
  );
}

function InfoBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[12px] border border-[#1f1f1f] bg-[#0b0b0b] p-4">
      <div className="mb-2 text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
        {title}
      </div>
      <div className="break-words text-[14px] leading-7 text-[#f8fafc]">
        {body}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[#1f1f1f] bg-[#111111] p-6">
      <div className="text-[12px] uppercase tracking-[0.12em] text-[#6b7280]">
        {label}
      </div>
      <div className="mt-3 text-[24px] font-semibold tracking-[-0.02em] text-[#f8fafc]">
        {value}
      </div>
    </div>
  );
}
