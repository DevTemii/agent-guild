"use client";

import { useMemo, useState } from "react";

type Milestone = {
    title: string;
    amount: number;
    status: "pending" | "funded" | "completed" | "released";
};

type EscrowProject = {
    clientName: string;
    freelancerName: string;
    totalBudget: number;
    deposited: boolean;
    milestones: Milestone[];
    completedContracts: number;
};

export default function EscrowSimulator() {
    const [clientName, setClientName] = useState("");
    const [freelancerName, setFreelancerName] = useState("");
    const [budget, setBudget] = useState("");
    const [project, setProject] = useState<EscrowProject | null>(null);
    const [status, setStatus] = useState("");

    const guildScore = useMemo(() => {
        if (!project) return 0;
        return project.completedContracts * 10;
    }, [project]);

    const creditUnlocked = useMemo(() => {
        if (!project) return false;
        return project.completedContracts >= 3;
    }, [project]);

    function createEscrowProject() {
        if (!clientName || !freelancerName || !budget) {
            setStatus("Fill client name, freelancer name, and budget.");
            return;
        }

        const totalBudget = Number(budget);
        const m1 = Math.floor(totalBudget * 0.3);
        const m2 = Math.floor(totalBudget * 0.3);
        const m3 = totalBudget - m1 - m2;

        setProject({
            clientName,
            freelancerName,
            totalBudget,
            deposited: false,
            completedContracts: 2,
            milestones: [
                { title: "Project kickoff and research", amount: m1, status: "pending" },
                { title: "Core execution and draft delivery", amount: m2, status: "pending" },
                { title: "Final delivery and revisions", amount: m3, status: "pending" },
            ],
        });

        setStatus("Escrow project created.");
    }

    function depositFunds() {
        if (!project) return;

        setProject({
            ...project,
            deposited: true,
            milestones: project.milestones.map((m) => ({
                ...m,
                status: "funded",
            })),
        });

        setStatus("Client deposited funds into escrow.");
    }

    function markComplete(index: number) {
        if (!project) return;

        const updated = [...project.milestones];
        if (updated[index].status === "funded") {
            updated[index].status = "completed";
            setProject({ ...project, milestones: updated });
            setStatus(`Milestone ${index + 1} marked complete by freelancer.`);
        }
    }

    function approveAndRelease(index: number) {
        if (!project) return;

        const updated = [...project.milestones];
        if (updated[index].status === "completed") {
            updated[index].status = "released";

            const allReleased = updated.every((m) => m.status === "released");

            setProject({
                ...project,
                milestones: updated,
                completedContracts: allReleased
                    ? project.completedContracts + 1
                    : project.completedContracts,
            });

            setStatus(`Milestone ${index + 1} approved and funds released.`);
        }
    }

    function resetSimulation() {
        setProject(null);
        setClientName("");
        setFreelancerName("");
        setBudget("");
        setStatus("");
    }

    return (
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
                <h3 style={{ margin: 0, fontSize: "24px" }}>Escrow Simulation</h3>
                <p style={{ margin: "8px 0 0", opacity: 0.72, lineHeight: 1.6 }}>
                    Simulate milestone-based payments for freelancer contracts.
                </p>
            </div>

            {!project ? (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr",
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

                        <input
                            value={freelancerName}
                            onChange={(e) => setFreelancerName(e.target.value)}
                            placeholder="Freelancer name"
                            style={inputStyle}
                        />

                        <input
                            value={budget}
                            onChange={(e) => setBudget(e.target.value)}
                            placeholder="Budget in USD e.g 300"
                            style={inputStyle}
                        />

                        <button onClick={createEscrowProject} style={primaryBtn}>
                            Create Escrow Project
                        </button>
                    </div>

                    <div style={previewCard}>
                        <p style={{ opacity: 0.65 }}>
                            No escrow project yet. Create one to simulate the full contract flow.
                        </p>
                    </div>
                </div>
            ) : (
                <div style={{ display: "grid", gap: "18px" }}>
                    <div style={previewCard}>
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
                            <Badge text={`Client: ${project.clientName}`} />
                            <Badge text={`Freelancer: ${project.freelancerName}`} />
                            <Badge text={`Budget: $${project.totalBudget}`} />
                            <Badge text={project.deposited ? "Escrow Funded" : "Awaiting Deposit"} />
                        </div>

                        <div style={{ display: "grid", gap: "12px" }}>
                            {project.milestones.map((milestone, index) => (
                                <div
                                    key={index}
                                    style={{
                                        border: "1px solid #1f1f1f",
                                        borderRadius: "14px",
                                        padding: "14px",
                                        background: "#111",
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
                                        <div>
                                            <div style={{ fontWeight: 700 }}>{milestone.title}</div>
                                            <div style={{ opacity: 0.7, fontSize: "14px", marginTop: "4px" }}>
                                                ${milestone.amount}
                                            </div>
                                        </div>

                                        <Badge text={milestone.status.toUpperCase()} />
                                    </div>

                                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                                        {index === 0 && !project.deposited && (
                                            <button onClick={depositFunds} style={primaryBtnSmall}>
                                                Deposit Funds
                                            </button>
                                        )}

                                        {project.deposited && milestone.status === "funded" && (
                                            <button onClick={() => markComplete(index)} style={secondaryBtnSmall}>
                                                Mark Complete
                                            </button>
                                        )}

                                        {milestone.status === "completed" && (
                                            <button onClick={() => approveAndRelease(index)} style={primaryBtnSmall}>
                                                Approve & Release
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr",
                            gap: "14px",
                        }}
                    >
                        <div style={metricCard}>
                            <p style={metricLabel}>Completed Contracts</p>
                            <h3 style={metricValue}>{project.completedContracts}</h3>
                        </div>

                        <div style={metricCard}>
                            <p style={metricLabel}>Guild Score</p>
                            <h3 style={metricValue}>{guildScore}/100</h3>
                        </div>

                        <div style={metricCard}>
                            <p style={metricLabel}>Credit Status</p>
                            <h3 style={{ ...metricValue, fontSize: "24px" }}>
                                {creditUnlocked ? "$200 Unlocked" : "Locked"}
                            </h3>
                        </div>
                    </div>

                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <button onClick={resetSimulation} style={secondaryBtn}>
                            Reset Simulation
                        </button>
                    </div>
                </div>
            )}

            {status && (
                <div style={statusBox}>
                    {status}
                </div>
            )}
        </section>
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

const primaryBtnSmall: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: "10px",
    border: "none",
    background: "#22c55e",
    color: "black",
    fontWeight: 800,
    cursor: "pointer",
};

const secondaryBtnSmall: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: "10px",
    border: "1px solid #2c2c2c",
    background: "#0f0f0f",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
};

const previewCard: React.CSSProperties = {
    border: "1px solid #222",
    borderRadius: "18px",
    padding: "18px",
    background: "#0b0b0b",
    minHeight: "180px",
};

const metricCard: React.CSSProperties = {
    border: "1px solid #202020",
    borderRadius: "20px",
    padding: "18px",
    background: "#101010",
};

const metricLabel: React.CSSProperties = {
    margin: 0,
    opacity: 0.65,
    fontSize: "13px",
};

const metricValue: React.CSSProperties = {
    margin: "10px 0 0",
    fontSize: "32px",
};

const statusBox: React.CSSProperties = {
    marginTop: "18px",
    padding: "12px 14px",
    borderRadius: "12px",
    background: "#0b0b0b",
    border: "1px solid #1f1f1f",
    fontSize: "14px",
    opacity: 0.9,
};