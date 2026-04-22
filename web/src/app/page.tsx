"use client";

import Link from "next/link";
import { ConnectButton, useActiveAccount } from "thirdweb/react";
import { defineChain } from "thirdweb";
import { client } from "@/lib/client";

const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  rpc: "https://forno.celo-sepolia.celo-testnet.org",
  nativeCurrency: {
    name: "CELO",
    symbol: "CELO",
    decimals: 18,
  },
});

const appSteps = [
  "Create or review a contract",
  "Move approved work into escrow",
  "Submit delivery and release funds",
];

export default function Home() {
  const account = useActiveAccount();
  const connectedAddress = account?.address ?? null;

  return (
    <main className="min-h-screen bg-[#070707] px-4 py-4 text-[#f7f4ef] sm:px-5 sm:py-5">
      <div className="mx-auto max-w-[720px]">
        <header className="sticky top-0 z-20 rounded-[20px] border border-[#181818] bg-[#0b0b0b]/92 px-4 py-3 backdrop-blur sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[12px] font-semibold tracking-[0.18em]">AGENT GUILD</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[#f2b6be]">
                Mini app launcher
              </div>
            </div>
            <ConnectButton client={client} chain={celoSepolia} />
          </div>
        </header>

        <section className="mt-4 rounded-[24px] border border-[#1b1b1b] bg-[radial-gradient(circle_at_top,rgba(215,38,56,0.12),transparent_36%),linear-gradient(180deg,#101010_0%,#0b0b0b_100%)] p-5 sm:p-6">
          <div className="text-[11px] uppercase tracking-[0.16em] text-[#f2b6be]">Launch</div>
          <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.05em] sm:text-[34px]">
            Open the role workspace you need right now.
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#a1a1aa] sm:text-[15px] sm:leading-7">
            Agent Guild now prioritizes the app routes first. Choose client to create, send, and fund. Choose freelancer to review, submit, and track payout.
          </p>

          <div className="mt-5 grid gap-4">
            <RoleCard
              href="/client"
              eyebrow="Client"
              title="Create, send, and fund"
              description="Start with briefs and agreements, then move approved work into escrow and release from one action-driven dashboard."
              cta="Open Client App"
            />
            <RoleCard
              href="/freelancer"
              eyebrow="Freelancer"
              title="Review, submit, and track"
              description="Open the inbox, approve incoming contracts, submit funded work, and monitor reputation without desktop-style scrolling."
              cta="Open Freelancer App"
            />
          </div>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_0.92fr]">
          <div className="rounded-[20px] border border-[#1b1b1b] bg-[#0d0d0d] p-5">
            <div className="text-[11px] uppercase tracking-[0.16em] text-[#71717a]">Core flow</div>
            <div className="mt-4 grid gap-3">
              {appSteps.map((step, index) => (
                <div key={step} className="rounded-[14px] border border-[#1d1d1d] bg-[#090909] px-4 py-4">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#71717a]">
                    Step 0{index + 1}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-[#f7f4ef]">{step}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[20px] border border-[#1b1b1b] bg-[#0d0d0d] p-5">
            <div className="text-[11px] uppercase tracking-[0.16em] text-[#71717a]">Status</div>
            <div className="mt-4 rounded-[16px] border border-[#1d1d1d] bg-[#090909] px-4 py-4 text-sm leading-6 text-[#d4d4d8]">
              {connectedAddress
                ? `Wallet connected: ${shortAddress(connectedAddress)}`
                : "Connect a wallet, then jump straight into the correct role app."}
            </div>
            <div className="mt-4 rounded-[16px] border border-[#4c1d24] bg-[#160b0d] px-4 py-4 text-sm leading-6 text-[#e6c7cb]">
              Mainnet beta keeps release as the only onchain final settlement path. Support review remains recommendation-only.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function RoleCard({
  href,
  eyebrow,
  title,
  description,
  cta,
}: {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-[18px] border border-[#1d1d1d] bg-[#090909] p-5 transition hover:border-[#363636]"
    >
      <div className="text-[11px] uppercase tracking-[0.16em] text-[#f2b6be]">{eyebrow}</div>
      <div className="mt-3 text-[20px] font-semibold tracking-[-0.04em] text-[#f7f4ef]">{title}</div>
      <div className="mt-3 text-sm leading-6 text-[#a1a1aa]">{description}</div>
      <div className="mt-5 inline-flex rounded-[12px] bg-[#d72638] px-4 py-2.5 text-sm font-semibold text-white">
        {cta}
      </div>
    </Link>
  );
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
