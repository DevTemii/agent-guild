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

const CONTRACT_CACHE_STORAGE_KEY_PREFIX = "agent-guild-contract-cache";
const NOTIFICATION_CACHE_STORAGE_KEY_PREFIX = "agent-guild-notification-cache";
const PROJECT_INDEX_CACHE_STORAGE_KEY_PREFIX = "agent-guild-project-index-cache";
const WORKFLOW_SESSION_STORAGE_KEY_PREFIX = "agent-guild-workflow-session";
const WORKFLOW_REFRESH_EVENT = "agent-guild:workflow-refresh";

const cachedContractsByWallet = new Map<string, ProductContract[]>();
const cachedNotificationsByWallet = new Map<string, string[]>();
const cachedProjectsByWallet = new Map<string, WorkflowProjectIndexEntry[]>();
const cachedWorkflowSessionsByWallet = new Map<string, WorkflowClientSessionState>();
const workflowSessionInitPromises = new Map<string, Promise<WorkflowSessionDebugResult | false>>();
let lastWorkflowBackendStoreType: "database" | "memory" | null = null;
let lastWorkflowSyncAt: string | null = null;

type WorkflowSnapshot = {
  contracts: ProductContract[];
  notifications: string[];
};

type WorkflowProjectSnapshot = {
  projects: WorkflowProjectIndexEntry[];
};

export type WorkflowDebugSnapshot = {
  storeType: "database" | "memory" | null;
  lastSyncAt: string | null;
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

export type WorkflowClientSessionState = {
  wallet: string;
  sessionExists: boolean;
  sessionId: string | null;
  sessionInitialized: boolean;
  sessionRestoredFromStorage: boolean;
  sessionExpired: boolean;
  lastSessionError: string | null;
  initializedAt: string | null;
  expiresAt: number | null;
};

export type SendDealMutationResult = {
  contract: ProductContract;
  debug: {
    url: string;
    contractId: string;
    requestPayload: string;
    responseStatus: number;
    responseOk: boolean;
    responseBody: string;
  };
};

export type CreateWorkflowContractInput = {
  title: string;
  description: string;
  amount: string;
  amountWei: string;
  clientWallet: string;
  clientName: string;
  freelancerWallet: string;
  freelancerName: string;
  projectBrief: string;
  displayBudgetAmountUsd: string;
  chainId: number;
};

function getWalletScopedStorageKey(prefix: string, wallet?: string | null) {
  return getWalletCacheKey(prefix, wallet);
}

function getWorkflowSessionStorageKey(wallet?: string | null) {
  return getWalletScopedStorageKey(WORKFLOW_SESSION_STORAGE_KEY_PREFIX, wallet);
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

function getWorkflowSessionState(wallet?: string | null) {
  const normalizedWallet = normalizeWallet(wallet);
  if (!normalizedWallet) {
    return null;
  }

  const cachedState = cachedWorkflowSessionsByWallet.get(normalizedWallet);
  if (cachedState) {
    return cachedState;
  }

  const storageKey = getWorkflowSessionStorageKey(normalizedWallet);
  if (!storageKey) {
    return null;
  }

  const storedState = readJson<WorkflowClientSessionState | null>(storageKey, null);
  if (!storedState || normalizeWallet(storedState.wallet) !== normalizedWallet) {
    return null;
  }

  cachedWorkflowSessionsByWallet.set(normalizedWallet, storedState);
  return storedState;
}

function persistWorkflowSessionState(state: WorkflowClientSessionState | null) {
  const normalizedWallet = normalizeWallet(state?.wallet);
  if (!normalizedWallet || !state) {
    return;
  }

  const nextState = {
    ...state,
    wallet: normalizedWallet,
  } satisfies WorkflowClientSessionState;
  cachedWorkflowSessionsByWallet.set(normalizedWallet, nextState);
  const storageKey = getWorkflowSessionStorageKey(normalizedWallet);
  if (storageKey) {
    writeJson(storageKey, nextState);
  }
}

export function getStoredWorkflowSessionState(wallet?: string | null) {
  return getWorkflowSessionState(wallet);
}

function emitWorkflowRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(WORKFLOW_REFRESH_EVENT));
}

function recordWorkflowDebug(storeType?: "database" | "memory" | null) {
  if (storeType) {
    lastWorkflowBackendStoreType = storeType;
  }
  lastWorkflowSyncAt = new Date().toISOString();
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

  const storedContracts = readJson<ProductContract[]>(storageKey, [])
    .map(normalizeContract)
    .filter((contract) => !contract.id.startsWith("local-"));
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
  const activeInit = workflowSessionInitPromises.get(connectedWallet);
  if (activeInit) {
    return activeInit;
  }

  const initializer = (async () => {
    const storedState = getWorkflowSessionState(connectedWallet);
    const restoredFromStorage = Boolean(
      storedState?.sessionExists &&
        storedState.expiresAt &&
        storedState.expiresAt > Date.now()
    );

    const sessionResponse = await fetch("/api/workflow/session", {
      cache: "no-store",
    });

    if (sessionResponse.ok) {
      const session = (await sessionResponse.json()) as {
        wallet?: string | null;
        sessionId?: string | null;
        expiresAt?: number | null;
      };
      const sessionWallet = normalizeWallet(session.wallet);
      if (sessionWallet === connectedWallet) {
        persistWorkflowSessionState({
          wallet: connectedWallet,
          sessionExists: true,
          sessionId: session.sessionId?.trim() || null,
          sessionInitialized: true,
          sessionRestoredFromStorage: restoredFromStorage,
          sessionExpired: false,
          lastSessionError: null,
          initializedAt: new Date().toISOString(),
          expiresAt: typeof session.expiresAt === "number" ? session.expiresAt : null,
        });

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
      const errorMessage =
        challenge.error ||
        (await parseErrorMessage(
          challengeResponse,
          "Could not start a secure wallet session for this action."
        ));
      persistWorkflowSessionState({
        wallet: connectedWallet,
        sessionExists: false,
        sessionId: null,
        sessionInitialized: false,
        sessionRestoredFromStorage: restoredFromStorage,
        sessionExpired: false,
        lastSessionError: errorMessage,
        initializedAt: storedState?.initializedAt ?? null,
        expiresAt: storedState?.expiresAt ?? null,
      });
      throw new Error(errorMessage);
    }

    if (!challenge.success || !challenge.token || !challenge.message) {
      const errorMessage = challenge.error ?? "Workflow challenge is missing token or message.";
      persistWorkflowSessionState({
        wallet: connectedWallet,
        sessionExists: false,
        sessionId: null,
        sessionInitialized: false,
        sessionRestoredFromStorage: restoredFromStorage,
        sessionExpired: false,
        lastSessionError: errorMessage,
        initializedAt: storedState?.initializedAt ?? null,
        expiresAt: storedState?.expiresAt ?? null,
      });
      throw new Error(errorMessage);
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

    const verifyPayload = (await verifyResponse.json()) as {
      success?: boolean;
      stage?: string;
      error?: string;
      sessionId?: string | null;
      expiresAt?: number | null;
    };

    if (!verifyResponse.ok || !verifyPayload.success) {
      const verifyError =
        verifyPayload.error ||
        "Could not verify the secure wallet session for this action.";
      persistWorkflowSessionState({
        wallet: connectedWallet,
        sessionExists: false,
        sessionId: null,
        sessionInitialized: false,
        sessionRestoredFromStorage: restoredFromStorage,
        sessionExpired: false,
        lastSessionError: verifyError,
        initializedAt: storedState?.initializedAt ?? null,
        expiresAt: storedState?.expiresAt ?? null,
      });
      throw new Error(verifyError);
    }

    persistWorkflowSessionState({
      wallet: connectedWallet,
      sessionExists: true,
      sessionId: verifyPayload.sessionId?.trim() || null,
      sessionInitialized: true,
      sessionRestoredFromStorage: false,
      sessionExpired: false,
      lastSessionError: null,
      initializedAt: new Date().toISOString(),
      expiresAt: typeof verifyPayload.expiresAt === "number" ? verifyPayload.expiresAt : null,
    });

    return {
      wallet: connectedWallet,
      chainId: challenge.chainId ?? debugContext?.chainId ?? null,
      amountRawValue: challenge.amountRawValue ?? debugContext?.amount?.trim() ?? null,
      amountWei: challenge.amountWei ?? debugContext?.amountWei?.trim() ?? null,
      parsedAmount: challenge.parsedAmount ?? null,
      stage: verifyPayload.stage ?? challenge.stage ?? "session_initialized",
      usedExistingSession: false,
      sessionMode: "verified",
      reason: null,
      challengeResponse: {
        tokenPresent: Boolean(challenge.token),
        message: challenge.message,
      },
    } satisfies WorkflowSessionDebugResult;
  })();

  workflowSessionInitPromises.set(connectedWallet, initializer);
  try {
    return await initializer;
  } finally {
    workflowSessionInitPromises.delete(connectedWallet);
  }
}

async function fetchWorkflowSnapshot(account?: Account | null) {
  const wallet = await resolveWorkflowWalletAddress(account);
  if (!wallet) {
    return {
      contracts: [],
      notifications: [],
    } satisfies WorkflowSnapshot;
  }

  const response = await fetch(`/api/workflow/state?wallet=${encodeURIComponent(wallet)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to load workflow state."));
  }

  const payload = (await response.json()) as {
    contracts: ProductContract[];
    notifications: WorkflowNotification[];
    storeType?: "database" | "memory";
  };
  recordWorkflowDebug(payload.storeType ?? null);

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

  const response = await fetch(`/api/workflow/projects?wallet=${encodeURIComponent(wallet)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to load workflow projects."));
  }

  const payload = (await response.json()) as {
    projects: WorkflowProjectIndexEntry[];
    storeType?: "database" | "memory";
  };
  recordWorkflowDebug(payload.storeType ?? null);

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

  const response = await fetch(input.path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body:
      input.body === undefined
        ? JSON.stringify({ wallet })
        : JSON.stringify({
            ...(input.body as Record<string, unknown>),
            wallet,
          }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Workflow request failed."));
  }

  const payload = (await response.json()) as
    | T
    | {
        success?: boolean;
        contract?: T;
        submission?: T;
        storeType?: "database" | "memory";
      };
  if (payload && typeof payload === "object" && "storeType" in payload) {
    recordWorkflowDebug(payload.storeType ?? null);
  } else {
    recordWorkflowDebug(null);
  }
  await refreshWorkflowSnapshot(account);

  if (payload && typeof payload === "object") {
    if ("contract" in payload && payload.contract) {
      return payload.contract;
    }

    if ("submission" in payload && payload.submission) {
      return payload.submission;
    }
  }

  return payload as T;
}

function sanitizeJsonValue(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeJsonValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, sanitizeJsonValue(entry)])
    );
  }

  return value;
}

async function parseJsonFromText<T>(text: string) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
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

export async function initializeWorkflowSession(
  account: Account | null | undefined,
  debugContext?: WorkflowChallengeDebugContext
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

export async function createWorkflowContract(
  input: CreateWorkflowContractInput,
  account: Account | null | undefined
) {
  return postWorkflowMutation<ProductContract>(account, {
    path: "/api/workflow/contracts/create",
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
  account: Account | null | undefined,
  payload?: {
    clientWallet: string;
    freelancerWallet?: string;
  }
): Promise<SendDealMutationResult> {
  const wallet = await resolveWorkflowWalletAddress(account);
  if (!wallet) {
    throw new Error("Reconnect Wallet");
  }

  const path = `/api/workflow/contracts/${id}/send`;
  const cleanPayload =
    payload === undefined
      ? undefined
      : (sanitizeJsonValue(payload) as Record<string, unknown>);
  const requestPayload = cleanPayload ? JSON.stringify(cleanPayload) : "";

  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: requestPayload || undefined,
  });

  const responseText = await response.text();
  const responsePayload = await parseJsonFromText<{
    success?: boolean;
    error?: string;
    contract?: ProductContract;
    storeType?: "database" | "memory";
  }>(responseText);
  if (responsePayload?.storeType) {
    recordWorkflowDebug(responsePayload.storeType);
  }

  if (!response.ok) {
    const errorBody = responseText || "No response body returned.";
    const errorMessage =
      responsePayload?.error || `Send deal failed with status ${response.status}.`;
    throw new Error(`[${response.status}] ${errorMessage} :: ${errorBody}`);
  }

  const contract = responsePayload?.contract
    ? normalizeContract(responsePayload.contract)
    : responsePayload
      ? normalizeContract(responsePayload as unknown as ProductContract)
      : null;

  if (!contract) {
    throw new Error(`Send deal returned an empty response. :: ${responseText || "No response body returned."}`);
  }

  await refreshWorkflowSnapshot(account);

  return {
    contract,
    debug: {
      url: path,
      contractId: contract.id,
      requestPayload,
      responseStatus: response.status,
      responseOk: response.ok,
      responseBody: responseText,
    },
  } satisfies SendDealMutationResult;
}

export async function getProjectSubmission(
  projectId: number,
  account: Account | null | undefined
) {
  const wallet = await resolveWorkflowWalletAddress(account);
  if (!wallet) {
    return null;
  }

  const response = await fetch(
    `/api/workflow/projects/${projectId}/submission?wallet=${encodeURIComponent(wallet)}`,
    {
    cache: "no-store",
    }
  );

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
    storeType?: "database" | "memory";
  };
  recordWorkflowDebug(payload.storeType ?? null);

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

async function fetchFreelancerInbox(account?: Account | null) {
  const wallet = await resolveWorkflowWalletAddress(account);
  if (!wallet) {
    return {
      contracts: [],
      notifications: [],
    } satisfies WorkflowSnapshot;
  }

  const response = await fetch(`/api/workflow/inbox/${wallet}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to load workflow inbox."));
  }

  const payload = (await response.json()) as {
    contracts: ProductContract[];
    notifications: WorkflowNotification[];
    storeType?: "database" | "memory";
  };
  recordWorkflowDebug(payload.storeType ?? null);

  return {
    contracts: (payload.contracts ?? []).map(normalizeContract),
    notifications: (payload.notifications ?? []).map((entry) => entry.message),
  } satisfies WorkflowSnapshot;
}

export async function syncFreelancerInbox(account?: Account | null) {
  const wallet = await resolveWorkflowWalletAddress(account);
  if (!wallet) {
    return {
      contracts: [],
      notifications: [],
    } satisfies WorkflowSnapshot;
  }

  try {
    const snapshot = await fetchFreelancerInbox(account);
    return hydrateWorkflowSnapshot(wallet, snapshot);
  } catch (error) {
    console.error("Failed to refresh freelancer inbox", error);
    return {
      contracts: getCachedContractsForWallet(wallet),
      notifications: getCachedNotificationsForWallet(wallet),
    } satisfies WorkflowSnapshot;
  }
}

export function getWorkflowDebugSnapshot(): WorkflowDebugSnapshot {
  return {
    storeType: lastWorkflowBackendStoreType,
    lastSyncAt: lastWorkflowSyncAt,
  };
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
