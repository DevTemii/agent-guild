"use client";

import { useEffect, useState } from "react";
import { useAgentWalletSession } from "@/lib/walletSession";

type MiniPayWalletSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  continueLabel?: string;
  selectedRole?: "client" | "freelancer" | null;
  onContinue?: () => void;
  configErrors?: string[];
};

export function MiniPayWalletSheet({
  open,
  onClose,
  title = "Connect MiniPay wallet",
  description = "Use your MiniPay wallet to manage this deal.",
  continueLabel,
  selectedRole = null,
  onContinue,
  configErrors,
}: MiniPayWalletSheetProps) {
  const walletSession = useAgentWalletSession();
  const { isMiniPay, walletConnected, refreshSession } = walletSession;
  const [localError, setLocalError] = useState<string | null>(null);
  const [continueClickCount, setContinueClickCount] = useState(0);

  const shortenedAddress = walletSession.address
    ? `${walletSession.address.slice(0, 6)}...${walletSession.address.slice(-4)}`
    : null;

  const resolvedError = localError || walletSession.rawWalletError || null;
  const actionTitle = walletSession.isMiniPay ? title : "Connect wallet";
  const actionDescription = walletSession.isMiniPay
    ? description
    : "Use your wallet to create deals, secure payment, and confirm payout.";

  useEffect(() => {
    if (!open || !isMiniPay || walletConnected) {
      return;
    }

    void refreshSession(false);
  }, [isMiniPay, open, refreshSession, walletConnected]);

  async function handleConnectWallet() {
    if (configErrors?.length) {
      return;
    }

    try {
      setLocalError(null);
      if (walletSession.isMiniPay) {
        await walletSession.connectWallet();
      } else {
        await walletSession.connectExternalWallet("io.metamask");
      }
    } catch (connectError) {
      console.error(connectError);
      setLocalError("Could not connect wallet. Try again.");
    }
  }

  async function handleExternalConnect(walletId: Parameters<typeof walletSession.connectExternalWallet>[0]) {
    try {
      setLocalError(null);
      await walletSession.connectExternalWallet(walletId);
    } catch (connectError) {
      console.error(connectError);
      setLocalError("Could not connect wallet. Try again.");
    }
  }

  async function handleDisconnectWallet() {
    await walletSession.disconnectWallet();
  }

  function handleContinueClick() {
    const nextCount = continueClickCount + 1;
    setContinueClickCount(nextCount);
    console.log("continue clicked", {
      selectedRole,
      address: walletSession.address,
    });
    onContinue?.();
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 pb-4 pt-10 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close wallet sheet"
        className="absolute inset-0 z-0 cursor-default"
        onClick={() => {
          setLocalError(null);
          onClose();
        }}
      />

      <div className="pointer-events-auto relative z-10 w-full max-w-[420px] overflow-hidden rounded-[28px] border border-[#2a1116] bg-[radial-gradient(circle_at_top,rgba(215,38,56,0.18),transparent_38%),linear-gradient(180deg,#111111_0%,#080808_100%)] p-5 text-[#f7f4ef] shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#2a2a2a]" />

        <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#f2b6be]">
          Wallet
        </div>
        <h2 className="mt-3 text-[27px] font-semibold tracking-[-0.05em] text-[#f7f4ef]">{actionTitle}</h2>
        <p className="mt-3 text-[15px] leading-7 text-[#c9c9d1]">{actionDescription}</p>

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
            <div className="mt-2 text-sm leading-6 text-[#b8c7bc]">
              {walletSession.walletSource === "minipay"
                ? "Wallet connected securely inside MiniPay."
                : "Wallet connected securely for this deal flow."}
            </div>
          </div>
        ) : null}

        {resolvedError ? (
          <div className="mt-5 rounded-[18px] border border-[#4c1d24] bg-[#150b0d] px-4 py-4 text-sm leading-6 text-[#f6c8ce]">
            {resolvedError}
          </div>
        ) : null}

        <div className="mt-4 rounded-[18px] border border-[#1d1d1d] bg-[#090909] px-4 py-4 text-sm leading-6 text-[#c9c9d1]">
          <div>role: {selectedRole || "none"}</div>
          <div>address: {walletSession.address || "not connected"}</div>
          <div>click count: {continueClickCount}</div>
        </div>

        <div className="mt-6 space-y-3">
          {!shortenedAddress ? (
            <>
              <button
                type="button"
                onClick={handleConnectWallet}
                disabled={walletSession.isConnecting || Boolean(configErrors?.length)}
                className="min-h-[56px] w-full rounded-[18px] bg-[#d72638] px-5 py-4 text-base font-semibold text-white transition hover:bg-[#b91f30] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {walletSession.isConnecting
                  ? "Connecting..."
                  : walletSession.isMiniPay
                    ? "Connect Wallet"
                    : "Continue with MetaMask"}
              </button>

              {!walletSession.isMiniPay ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleExternalConnect("io.metamask")}
                    disabled={walletSession.isConnecting || Boolean(configErrors?.length)}
                    className="min-h-[52px] w-full rounded-[18px] border border-[#252525] bg-[#0d0d0d] px-5 py-4 text-base font-semibold text-[#f7f4ef] transition hover:border-[#393939] disabled:opacity-55"
                  >
                    Continue with MetaMask
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExternalConnect("walletConnect")}
                    disabled={walletSession.isConnecting || Boolean(configErrors?.length)}
                    className="min-h-[52px] w-full rounded-[18px] border border-[#252525] bg-[#0d0d0d] px-5 py-4 text-base font-semibold text-[#f7f4ef] transition hover:border-[#393939] disabled:opacity-55"
                  >
                    Continue with WalletConnect
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExternalConnect("com.coinbase.wallet")}
                    disabled={walletSession.isConnecting || Boolean(configErrors?.length)}
                    className="min-h-[52px] w-full rounded-[18px] border border-[#252525] bg-[#0d0d0d] px-5 py-4 text-base font-semibold text-[#f7f4ef] transition hover:border-[#393939] disabled:opacity-55"
                  >
                    Continue with Coinbase
                  </button>
                </>
              ) : null}
            </>
          ) : (
            <>
              {continueLabel && onContinue ? (
                <button
                  type="button"
                  onClick={handleContinueClick}
                  disabled={!walletSession.address}
                  className="relative z-20 min-h-[56px] w-full rounded-[18px] bg-[#d72638] px-5 py-4 text-base font-semibold text-white transition hover:bg-[#b91f30] disabled:cursor-not-allowed disabled:opacity-55"
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
  const walletSession = useAgentWalletSession();
  const address = walletSession.address;
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
