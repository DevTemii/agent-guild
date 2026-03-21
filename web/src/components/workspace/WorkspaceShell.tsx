"use client";

import { ReactNode } from "react";

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
  return (
    <main className="min-h-screen bg-[#070707] text-[#f7f4ef]">
      <div className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8">
        <header className="border-b border-[#151515] py-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[14px] font-semibold tracking-[0.18em]">AGENT GUILD</div>
              <div className="mt-2 text-[12px] uppercase tracking-[0.16em] text-[#f2b6be]">
                {workspaceLabel}
              </div>
            </div>

            {headerActions && <div className="flex flex-wrap items-center gap-3">{headerActions}</div>}
          </div>
        </header>

        <section className="py-6 sm:py-8 lg:py-10">
          <div className="rounded-[28px] border border-[#181818] bg-[#0a0a0a] p-4 sm:p-6">
            <div className="rounded-[24px] border border-[#1a1a1a] bg-[radial-gradient(circle_at_top,rgba(215,38,56,0.14),transparent_36%),linear-gradient(180deg,#101010_0%,#0b0b0b_100%)] p-6 sm:p-8">
              <div className="max-w-[880px]">
                <h1 className="text-[32px] font-semibold tracking-[-0.04em] sm:text-[42px] lg:text-[50px]">
                  {title}
                </h1>
                <p className="mt-4 max-w-[760px] text-[15px] leading-7 text-[#a1a1aa] sm:text-[16px] sm:leading-8">
                  {description}
                </p>
              </div>

              {metricStrip && <div className="mt-6">{metricStrip}</div>}
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
              <aside className="hidden xl:block">
                <DashboardNav
                  items={navItems}
                  activeItem={activeItem}
                  onItemChange={onItemChange}
                  desktop
                />
              </aside>

              <div className="min-w-0">
                <div className="xl:hidden">
                  <DashboardNav
                    items={navItems}
                    activeItem={activeItem}
                    onItemChange={onItemChange}
                  />
                </div>

                <div className="mt-4 grid gap-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="min-w-0 space-y-6">
                    {focusArea}
                    {mainArea}
                  </div>
                  {supportArea ? <div className="min-w-0 space-y-6">{supportArea}</div> : null}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function DashboardNav({
  items,
  activeItem,
  onItemChange,
  desktop = false,
}: {
  items: WorkspaceNavItem[];
  activeItem: string;
  onItemChange: (id: string) => void;
  desktop?: boolean;
}) {
  if (desktop) {
    return (
      <div className="sticky top-6 rounded-[22px] border border-[#1b1b1b] bg-[#0d0d0d] p-4">
        <div className="text-[11px] uppercase tracking-[0.16em] text-[#71717a]">Navigation</div>
        <div className="mt-4 grid gap-2">
          {items.map((item) => {
            const active = item.id === activeItem;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onItemChange(item.id)}
                className={`rounded-[16px] border px-4 py-4 text-left transition ${
                  active
                    ? "border-[#6f1d26] bg-[#160b0d]"
                    : "border-[#1d1d1d] bg-[#090909] hover:border-[#323232]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-[#f7f4ef]">{item.label}</div>
                  {item.badge ? (
                    <div className="rounded-full border border-[#2c2c2c] bg-[#111111] px-2.5 py-1 text-[11px] text-[#d4d4d8]">
                      {item.badge}
                    </div>
                  ) : null}
                </div>
                {item.hint ? <div className="mt-2 text-xs leading-6 text-[#8b8b95]">{item.hint}</div> : null}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-10 -mx-1 overflow-x-auto rounded-[18px] border border-[#1b1b1b] bg-[#0c0c0c] p-1 backdrop-blur-sm">
      <div className="flex min-w-max gap-2">
        {items.map((item) => {
          const active = item.id === activeItem;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onItemChange(item.id)}
              className={`rounded-[14px] px-4 py-3 text-sm font-medium transition ${
                active
                  ? "bg-[#160b0d] text-[#f7f4ef]"
                  : "bg-transparent text-[#a1a1aa] hover:bg-[#111111] hover:text-[#f7f4ef]"
              }`}
            >
              <span>{item.label}</span>
              {item.badge ? <span className="ml-2 text-[11px] text-[#d4d4d8]">{item.badge}</span> : null}
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
    <section className={`rounded-[22px] border border-[#1b1b1b] bg-[#0d0d0d] p-5 sm:p-6 ${className}`}>
      {(title || subtitle || action) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {title ? (
              <h2 className="text-[20px] font-semibold tracking-[-0.03em] text-[#f7f4ef]">{title}</h2>
            ) : null}
            {subtitle ? <p className="mt-2 text-sm leading-7 text-[#a1a1aa]">{subtitle}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      )}
      <div className={title || subtitle || action ? "mt-5" : ""}>{children}</div>
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
    <div className="rounded-[22px] border border-[#4c1d24] bg-[linear-gradient(180deg,#160b0d_0%,#11090b_100%)] p-5 sm:p-6">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[#f2b6be]">{eyebrow}</div>
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[24px] font-semibold tracking-[-0.03em] text-[#f7f4ef]">{title}</div>
          <p className="mt-3 max-w-[780px] text-sm leading-7 text-[#e6c7cb]">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
