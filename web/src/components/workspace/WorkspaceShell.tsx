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
  const [showMobileSupport, setShowMobileSupport] = useState(false);

  return (
    <main className="min-h-screen bg-[#070707] text-[#f7f4ef]">
      <div className="mx-auto max-w-[1380px] px-3 sm:px-5 lg:px-8">
        <header className="sticky top-0 z-30 border-b border-[#151515] bg-[#070707]/92 py-3 backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[12px] font-semibold tracking-[0.18em] text-[#f7f4ef]">AGENT GUILD</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[#f2b6be]">
                {workspaceLabel}
              </div>
            </div>

            {headerActions && <div className="flex flex-wrap items-center gap-3">{headerActions}</div>}
          </div>
        </header>

        <section className="py-4 sm:py-6 lg:py-8">
          <div className="rounded-[24px] border border-[#181818] bg-[#0a0a0a] p-3 sm:p-5">
            <div className="rounded-[20px] border border-[#1a1a1a] bg-[radial-gradient(circle_at_top,rgba(215,38,56,0.12),transparent_34%),linear-gradient(180deg,#101010_0%,#0b0b0b_100%)] p-4 sm:p-6">
              <div className="max-w-[880px]">
                <h1 className="text-[24px] font-semibold tracking-[-0.04em] sm:text-[30px] lg:text-[38px]">
                  {title}
                </h1>
                <p className="mt-3 max-w-[760px] text-[14px] leading-6 text-[#a1a1aa] sm:text-[15px] sm:leading-7">
                  {description}
                </p>
              </div>

              {metricStrip && <div className="mt-4">{metricStrip}</div>}
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)] xl:gap-5">
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

                <div className="mt-3 grid gap-4 2xl:grid-cols-[minmax(0,1fr)_300px] 2xl:gap-5">
                  <div className="min-w-0 space-y-4 sm:space-y-5">
                    {focusArea}
                    {mainArea}
                  </div>
                  {supportArea ? (
                    <>
                      <div className="min-w-0 space-y-5 hidden 2xl:block">{supportArea}</div>
                      <div className="2xl:hidden">
                        <button
                          type="button"
                          onClick={() => setShowMobileSupport((current) => !current)}
                          className="flex w-full items-center justify-between rounded-[18px] border border-[#1b1b1b] bg-[#0d0d0d] px-4 py-3 text-left text-sm font-semibold text-[#f7f4ef]"
                        >
                          <span>Support & context</span>
                          <span className="text-xs text-[#a1a1aa]">
                            {showMobileSupport ? "Hide" : "Show"}
                          </span>
                        </button>

                        {showMobileSupport ? (
                          <div className="mt-4 space-y-4">{supportArea}</div>
                        ) : null}
                      </div>
                    </>
                  ) : null}
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
      <div className="sticky top-20 rounded-[20px] border border-[#1b1b1b] bg-[#0d0d0d] p-3">
        <div className="text-[11px] uppercase tracking-[0.16em] text-[#71717a]">Navigation</div>
        <div className="mt-3 grid gap-2">
          {items.map((item) => {
            const active = item.id === activeItem;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onItemChange(item.id)}
                className={`rounded-[14px] border px-3 py-3 text-left transition ${
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
    <div className="sticky top-[58px] z-20 -mx-1 overflow-x-auto rounded-[16px] border border-[#1b1b1b] bg-[#0c0c0c]/96 p-1 backdrop-blur-sm">
      <div className="flex min-w-max gap-2">
        {items.map((item) => {
          const active = item.id === activeItem;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onItemChange(item.id)}
              className={`rounded-[12px] px-3 py-2.5 text-sm font-medium transition ${
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
    <section className={`rounded-[18px] border border-[#1b1b1b] bg-[#0d0d0d] p-4 sm:p-5 ${className}`}>
      {(title || subtitle || action) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {title ? (
              <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-[#f7f4ef]">{title}</h2>
            ) : null}
            {subtitle ? <p className="mt-2 text-sm leading-6 text-[#a1a1aa]">{subtitle}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
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
    <div className="rounded-[18px] border border-[#4c1d24] bg-[linear-gradient(180deg,#160b0d_0%,#11090b_100%)] p-4 sm:p-5">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[#f2b6be]">{eyebrow}</div>
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[20px] font-semibold tracking-[-0.03em] text-[#f7f4ef] sm:text-[22px]">{title}</div>
          <p className="mt-2 max-w-[780px] text-sm leading-6 text-[#e6c7cb]">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
