"use client";

import Link from "next/link";
import { use, useMemo } from "react";
import { useReadContract } from "thirdweb/react";
import { getContract, defineChain } from "thirdweb";
import { client } from "@/lib/client";
import {
  AGENT_REGISTRY_ABI,
  AGENT_REGISTRY_ADDRESS,
} from "@/lib/contract";

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

export default function AgentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = Number(resolvedParams.id);

  const contract = useMemo(() => {
    return getContract({
      client,
      chain: celoSepolia,
      address: AGENT_REGISTRY_ADDRESS,
      abi: AGENT_REGISTRY_ABI as any,
    });
  }, []);

  const { data, isLoading } = useReadContract({
    contract,
    method:
      "function getAgents() view returns ((address owner,string name,string description,string skill,uint256 hourlyRate,string location,string availability)[])",
    params: [],
  });

  const agents = (data as Agent[] | undefined) || [];
  const agent = agents[id];

  if (isLoading) {
    return (
      <main style={pageStyle}>
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <p>Loading profile...</p>
        </div>
      </main>
    );
  }

  if (!agent) {
    return (
      <main style={pageStyle}>
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <Link href="/" style={backLink}>
            ← Back to registry
          </Link>
          <h1>Agent not found</h1>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <Link href="/" style={backLink}>
          ← Back to registry
        </Link>

        <div style={heroCard}>
          <div style={pill}>Onchain Freelancer Profile</div>

          <h1 style={{ fontSize: "44px", margin: "14px 0 10px" }}>
            {agent.name}
          </h1>

          <p style={{ opacity: 0.82, lineHeight: 1.7, fontSize: "17px" }}>
            {agent.description}
          </p>

          <div style={badgeRow}>
            <Badge text={agent.skill} />
            <Badge text={`$${agent.hourlyRate.toString()}/hr`} />
            <Badge text={agent.location} />
            <Badge text={agent.availability} />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "18px",
            marginTop: "20px",
          }}
        >
          <div style={card}>
            <h3 style={cardTitle}>Profile Details</h3>
            <Info label="Primary Skill" value={agent.skill} />
            <Info
              label="Hourly Rate"
              value={`$${agent.hourlyRate.toString()}/hr`}
            />
            <Info label="Location" value={agent.location} />
            <Info label="Availability" value={agent.availability} />
          </div>

          <div style={card}>
            <h3 style={cardTitle}>Ownership</h3>
            <Info label="Owner Wallet" value={agent.owner} />
            <a
              href={`https://sepolia.celoscan.io/address/${agent.owner}`}
              target="_blank"
              rel="noreferrer"
              style={explorerLink}
            >
              View owner on Celoscan
            </a>
            <br />
            <a
              href={`https://sepolia.celoscan.io/address/${AGENT_REGISTRY_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              style={explorerLink}
            >
              View contract on Celoscan
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <div style={{ fontSize: "12px", opacity: 0.6, marginBottom: "4px" }}>
        {label}
      </div>
      <div style={{ wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <span
      style={{
        padding: "8px 12px",
        borderRadius: "999px",
        background: "#151515",
        border: "1px solid #262626",
        fontSize: "13px",
      }}
    >
      {text}
    </span>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top left, rgba(34,197,94,0.12), transparent 28%), #080808",
  color: "white",
  padding: "32px 20px 60px",
  fontFamily: "Inter, sans-serif",
};

const heroCard: React.CSSProperties = {
  border: "1px solid #202020",
  borderRadius: "24px",
  padding: "28px",
  background: "linear-gradient(180deg, #101010, #0b0b0b)",
};

const card: React.CSSProperties = {
  border: "1px solid #202020",
  borderRadius: "20px",
  padding: "20px",
  background: "#101010",
};

const cardTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: "18px",
  fontSize: "20px",
};

const badgeRow: React.CSSProperties = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  marginTop: "18px",
};

const pill: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: "999px",
  background: "rgba(34,197,94,0.12)",
  color: "#86efac",
  fontSize: "13px",
  fontWeight: 700,
};

const backLink: React.CSSProperties = {
  display: "inline-block",
  marginBottom: "18px",
  color: "#86efac",
  textDecoration: "none",
};

const explorerLink: React.CSSProperties = {
  color: "#86efac",
  textDecoration: "none",
  fontSize: "14px",
};