import crypto from "node:crypto";
import { cookies } from "next/headers";
import { verifySignature } from "thirdweb/auth";
import { defineChain } from "thirdweb";
import { client } from "@/lib/client";
import { normalizeWallet } from "@/lib/workflowTypes";

const WORKFLOW_SESSION_COOKIE = "agent-guild-workflow-session";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  rpc: "https://forno.celo-sepolia.celo-testnet.org",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
});

type WorkflowChallengePayload = {
  wallet: string;
  nonce: string;
  expiresAt: number;
};

type WorkflowSessionPayload = {
  wallet: string;
  expiresAt: number;
};

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

  return verifySignature({
    address: normalizedWallet,
    message: buildWorkflowChallengeMessage(payload),
    signature,
    client,
    chain: celoSepolia,
  });
}

function createWorkflowSessionToken(wallet: string) {
  return encodeSignedToken({
    wallet: normalizeWallet(wallet),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
}

export async function setWorkflowSession(wallet: string) {
  const cookieStore = await cookies();
  cookieStore.set(WORKFLOW_SESSION_COOKIE, createWorkflowSessionToken(wallet), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function clearWorkflowSession() {
  const cookieStore = await cookies();
  cookieStore.delete(WORKFLOW_SESSION_COOKIE);
}

export async function getWorkflowSessionWallet() {
  const cookieStore = await cookies();
  const token = cookieStore.get(WORKFLOW_SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const payload = decodeSignedToken<WorkflowSessionPayload>(token);
  if (!payload || payload.expiresAt < Date.now()) {
    cookieStore.delete(WORKFLOW_SESSION_COOKIE);
    return null;
  }

  return normalizeWallet(payload.wallet);
}
