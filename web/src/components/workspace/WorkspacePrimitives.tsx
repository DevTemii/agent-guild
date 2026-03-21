"use client";

import { ReactNode } from "react";
import { ProductContract } from "@/lib/workflowStore";
import { WorkspacePanel } from "./WorkspaceShell";

export function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[#1d1d1d] bg-[#0d0d0d] p-4">
      <div className="text-[26px] font-semibold tracking-[-0.03em] text-[#f7f4ef]">{value}</div>
      <div className="mt-2 text-[11px] uppercase tracking-[0.14em] text-[#71717a]">{label}</div>
    </div>
  );
}

export function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[#1d1d1d] bg-[#090909] p-4">
      <div className="text-[12px] uppercase tracking-[0.14em] text-[#71717a]">{label}</div>
      <div className="mt-2 break-words text-[14px] leading-7 text-[#d4d4d8]">{value}</div>
    </div>
  );
}

export function MetadataPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-[#1d1d1d] bg-[#0d0d0d] px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-[#71717a]">{label}</div>
      <div className="mt-2 break-words text-[13px] font-medium text-[#f7f4ef]">{value}</div>
    </div>
  );
}

export function NotificationList({
  notifications,
  emptyCopy,
}: {
  notifications: string[];
  emptyCopy: string;
}) {
  if (notifications.length === 0) {
    return <EmptyState copy={emptyCopy} />;
  }

  return (
    <div className="grid gap-2">
      {notifications.slice(0, 4).map((note, index) => (
        <div key={index} className="rounded-[12px] border border-[#1d1d1d] bg-[#090909] px-4 py-3 text-sm text-[#d4d4d8]">
          {note}
        </div>
      ))}
    </div>
  );
}

export function ContractCardList({
  contracts,
  variant,
  emptyState = "No contracts yet.",
  actionLabel,
  onAction,
  nextActionLabel,
  selectable = false,
  selectedId,
  onSelect,
  footer,
}: {
  contracts: ProductContract[];
  variant: "client" | "freelancer";
  emptyState?: string;
  actionLabel?: string;
  onAction?: (id: string) => void;
  nextActionLabel?: (contract: ProductContract) => string;
  selectable?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  footer?: (contract: ProductContract) => ReactNode;
}) {
  if (contracts.length === 0) {
    return <EmptyState copy={emptyState} />;
  }

  return (
    <div className="grid gap-3">
      {contracts.map((contract) => {
        const linkedProjectId = typeof contract.linkedProjectId === "number" ? contract.linkedProjectId : null;
        const isEscrowLinked = linkedProjectId !== null && linkedProjectId > 0;

        return (
          <div
            key={contract.id}
            onClick={() => selectable && onSelect?.(contract.id)}
            onKeyDown={(event) => {
              if (selectable && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onSelect?.(contract.id);
              }
            }}
            role={selectable ? "button" : undefined}
            tabIndex={selectable ? 0 : undefined}
            className={`rounded-[16px] border p-4 text-left transition ${
              selectable && selectedId === contract.id
                ? "border-[#6f1d26] bg-[#160b0d]"
                : "border-[#1d1d1d] bg-[#090909]"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[#f7f4ef]">
                  {variant === "client" ? contract.freelancerName : contract.clientName}
                </div>
                <div className="mt-1 text-xs text-[#71717a]">
                  {variant === "client" ? "Freelancer" : "Client"}
                </div>
              </div>
              <StatusBadge status={contract.status} />
            </div>

            <div className="mt-3 text-sm leading-7 text-[#d4d4d8]">{contract.summary}</div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <MetadataPill label="Budget" value={`$${contract.budget}`} />
              <MetadataPill label="Milestones" value={`${contract.milestones.length}`} />
              <MetadataPill
                label="Next"
                value={
                  nextActionLabel
                    ? nextActionLabel(contract)
                    : contract.status === "sent"
                      ? "Waiting"
                      : "Review"
                }
              />
            </div>

            {isEscrowLinked ? (
              <div className="mt-4 rounded-[12px] border border-[#1f1f1f] bg-[#111111] px-3 py-3 text-xs text-[#d4d4d8]">
                Escrow created for Project #{linkedProjectId}.
              </div>
            ) : null}

            {footer ? <div className="mt-4">{footer(contract)}</div> : null}

            {actionLabel && onAction && !isEscrowLinked ? (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onAction(contract.id);
                  }}
                  className="inline-flex rounded-[10px] bg-[#d72638] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#b91f30]"
                >
                  {actionLabel}
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function StatusBadge({ status }: { status: ProductContract["status"] }) {
  const tone =
    status === "approved"
      ? "border-[#1f3b28] bg-[#0d1912] text-[#9be2b0]"
      : status === "rejected"
        ? "border-[#4c1d24] bg-[#160b0d] text-[#f2b6be]"
        : status === "sent"
          ? "border-[#3a2d18] bg-[#171108] text-[#f8d28c]"
          : "border-[#242424] bg-[#0d0d0d] text-[#d4d4d8]";

  return (
    <div className={`rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] ${tone}`}>
      {status}
    </div>
  );
}

export function SegmentedControl({
  items,
  activeId,
  onChange,
}: {
  items: Array<{ id: string; label: string }>;
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex max-w-full gap-2 overflow-x-auto rounded-[14px] border border-[#1d1d1d] bg-[#090909] p-1">
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`whitespace-nowrap rounded-[10px] px-3 py-2 text-xs font-semibold transition ${
              active ? "bg-[#160b0d] text-[#f7f4ef]" : "text-[#a1a1aa] hover:bg-[#111111] hover:text-[#f7f4ef]"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function PipelineRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "amber" | "red" | "green";
}) {
  const borderTone =
    tone === "amber"
      ? "border-[#3a2d18] bg-[#171108]"
      : tone === "red"
        ? "border-[#4c1d24] bg-[#160b0d]"
        : tone === "green"
          ? "border-[#1f3b28] bg-[#0d1912]"
          : "border-[#1d1d1d] bg-[#090909]";

  return (
    <div className={`flex items-center justify-between gap-4 rounded-[14px] border px-4 py-3 ${borderTone}`}>
      <div className="text-sm text-[#d4d4d8]">{label}</div>
      <div className="text-sm font-semibold text-[#f7f4ef]">{value}</div>
    </div>
  );
}

export function EmptyState({ copy }: { copy: string }) {
  return (
    <div className="rounded-[14px] border border-dashed border-[#242424] bg-[#090909] px-4 py-6 text-sm leading-7 text-[#a1a1aa]">
      {copy}
    </div>
  );
}

export function SetupGate({ copy }: { copy: string }) {
  return (
    <WorkspacePanel title="Setup required" subtitle="This view depends on the workspace being initialized first.">
      <EmptyState copy={copy} />
    </WorkspacePanel>
  );
}

export function InlineNotice({ message }: { message: string }) {
  return (
    <div className="rounded-[12px] border border-[#1d1d1d] bg-[#090909] px-4 py-3 text-sm text-[#d4d4d8]">
      {message}
    </div>
  );
}
