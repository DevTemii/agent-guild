"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ConnectButton, useActiveAccount } from "thirdweb/react";
import { client } from "@/lib/client";
import { agentGuildChain } from "@/lib/networkConfig";

const SPLASH_STORAGE_KEY = "agent-guild-minipay-splash";

export default function Home() {
  const account = useActiveAccount();
  const connectedAddress = account?.address ?? null;
  const [showRoleScreen, setShowRoleScreen] = useState(false);

  useEffect(() => {
    const savedStep = window.localStorage.getItem(SPLASH_STORAGE_KEY);
    if (savedStep === "role") {
      setShowRoleScreen(true);
    }
  }, []);

  function continueToRoleSelection() {
    window.localStorage.setItem(SPLASH_STORAGE_KEY, "role");
    setShowRoleScreen(true);
  }

  return (
    <main className="min-h-screen bg-[#070707] px-4 py-5 text-[#f7f4ef]">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-[420px] flex-col">
        {!showRoleScreen ? (
          <section className="flex flex-1 flex-col justify-between rounded-[28px] border border-[#181818] bg-[radial-gradient(circle_at_top,rgba(215,38,56,0.18),transparent_32%),linear-gradient(180deg,#101010_0%,#090909_100%)] px-5 py-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <div>
              <div className="inline-flex rounded-full border border-[#3f2025] bg-[#150b0d] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f2b6be]">
                Agent Guild
              </div>
              <div className="mt-10">
                <div className="text-[34px] font-semibold tracking-[-0.06em] text-[#f7f4ef]">
                  Agent Guild
                </div>
                <p className="mt-4 max-w-[290px] text-[15px] leading-7 text-[#c8c8d0]">
                  Contracts, escrow, and payout in one flow.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[18px] border border-[#1e1e1e] bg-[#0b0b0b] px-4 py-4 text-sm leading-6 text-[#a1a1aa]">
                Built for MiniPay-first client and freelancer workflows on Celo.
              </div>
              <button
                type="button"
                onClick={continueToRoleSelection}
                className="w-full rounded-[18px] bg-[#d72638] px-5 py-4 text-base font-semibold text-white transition hover:bg-[#b91f30]"
              >
                Continue
              </button>
            </div>
          </section>
        ) : (
          <section className="flex flex-1 flex-col justify-between rounded-[28px] border border-[#181818] bg-[#0b0b0b] px-5 py-6">
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#f2b6be]">
                Wallet & role
              </div>
              <h1 className="mt-4 text-[30px] font-semibold tracking-[-0.05em] text-[#f7f4ef]">
                Open Agent Guild as the role you need right now.
              </h1>
              <p className="mt-3 text-sm leading-7 text-[#a1a1aa]">
                Connect the MiniPay wallet you want to use for contracts, escrow, and payout.
              </p>

              <div className="mt-6">
                <ConnectButton client={client} chain={agentGuildChain} />
              </div>

              <div className="mt-4 rounded-[18px] border border-[#1e1e1e] bg-[#090909] px-4 py-4 text-sm leading-6 text-[#d4d4d8]">
                {connectedAddress
                  ? `Connected wallet: ${shortAddress(connectedAddress)}`
                  : "Connect your wallet to continue into the app flow."}
              </div>
            </div>

            <div className="space-y-3">
              <RoleButton
                href="/client"
                title="Continue as Client"
                description="Create contracts, fund escrow, and release payout."
                disabled={!connectedAddress}
              />
              <RoleButton
                href="/freelancer"
                title="Continue as Freelancer"
                description="Review contracts, submit work, and track release."
                disabled={!connectedAddress}
              />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function RoleButton({
  href,
  title,
  description,
  disabled,
}: {
  href: string;
  title: string;
  description: string;
  disabled: boolean;
}) {
  if (disabled) {
    return (
      <div className="rounded-[20px] border border-[#1d1d1d] bg-[#090909] px-4 py-4 opacity-65">
        <div className="text-base font-semibold text-[#f7f4ef]">{title}</div>
        <div className="mt-2 text-sm leading-6 text-[#a1a1aa]">{description}</div>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="block rounded-[20px] border border-[#1d1d1d] bg-[#090909] px-4 py-4 transition hover:border-[#363636]"
    >
      <div className="text-base font-semibold text-[#f7f4ef]">{title}</div>
      <div className="mt-2 text-sm leading-6 text-[#a1a1aa]">{description}</div>
    </Link>
  );
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
