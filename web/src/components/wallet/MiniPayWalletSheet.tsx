"use client";

import { useState } from "react";
import { useActiveAccount, useActiveWallet, useConnect, useDisconnect } from "thirdweb/react";
import { EIP1193 } from "thirdweb/wallets";
import { client } from "@/lib/client";
import { agentGuildChain } from "@/lib/networkConfig";

declare global {
  interface Window {
    ethereum?: object;
  }
}

type MiniPayWalletSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  continueLabel?: string;
  onContinue?: () => void;
  configErrors?: string[];
};

export function MiniPayWalletSheet({
  open,
  onClose,
  title = "Connect MiniPay wallet",
  description = "Use your MiniPay wallet to manage this deal.",
  continueLabel,
  onContinue,
  configErrors,
}: MiniPayWalletSheetProps) {
  const activeAccount = useActiveAccount();
  const activeWallet = useActiveWallet();
  const { connect, isConnecting, error } = useConnect({
    client: client!,
  });
  const { disconnect } = useDisconnect();
  const [localError, setLocalError] = useState<string | null>(null);

  const shortenedAddress = activeAccount?.address
    ? `${activeAccount.address.slice(0, 6)}...${activeAccount.address.slice(-4)}`
    : null;

  const resolvedError =
    localError || error?.message || null;

  async function handleConnectWallet() {
    if (configErrors?.length) {
      return;
    }

    if (typeof window === "undefined" || !window.ethereum) {
      setLocalError("Could not connect wallet. Try again.");
      return;
    }

    try {
      setLocalError(null);
      await connect(async () => {
        const wallet = EIP1193.fromProvider({
          provider: window.ethereum as never,
          walletId: "adapter",
        });

        await wallet.connect({
          client: client!,
          chain: agentGuildChain,
        });

        return wallet;
      });
    } catch (connectError) {
      console.error(connectError);
      setLocalError("Could not connect wallet. Try again.");
    }
  }

  async function handleDisconnectWallet() {
    if (!activeWallet) {
      return;
    }

    await disconnect(activeWallet);
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 pb-4 pt-10 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close wallet sheet"
        className="absolute inset-0 cursor-default"
        onClick={() => {
          setLocalError(null);
          onClose();
        }}
      />

      <div className="relative w-full max-w-[420px] overflow-hidden rounded-[28px] border border-[#2a1116] bg-[radial-gradient(circle_at_top,rgba(215,38,56,0.18),transparent_38%),linear-gradient(180deg,#111111_0%,#080808_100%)] p-5 text-[#f7f4ef] shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#2a2a2a]" />

        <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#f2b6be]">
          Wallet
        </div>
        <h2 className="mt-3 text-[27px] font-semibold tracking-[-0.05em] text-[#f7f4ef]">{title}</h2>
        <p className="mt-3 text-[15px] leading-7 text-[#c9c9d1]">{description}</p>

        {configErrors?.length ? (
          <div className="mt-5 rounded-[20px] border border-[#4c1d24] bg-[#150b0d] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f2b6be]">
              Configuration required
            </div>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-[#f6c8ce]">
              {configErrors.map((configError) => (
                <li key={configError}>{configError}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {shortenedAddress ? (
          <div className="mt-5 rounded-[20px] border border-[#1d3324] bg-[#0d1711] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9be2b0]">
              Connected
            </div>
            <div className="mt-2 text-[18px] font-semibold text-[#f7f4ef]">{shortenedAddress}</div>
            <div className="mt-2 text-sm leading-6 text-[#b8c7bc]">MiniPay wallet ready for this deal flow.</div>
          </div>
        ) : null}

        {resolvedError ? (
          <div className="mt-5 rounded-[18px] border border-[#4c1d24] bg-[#150b0d] px-4 py-4 text-sm leading-6 text-[#f6c8ce]">
            {resolvedError}
          </div>
        ) : null}

        <div className="mt-6 space-y-3">
          {!shortenedAddress ? (
            <button
              type="button"
              onClick={handleConnectWallet}
              disabled={isConnecting || Boolean(configErrors?.length)}
              className="min-h-[56px] w-full rounded-[18px] bg-[#d72638] px-5 py-4 text-base font-semibold text-white transition hover:bg-[#b91f30] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>
          ) : (
            <>
              {continueLabel && onContinue ? (
                <button
                  type="button"
                  onClick={onContinue}
                  className="min-h-[56px] w-full rounded-[18px] bg-[#d72638] px-5 py-4 text-base font-semibold text-white transition hover:bg-[#b91f30]"
                >
                  {continueLabel}
                </button>
              ) : null}

              <button
                type="button"
                onClick={handleDisconnectWallet}
                className="min-h-[52px] w-full rounded-[18px] border border-[#292929] bg-[#0d0d0d] px-5 py-4 text-base font-semibold text-[#f7f4ef] transition hover:border-[#393939]"
              >
                Disconnect Wallet
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              setLocalError(null);
              onClose();
            }}
            className="min-h-[52px] w-full rounded-[18px] border border-transparent px-5 py-4 text-sm font-semibold text-[#9ca3af] transition hover:text-[#f7f4ef]"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

export function MiniPayWalletButton({
  label = "Connect Wallet",
  onClick,
}: {
  label?: string;
  onClick: () => void;
}) {
  const activeAccount = useActiveAccount();
  const address = activeAccount?.address;
  const text = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : label;

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[52px] items-center justify-center rounded-[16px] border border-[#2a2a2a] bg-[#0d0d0d] px-4 py-3 text-sm font-semibold text-[#f7f4ef] transition hover:border-[#404040]"
    >
      {text}
    </button>
  );
}
