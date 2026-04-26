import type { Account } from "thirdweb/wallets";
import {
  getWalletCacheKey,
} from "./cacheKeys";
import { resolveAgentWalletIdentity, signAgentWalletMessage } from "./walletSession";
import {
  type ContractStatus,
  type ProjectSubmission,
  type ProductContract,
  type WorkflowProjectIndexEntry,
  type WorkflowNotification,
  normalizeContract,
  normalizeNotification,
  normalizeProjectSubmission,
  normalizeWorkflowProjectIndexEntry,
  normalizeWallet,
} from "./workflowTypes";

export type {
  ContractMilestone,
  ContractStatus,
  LegacyProductContract,
  ProjectSubmission,
  ProductContract,
  WorkflowProjectIndexEntry,
  WorkflowNotification,
} from "./workflowTypes";
export { normalizeWallet } from "./workflowTypes";

const LEGACY_CONTRACTS_STORAGE_KEY = "agent-guild-product-contracts";
const LEGACY_NOTIFICATION_STORAGE_KEY_PREFIX = "agent-guild-notifications";
const CONTRACT_CACHE_STORAGE_KEY_PREFIX = "agent-guild-contract-cache";
const NOTIFICATION_CACHE_STORAGE_KEY_PREFIX = "agent-guild-notification-cache";
const PROJECT_INDEX_CACHE_STORAGE_KEY_PREFIX = "agent-guild-project-index-cache";
const MIGRATION_MARKER_STORAGE_KEY_PREFIX = "agent-guild-workflow-migrated";
const WORKFLOW_REFRESH_EVENT = "agent-guild:workflow-refresh";

const cachedContractsByWallet = new Map<string, ProductContract[]>();
const cachedNotificationsByWallet = new Map<string, string[]>();
const cachedProjectsByWallet = new Map<string, WorkflowProjectIndexEntry[]>();

type WorkflowSnapshot = {
  contracts: ProductContract[];
  notifications: string[];
};

type WorkflowProjectSnapshot = {
  projects: WorkflowProjectIndexEntry[];
};

export type WorkflowChallengeDebugContext = {
  title?: string;
  description?: string;
  amount?: string;
  amountWei?: string;
  chainId?: number | null;
  role?: string;
  timestamp?: string;
};

export type WorkflowSessionDebugResult = {
  wallet: string;
  chainId: number | null;
  amountRawValue: string | null;
  amountWei: string | null;
  parsedAmount: string | null;
  stage: string;
  usedExistingSession: boolean;
  sessionMode: "verified" | "fallback";
  reason: string | null;
  challengeResponse: {
    tokenPresent: boolean;
    message?: string;
  } | null;
};

function getWalletScopedStorageKey(prefix: string, wallet?: string | null) {
  return getWalletCacheKey(prefix, wallet);
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

function setCachedProjects(wallet: string, projects: WorkflowProjectIndexEntry[]) {
  const normalizedWallet = normalizeWallet(wallet);
  if (!normalizedWallet) return [];

  const nextProjects = projects
    .map((entry) => normalizeWorkflowProjectIndexEntry(entry))
    .filter((entry): entry is WorkflowProjectIndexEntry => entry !== null);

  cachedProjectsByWallet.set(normalizedWallet, nextProjects);
  const storageKey = getWalletScopedStorageKey(
    PROJECT_INDEX_CACHE_STORAGE_KEY_PREFIX,
    normalizedWallet
  );
  if (storageKey) {
    writeJson(storageKey, nextProjects);
  }

  return nextProjects;
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

function getCachedProjectsForWallet(wallet?: string | null) {
  const normalizedWallet = normalizeWallet(wallet);
  if (!normalizedWallet) return [];

  const memoryProjects = cachedProjectsByWallet.get(normalizedWallet);
  if (memoryProjects) {
    return memoryProjects;
  }

  const storageKey = getWalletScopedStorageKey(
    PROJECT_INDEX_CACHE_STORAGE_KEY_PREFIX,
    normalizedWallet
  );
  if (!storageKey) return [];

  const storedProjects = readJson<WorkflowProjectIndexEntry[]>(storageKey, [])
    .map((entry) => normalizeWorkflowProjectIndexEntry(entry))
    .filter((entry): entry is WorkflowProjectIndexEntry => entry !== null);
  cachedProjectsByWallet.set(normalizedWallet, storedProjects);
  return storedProjects;
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

async function resolveWorkflowWalletAddress(account?: Account | null) {
  const walletIdentity = await resolveAgentWalletIdentity(account);
  return normalizeWallet(walletIdentity.address);
}

async function ensureBackendWorkflowSession(
  account?: Account | null,
  debugContext?: WorkflowChallengeDebugContext
) {
  const connectedWallet = await resolveWorkflowWalletAddress(account);
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
      return {
        wallet: connectedWallet,
        chainId: debugContext?.chainId ?? null,
        amountRawValue: debugContext?.amount?.trim() || null,
        amountWei: debugContext?.amountWei?.trim() || null,
        parsedAmount: null,
        stage: "session_initialized",
        usedExistingSession: true,
        sessionMode: "verified",
        reason: null,
        challengeResponse: null,
      } satisfies WorkflowSessionDebugResult;
    }

    if (sessionWallet && sessionWallet !== connectedWallet) {
      await fetch("/api/workflow/session", { method: "DELETE" });
    }
  }

  const challengeResponse = await fetch("/api/workflow/session/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: connectedWallet,
    }),
  });

  const challenge = (await challengeResponse.json()) as {
    success?: boolean;
    stage?: string;
    error?: string;
    token?: string;
    message?: string;
    parsedAmount?: string | null;
    amountRawValue?: string | null;
    amountWei?: string | null;
    chainId?: number | null;
    fallback?: {
      sessionMode?: "fallback";
      reason?: string | null;
    } | null;
  };

  if (!challengeResponse.ok) {
    if (challenge.fallback?.sessionMode === "fallback") {
      return {
        wallet: connectedWallet,
        chainId: challenge.chainId ?? debugContext?.chainId ?? null,
        amountRawValue: challenge.amountRawValue ?? debugContext?.amount?.trim() ?? null,
        amountWei: challenge.amountWei ?? debugContext?.amountWei?.trim() ?? null,
        parsedAmount: challenge.parsedAmount ?? null,
        stage: challenge.stage ?? "fallback_generated",
        usedExistingSession: false,
        sessionMode: "fallback",
        reason: challenge.fallback.reason ?? challenge.error ?? "workflow session fallback",
        challengeResponse: null,
      } satisfies WorkflowSessionDebugResult;
    }

    throw new Error(
      challenge.error ||
        (await parseErrorMessage(
          challengeResponse,
          "Could not start a secure wallet session for this action."
        ))
    );
  }

  if (!challenge.success && challenge.fallback?.sessionMode === "fallback") {
    return {
      wallet: connectedWallet,
      chainId: challenge.chainId ?? debugContext?.chainId ?? null,
      amountRawValue: challenge.amountRawValue ?? debugContext?.amount?.trim() ?? null,
      amountWei: challenge.amountWei ?? debugContext?.amountWei?.trim() ?? null,
      parsedAmount: challenge.parsedAmount ?? null,
      stage: challenge.stage ?? "fallback_generated",
      usedExistingSession: false,
      sessionMode: "fallback",
      reason: challenge.fallback.reason ?? challenge.error ?? "workflow session fallback",
      challengeResponse: null,
    } satisfies WorkflowSessionDebugResult;
  }

  if (!challenge.token || !challenge.message) {
    return {
      wallet: connectedWallet,
      chainId: challenge.chainId ?? debugContext?.chainId ?? null,
      amountRawValue: challenge.amountRawValue ?? debugContext?.amount?.trim() ?? null,
      amountWei: challenge.amountWei ?? debugContext?.amountWei?.trim() ?? null,
      parsedAmount: challenge.parsedAmount ?? null,
      stage: challenge.stage ?? "fallback_generated",
      usedExistingSession: false,
      sessionMode: "fallback",
      reason: challenge.error ?? "workflow challenge missing token",
      challengeResponse: null,
    } satisfies WorkflowSessionDebugResult;
  }

  const signature = await signAgentWalletMessage({
    account,
    message: challenge.message,
  });

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
    return {
      wallet: connectedWallet,
      chainId: challenge.chainId ?? debugContext?.chainId ?? null,
      amountRawValue: challenge.amountRawValue ?? debugContext?.amount?.trim() ?? null,
      amountWei: challenge.amountWei ?? debugContext?.amountWei?.trim() ?? null,
      parsedAmount: challenge.parsedAmount ?? null,
      stage: "fallback_generated",
      usedExistingSession: false,
      sessionMode: "fallback",
      reason: await parseErrorMessage(
        verifyResponse,
        "Could not verify the secure wallet session for this action."
      ),
      challengeResponse: {
        tokenPresent: Boolean(challenge.token),
        message: challenge.message,
      },
    } satisfies WorkflowSessionDebugResult;
  }

  return {
    wallet: connectedWallet,
    chainId: challenge.chainId ?? debugContext?.chainId ?? null,
    amountRawValue: challenge.amountRawValue ?? debugContext?.amount?.trim() ?? null,
    amountWei: challenge.amountWei ?? debugContext?.amountWei?.trim() ?? null,
    parsedAmount: challenge.parsedAmount ?? null,
    stage: challenge.stage ?? "challenge_created",
    usedExistingSession: false,
    sessionMode: "verified",
    reason: null,
    challengeResponse: {
      tokenPresent: Boolean(challenge.token),
      message: challenge.message,
    },
  } satisfies WorkflowSessionDebugResult;
}

async function importLegacyWorkflowIfNeeded(account?: Account | null) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedWallet = await resolveWorkflowWalletAddress(account);
  if (!normalizedWallet) {
    return;
  }
  const markerKey = getMigrationMarkerKey(normalizedWallet);
  if (!markerKey || window.localStorage.getItem(markerKey) === "done") {
    return;
  }

  const legacyContracts = getLegacyContracts().filter((contract) => {
    return (
      contract.clientWallet === normalizedWallet || contract.freelancerWallet === normalizedWallet
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
  const wallet = await resolveWorkflowWalletAddress(account);
  if (!wallet) {
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
  const wallet = await resolveWorkflowWalletAddress(account);
  if (!wallet) {
    return {
      contracts: [],
      notifications: [],
    } satisfies WorkflowSnapshot;
  }

  try {
    const snapshot = await fetchWorkflowSnapshot(account);
    return hydrateWorkflowSnapshot(wallet, snapshot);
  } catch (error) {
    console.error("Failed to refresh workflow snapshot", error);
    return {
      contracts: getCachedContractsForWallet(wallet),
      notifications: getCachedNotificationsForWallet(wallet),
    } satisfies WorkflowSnapshot;
  }
}

async function fetchWorkflowProjects(account?: Account | null) {
  const wallet = await resolveWorkflowWalletAddress(account);
  if (!wallet) {
    return {
      projects: [],
    } satisfies WorkflowProjectSnapshot;
  }

  await ensureBackendWorkflowSession(account);
  await importLegacyWorkflowIfNeeded(account);

  const response = await fetch("/api/workflow/projects", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to load workflow projects."));
  }

  const payload = (await response.json()) as {
    projects: WorkflowProjectIndexEntry[];
  };

  return {
    projects: (payload.projects ?? [])
      .map((entry) => normalizeWorkflowProjectIndexEntry(entry))
      .filter((entry): entry is WorkflowProjectIndexEntry => entry !== null),
  } satisfies WorkflowProjectSnapshot;
}

async function refreshWorkflowProjects(account?: Account | null) {
  const wallet = await resolveWorkflowWalletAddress(account);
  if (!wallet) {
    return {
      projects: [],
    } satisfies WorkflowProjectSnapshot;
  }

  try {
    const snapshot = await fetchWorkflowProjects(account);
    setCachedProjects(wallet, snapshot.projects);
    emitWorkflowRefresh();
    return snapshot;
  } catch (error) {
    console.error("Failed to refresh workflow projects", error);
    return {
      projects: getCachedProjectsForWallet(wallet),
    } satisfies WorkflowProjectSnapshot;
  }
}

async function postWorkflowMutation<T>(
  account: Account | null | undefined,
  input: {
    path: string;
    body?: unknown;
  }
) {
  const wallet = await resolveWorkflowWalletAddress(account);
  if (!wallet) {
    throw new Error("Reconnect Wallet");
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

function isLocalWorkflowDraftId(id: string) {
  return id.startsWith("local-");
}

function buildDraftContractInputFromContract(
  contract: ProductContract
): Omit<ProductContract, "id" | "status" | "createdAt" | "updatedAt"> {
  return {
    clientWallet: contract.clientWallet,
    clientName: contract.clientName,
    freelancerWallet: contract.freelancerWallet,
    freelancerName: contract.freelancerName,
    projectBrief: contract.projectBrief,
    displayBudget: contract.displayBudget,
    settlementAmountCelo: contract.settlementAmountCelo,
    summary: contract.summary,
    milestones: contract.milestones,
    linkedProjectId: contract.linkedProjectId ?? null,
  };
}

function replaceLocalDraftCache(localDraftId: string, remoteDraft: ProductContract) {
  const wallet = normalizeWallet(remoteDraft.clientWallet);
  if (!wallet) {
    return;
  }

  const currentContracts = getCachedContractsForWallet(wallet);
  const nextContracts = [
    remoteDraft,
    ...currentContracts.filter(
      (contract) => contract.id !== localDraftId && contract.id !== remoteDraft.id
    ),
  ];

  setCachedContracts(wallet, nextContracts);
  emitWorkflowRefresh();
}

export function getWorkflowRefreshEventName() {
  return WORKFLOW_REFRESH_EVENT;
}

export async function syncWorkflowState(account?: Account | null) {
  return refreshWorkflowSnapshot(account);
}

export async function syncWorkflowProjects(account?: Account | null) {
  return refreshWorkflowProjects(account);
}

export async function ensureWorkflowSessionForAction(
  account: Account | null | undefined,
  debugContext: WorkflowChallengeDebugContext
) {
  return ensureBackendWorkflowSession(account, debugContext);
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

export function createLocalDraftContractFallback(
  input: Omit<ProductContract, "id" | "status" | "createdAt" | "updatedAt">
) {
  const draft: ProductContract = normalizeContract({
    ...input,
    id: `local-${crypto.randomUUID()}`,
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const contracts = getCachedContractsForWallet(input.clientWallet);
  setCachedContracts(input.clientWallet, [draft, ...contracts]);
  appendNotificationForWallet(
    input.clientWallet,
    `Local fallback draft created for ${input.freelancerName}.`
  );
  emitWorkflowRefresh();
  return draft;
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
  if (isLocalWorkflowDraftId(id)) {
    const localDraft = getProductContractById(id);
    if (!localDraft) {
      throw new Error("This draft only exists on this device. Recreate the deal and try again.");
    }

    const remoteDraft = await createDraftContract(
      buildDraftContractInputFromContract(localDraft),
      account
    );
    replaceLocalDraftCache(id, remoteDraft);

    return postWorkflowMutation<ProductContract>(account, {
      path: `/api/workflow/contracts/${remoteDraft.id}/send`,
    });
  }

  return postWorkflowMutation<ProductContract>(account, {
    path: `/api/workflow/contracts/${id}/send`,
  });
}

export async function getProjectSubmission(
  projectId: number,
  account: Account | null | undefined
) {
  if (!account) {
    return null;
  }

  await ensureBackendWorkflowSession(account);

  const response = await fetch(`/api/workflow/projects/${projectId}/submission`, {
    cache: "no-store",
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }

    const message = await parseErrorMessage(
      response,
      "Failed to load project submission."
    );
    if (response.status === 400 && message.toLowerCase().includes("not found")) {
      return null;
    }
    throw new Error(message);
  }

  const payload = (await response.json()) as {
    submission?: ProjectSubmission | null;
  };

  return payload.submission ? normalizeProjectSubmission(payload.submission) : null;
}

export async function saveProjectSubmission(
  input: {
    projectId: number;
    deliveryUrl: string;
    clientWallet: string;
    freelancerWallet: string;
    txHash?: string | null;
  },
  account: Account | null | undefined
) {
  return postWorkflowMutation<ProjectSubmission>(account, {
    path: `/api/workflow/projects/${input.projectId}/submission`,
    body: input,
  }).then((submission) => normalizeProjectSubmission(submission));
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

export function getIndexedProjectsForWallet(wallet?: string | null) {
  return getCachedProjectsForWallet(wallet);
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
