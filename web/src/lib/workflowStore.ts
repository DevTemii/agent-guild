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
const NOTIFICATION_STORAGE_KEY_PREFIX = "agent-guild-notifications";
const WORKFLOW_REFRESH_EVENT = "agent-guild:workflow-refresh";

function nowIso() {
  return new Date().toISOString();
}

function normalizeWallet(wallet?: string | null) {
  return wallet?.trim().toLowerCase() ?? "";
}

function getNotificationStorageKey(wallet?: string | null) {
  const address = normalizeWallet(wallet);
  return address ? `${NOTIFICATION_STORAGE_KEY_PREFIX}:${address}` : null;
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
    clientWallet: normalizeWallet(input.clientWallet),
    freelancerWallet: normalizeWallet(input.freelancerWallet),
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

export function sendProductContract(id: string) {
  const contract = getProductContracts().find((entry) => entry.id === id) ?? null;
  if (!contract || !normalizeWallet(contract.freelancerWallet)) return null;
  return updateProductContractStatus(id, "sent");
}

export function getContractsForClient(wallet?: string | null) {
  const address = normalizeWallet(wallet);
  if (!address) return [];
  return getProductContracts().filter(
    (contract) => normalizeWallet(contract.clientWallet) === address
  );
}

export function getContractsForFreelancer(wallet?: string | null) {
  const address = normalizeWallet(wallet);
  if (!address) return [];
  return getProductContracts().filter(
    (contract) => normalizeWallet(contract.freelancerWallet) === address
  );
}

export function getPendingContractsForFreelancer(wallet?: string | null) {
  return getContractsForFreelancer(wallet).filter((contract) => contract.status === "sent");
}

export function getNotificationsForWallet(wallet?: string | null) {
  const storageKey = getNotificationStorageKey(wallet);
  if (!storageKey) return [];
  return readJson<string[]>(storageKey, []);
}

export function saveNotificationsForWallet(wallet: string, notifications: string[]) {
  const storageKey = getNotificationStorageKey(wallet);
  if (!storageKey) return [];

  const next = notifications.slice(0, 8);
  writeJson(storageKey, next);
  emitWorkflowRefresh();
  return next;
}

export function appendNotificationForWallet(wallet: string | null | undefined, message: string) {
  const address = normalizeWallet(wallet);
  if (!address) return [];
  return saveNotificationsForWallet(address, [message, ...getNotificationsForWallet(address)]);
}

export function appendNotifications(
  entries: Array<{
    wallet?: string | null;
    message: string;
  }>
) {
  const grouped = new Map<string, string[]>();

  entries.forEach(({ wallet, message }) => {
    const address = normalizeWallet(wallet);
    if (!address) return;

    const existing = grouped.get(address) ?? getNotificationsForWallet(address);
    grouped.set(address, [message, ...existing].slice(0, 8));
  });

  grouped.forEach((notifications, address) => {
    const storageKey = getNotificationStorageKey(address);
    if (!storageKey) return;
    writeJson(storageKey, notifications);
  });

  if (grouped.size > 0) {
    emitWorkflowRefresh();
  }
}
