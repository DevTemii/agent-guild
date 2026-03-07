"use client";

import EscrowSimulator from "@/components/EscrowSimulator";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ConnectButton,
  useActiveAccount,
  useReadContract,
} from "thirdweb/react";
import {
  getContract,
  prepareContractCall,
  sendTransaction,
  defineChain,
} from "thirdweb";
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

function generateMockContract(
  clientName: string,
  projectDescription: string,
  budget: number
): GeneratedContract {
  const milestone1 = Math.floor(budget * 0.3);
  const milestone2 = Math.floor(budget * 0.3);
  const milestone3 = budget - milestone1 - milestone2;

  return {
    clientName,
    projectDescription,
    budget,
    summary: `Freelancer will complete the project for ${clientName}. The work includes: ${projectDescription}. Payment will be split across 3 milestones based on delivery progress.`,
    milestones: [
      {
        title: "Project kickoff and research",
        amount: milestone1,
      },
      {
        title: "Core execution and draft delivery",
        amount: milestone2,
      },
      {
        title: "Final delivery and revisions",
        amount: milestone3,
      },
    ],
  };
}

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
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

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

  const agents = ((data as Agent[] | undefined) || []).filter((agent) => {
    const q = search.toLowerCase();
    return (
      agent.name.toLowerCase().includes(q) ||
      agent.skill.toLowerCase().includes(q) ||
      agent.location.toLowerCase().includes(q)
    );
  });

  function handleGenerateContract() {
    if (!clientName || !projectBrief || !budget) {
      setStatus("Fill client name, project brief, and budget to generate contract.");
      return;
    }

    const result = generateMockContract(
      clientName,
      projectBrief,
      Number(budget)
    );

    setGeneratedContract(result);
    setStatus("AI contract generated successfully.");
  }

  async function createAgent() {
    if (!account) {
      setStatus("Connect your wallet first.");
      return;
    }

    if (
      !name ||
      !description ||
      !skill ||
      !hourlyRate ||
      !location ||
      !availability
    ) {
      setStatus("Fill all profile fields.");
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
          description,
          skill,
          BigInt(hourlyRate),
          location,
          availability,
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
    } catch (error) {
      console.error(error);
      setStatus("Transaction failed.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(34,197,94,0.12), transparent 28%), #080808",
        color: "white",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <section
        style={{
          maxWidth: "1180px",
          margin: "0 auto",
          padding: "32px 20px 60px",
        }}
      >
        <nav
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "40px",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 800 }}>
              Agent Guild
            </h1>
            <p style={{ margin: "6px 0 0", opacity: 0.7, fontSize: "14px" }}>
              Onchain workforce profiles for emerging markets
            </p>
          </div>

          <ConnectButton client={client} chain={celoSepolia} />
        </nav>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 0.8fr",
            gap: "20px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              border: "1px solid #202020",
              borderRadius: "24px",
              padding: "32px",
              background: "linear-gradient(180deg, #101010, #0b0b0b)",
            }}
          >
            <div
              style={{
                display: "inline-block",
                padding: "8px 12px",
                borderRadius: "999px",
                background: "rgba(34,197,94,0.12)",
                color: "#86efac",
                fontSize: "13px",
                fontWeight: 700,
                marginBottom: "18px",
              }}
            >
              Workforce Layer MVP
            </div>

            <h2
              style={{
                fontSize: "48px",
                lineHeight: 1.05,
                margin: "0 0 16px",
                fontWeight: 900,
                maxWidth: "760px",
              }}
            >
              Create verifiable freelancer agents on Celo.
            </h2>

            <p
              style={{
                opacity: 0.78,
                fontSize: "17px",
                lineHeight: 1.7,
                maxWidth: "760px",
                marginBottom: "24px",
              }}
            >
              Agent Guild helps designers, developers, and remote workers build
              portable onchain profiles with skills, rates, location, and
              availability.
            </p>

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <a href="#create" style={primaryLink}>
                Create Profile
              </a>

              <a
                href={`https://sepolia.celoscan.io/address/${AGENT_REGISTRY_ADDRESS}`}
                target="_blank"
                rel="noreferrer"
                style={secondaryLink}
              >
                View Contract
              </a>
            </div>
          </div>

          <div style={{ display: "grid", gap: "16px" }}>
            <div style={metricCard}>
              <p style={metricLabel}>Total Profiles</p>
              <h3 style={metricValue}>{agents.length}</h3>
            </div>

            <div style={metricCard}>
              <p style={metricLabel}>Network</p>
              <h3 style={{ margin: "10px 0 0", fontSize: "28px" }}>
                Celo Sepolia
              </h3>
            </div>

            <div style={metricCard}>
              <p style={metricLabel}>Connected Wallet</p>
              <h3
                style={{
                  margin: "10px 0 0",
                  fontSize: "15px",
                  wordBreak: "break-all",
                  lineHeight: 1.5,
                }}
              >
                {account ? account.address : "Not connected"}
              </h3>
            </div>
          </div>
        </section>

        <section
          style={{
            border: "1px solid #202020",
            borderRadius: "24px",
            padding: "24px",
            background: "#101010",
            marginBottom: "24px",
          }}
        >
          <div style={{ marginBottom: "18px" }}>
            <h3 style={{ margin: 0, fontSize: "24px" }}>AI Contract Generator</h3>
            <p style={{ margin: "8px 0 0", opacity: 0.72, lineHeight: 1.6 }}>
              Generate a structured freelance contract with milestone-based payment splits.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "20px",
              alignItems: "start",
            }}
          >
            <div style={{ display: "grid", gap: "12px" }}>
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Client name"
                style={inputStyle}
              />

              <textarea
                value={projectBrief}
                onChange={(e) => setProjectBrief(e.target.value)}
                placeholder="Project description"
                rows={4}
                style={textareaStyle}
              />

              <input
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="Budget in USD e.g 300"
                style={inputStyle}
              />

              <button onClick={handleGenerateContract} style={primaryBtn}>
                Generate Contract
              </button>
            </div>

            <div
              style={{
                border: "1px solid #222",
                borderRadius: "18px",
                padding: "18px",
                background: "#0b0b0b",
                minHeight: "220px",
              }}
            >
              {!generatedContract ? (
                <p style={{ opacity: 0.65 }}>No contract generated yet.</p>
              ) : (
                <div style={{ display: "grid", gap: "14px" }}>
                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        opacity: 0.6,
                        marginBottom: "6px",
                      }}
                    >
                      Client
                    </div>
                    <div>{generatedContract.clientName}</div>
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        opacity: 0.6,
                        marginBottom: "6px",
                      }}
                    >
                      Summary
                    </div>
                    <div style={{ lineHeight: 1.6, opacity: 0.9 }}>
                      {generatedContract.summary}
                    </div>
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        opacity: 0.6,
                        marginBottom: "8px",
                      }}
                    >
                      Milestones
                    </div>

                    <div style={{ display: "grid", gap: "10px" }}>
                      {generatedContract.milestones.map((milestone, index) => (
                        <div
                          key={index}
                          style={{
                            border: "1px solid #1e1e1e",
                            borderRadius: "12px",
                            padding: "12px",
                            background: "#111",
                          }}
                        >
                          <div style={{ fontWeight: 700 }}>{milestone.title}</div>
                          <div style={{ opacity: 0.75, marginTop: "4px" }}>
                            ${milestone.amount}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        opacity: 0.6,
                        marginBottom: "6px",
                      }}
                    >
                      Total Budget
                    </div>
                    <div style={{ fontWeight: 800 }}>
                      ${generatedContract.budget}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <EscrowSimulator />

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "0.95fr 1.05fr",
            gap: "20px",
            alignItems: "start",
          }}
        >
          <div
            id="create"
            style={{
              border: "1px solid #202020",
              borderRadius: "24px",
              padding: "24px",
              background: "#101010",
            }}
          >
            <h3 style={{ marginTop: 0, fontSize: "24px" }}>
              Create Work Profile
            </h3>

            <div style={{ display: "grid", gap: "12px", marginTop: "18px" }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                style={inputStyle}
              />

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short bio / description"
                rows={3}
                style={textareaStyle}
              />

              <input
                value={skill}
                onChange={(e) => setSkill(e.target.value)}
                placeholder="Primary skill e.g Product Design"
                style={inputStyle}
              />

              <input
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="Hourly rate in USD e.g 25"
                style={inputStyle}
              />

              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Location e.g Lagos, Nigeria"
                style={inputStyle}
              />

              <input
                value={availability}
                onChange={(e) => setAvailability(e.target.value)}
                placeholder="Availability e.g Full-time / Part-time"
                style={inputStyle}
              />

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  onClick={createAgent}
                  disabled={creating}
                  style={primaryBtn}
                >
                  {creating ? "Creating..." : "Create Profile"}
                </button>

                <button onClick={() => refetch()} style={secondaryBtn}>
                  Refresh
                </button>
              </div>

              {status && (
                <div
                  style={{
                    marginTop: "8px",
                    padding: "12px 14px",
                    borderRadius: "12px",
                    background: "#0b0b0b",
                    border: "1px solid #1f1f1f",
                    fontSize: "14px",
                    opacity: 0.9,
                  }}
                >
                  {status}
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              border: "1px solid #202020",
              borderRadius: "24px",
              padding: "24px",
              background: "#101010",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                marginBottom: "18px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "24px" }}>Talent Registry</h3>
                <p style={{ margin: "6px 0 0", opacity: 0.7 }}>
                  Discover registered onchain freelancer profiles
                </p>
              </div>

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search skill or location"
                style={{
                  ...inputStyle,
                  width: "220px",
                  margin: 0,
                }}
              />
            </div>

            {isLoading ? (
              <p>Loading profiles...</p>
            ) : agents.length === 0 ? (
              <div
                style={{
                  border: "1px dashed #2d2d2d",
                  borderRadius: "18px",
                  padding: "28px",
                  textAlign: "center",
                  opacity: 0.72,
                }}
              >
                No profiles yet.
              </div>
            ) : (
              <div style={{ display: "grid", gap: "14px" }}>
                {agents.map((agent, index) => {
                  const isMine =
                    account?.address?.toLowerCase() ===
                    agent.owner?.toLowerCase();

                  return (
                    <Link
                      key={index}
                      href={`/agent/${index}`}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <div
                        style={{
                          border: "1px solid #232323",
                          borderRadius: "18px",
                          padding: "18px",
                          background: "#0b0b0b",
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "12px",
                            alignItems: "center",
                            marginBottom: "8px",
                          }}
                        >
                          <h4 style={{ margin: 0, fontSize: "19px" }}>
                            {agent.name}
                          </h4>

                          {isMine && (
                            <span
                              style={{
                                padding: "6px 10px",
                                borderRadius: "999px",
                                background: "rgba(34,197,94,0.14)",
                                color: "#86efac",
                                fontSize: "12px",
                                fontWeight: 800,
                                whiteSpace: "nowrap",
                              }}
                            >
                              My Profile
                            </span>
                          )}
                        </div>

                        <p
                          style={{
                            margin: "0 0 10px",
                            opacity: 0.82,
                            lineHeight: 1.6,
                          }}
                        >
                          {agent.description}
                        </p>

                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            flexWrap: "wrap",
                            marginBottom: "10px",
                          }}
                        >
                          <Badge text={agent.skill} />
                          <Badge text={`$${agent.hourlyRate.toString()}/hr`} />
                          <Badge text={agent.location} />
                          <Badge text={agent.availability} />
                        </div>

                        <div
                          style={{
                            fontSize: "12px",
                            opacity: 0.6,
                            wordBreak: "break-all",
                          }}
                        >
                          Owner: {agent.owner}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <span
      style={{
        padding: "6px 10px",
        borderRadius: "999px",
        background: "#151515",
        border: "1px solid #262626",
        fontSize: "12px",
        opacity: 0.9,
      }}
    >
      {text}
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px",
  borderRadius: "14px",
  border: "1px solid #2a2a2a",
  background: "#0b0b0b",
  color: "white",
  outline: "none",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px",
  borderRadius: "14px",
  border: "1px solid #2a2a2a",
  background: "#0b0b0b",
  color: "white",
  outline: "none",
  resize: "vertical",
};

const primaryBtn: React.CSSProperties = {
  padding: "14px 18px",
  borderRadius: "12px",
  border: "none",
  background: "#22c55e",
  color: "black",
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  padding: "14px 18px",
  borderRadius: "12px",
  border: "1px solid #2c2c2c",
  background: "#0f0f0f",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

const primaryLink: React.CSSProperties = {
  padding: "14px 18px",
  borderRadius: "12px",
  background: "#22c55e",
  color: "black",
  fontWeight: 800,
  textDecoration: "none",
};

const secondaryLink: React.CSSProperties = {
  padding: "14px 18px",
  borderRadius: "12px",
  border: "1px solid #2c2c2c",
  color: "white",
  textDecoration: "none",
  fontWeight: 700,
  background: "#101010",
};

const metricCard: React.CSSProperties = {
  border: "1px solid #202020",
  borderRadius: "20px",
  padding: "22px",
  background: "#101010",
};

const metricLabel: React.CSSProperties = {
  margin: 0,
  opacity: 0.65,
  fontSize: "13px",
};

const metricValue: React.CSSProperties = {
  margin: "10px 0 0",
  fontSize: "42px",
};