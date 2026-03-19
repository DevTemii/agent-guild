export type ContractStatus = "draft" | "sent" | "approved" | "rejected";

export type ContractMilestone = {
  title: string;
  amount: number;
};

export type ProductContract = {
  id: string;
  clientWallet: string;
  clientName: string;
  freelancerWallet: string;
  freelancerName: string;
  projectBrief: string;
  budget: number;
  summary: string;
  milestones: ContractMilestone[];
  status: ContractStatus;
  createdAt: string;
  updatedAt: string;
};

const CONTRACTS_STORAGE_KEY = "agent-guild-product-contracts";
const NOTIFICATION_STORAGE_KEY = "agent-guild-notifications";
const WORKFLOW_REFRESH_EVENT = "agent-guild:workflow-refresh";

function nowIso() {
  return new Date().toISOString();
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error(`Failed to parse local storage for ${key}`, error);
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function emitWorkflowRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(WORKFLOW_REFRESH_EVENT));
}

export function getWorkflowRefreshEventName() {
  return WORKFLOW_REFRESH_EVENT;
}

export function getProductContracts() {
  return readJson<ProductContract[]>(CONTRACTS_STORAGE_KEY, []);
}

export function saveProductContracts(contracts: ProductContract[]) {
  writeJson(CONTRACTS_STORAGE_KEY, contracts);
  emitWorkflowRefresh();
}

export function createDraftContract(
  input: Omit<ProductContract, "id" | "status" | "createdAt" | "updatedAt">
) {
  const nextContract: ProductContract = {
    ...input,
    id: crypto.randomUUID(),
    status: "draft",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  saveProductContracts([nextContract, ...getProductContracts()]);
  return nextContract;
}

export function updateProductContractStatus(id: string, status: ContractStatus) {
  const nextContracts = getProductContracts().map((contract) =>
    contract.id === id ? { ...contract, status, updatedAt: nowIso() } : contract
  );
  saveProductContracts(nextContracts);
  return nextContracts.find((contract) => contract.id === id) ?? null;
}

export function getContractsForClient(wallet?: string | null) {
  if (!wallet) return [];
  const address = wallet.toLowerCase();
  return getProductContracts().filter((contract) => contract.clientWallet === address);
}

export function getContractsForFreelancer(wallet?: string | null) {
  if (!wallet) return [];
  const address = wallet.toLowerCase();
  return getProductContracts().filter((contract) => contract.freelancerWallet === address);
}

export function appendNotification(message: string) {
  const next = [message, ...readJson<string[]>(NOTIFICATION_STORAGE_KEY, [])].slice(0, 8);
  writeJson(NOTIFICATION_STORAGE_KEY, next);
  emitWorkflowRefresh();
  return next;
}
