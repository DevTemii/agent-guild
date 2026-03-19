"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ConnectButton, useActiveAccount, useReadContract } from "thirdweb/react";
import { defineChain, getContract } from "thirdweb";
import EscrowSimulator from "@/components/EscrowSimulator";
import { client } from "@/lib/client";
import { AGENT_REGISTRY_ABI, AGENT_REGISTRY_ADDRESS } from "@/lib/contract";
import {
  appendNotification,
  createDraftContract,
  getContractsForClient,
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

type ClientProfile = {
  companyName: string;
  contactName: string;
  operatingFocus: string;
};

const PROFILE_STORAGE_KEY = "agent-guild-client-profile";
const CONTRACT_STORAGE_KEY = "agent-guild-generated-contract";
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

export default function ClientWorkspacePage() {
  const account = useActiveAccount();
  const connectedAddress = account?.address?.toLowerCase() ?? null;
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [operatingFocus, setOperatingFocus] = useState("");
  const [savedProfile, setSavedProfile] = useState<ClientProfile | null>(null);
  const [onboardingStatus, setOnboardingStatus] = useState("");

  const [clientName, setClientName] = useState("");
  const [projectBrief, setProjectBrief] = useState("");
  const [budget, setBudget] = useState("");
  const [generatingContract, setGeneratingContract] = useState(false);
  const [contractStatus, setContractStatus] = useState("");
  const [notifications, setNotifications] = useState<string[]>([]);
  const [freelancerSearch, setFreelancerSearch] = useState("");
  const [selectedFreelancerWallet, setSelectedFreelancerWallet] = useState("");
  const [customFreelancerWallet, setCustomFreelancerWallet] = useState("");
  const [contracts, setContracts] = useState<ProductContract[]>([]);
  const [selectedApprovedContractId, setSelectedApprovedContractId] = useState<string | null>(null);

  const registryContract = useMemo(() => {
    return getContract({
      client,
      chain: celoSepolia,
      address: AGENT_REGISTRY_ADDRESS,
      abi: AGENT_REGISTRY_ABI,
    });
  }, []);

  const { data } = useReadContract({
    contract: registryContract,
    method: "getAgents",
    params: [],
  });

  const allAgents = (data as Agent[] | undefined) || [];
  const availableTalent = allAgents.filter((agent, index, arr) => {
    const owner = agent.owner.toLowerCase();
    return index === arr.findIndex((item) => item.owner.toLowerCase() === owner);
  });

  const filteredTalent = availableTalent.filter((agent) => {
    const query = freelancerSearch.toLowerCase().trim();
    if (!query) return true;

    return (
      agent.name.toLowerCase().includes(query) ||
      agent.skill.toLowerCase().includes(query) ||
      agent.location.toLowerCase().includes(query)
    );
  });

  const selectedFreelancer =
    availableTalent.find((agent) => agent.owner.toLowerCase() === selectedFreelancerWallet) ?? null;

  useEffect(() => {
    const savedProfileRaw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (savedProfileRaw) {
      try {
        const parsed = JSON.parse(savedProfileRaw) as ClientProfile;
        setSavedProfile(parsed);
        setCompanyName(parsed.companyName);
        setContactName(parsed.contactName);
        setOperatingFocus(parsed.operatingFocus);
        setClientName(parsed.companyName);
      } catch (error) {
        console.error("Failed to restore client profile", error);
      }
    }

    const savedNotificationsRaw = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    if (savedNotificationsRaw) {
      try {
        setNotifications(JSON.parse(savedNotificationsRaw));
      } catch (error) {
        console.error("Failed to restore notifications", error);
      }
    }
  }, []);

  useEffect(() => {
    if (selectedFreelancer) {
      setCustomFreelancerWallet("");
    }
  }, [selectedFreelancer]);

  useEffect(() => {
    if (!connectedAddress) {
      setContracts([]);
      setSelectedApprovedContractId(null);
      return;
    }

    const syncWorkflow = () => {
      const nextContracts = getContractsForClient(connectedAddress);
      setContracts(nextContracts);

      const approvedContracts = nextContracts.filter((contract) => contract.status === "approved");
      setSelectedApprovedContractId((currentId) => {
        if (currentId && approvedContracts.some((contract) => contract.id === currentId)) {
          return currentId;
        }
        return approvedContracts[0]?.id ?? null;
      });

      const savedNotificationsRaw = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
      if (savedNotificationsRaw) {
        try {
          setNotifications(JSON.parse(savedNotificationsRaw));
        } catch (error) {
          console.error("Failed to restore notifications", error);
        }
      }
    };

    syncWorkflow();
    window.addEventListener("storage", syncWorkflow);
    window.addEventListener(getWorkflowRefreshEventName(), syncWorkflow);

    return () => {
      window.removeEventListener("storage", syncWorkflow);
      window.removeEventListener(getWorkflowRefreshEventName(), syncWorkflow);
    };
  }, [connectedAddress]);

  function saveClientProfile() {
    if (!companyName.trim() || !contactName.trim()) {
      setOnboardingStatus("Add company name and contact name to continue.");
      return;
    }

    const nextProfile = {
      companyName: companyName.trim(),
      contactName: contactName.trim(),
      operatingFocus: operatingFocus.trim() || "AI operations",
    };

    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(nextProfile));
    setSavedProfile(nextProfile);
    setClientName(nextProfile.companyName);
    setOnboardingStatus("Client workspace created.");
  }

  async function handleGenerateContract() {
    if (!clientName || !projectBrief || !budget) {
      setContractStatus("Fill client name, project brief, and budget to generate contract.");
      return;
    }
    if (!connectedAddress) {
      setContractStatus("Connect your wallet first.");
      return;
    }

    const freelancerWallet = selectedFreelancer?.owner?.toLowerCase() || customFreelancerWallet.trim().toLowerCase();
    const freelancerName = selectedFreelancer?.name?.trim() || "Custom freelancer";

    if (!freelancerWallet) {
      setContractStatus("Select a freelancer profile or enter a wallet before generating a contract.");
      return;
    }

    try {
      setGeneratingContract(true);
      setContractStatus("Generating AI contract...");

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
        throw new Error(result?.error || result?.message || "Failed to generate contract.");
      }

      localStorage.setItem(CONTRACT_STORAGE_KEY, JSON.stringify(result));

      const draft = createDraftContract({
        clientWallet: connectedAddress,
        clientName,
        freelancerWallet,
        freelancerName,
        projectBrief,
        budget: Number(budget),
        summary: result.summary,
        milestones: result.milestones,
      });

      appendNotification(`Contract draft created for ${draft.freelancerName}.`);
      setContracts(getContractsForClient(connectedAddress));
      setContractStatus("AI contract generated and saved as draft.");
    } catch (error) {
      console.error(error);
      setContractStatus(error instanceof Error ? error.message : "AI contract generation failed.");
    } finally {
      setGeneratingContract(false);
    }
  }

  function sendContract(contractId: string) {
    const next = updateProductContractStatus(contractId, "sent");
    if (!next) return;
    appendNotification(`Contract sent to ${next.freelancerName} for approval.`);
    setContracts(getContractsForClient(connectedAddress));
    setContractStatus(`Contract sent to ${next.freelancerName}.`);
  }

  const draftContracts = contracts.filter((contract) => contract.status === "draft");
  const sentContracts = contracts.filter((contract) => contract.status === "sent");
  const approvedContracts = contracts.filter((contract) => contract.status === "approved");
  const rejectedContracts = contracts.filter((contract) => contract.status === "rejected");
  const selectedApprovedContract =
    approvedContracts.find((contract) => contract.id === selectedApprovedContractId) ?? null;

  function openEscrowForContract(contractId: string) {
    setSelectedApprovedContractId(contractId);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        document.getElementById("escrow-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  return (
    <main className="min-h-screen bg-[#070707] text-[#f7f4ef]">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
        <header className="border-b border-[#151515] py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[14px] font-semibold tracking-[0.18em]">AGENT GUILD</div>
              <div className="mt-2 text-[12px] uppercase tracking-[0.16em] text-[#f2b6be]">Client workspace</div>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="rounded-[10px] border border-[#262626] px-4 py-2 text-sm font-medium text-[#f7f4ef] transition hover:border-[#3b3b3b]"
              >
                Back to Home
              </Link>
              <Link
                href="/freelancer"
                className="rounded-[10px] border border-[#262626] px-4 py-2 text-sm font-medium text-[#f7f4ef] transition hover:border-[#3b3b3b]"
              >
                Freelancer Workspace
              </Link>
              <ConnectButton client={client} chain={celoSepolia} />
            </div>
          </div>
        </header>

        <section className="py-12 sm:py-16">
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[22px] border border-[#1d1d1d] bg-[radial-gradient(circle_at_top,rgba(215,38,56,0.16),transparent_38%),linear-gradient(180deg,#111111_0%,#0a0a0a_100%)] p-6 sm:p-8">
              <div className="text-[12px] uppercase tracking-[0.16em] text-[#f2b6be]">Client operations</div>
              <h1 className="mt-3 text-[34px] font-semibold tracking-[-0.04em] sm:text-[46px]">
                Manage agreements, escrow, and release from one workspace.
              </h1>
              <p className="mt-4 max-w-[620px] text-[16px] leading-8 text-[#a1a1aa]">
                This workspace is where client-side work happens: identity, contract generation, escrow creation, funding, and final review.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <SummaryCard label="Contract Drafts" value={`${draftContracts.length}`} />
                <SummaryCard label="Sent Contracts" value={`${sentContracts.length}`} />
                <SummaryCard label="Approved Contracts" value={`${approvedContracts.length}`} />
              </div>
            </div>

            <div className="rounded-[22px] border border-[#1d1d1d] bg-[#0d0d0d] p-6 sm:p-8">
              {!savedProfile ? (
                <>
                  <div className="text-[12px] uppercase tracking-[0.16em] text-[#f2b6be]">Onboarding</div>
                  <h2 className="mt-3 text-[26px] font-semibold tracking-[-0.03em]">Create your client workspace</h2>
                  <p className="mt-3 text-[15px] leading-7 text-[#a1a1aa]">
                    Keep this lightweight for now. We only need enough identity to make the workspace feel intentional.
                  </p>

                  <div className="mt-6 grid gap-3">
                    <input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Company or team name"
                      className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                    />
                    <input
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="Primary contact name"
                      className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                    />
                    <input
                      value={operatingFocus}
                      onChange={(e) => setOperatingFocus(e.target.value)}
                      placeholder="What are you hiring for?"
                      className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                    />
                    <button
                      onClick={saveClientProfile}
                      className="rounded-[12px] bg-[#d72638] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b91f30]"
                    >
                      Create Client Workspace
                    </button>
                    {onboardingStatus && (
                      <div className="rounded-[12px] border border-[#1f1f1f] bg-[#090909] px-4 py-3 text-sm text-[#d4d4d8]">
                        {onboardingStatus}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="grid gap-6">
                  <div>
                    <div className="text-[12px] uppercase tracking-[0.16em] text-[#f2b6be]">Profile summary</div>
                    <h2 className="mt-3 text-[26px] font-semibold tracking-[-0.03em]">{savedProfile.companyName}</h2>
                    <p className="mt-3 text-[15px] leading-7 text-[#a1a1aa]">
                      {savedProfile.contactName} is managing hiring and execution. Current focus: {savedProfile.operatingFocus}.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailCard label="Primary contact" value={savedProfile.contactName} />
                    <DetailCard label="Operating focus" value={savedProfile.operatingFocus} />
                  </div>

                  <div className="rounded-[16px] border border-[#1d1d1d] bg-[#090909] p-4">
                    <div className="text-[12px] uppercase tracking-[0.14em] text-[#71717a]">Notifications</div>
                    <div className="mt-3 grid gap-2">
                      {notifications.length === 0 ? (
                        <div className="text-sm text-[#a1a1aa]">No notifications yet. Escrow activity will appear here.</div>
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

        {savedProfile && (
          <>
            <section className="border-t border-[#151515] py-12 sm:py-16">
              <div className="mb-8 max-w-[720px]">
                <div className="text-[12px] uppercase tracking-[0.16em] text-[#f2b6be]">Contract studio</div>
                <h2 className="mt-3 text-[28px] font-semibold tracking-[-0.03em]">
                  Generate the agreement before you move work into escrow.
                </h2>
              </div>

              <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
                <div className="rounded-[18px] border border-[#1d1d1d] bg-[#0d0d0d] p-6">
                  <div className="grid gap-3">
                    <input
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Client name"
                      className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                    />
                    <textarea
                      value={projectBrief}
                      onChange={(e) => setProjectBrief(e.target.value)}
                      rows={5}
                      placeholder="Project description"
                      className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                    />
                    <input
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      placeholder="Budget in USD"
                      className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                    />
                    <button
                      onClick={handleGenerateContract}
                      className="rounded-[12px] bg-[#d72638] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b91f30]"
                    >
                      {generatingContract ? "Generating..." : "Generate And Save Draft"}
                    </button>
                    {contractStatus && (
                      <div className="rounded-[12px] border border-[#1d1d1d] bg-[#090909] px-4 py-3 text-sm text-[#d4d4d8]">
                        {contractStatus}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid gap-6">
                  <div className="rounded-[18px] border border-[#1d1d1d] bg-[#0d0d0d] p-6">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[12px] uppercase tracking-[0.14em] text-[#71717a]">Freelancer selection</div>
                        <div className="mt-2 text-[18px] font-semibold tracking-[-0.03em]">Choose from registry</div>
                      </div>
                      <div className="rounded-full border border-[#1d1d1d] bg-[#090909] px-3 py-1 text-[12px] text-[#a1a1aa]">
                        {availableTalent.length} profiles
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4">
                      <input
                        value={freelancerSearch}
                        onChange={(e) => setFreelancerSearch(e.target.value)}
                        placeholder="Search freelancer by name, skill, or location"
                        className="w-full rounded-[12px] border border-[#242424] bg-[#090909] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                      />

                      <div className="grid max-h-[260px] gap-3 overflow-y-auto pr-1">
                        {filteredTalent.slice(0, 8).map((agent) => {
                          const isSelected = selectedFreelancerWallet === agent.owner.toLowerCase();
                          return (
                            <button
                              key={agent.owner}
                              type="button"
                              onClick={() => setSelectedFreelancerWallet(agent.owner.toLowerCase())}
                              className={`rounded-[14px] border p-4 text-left transition ${
                                isSelected
                                  ? "border-[#6f1d26] bg-[#160b0d]"
                                  : "border-[#1d1d1d] bg-[#090909] hover:border-[#363636]"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-[#f7f4ef]">{agent.name}</div>
                                  <div className="mt-1 text-sm text-[#a1a1aa]">{agent.skill}</div>
                                </div>
                                <div className="rounded-full border border-[#232323] bg-[#0d0d0d] px-3 py-1 text-[11px] text-[#a1a1aa]">
                                  ${agent.hourlyRate.toString()}/hr
                                </div>
                              </div>
                              <div className="mt-3 text-xs text-[#71717a]">
                                {agent.location} • {agent.availability}
                              </div>
                            </button>
                          );
                        })}
                        {filteredTalent.length === 0 && (
                          <div className="rounded-[14px] border border-dashed border-[#242424] bg-[#090909] px-4 py-6 text-sm text-[#a1a1aa]">
                            No matching freelancers found in the registry.
                          </div>
                        )}
                      </div>

                      {selectedFreelancer ? (
                        <div className="rounded-[16px] border border-[#4c1d24] bg-[#160b0d] p-4">
                          <div className="text-[12px] uppercase tracking-[0.14em] text-[#f2b6be]">Selected freelancer</div>
                          <div className="mt-3 text-[18px] font-semibold text-[#f7f4ef]">{selectedFreelancer.name}</div>
                          <div className="mt-2 text-sm text-[#d4d4d8]">{selectedFreelancer.description}</div>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <MetadataPill label="Wallet" value={shortAddress(selectedFreelancer.owner)} />
                            <MetadataPill label="Skill" value={selectedFreelancer.skill} />
                            <MetadataPill label="Rate" value={`$${selectedFreelancer.hourlyRate.toString()}/hr`} />
                            <MetadataPill label="Availability" value={selectedFreelancer.availability} />
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-[16px] border border-[#1d1d1d] bg-[#090909] p-4">
                          <div className="text-[12px] uppercase tracking-[0.14em] text-[#71717a]">Fallback</div>
                          <input
                            value={customFreelancerWallet}
                            onChange={(e) => {
                              setSelectedFreelancerWallet("");
                              setCustomFreelancerWallet(e.target.value);
                            }}
                            placeholder="If needed, enter freelancer wallet manually"
                            className="mt-3 w-full rounded-[12px] border border-[#242424] bg-[#0d0d0d] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#71717a] focus:border-[#6f1d26]"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[18px] border border-[#1d1d1d] bg-[#0d0d0d] p-6">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[12px] uppercase tracking-[0.14em] text-[#71717a]">Contract lifecycle</div>
                        <div className="mt-2 text-[18px] font-semibold tracking-[-0.03em]">Drafts and handoff</div>
                      </div>
                      <div className="rounded-full border border-[#1d1d1d] bg-[#090909] px-3 py-1 text-[12px] text-[#a1a1aa]">
                        {contracts.length} contracts
                      </div>
                    </div>

                    {contracts.length === 0 ? (
                      <p className="mt-6 text-sm text-[#a1a1aa]">
                        Drafts generated here become the basis for freelancer approval before escrow can begin.
                      </p>
                    ) : (
                      <div className="mt-6 grid gap-5">
                        <ContractSection
                          title="Drafts"
                          emptyState="No drafts yet."
                          contracts={draftContracts}
                          variant="client"
                          actionLabel="Send To Freelancer"
                          onAction={sendContract}
                          nextActionLabel="Ready to send"
                        />
                        <ContractSection
                          title="Sent Contracts"
                          emptyState="No sent contracts yet."
                          contracts={sentContracts}
                          variant="client"
                          nextActionLabel="Waiting for freelancer approval"
                        />
                        <ContractSection
                          title="Approved Contracts"
                          emptyState="No approved contracts yet."
                          contracts={approvedContracts}
                          variant="client"
                          selectable
                          selectedId={selectedApprovedContractId}
                          onSelect={setSelectedApprovedContractId}
                          actionLabel="Create Escrow For This Contract"
                          onAction={openEscrowForContract}
                          nextActionLabel="Escrow unlocked"
                        />
                        <ContractSection
                          title="Rejected Contracts"
                          emptyState="No rejected contracts yet."
                          contracts={rejectedContracts}
                          variant="client"
                          nextActionLabel="Needs revision"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section id="escrow-workspace" className="border-t border-[#151515] py-12 sm:py-16">
              <div className="mb-8 max-w-[760px]">
                <div className="text-[12px] uppercase tracking-[0.16em] text-[#f2b6be]">Project execution</div>
                <h2 className="mt-3 text-[28px] font-semibold tracking-[-0.03em]">
                  Create escrow, fund work, review submissions, and release payment.
                </h2>
                <p className="mt-4 text-[15px] leading-7 text-[#a1a1aa]">
                  The blockchain flow is unchanged. Escrow creation is now gated by freelancer approval at the product layer.
                </p>
                {selectedApprovedContract && (
                  <div className="mt-5 rounded-[16px] border border-[#4c1d24] bg-[#160b0d] p-4">
                    <div className="text-[12px] uppercase tracking-[0.14em] text-[#f2b6be]">Ready for escrow</div>
                    <div className="mt-2 text-[20px] font-semibold text-[#f7f4ef]">
                      {selectedApprovedContract.freelancerName} approved this contract
                    </div>
                    <div className="mt-2 text-sm text-[#d4d4d8]">
                      ${selectedApprovedContract.budget} • {selectedApprovedContract.milestones.length} milestones
                    </div>
                  </div>
                )}
              </div>

              <EscrowSimulator selectedRole="client" approvedContract={selectedApprovedContract} />
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

function ContractSection({
  title,
  emptyState,
  contracts,
  variant,
  actionLabel,
  onAction,
  nextActionLabel,
  selectable,
  selectedId,
  onSelect,
}: {
  title: string;
  emptyState: string;
  contracts: ProductContract[];
  variant: "client" | "freelancer";
  actionLabel?: string;
  onAction?: (id: string) => void;
  nextActionLabel?: string;
  selectable?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="rounded-[16px] border border-[#1d1d1d] bg-[#090909] p-4">
      <div className="text-[12px] uppercase tracking-[0.14em] text-[#71717a]">{title}</div>
      {contracts.length === 0 ? (
        <div className="mt-3 text-sm text-[#a1a1aa]">{emptyState}</div>
      ) : (
        <div className="mt-3 grid gap-3">
          {contracts.map((contract) => (
            <div
              key={contract.id}
              onClick={() => selectable && onSelect?.(contract.id)}
              onKeyDown={(event) => {
                if (selectable && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onSelect?.(contract.id);
                }
              }}
              role={selectable ? "button" : undefined}
              tabIndex={selectable ? 0 : undefined}
              className={`rounded-[14px] border p-4 text-left ${
                selectable && selectedId === contract.id
                  ? "border-[#6f1d26] bg-[#160b0d]"
                  : "border-[#1d1d1d] bg-[#0d0d0d]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[#f7f4ef]">
                    {variant === "client" ? contract.freelancerName : contract.clientName}
                  </div>
                  <div className="mt-1 text-xs text-[#71717a]">
                    {variant === "client" ? "Freelancer" : "Client"}
                  </div>
                </div>
                <StatusBadge status={contract.status} />
              </div>
              <div className="mt-2 text-sm text-[#d4d4d8]">{contract.summary}</div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <MetadataPill label="Budget" value={`$${contract.budget}`} />
                <MetadataPill label="Milestones" value={`${contract.milestones.length}`} />
                <MetadataPill
                  label="Next"
                  value={nextActionLabel || (contract.status === "approved" ? "Create escrow" : "In review")}
                />
              </div>
              {actionLabel && onAction && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onAction(contract.id);
                    }}
                    className="inline-flex rounded-[10px] bg-[#d72638] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#b91f30]"
                  >
                    {actionLabel}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ProductContract["status"] }) {
  const tone =
    status === "approved"
      ? "border-[#1f3b28] bg-[#0d1912] text-[#9be2b0]"
      : status === "rejected"
        ? "border-[#4c1d24] bg-[#160b0d] text-[#f2b6be]"
        : status === "sent"
          ? "border-[#3a2d18] bg-[#171108] text-[#f8d28c]"
          : "border-[#242424] bg-[#0d0d0d] text-[#d4d4d8]";

  return (
    <div className={`rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] ${tone}`}>
      {status}
    </div>
  );
}

function MetadataPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-[#1d1d1d] bg-[#0d0d0d] px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-[#71717a]">{label}</div>
      <div className="mt-2 text-[13px] font-medium text-[#f7f4ef]">{value}</div>
    </div>
  );
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
