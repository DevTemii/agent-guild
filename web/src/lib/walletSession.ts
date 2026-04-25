"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActiveAccount, useActiveWallet, useActiveWalletChain, useConnect, useDisconnect } from "thirdweb/react";
import type { Account } from "thirdweb/wallets";
import { createWallet, EIP1193 } from "thirdweb/wallets";
import { client } from "./client";
import { agentGuildChain, agentGuildChainId } from "./networkConfig";
import { normalizeWallet } from "./workflowTypes";

declare global {
  interface Window {
    ethereum?: BrowserWalletProvider;
  }
}

export type AgentWalletSource = "minipay" | "external";

type BrowserWalletProvider = {
  isMiniPay?: boolean;
  request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

type PersistedMiniPaySession = {
  walletSource: "minipay";
  address: string;
  chainId: number | null;
  connectedAt: string;
};

type MiniPayResolution = {
  isMiniPay: boolean;
  providerDetected: boolean;
  provider: BrowserWalletProvider | null;
  address: string | null;
  chainId: number | null;
};

type ExternalWalletId = "io.metamask" | "walletConnect" | "com.coinbase.wallet";

export type AgentWalletSessionState = {
  isMiniPay: boolean;
  walletSource: AgentWalletSource | null;
  provider: BrowserWalletProvider | null;
  address: string | null;
  walletConnected: boolean;
  providerDetected: boolean;
  providerChainId: number | null;
  externalChainId: number | null;
  sessionActive: boolean;
  rawWalletError: string | null;
  externalWalletId: string | null;
  isConnecting: boolean;
  connectWallet: () => Promise<void>;
  connectExternalWallet: (walletId: ExternalWalletId) => Promise<void>;
  disconnectWallet: () => Promise<void>;
  refreshSession: (requestAccounts?: boolean) => Promise<void>;
  thirdwebAccount: Account | undefined;
};

const MINIPAY_SESSION_STORAGE_KEY = `agent-guild-minipay-session:${agentGuildChainId}`;
const MINIPAY_ADAPTER_WALLET_ID = "adapter";

function getRequiredThirdwebClient() {
  if (!client) {
    throw new Error("Could not connect wallet. Try again.");
  }

  return client;
}

function getBrowserWalletProvider() {
  if (typeof window === "undefined") {
    return null;
  }

  const provider = window.ethereum;
  if (!provider || typeof provider.request !== "function") {
    return null;
  }

  return provider;
}

function parseChainId(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("0x")) {
    const parsedHex = Number.parseInt(trimmed, 16);
    return Number.isFinite(parsedHex) ? parsedHex : null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAccounts(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? normalizeWallet(entry) : null))
    .filter((entry): entry is string => Boolean(entry));
}

function readPersistedMiniPaySession() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(MINIPAY_SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as PersistedMiniPaySession;
  } catch (error) {
    console.error("Failed to parse MiniPay wallet session", error);
    window.localStorage.removeItem(MINIPAY_SESSION_STORAGE_KEY);
    return null;
  }
}

function persistMiniPaySession(session: PersistedMiniPaySession | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (!session) {
    window.localStorage.removeItem(MINIPAY_SESSION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(MINIPAY_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function isMiniPayInjected() {
  return Boolean(getBrowserWalletProvider()?.isMiniPay);
}

export async function resolveMiniPayWallet(requestAccounts = false): Promise<MiniPayResolution> {
  const provider = getBrowserWalletProvider();
  const providerDetected = Boolean(provider);
  const isMiniPay = Boolean(provider?.isMiniPay);

  if (!provider || !isMiniPay) {
    return {
      isMiniPay,
      providerDetected,
      provider,
      address: null,
      chainId: null,
    };
  }

  const persisted = readPersistedMiniPaySession();
  let address = persisted?.address ?? null;
  let chainId = persisted?.chainId ?? null;

  try {
    const accountsResponse = await provider.request?.({
      method: requestAccounts ? "eth_requestAccounts" : "eth_accounts",
    });
    const accounts = parseAccounts(accountsResponse);
    address = accounts[0] ?? null;
  } catch (error) {
    console.error("Failed to resolve MiniPay accounts", error);
    throw error;
  }

  try {
    const chainResponse = await provider.request?.({ method: "eth_chainId" });
    chainId = parseChainId(chainResponse);
  } catch (error) {
    console.error("Failed to resolve MiniPay chain id", error);
  }

  if (address) {
    persistMiniPaySession({
      walletSource: "minipay",
      address,
      chainId,
      connectedAt: new Date().toISOString(),
    });
  } else {
    persistMiniPaySession(null);
  }

  return {
    isMiniPay,
    providerDetected,
    provider,
    address,
    chainId,
  };
}

export async function resolveAgentWalletIdentity(account?: Account | null) {
  const miniPay = await resolveMiniPayWallet(false);
  if (miniPay.isMiniPay && miniPay.address) {
    return {
      isMiniPay: true,
      walletSource: "minipay" as const,
      provider: miniPay.provider,
      address: miniPay.address,
      chainId: miniPay.chainId,
      providerDetected: miniPay.providerDetected,
      sessionActive: miniPay.chainId === agentGuildChainId,
    };
  }

  const externalAddress = normalizeWallet(account?.address) || null;
  return {
    isMiniPay: miniPay.isMiniPay,
    walletSource: externalAddress ? ("external" as const) : null,
    provider: miniPay.provider,
    address: externalAddress,
    chainId: miniPay.chainId,
    providerDetected: miniPay.providerDetected,
    sessionActive: Boolean(externalAddress),
  };
}

export async function signAgentWalletMessage(input: {
  account?: Account | null;
  message: string;
}) {
  const miniPay = await resolveMiniPayWallet(false);
  if (miniPay.isMiniPay && miniPay.provider && miniPay.address) {
    if (miniPay.chainId !== agentGuildChainId) {
      throw new Error("Reconnect Wallet");
    }

    try {
      const signature = await miniPay.provider.request?.({
        method: "personal_sign",
        params: [input.message, miniPay.address],
      });

      if (typeof signature === "string" && signature.trim()) {
        return signature;
      }
    } catch (error) {
      console.error("MiniPay personal_sign failed", error);
    }

    const fallbackSignature = await miniPay.provider.request?.({
      method: "eth_sign",
      params: [miniPay.address, input.message],
    });

    if (typeof fallbackSignature === "string" && fallbackSignature.trim()) {
      return fallbackSignature;
    }

    throw new Error("Reconnect Wallet");
  }

  if (!input.account) {
    throw new Error("Reconnect Wallet");
  }

  return input.account.signMessage({ message: input.message });
}

function extractWalletError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "Could not connect wallet. Try again.";
}

export function useAgentWalletSession(): AgentWalletSessionState {
  const activeAccount = useActiveAccount();
  const activeWallet = useActiveWallet();
  const activeWalletChain = useActiveWalletChain();
  const { connect, isConnecting } = useConnect({
    client: client!,
  });
  const { disconnect } = useDisconnect();
  const [miniPayState, setMiniPayState] = useState<MiniPayResolution>({
    isMiniPay: false,
    providerDetected: false,
    provider: null,
    address: null,
    chainId: null,
  });
  const [rawWalletError, setRawWalletError] = useState<string | null>(null);
  const syncInFlightRef = useRef(false);
  const activeWalletId = (activeWallet as { id?: string } | null)?.id ?? null;

  const syncMiniPayWallet = useCallback(
    async (requestAccounts: boolean) => {
      if (syncInFlightRef.current) {
        return;
      }

      const provider = getBrowserWalletProvider();
      if (!provider?.isMiniPay) {
        setMiniPayState({
          isMiniPay: false,
          providerDetected: Boolean(provider),
          provider,
          address: null,
          chainId: null,
        });
        return;
      }

      try {
        syncInFlightRef.current = true;
        const nextMiniPayState = await resolveMiniPayWallet(requestAccounts);
        setMiniPayState(nextMiniPayState);

        if (nextMiniPayState.address) {
          const thirdwebClient = getRequiredThirdwebClient();
          const shouldSyncAdapter =
            normalizeWallet(activeAccount?.address) !== nextMiniPayState.address ||
            activeWalletId !== MINIPAY_ADAPTER_WALLET_ID;

          if (shouldSyncAdapter) {
            if (activeWallet && activeWalletId !== MINIPAY_ADAPTER_WALLET_ID) {
              await disconnect(activeWallet);
            }

            await connect(async () => {
              const wallet = EIP1193.fromProvider({
                provider: nextMiniPayState.provider as never,
                walletId: MINIPAY_ADAPTER_WALLET_ID,
              });

              await wallet.connect({
                client: thirdwebClient,
                chain: agentGuildChain,
              });

              return wallet;
            });
          }
        }

        setRawWalletError(null);
      } catch (error) {
        console.error("Failed to sync MiniPay wallet session", error);
        setRawWalletError(extractWalletError(error));
      } finally {
        syncInFlightRef.current = false;
      }
    },
    [activeAccount?.address, activeWallet, activeWalletId, connect, disconnect]
  );

  useEffect(() => {
    void syncMiniPayWallet(false);
  }, [syncMiniPayWallet]);

  useEffect(() => {
    const provider = getBrowserWalletProvider();
    if (!provider?.isMiniPay || !provider.on || !provider.removeListener) {
      return;
    }

    const handleWalletChange = () => {
      void syncMiniPayWallet(false);
    };

    provider.on("accountsChanged", handleWalletChange);
    provider.on("chainChanged", handleWalletChange);

    return () => {
      provider.removeListener?.("accountsChanged", handleWalletChange);
      provider.removeListener?.("chainChanged", handleWalletChange);
    };
  }, [syncMiniPayWallet]);

  useEffect(() => {
    if (!miniPayState.isMiniPay || !activeWallet || activeWalletId === MINIPAY_ADAPTER_WALLET_ID) {
      return;
    }

    void disconnect(activeWallet);
  }, [activeWallet, activeWalletId, disconnect, miniPayState.isMiniPay]);

  const connectExternalWallet = useCallback(
    async (walletId: ExternalWalletId) => {
      try {
        setRawWalletError(null);
        persistMiniPaySession(null);

        if (activeWallet) {
          await disconnect(activeWallet);
        }

        await connect(async () => {
          const thirdwebClient = getRequiredThirdwebClient();
          const wallet = createWallet(walletId);
          await wallet.connect({
            client: thirdwebClient,
            chain: agentGuildChain,
          });
          return wallet;
        });
      } catch (error) {
        console.error("Failed to connect external wallet", error);
        setRawWalletError(extractWalletError(error));
      }
    },
    [activeWallet, connect, disconnect]
  );

  const disconnectWallet = useCallback(async () => {
    try {
      persistMiniPaySession(null);
      setRawWalletError(null);
      setMiniPayState({
        isMiniPay: isMiniPayInjected(),
        providerDetected: Boolean(getBrowserWalletProvider()),
        provider: getBrowserWalletProvider(),
        address: null,
        chainId: null,
      });

      if (activeWallet) {
        await disconnect(activeWallet);
      }
    } catch (error) {
      console.error("Failed to disconnect wallet", error);
      setRawWalletError(extractWalletError(error));
    }
  }, [activeWallet, disconnect]);

  const walletSource = useMemo<AgentWalletSource | null>(() => {
    if (miniPayState.isMiniPay && miniPayState.address) {
      return "minipay";
    }

    return activeAccount?.address ? "external" : null;
  }, [activeAccount?.address, miniPayState.address, miniPayState.isMiniPay]);

  const address = useMemo(() => {
    if (walletSource === "minipay") {
      return miniPayState.address;
    }

    return normalizeWallet(activeAccount?.address) || null;
  }, [activeAccount?.address, miniPayState.address, walletSource]);

  const providerChainId = miniPayState.chainId;
  const externalChainId = activeWalletChain?.id ?? null;
  const walletConnected = Boolean(address);
  const sessionActive =
    walletSource === "minipay"
      ? Boolean(address && providerChainId === agentGuildChainId)
      : Boolean(address && externalChainId === agentGuildChainId);

  return {
    isMiniPay: miniPayState.isMiniPay,
    walletSource,
    provider: miniPayState.provider,
    address,
    walletConnected,
    providerDetected: miniPayState.providerDetected,
    providerChainId,
    externalChainId,
    sessionActive,
    rawWalletError,
    externalWalletId: walletSource === "external" ? activeWalletId : null,
    isConnecting: isConnecting || syncInFlightRef.current,
    connectWallet: () => syncMiniPayWallet(true),
    connectExternalWallet,
    disconnectWallet,
    refreshSession: async (requestAccounts = false) => {
      if (miniPayState.isMiniPay) {
        await syncMiniPayWallet(requestAccounts);
      }
    },
    thirdwebAccount: activeAccount,
  };
}
