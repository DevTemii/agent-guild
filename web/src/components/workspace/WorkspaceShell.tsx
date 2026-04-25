"use client";

import { ReactNode, useState } from "react";

export type WorkspaceNavItem = {
  id: string;
  label: string;
  badge?: string;
  hint?: string;
};

type WorkspaceShellProps = {
  workspaceLabel: string;
  title: string;
  description: string;
  navItems: WorkspaceNavItem[];
  activeItem: string;
  onItemChange: (id: string) => void;
  headerActions?: ReactNode;
  metricStrip?: ReactNode;
  focusArea?: ReactNode;
  mainArea: ReactNode;
  supportArea?: ReactNode;
};

export function WorkspaceShell({
  workspaceLabel,
  title,
  description,
  navItems,
  activeItem,
  onItemChange,
  headerActions,
  metricStrip,
  focusArea,
  mainArea,
  supportArea,
}: WorkspaceShellProps) {
  const [showMore, setShowMore] = useState(false);

  return (
    <main className="min-h-screen bg-[#050505] pb-28 text-[#f7f4ef]">
      <div className="mx-auto max-w-[420px] px-4 py-4">
        <header className="sticky top-0 z-30 rounded-[24px] border border-[#181818] bg-[#0a0a0a]/94 px-4 py-4 shadow-[0_16px_48px_rgba(0,0,0,0.35)] backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f2b6be]">
                {workspaceLabel}
              </div>
              <div className="mt-2 text-[22px] font-semibold tracking-[-0.05em] text-[#f7f4ef]">
                {title}
              </div>
            </div>
            {headerActions ? <div className="flex shrink-0 items-center gap-2">{headerActions}</div> : null}
          </div>
          <p className="mt-3 text-sm leading-6 text-[#9ca3af]">{description}</p>
        </header>

        {metricStrip ? <div className="mt-4">{metricStrip}</div> : null}
        {focusArea ? <div className="mt-4">{focusArea}</div> : null}

        <div className="mt-4 space-y-4">{mainArea}</div>

        {supportArea ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowMore((current) => !current)}
              className="flex min-h-[52px] w-full items-center justify-between rounded-[18px] border border-[#1b1b1b] bg-[#0d0d0d] px-4 py-3 text-left text-sm font-semibold text-[#f7f4ef]"
            >
              <span>More details</span>
              <span className="text-xs text-[#a1a1aa]">{showMore ? "Hide" : "Show"}</span>
            </button>

            {showMore ? <div className="mt-4 space-y-4">{supportArea}</div> : null}
          </div>
        ) : null}
      </div>

      {navItems.length > 0 ? (
        <BottomTabs items={navItems} activeItem={activeItem} onItemChange={onItemChange} />
      ) : null}
    </main>
  );
}

function BottomTabs({
  items,
  activeItem,
  onItemChange,
}: {
  items: WorkspaceNavItem[];
  activeItem: string;
  onItemChange: (id: string) => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#171717] bg-[#070707]/97 px-3 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-[420px] items-center justify-between gap-2 rounded-[22px] border border-[#1b1b1b] bg-[radial-gradient(circle_at_top,rgba(215,38,56,0.12),transparent_55%),#0b0b0b] p-1.5 shadow-[0_-12px_40px_rgba(0,0,0,0.35)]">
        {items.map((item) => {
          const active = item.id === activeItem;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onItemChange(item.id)}
              className={`flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center rounded-[16px] px-2 py-2.5 text-center text-[11px] font-semibold transition ${
                active
                  ? "bg-[#180c0f] text-[#f7f4ef]"
                  : "text-[#8c8c95] hover:bg-[#121212] hover:text-[#f7f4ef]"
              }`}
            >
              <span>{item.label}</span>
              {item.badge ? <span className="mt-1 text-[10px] text-[#d4d4d8]">{item.badge}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function WorkspacePanel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[24px] border border-[#181818] bg-[#0b0b0b] p-4 shadow-[0_14px_40px_rgba(0,0,0,0.22)] ${className}`}>
      {(title || subtitle || action) && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3">
            <div>
              {title ? (
                <h2 className="text-[18px] font-semibold tracking-[-0.04em] text-[#f7f4ef]">{title}</h2>
              ) : null}
              {subtitle ? <p className="mt-2 text-sm leading-6 text-[#9ca3af]">{subtitle}</p> : null}
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </div>
        </div>
      )}
      <div className={title || subtitle || action ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

export function SectionNotice({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-[#4c1d24] bg-[radial-gradient(circle_at_top,rgba(215,38,56,0.18),transparent_36%),linear-gradient(180deg,#170b0d_0%,#10080a_100%)] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.3)]">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[#f2b6be]">{eyebrow}</div>
      <div className="mt-3 text-[24px] font-semibold tracking-[-0.05em] text-[#f7f4ef]">{title}</div>
      <p className="mt-3 text-[15px] leading-7 text-[#e6c7cb]">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
