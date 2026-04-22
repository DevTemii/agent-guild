import type { Account } from "thirdweb/wallets";
import {
  type ContractStatus,
  type ProductContract,
  type WorkflowNotification,
  normalizeContract,
  normalizeNotification,
  normalizeWallet,
} from "./workflowTypes";

export type {
  ContractMilestone,
  ContractStatus,
  LegacyProductContract,
  ProductContract,
  WorkflowNotification,
} from "./workflowTypes";
export { normalizeWallet } from "./workflowTypes";

const LEGACY_CONTRACTS_STORAGE_KEY = "agent-guild-product-contracts";
const LEGACY_NOTIFICATION_STORAGE_KEY_PREFIX = "agent-guild-notifications";
const CONTRACT_CACHE_STORAGE_KEY_PREFIX = "agent-guild-contract-cache";
const NOTIFICATION_CACHE_STORAGE_KEY_PREFIX = "agent-guild-notification-cache";
const MIGRATION_MARKER_STORAGE_KEY_PREFIX = "agent-guild-workflow-migrated";
const WORKFLOW_REFRESH_EVENT = "agent-guild:workflow-refresh";

const cachedContractsByWallet = new Map<string, ProductContract[]>();
const cachedNotificationsByWallet = new Map<string, string[]>();

type WorkflowSnapshot = {
  contracts: ProductContract[];
  notifications: string[];
};

function getWalletScopedStorageKey(prefix: string, wallet?: string | null) {
  const normalizedWallet = normalizeWallet(wallet);
  return normalizedWallet ? `${prefix}:${normalizedWallet}` : null;
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

function setCachedContracts(wallet: string, contracts: ProductContract[]) {
  const normalizedWallet = normalizeWallet(wallet);
  if (!normalizedWallet) return [];

  const nextContracts = contracts.map(normalizeContract);
  cachedContractsByWallet.set(normalizedWallet, nextContracts);
  const storageKey = getWalletScopedStorageKey(
    CONTRACT_CACHE_STORAGE_KEY_PREFIX,
    normalizedWallet
  );
  if (storageKey) {
    writeJson(storageKey, nextContracts);
  }
  return nextContracts;
}

function setCachedNotifications(wallet: string, notifications: string[]) {
  const normalizedWallet = normalizeWallet(wallet);
  if (!normalizedWallet) return [];

  const nextNotifications = notifications.slice(0, 12);
  cachedNotificationsByWallet.set(normalizedWallet, nextNotifications);
  const storageKey = getWalletScopedStorageKey(
    NOTIFICATION_CACHE_STORAGE_KEY_PREFIX,
    normalizedWallet
  );
  if (storageKey) {
    writeJson(storageKey, nextNotifications);
  }
  return nextNotifications;
}

function getCachedContractsForWallet(wallet?: string | null) {
  const normalizedWallet = normalizeWallet(wallet);
  if (!normalizedWallet) return [];

  const memoryContracts = cachedContractsByWallet.get(normalizedWallet);
  if (memoryContracts) {
    return memoryContracts;
  }

  const storageKey = getWalletScopedStorageKey(
    CONTRACT_CACHE_STORAGE_KEY_PREFIX,
    normalizedWallet
  );
  if (!storageKey) return [];

  const storedContracts = readJson<ProductContract[]>(storageKey, []).map(normalizeContract);
  cachedContractsByWallet.set(normalizedWallet, storedContracts);
  return storedContracts;
}

function getCachedNotificationsForWallet(wallet?: string | null) {
  const normalizedWallet = normalizeWallet(wallet);
  if (!normalizedWallet) return [];

  const memoryNotifications = cachedNotificationsByWallet.get(normalizedWallet);
  if (memoryNotifications) {
    return memoryNotifications;
  }

  const storageKey = getWalletScopedStorageKey(
    NOTIFICATION_CACHE_STORAGE_KEY_PREFIX,
    normalizedWallet
  );
  if (!storageKey) return [];

  const storedNotifications = readJson<string[]>(storageKey, []);
  cachedNotificationsByWallet.set(normalizedWallet, storedNotifications);
  return storedNotifications;
}

function hydrateWorkflowSnapshot(wallet: string, snapshot: WorkflowSnapshot) {
  setCachedContracts(wallet, snapshot.contracts);
  setCachedNotifications(wallet, snapshot.notifications);
  emitWorkflowRefresh();
  return snapshot;
}

function getLegacyContracts() {
  return readJson<ProductContract[]>(LEGACY_CONTRACTS_STORAGE_KEY, []).map(normalizeContract);
}

function getLegacyNotificationsForWallet(wallet?: string | null) {
  const storageKey = getWalletScopedStorageKey(
    LEGACY_NOTIFICATION_STORAGE_KEY_PREFIX,
    wallet
  );
  if (!storageKey) return [];
  return readJson<string[]>(storageKey, []);
}

function getMigrationMarkerKey(wallet?: string | null) {
  return getWalletScopedStorageKey(MIGRATION_MARKER_STORAGE_KEY_PREFIX, wallet);
}

async function parseErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error || fallback;
  } catch {
    return fallback;
  }
}

async function ensureBackendWorkflowSession(account?: Account | null) {
  if (!account) return false;

  const connectedWallet = normalizeWallet(account.address);
  if (!connectedWallet) {
    return false;
  }

  const sessionResponse = await fetch("/api/workflow/session", {
    cache: "no-store",
  });

  if (sessionResponse.ok) {
    const session = (await sessionResponse.json()) as { wallet?: string | null };
    const sessionWallet = normalizeWallet(session.wallet);
    if (sessionWallet === connectedWallet) {
      return true;
    }

    if (sessionWallet && sessionWallet !== connectedWallet) {
      await fetch("/api/workflow/session", { method: "DELETE" });
    }
  }

  const challengeResponse = await fetch("/api/workflow/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet: connectedWallet }),
  });

  if (!challengeResponse.ok) {
    throw new Error(await parseErrorMessage(challengeResponse, "Failed to create workflow challenge."));
  }

  const challenge = (await challengeResponse.json()) as {
    token: string;
    message: string;
  };

  const signature = await account.signMessage({ message: challenge.message });

  const verifyResponse = await fetch("/api/workflow/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: connectedWallet,
      challengeToken: challenge.token,
      signature,
    }),
  });

  if (!verifyResponse.ok) {
    throw new Error(await parseErrorMessage(verifyResponse, "Failed to verify workflow session."));
  }

  return true;
}

async function importLegacyWorkflowIfNeeded(account?: Account | null) {
  if (!account || typeof window === "undefined") {
    return;
  }

  const normalizedWallet = normalizeWallet(account.address);
  const markerKey = getMigrationMarkerKey(normalizedWallet);
  if (!markerKey || window.localStorage.getItem(markerKey) === "done") {
    return;
  }

  const legacyContracts = getLegacyContracts().filter((contract) => {
    const wallet = normalizeWallet(account.address);
    return (
      contract.clientWallet === wallet || contract.freelancerWallet === wallet
    );
  });
  const legacyNotifications = getLegacyNotificationsForWallet(normalizedWallet).map(
    (message) =>
      normalizeNotification({
        id: crypto.randomUUID(),
        wallet: normalizedWallet,
        message,
        createdAt: new Date().toISOString(),
      })
  );

  if (legacyContracts.length === 0 && legacyNotifications.every((entry) => entry === null)) {
    window.localStorage.setItem(markerKey, "done");
    return;
  }

  const response = await fetch("/api/workflow/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contracts: legacyContracts,
      notifications: legacyNotifications.filter(
        (entry): entry is WorkflowNotification => entry !== null
      ),
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to import legacy workflow."));
  }

  window.localStorage.setItem(markerKey, "done");
}

async function fetchWorkflowSnapshot(account?: Account | null) {
  if (!account) {
    return {
      contracts: [],
      notifications: [],
    } satisfies WorkflowSnapshot;
  }

  await ensureBackendWorkflowSession(account);
  await importLegacyWorkflowIfNeeded(account);

  const response = await fetch("/api/workflow/state", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to load workflow state."));
  }

  const payload = (await response.json()) as {
    contracts: ProductContract[];
    notifications: WorkflowNotification[];
  };

  return {
    contracts: (payload.contracts ?? []).map(normalizeContract),
    notifications: (payload.notifications ?? []).map((entry) => entry.message),
  } satisfies WorkflowSnapshot;
}

async function refreshWorkflowSnapshot(account?: Account | null) {
  if (!account) {
    return {
      contracts: [],
      notifications: [],
    } satisfies WorkflowSnapshot;
  }

  try {
    const snapshot = await fetchWorkflowSnapshot(account);
    return hydrateWorkflowSnapshot(account.address, snapshot);
  } catch (error) {
    console.error("Failed to refresh workflow snapshot", error);
    return {
      contracts: getCachedContractsForWallet(account.address),
      notifications: getCachedNotificationsForWallet(account.address),
    } satisfies WorkflowSnapshot;
  }
}

async function postWorkflowMutation<T>(
  account: Account | null | undefined,
  input: {
    path: string;
    body?: unknown;
  }
) {
  if (!account) {
    throw new Error("Connect your wallet first.");
  }

  await ensureBackendWorkflowSession(account);

  const response = await fetch(input.path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Workflow request failed."));
  }

  const payload = (await response.json()) as T;
  await refreshWorkflowSnapshot(account);
  return payload;
}

export function getWorkflowRefreshEventName() {
  return WORKFLOW_REFRESH_EVENT;
}

export async function syncWorkflowState(account?: Account | null) {
  return refreshWorkflowSnapshot(account);
}

export function getProductContracts(wallet?: string | null) {
  return getCachedContractsForWallet(wallet);
}

export function getProductContractById(id: string) {
  for (const contracts of cachedContractsByWallet.values()) {
    const match = contracts.find((contract) => contract.id === id);
    if (match) {
      return match;
    }
  }

  if (typeof window === "undefined") {
    return null;
  }

  for (let index = 0; index < window.localStorage.length; index++) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(CONTRACT_CACHE_STORAGE_KEY_PREFIX)) {
      continue;
    }

    const contracts = readJson<ProductContract[]>(key, []).map(normalizeContract);
    const match = contracts.find((contract) => contract.id === id);
    if (match) {
      return match;
    }
  }

  return null;
}

export function getProductContractByLinkedProjectId(projectId?: number | null) {
  if (typeof projectId !== "number" || !Number.isInteger(projectId) || projectId < 1) {
    return null;
  }

  for (const contracts of cachedContractsByWallet.values()) {
    const match =
      contracts.find((contract) => (contract.linkedProjectId ?? null) === projectId) ?? null;
    if (match) {
      return match;
    }
  }

  if (typeof window === "undefined") {
    return null;
  }

  for (let index = 0; index < window.localStorage.length; index++) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(CONTRACT_CACHE_STORAGE_KEY_PREFIX)) {
      continue;
    }

    const contracts = readJson<ProductContract[]>(key, []).map(normalizeContract);
    const match =
      contracts.find((contract) => (contract.linkedProjectId ?? null) === projectId) ?? null;
    if (match) {
      return match;
    }
  }

  return null;
}

export async function createDraftContract(
  input: Omit<ProductContract, "id" | "status" | "createdAt" | "updatedAt">,
  account: Account | null | undefined
) {
  return postWorkflowMutation<ProductContract>(account, {
    path: "/api/workflow/contracts",
    body: input,
  });
}

export async function updateProductContractStatus(
  id: string,
  status: ContractStatus,
  account: Account | null | undefined
) {
  if (status !== "approved" && status !== "rejected") {
    throw new Error("Only freelancer approval or rejection is supported through this action.");
  }

  return postWorkflowMutation<ProductContract>(account, {
    path: `/api/workflow/contracts/${id}/respond`,
    body: { status },
  });
}

export async function updateProductContractSettlementAmount(
  id: string,
  settlementAmountCelo: string,
  account: Account | null | undefined
) {
  return postWorkflowMutation<ProductContract>(account, {
    path: `/api/workflow/contracts/${id}/settlement`,
    body: { settlementAmountCelo },
  });
}

export async function linkProductContractToProject(
  id: string,
  projectId: number,
  account: Account | null | undefined
) {
  return postWorkflowMutation<ProductContract>(account, {
    path: `/api/workflow/contracts/${id}/link-project`,
    body: { projectId },
  });
}

export async function sendProductContract(
  id: string,
  account: Account | null | undefined
) {
  return postWorkflowMutation<ProductContract>(account, {
    path: `/api/workflow/contracts/${id}/send`,
  });
}

export function getContractsForClient(wallet?: string | null) {
  const address = normalizeWallet(wallet);
  if (!address) return [];
  return getCachedContractsForWallet(address).filter(
    (contract) => normalizeWallet(contract.clientWallet) === address
  );
}

export function getContractsForFreelancer(wallet?: string | null) {
  const address = normalizeWallet(wallet);
  if (!address) return [];
  return getCachedContractsForWallet(address).filter(
    (contract) => normalizeWallet(contract.freelancerWallet) === address
  );
}

export function getPendingContractsForFreelancer(wallet?: string | null) {
  return getContractsForFreelancer(wallet).filter((contract) => contract.status === "sent");
}

export function getNotificationsForWallet(wallet?: string | null) {
  return getCachedNotificationsForWallet(wallet);
}

export function saveNotificationsForWallet(wallet: string, notifications: string[]) {
  const nextNotifications = setCachedNotifications(wallet, notifications);
  emitWorkflowRefresh();
  return nextNotifications;
}

export function appendNotificationForWallet(wallet: string | null | undefined, message: string) {
  const address = normalizeWallet(wallet);
  if (!address) return [];

  return saveNotificationsForWallet(address, [
    message,
    ...getCachedNotificationsForWallet(address),
  ]);
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

    const existing = grouped.get(address) ?? getCachedNotificationsForWallet(address);
    grouped.set(address, [message, ...existing].slice(0, 12));
  });

  grouped.forEach((notifications, address) => {
    setCachedNotifications(address, notifications);
  });

  if (grouped.size > 0) {
    emitWorkflowRefresh();
  }
}
