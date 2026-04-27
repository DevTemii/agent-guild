import crypto from "node:crypto";
import { cookies } from "next/headers";
import { verifySignature } from "thirdweb/auth";
import { client } from "@/lib/client";
import { agentGuildChain } from "@/lib/networkConfig";
import { agentGuildRuntimeConfig } from "@/lib/runtimeConfig";
import { normalizeWallet } from "@/lib/workflowTypes";
import { getWorkflowSessionMemoryStore } from "@/lib/server/workflowMemoryStore";

const WORKFLOW_SESSION_COOKIE = "agent-guild-workflow-session";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type WorkflowChallengePayload = {
  wallet: string;
  nonce: string;
  expiresAt: number;
};

type WorkflowSessionPayload = {
  sessionId: string;
  wallet: string;
  expiresAt: number;
};

function getWorkflowSessionStore() {
  return getWorkflowSessionMemoryStore() as Map<string, WorkflowSessionPayload>;
}

function getWorkflowSessionSecret() {
  if (process.env.WORKFLOW_SESSION_SECRET) {
    return process.env.WORKFLOW_SESSION_SECRET;
  }

  if (process.env.NODE_ENV !== "production") {
    return "agent-guild-dev-workflow-secret";
  }

  throw new Error("WORKFLOW_SESSION_SECRET is required in production.");
}

function signTokenBody(body: string) {
  return crypto
    .createHmac("sha256", getWorkflowSessionSecret())
    .update(body)
    .digest("base64url");
}

function encodeSignedToken(payload: WorkflowChallengePayload | WorkflowSessionPayload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signTokenBody(body);
  return `${body}.${signature}`;
}

function decodeSignedToken<T extends WorkflowChallengePayload | WorkflowSessionPayload>(
  token: string
) {
  const [body, signature] = token.split(".");
  if (!body || !signature) {
    return null;
  }

  if (signTokenBody(body) !== signature) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function createWorkflowChallenge(wallet: string) {
  const normalizedWallet = normalizeWallet(wallet);
  if (!normalizedWallet) {
    throw new Error("Wallet is required.");
  }

  const payload: WorkflowChallengePayload = {
    wallet: normalizedWallet,
    nonce: crypto.randomUUID(),
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  };

  return {
    token: encodeSignedToken(payload),
    message: buildWorkflowChallengeMessage(payload),
  };
}

export function buildWorkflowChallengeMessage(payload: WorkflowChallengePayload) {
  return [
    "Agent Guild workflow session",
    "",
    "Sign this message to unlock shared workflow state for this wallet.",
    `Wallet: ${payload.wallet}`,
    `Nonce: ${payload.nonce}`,
    `Expires: ${new Date(payload.expiresAt).toISOString()}`,
  ].join("\n");
}

export async function verifyWorkflowChallengeSignature({
  wallet,
  token,
  signature,
}: {
  wallet: string;
  token: string;
  signature: string;
}) {
  const normalizedWallet = normalizeWallet(wallet);
  const payload = decodeSignedToken<WorkflowChallengePayload>(token);

  if (!normalizedWallet || !payload) {
    return false;
  }

  if (payload.wallet !== normalizedWallet || payload.expiresAt < Date.now()) {
    return false;
  }

  if (!agentGuildRuntimeConfig.valid || !client) {
    return false;
  }

  return verifySignature({
    address: normalizedWallet,
    message: buildWorkflowChallengeMessage(payload),
    signature,
    client,
    chain: agentGuildChain,
  });
}

function createWorkflowSessionToken(wallet: string) {
  return encodeSignedToken({
    sessionId: crypto.randomUUID(),
    wallet: normalizeWallet(wallet),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
}

export async function setWorkflowSession(wallet: string) {
  const token = createWorkflowSessionToken(wallet);
  const payload = decodeSignedToken<WorkflowSessionPayload>(token);
  if (payload) {
    getWorkflowSessionStore().set(payload.sessionId, payload);
  }
  const cookieStore = await cookies();
  cookieStore.set(WORKFLOW_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });

  return payload;
}

export async function clearWorkflowSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(WORKFLOW_SESSION_COOKIE)?.value;
  if (token) {
    const payload = decodeSignedToken<WorkflowSessionPayload>(token);
    if (payload?.sessionId) {
      getWorkflowSessionStore().delete(payload.sessionId);
    }
  }
  cookieStore.delete(WORKFLOW_SESSION_COOKIE);
}

export async function getWorkflowSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(WORKFLOW_SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const payload = decodeSignedToken<WorkflowSessionPayload>(token);
  if (!payload || payload.expiresAt < Date.now()) {
    cookieStore.delete(WORKFLOW_SESSION_COOKIE);
    if (payload?.sessionId) {
      getWorkflowSessionStore().delete(payload.sessionId);
    }
    return null;
  }

  getWorkflowSessionStore().set(payload.sessionId, payload);

  return {
    ...payload,
    wallet: normalizeWallet(payload.wallet),
  };
}

export async function getWorkflowSessionWallet() {
  const session = await getWorkflowSession();
  return session?.wallet ?? null;
}

export async function resolveWorkflowRequestWallet(
  request: Request,
  explicitWallet?: string | null
) {
  const directWallet = normalizeWallet(explicitWallet);
  if (directWallet) {
    return directWallet;
  }

  try {
    const url = new URL(request.url);
    const queryWallet = normalizeWallet(url.searchParams.get("wallet"));
    if (queryWallet) {
      return queryWallet;
    }
  } catch {
    // ignore URL parse failure and fall through to session lookup
  }

  return getWorkflowSessionWallet();
}
