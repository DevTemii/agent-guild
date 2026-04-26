"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfigErrorPanel } from "@/components/ConfigErrorScreen";
import { MiniPayWalletSheet } from "@/components/wallet/MiniPayWalletSheet";
import { client } from "@/lib/client";
import { agentGuildRuntimeConfig } from "@/lib/runtimeConfig";
import { useAgentWalletSession } from "@/lib/walletSession";

type Role = "client" | "freelancer";

export default function Home() {
  if (!agentGuildRuntimeConfig.valid || !client) {
    return <ConfigAwareHomeEntry />;
  }

  return <ConfiguredHomeEntry />;
}

function ConfiguredHomeEntry() {
  const router = useRouter();
  const walletSession = useAgentWalletSession();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const connectedAddress = walletSession.address;

  const continueLabel = useMemo(() => {
    if (!selectedRole) {
      return undefined;
    }

    return selectedRole === "client" ? "Continue as Client" : "Continue as Freelancer";
  }, [selectedRole]);

  function openRole(role: Role) {
    setSelectedRole(role);
  }

  function handleContinue() {
    if (!selectedRole || !connectedAddress) {
      return;
    }

    console.log("wallet sheet continue clicked", selectedRole, connectedAddress);
    const nextRoute = selectedRole === "client" ? "/client" : "/freelancer";
    setSelectedRole(null);
    router.push(nextRoute);
  }

  return (
    <>
      <EntryScreen onSelectRole={openRole} />
      <MiniPayWalletSheet
        open={selectedRole !== null}
        onClose={() => setSelectedRole(null)}
        continueLabel={continueLabel}
        selectedRole={selectedRole}
        onContinue={handleContinue}
      />
    </>
  );
}

function ConfigAwareHomeEntry() {
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  return (
    <>
      <EntryScreen onSelectRole={(role) => setSelectedRole(role)} />

      {selectedRole ? (
        <StaticSheet onClose={() => setSelectedRole(null)}>
          <ConfigErrorPanel
            title="Agent Guild needs runtime setup before wallet actions can load."
            description="The splash screen is still available, but wallet connection and contract actions stay disabled until the public app configuration is fixed."
            errors={agentGuildRuntimeConfig.errors}
          />
        </StaticSheet>
      ) : null}
    </>
  );
}

function EntryScreen({
  onSelectRole,
}: {
  onSelectRole: (role: Role) => void;
}) {
  return (
    <main className="min-h-screen overflow-hidden bg-[#050505] px-4 py-5 text-[#f7f4ef]">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-[390px] flex-col justify-between rounded-[32px] border border-[#1b1b1b] bg-[radial-gradient(circle_at_top,rgba(215,38,56,0.18),transparent_34%),linear-gradient(180deg,#101010_0%,#060606_100%)] px-5 py-6 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
        <div>
          <div className="inline-flex rounded-full border border-[#42171e] bg-[#180c0f] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f2b6be]">
            Agent Guild
          </div>

          <div className="mt-12">
            <div className="text-[36px] font-semibold tracking-[-0.07em] text-[#f7f4ef]">
              Secure freelance payments on Celo.
            </div>
            <p className="mt-4 max-w-[300px] text-[15px] leading-7 text-[#c9c9d1]">
              Create a deal, lock payment, submit work, and release funds in one simple flow.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => onSelectRole("client")}
            className="min-h-[56px] w-full rounded-[20px] bg-[#d72638] px-5 py-4 text-base font-semibold text-white transition hover:bg-[#b91f30]"
          >
            Continue as Client
          </button>
          <button
            type="button"
            onClick={() => onSelectRole("freelancer")}
            className="min-h-[56px] w-full rounded-[20px] border border-[#252525] bg-[#0c0c0c] px-5 py-4 text-base font-semibold text-[#f7f4ef] transition hover:border-[#383838]"
          >
            Continue as Freelancer
          </button>
        </div>
      </div>
    </main>
  );
}

function StaticSheet({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 pb-4 pt-10 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close sheet"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div className="relative w-full max-w-[420px] rounded-[28px] border border-[#2a1116] bg-[radial-gradient(circle_at_top,rgba(215,38,56,0.18),transparent_38%),linear-gradient(180deg,#111111_0%,#080808_100%)] p-5">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#2a2a2a]" />
        {children}
      </div>
    </div>
  );
}
