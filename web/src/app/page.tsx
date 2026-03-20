"use client";

import Link from "next/link";
import { ReactNode, useMemo, useState } from "react";
import { MotionConfig, motion, useReducedMotion } from "framer-motion";
import { ConnectButton, useActiveAccount, useReadContract } from "thirdweb/react";
import { defineChain, getContract } from "thirdweb";
import { client } from "@/lib/client";
import { AGENT_REGISTRY_ABI, AGENT_REGISTRY_ADDRESS } from "@/lib/contract";
import { getReputationForWallet } from "@/lib/reputationStore";

type Agent = {
  owner: string;
  name: string;
  description: string;
  skill: string;
  hourlyRate: bigint;
  location: string;
  availability: string;
};

const featuredTalentFallback = [
  {
    name: "Nora Vale",
    skill: "Workflow Design",
    description: "Builds contract-driven execution systems for recurring client delivery.",
    rate: "$120/hr",
    location: "Remote",
    availability: "Available this week",
    guildScore: "92/100",
    completed: "18",
  },
  {
    name: "Ibrahim Cole",
    skill: "AI Ops",
    description: "Specializes in agent deployment, monitoring, and milestone-based delivery.",
    rate: "$140/hr",
    location: "London",
    availability: "Taking projects",
    guildScore: "95/100",
    completed: "24",
  },
  {
    name: "Mina Park",
    skill: "Product Systems",
    description: "Translates product briefs into scoped execution plans with delivery accountability.",
    rate: "$110/hr",
    location: "Berlin",
    availability: "Open next sprint",
    guildScore: "89/100",
    completed: "16",
  },
] as const;

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

const easeOut = [0.22, 1, 0.36, 1] as const;
const baseTransition = { duration: 0.26, ease: easeOut } as const;
const heroTransition = { duration: 0.28, ease: easeOut } as const;

export default function Home() {
  const account = useActiveAccount();
  const [search, setSearch] = useState("");

  const contract = useMemo(
    () =>
      getContract({
        client,
        chain: celoSepolia,
        address: AGENT_REGISTRY_ADDRESS,
        abi: AGENT_REGISTRY_ABI,
      }),
    []
  );

  const { data, isLoading } = useReadContract({
    contract,
    method: "getAgents",
    params: [],
  });

  const allAgents = (data as Agent[] | undefined) || [];
  const uniqueAgents = allAgents.filter((agent, index, arr) => {
    const owner = agent.owner.toLowerCase();
    return index === arr.findIndex((item) => item.owner.toLowerCase() === owner);
  });

  const filteredAgents = uniqueAgents.filter((agent) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      agent.name.toLowerCase().includes(q) ||
      agent.skill.toLowerCase().includes(q) ||
      agent.location.toLowerCase().includes(q)
    );
  });

  const previewAgents = filteredAgents.slice(0, 6);

  const trustStack = [
    {
      title: "Contracts",
      body: "Structured agreements capture scope, milestones, and explicit approval before execution begins.",
    },
    {
      title: "Escrow",
      body: "Funding follows approval so payment is committed before delivery work starts.",
    },
    {
      title: "Delivery",
      body: "Submission stays tied to the agreed record instead of getting lost across chat, files, and status updates.",
    },
    {
      title: "Judgment",
      body: "Disputes reuse contract context, delivery evidence, and the stated challenge in one review path.",
    },
    {
      title: "Reputation",
      body: "Every resolved outcome becomes durable signal for the next hiring or delivery decision.",
    },
  ];

  const whyItMatters = [
    {
      title: "Fragmented agreements",
      body: "Scope often lives across briefs, messages, and edits, so both sides operate from different assumptions.",
    },
    {
      title: "Unclear payments",
      body: "Money frequently sits outside the agreement, which weakens confidence before work even starts.",
    },
    {
      title: "Weak dispute systems",
      body: "When delivery is contested, most workflows lack a structured record strong enough to resolve it cleanly.",
    },
  ];

  return (
    <MotionConfig transition={baseTransition}>
      <main className="relative min-h-screen overflow-hidden bg-[#050506] text-[#f7f4ef]">
        <AmbientBackdrop />

        <div className="relative mx-auto max-w-[1180px] px-4 sm:px-6">
          <header className="sticky top-0 z-30 border-b border-white/6 bg-[#050506]/88 backdrop-blur-lg">
            <div className="flex items-center justify-between py-4">
              <Reveal delay={0.02}>
                <Link href="/" className="text-[14px] font-semibold tracking-[0.22em] text-[#f7f4ef]">
                  AGENT GUILD
                </Link>
              </Reveal>

              <Reveal delay={0.08} className="hidden items-center gap-6 text-[13px] text-[#8a8a93] md:flex">
                <a href="#why" className="transition hover:text-[#f7f4ef]">Why</a>
                <a href="#system" className="transition hover:text-[#f7f4ef]">System</a>
                <a href="#workspaces" className="transition hover:text-[#f7f4ef]">Workspaces</a>
                <a href="#registry" className="transition hover:text-[#f7f4ef]">Talent</a>
              </Reveal>

              <Reveal delay={0.12} className="flex items-center gap-3">
                <div className="hidden sm:block">
                  <MotionLink href="/client" label="Client Workspace" variant="secondary" />
                </div>
                <ConnectButton client={client} chain={celoSepolia} />
              </Reveal>
            </div>
          </header>

          <section className="relative flex min-h-[78vh] items-center py-20 sm:py-28">
            <div className="mx-auto max-w-[860px] text-center">
              <Reveal delay={0.1}>
                <h1 className="mx-auto max-w-[760px] text-[44px] font-semibold leading-[0.94] tracking-[-0.07em] text-[#fbfaf8] sm:text-[64px] lg:text-[82px]">
                  The trust layer for modern work.
                </h1>
              </Reveal>

              <Reveal delay={0.18}>
                <p className="mx-auto mt-6 max-w-[560px] text-[17px] leading-8 text-[#a7a5ae] sm:text-[18px]">
                  From agreement to resolution, every step of work runs on one system.
                </p>
              </Reveal>

              <motion.div
                initial="hidden"
                animate="show"
                variants={{
                  hidden: {},
                  show: { transition: { staggerChildren: 0.06, delayChildren: 0.24 } },
                }}
                className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
              >
                {[
                  { href: "/client", label: "Continue as Client", variant: "primary" as const },
                  { href: "/freelancer", label: "Continue as Freelancer", variant: "secondary" as const },
                  { href: "#registry", label: "Explore Talent", variant: "secondary" as const },
                ].map((item) => (
                  <motion.div
                    key={item.label}
                    variants={{
                      hidden: { opacity: 0, y: 14 },
                      show: { opacity: 1, y: 0, transition: baseTransition },
                    }}
                  >
                    <MotionLink href={item.href} label={item.label} variant={item.variant} />
                  </motion.div>
                ))}
              </motion.div>

              <HeroVisual />
            </div>
          </section>

          <SectionReveal className="border-y border-white/6 py-8 md:py-10">
            <div className="grid gap-3 md:grid-cols-3">
              {[
                {
                  title: "Approval before funds",
                  body: "Work moves into escrow only after both sides align on the agreement.",
                },
                {
                  title: "Delivery tied to scope",
                  body: "Submission stays attached to the same contract record that started the job.",
                },
                {
                  title: "Resolution becomes trust",
                  body: "Every completed outcome strengthens the reputation layer for future work.",
                },
              ].map((item, index) => (
                <HoverCard
                  key={item.title}
                  delay={0.04 * index}
                  className="rounded-[20px] border border-white/8 bg-[#09090b] px-5 py-5"
                >
                  <div className="text-[14px] font-semibold tracking-[-0.03em] text-[#fbfaf8]">{item.title}</div>
                  <div className="mt-3 text-[14px] leading-7 text-[#9d9da6]">{item.body}</div>
                </HoverCard>
              ))}
            </div>
          </SectionReveal>

          <SectionReveal id="why" className="py-24 sm:py-30">
            <div className="rounded-[34px] border border-white/6 bg-[#08080a] px-6 py-8 sm:px-8 sm:py-10">
              <SectionEyebrow>Why it matters</SectionEyebrow>
              <SectionIntro
                title="Work slows down when trust lives in too many places."
                className="mt-4 max-w-[760px] text-left"
              />

              <div className="mt-12 grid gap-4 lg:grid-cols-3">
                {whyItMatters.map((item, index) => (
                  <ProblemCard
                    key={item.title}
                    title={item.title}
                    body={item.body}
                    delay={0.04 * index}
                  />
                ))}
              </div>
            </div>
          </SectionReveal>

          <SectionReveal id="system" className="py-24 sm:py-30">
            <div className="rounded-[34px] border border-white/6 bg-[linear-gradient(180deg,rgba(10,10,12,0.98),rgba(7,7,9,0.96))] px-6 py-8 sm:px-8 sm:py-10">
              <SectionEyebrow>Trust Stack</SectionEyebrow>
              <SectionIntro
                title={"Contracts, escrow, delivery, and dispute resolution \u2014 unified in one system."}
                className="mt-4 text-left"
              />

              <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {trustStack.map((item, index) => (
                  <SystemCard
                    key={item.title}
                    title={item.title}
                    body={item.body}
                    step={`0${index + 1}`}
                    delay={0.04 * index}
                  />
                ))}
              </div>
            </div>
          </SectionReveal>

          <SectionReveal id="workspaces" className="border-t border-white/6 py-24 sm:py-30">
            <SectionIntro title="One system for clients and freelancers." />

            <div className="mt-14 grid gap-6 lg:grid-cols-2">
              <WorkspaceCard
                href="/client"
                eyebrow="Client"
                title="Client workspace"
                body="Run agreement, approval, funding, and review from one operating surface."
                bullets={[
                  "Generate contract drafts from project briefs",
                  "Send work for approval before escrow creation",
                  "Fund escrow once approval is in place",
                  "Review delivery and release or dispute",
                ]}
                primary
              />
              <WorkspaceCard
                href="/freelancer"
                eyebrow="Freelancer"
                title="Freelancer workspace"
                body="Move from profile to approval, funded execution, and visible reputation growth."
                bullets={[
                  "Approve or reject incoming contracts",
                  "Track funded work ready for delivery",
                  "Submit against escrow-backed scope",
                  "Compound earnings and guild reputation",
                ]}
              />
            </div>
          </SectionReveal>

          <SectionReveal id="registry" className="border-t border-white/6 py-24 sm:py-30">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <SectionIntro
                title="Discover talent with real execution history."
                className="max-w-[760px] text-left"
              />

              <Reveal delay={0.08} className="w-full lg:max-w-[300px]">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search skill or location"
                  className="w-full rounded-[14px] border border-white/8 bg-[#0c0c0f] px-4 py-3 text-sm text-[#f7f4ef] outline-none placeholder:text-[#676772] focus:border-[#7f2630]"
                />
              </Reveal>
            </div>

            <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {!isLoading && previewAgents.length > 0
                ? previewAgents.map((agent, index) => {
                    const reputation = getReputationForWallet(agent.owner);
                    const isMine = account?.address?.toLowerCase() === agent.owner.toLowerCase();
                    return (
                      <TalentCard
                        key={`${agent.owner}-${index}`}
                        agent={agent}
                        reputation={reputation}
                        isMine={isMine}
                        href={`/agent/${index}`}
                        delay={0.05 * index}
                      />
                    );
                  })
                : featuredTalentFallback.map((profile, index) => (
                    <PlaceholderTalentCard
                      key={profile.name}
                      name={profile.name}
                      skill={profile.skill}
                      description={profile.description}
                      rate={profile.rate}
                      location={profile.location}
                      availability={profile.availability}
                      guildScore={profile.guildScore}
                      completed={profile.completed}
                      delay={0.05 * index}
                    />
                  ))}
            </div>
          </SectionReveal>

          <SectionReveal className="border-t border-white/6 py-24 sm:py-30">
            <motion.div
              whileHover={{ scale: 1.005 }}
              className="relative overflow-hidden rounded-[28px] border border-white/8 bg-[#09090b] p-8 text-center sm:p-12"
            >
              <motion.div
                aria-hidden="true"
                className="absolute inset-x-[30%] top-[-8%] h-24 rounded-full bg-[#d72638]/10 blur-[56px]"
                animate={{ opacity: [0.12, 0.18, 0.12], scale: [1, 1.02, 1] }}
                transition={{ duration: 10, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
              />

              <div className="relative">
                <h2 className="mx-auto max-w-[680px] text-[34px] font-semibold leading-[1.02] tracking-[-0.05em] text-[#fbfaf8] sm:text-[54px]">
                  Trust starts before work begins.
                </h2>
                <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                  <MotionLink href="/client" label="Continue as Client" variant="primary" />
                  <MotionLink href="/freelancer" label="Continue as Freelancer" variant="secondary" />
                </div>
              </div>
            </motion.div>
          </SectionReveal>

          <footer className="border-t border-white/6 py-10 text-sm text-[#71717a]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>Agent Guild</div>
              <div className="flex flex-wrap gap-4">
                <span>Contracts</span>
                <span>Escrow</span>
                <span>AI Judgment</span>
                <span>Reputation</span>
              </div>
            </div>
          </footer>
        </div>
      </main>
    </MotionConfig>
  );
}

function AmbientBackdrop() {
  const reduceMotion = useReducedMotion();

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute left-[-8%] top-[4%] h-[240px] w-[240px] rounded-full bg-[#5b111b]/14 blur-[84px]"
        animate={reduceMotion ? {} : { x: [0, 18, 0], y: [0, 12, 0], opacity: [0.18, 0.24, 0.18] }}
        transition={{ duration: 14, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute right-[-5%] top-[14%] h-[220px] w-[220px] rounded-full bg-[#761f2b]/10 blur-[92px]"
        animate={reduceMotion ? {} : { x: [0, -16, 0], y: [0, 14, 0], opacity: [0.12, 0.18, 0.12] }}
        transition={{ duration: 16, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[-4%] left-[24%] h-[180px] w-[380px] rounded-full bg-[#d72638]/8 blur-[110px]"
        animate={reduceMotion ? {} : { x: [0, 14, 0], y: [0, -10, 0], opacity: [0.08, 0.12, 0.08] }}
        transition={{ duration: 18, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      />
    </div>
  );
}

function HeroVisual() {
  const reduceMotion = useReducedMotion();
  const nodes = [
    {
      title: "Contract",
      body: "Scope, milestones, and approval are established before work begins.",
    },
    {
      title: "Escrow",
      body: "Funding is committed after approval so the job starts from a trusted position.",
    },
    {
      title: "Delivery",
      body: "Work is submitted against the agreed record instead of floating across channels.",
    },
    {
      title: "Judgment",
      body: "Contested outcomes are reviewed against the contract, delivery, and dispute reason.",
    },
    {
      title: "Reputation",
      body: "Resolved work compounds into a visible trust signal for the next engagement.",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.985, y: reduceMotion ? 0 : 18 }}
      animate={
        reduceMotion
          ? { opacity: 1, scale: 1, y: 0 }
          : { opacity: 1, scale: 1, y: [0, -4, 0, 2, 0] }
      }
      transition={{
        opacity: { delay: 0.24, duration: 0.28, ease: easeOut },
        scale: { delay: 0.24, duration: 0.28, ease: easeOut },
        y: { delay: 0.24, duration: 6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" },
      }}
      className="relative mx-auto mt-14 max-w-[900px]"
    >
      <motion.div
        aria-hidden="true"
        className="absolute inset-x-[26%] top-[8%] h-24 rounded-full bg-[#d72638]/10 blur-[56px]"
        animate={reduceMotion ? {} : { opacity: [0.1, 0.14, 0.1], scale: [1, 1.02, 1] }}
        transition={{ duration: 10, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      />

      <div className="relative overflow-hidden rounded-[30px] border border-white/8 bg-[#09090b] px-5 py-7 shadow-[0_26px_70px_rgba(0,0,0,0.34)] sm:px-7 sm:py-8">
        <div className="relative">
          <div className="mx-auto max-w-[720px] text-center">
            <div className="text-[26px] font-semibold tracking-[-0.05em] text-[#fbfaf8] sm:text-[34px]">
              Contracts. Escrow. Delivery. Judgment. Reputation.
            </div>
            <div className="mt-4 text-[15px] leading-7 text-[#9d9da6] sm:text-[16px]">
              Every job follows a structured path from agreement to resolution.
            </div>
          </div>

          <div className="relative mt-10">
            <div className="absolute left-[10%] right-[10%] top-9 hidden h-px bg-[linear-gradient(90deg,rgba(255,255,255,0.05),rgba(255,255,255,0.18),rgba(255,255,255,0.05))] xl:block" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {nodes.map((node, index) => (
                <div key={node.title} className="relative">
                  <motion.div
                    initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }}
                    animate={
                      reduceMotion
                        ? { opacity: 1, y: 0 }
                        : {
                            opacity: 1,
                            y: 0,
                            scale: [1, 1.006, 1],
                            boxShadow: [
                              "0 0 0 rgba(215,38,56,0)",
                              "0 14px 26px rgba(215,38,56,0.08)",
                              "0 0 0 rgba(215,38,56,0)",
                            ],
                          }
                    }
                    transition={{
                      opacity: { delay: 0.32 + index * 0.04, duration: 0.24, ease: easeOut },
                      y: { delay: 0.32 + index * 0.04, duration: 0.24, ease: easeOut },
                      scale: { duration: 5.2, delay: index * 0.45, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" },
                      boxShadow: { duration: 5.2, delay: index * 0.45, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" },
                    }}
                    className="h-full rounded-[22px] border border-white/8 bg-[#0d0d10] px-4 py-6 text-center"
                  >
                    <motion.div
                      className="mx-auto h-2.5 w-2.5 rounded-full bg-[#d72638]"
                      animate={
                        reduceMotion
                          ? {}
                          : {
                              scale: [1, 1.16, 1],
                              opacity: [0.82, 1, 0.82],
                              boxShadow: [
                                "0 0 0 rgba(215,38,56,0)",
                                "0 0 10px rgba(215,38,56,0.28)",
                                "0 0 0 rgba(215,38,56,0)",
                              ],
                            }
                      }
                      transition={{
                        duration: 4.6,
                        delay: index * 0.45,
                        repeat: Number.POSITIVE_INFINITY,
                        ease: "easeInOut",
                      }}
                    />
                    <div className="mt-4 text-[15px] font-semibold tracking-[-0.03em] text-[#fbfaf8]">
                      {node.title}
                    </div>
                    <div className="mt-3 text-[13px] leading-6 text-[#9d9da6]">
                      {node.body}
                    </div>
                  </motion.div>
                  {index < nodes.length - 1 && (
                    <div className="pointer-events-none absolute right-[-10px] top-8 hidden text-[18px] text-transparent after:block after:text-[#6c6b73] after:content-['→'] xl:block">
                      →
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-[#f2b6be]">{children}</div>;
}

function SectionIntro({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  return (
    <div className={`mx-auto max-w-[860px] text-center ${className ?? ""}`}>
      <h2 className="text-[32px] font-semibold leading-[1.02] tracking-[-0.06em] text-[#fbfaf8] sm:text-[48px]">
        {title}
      </h2>
    </div>
  );
}

function MotionLink({ href, label, variant }: { href: string; label: string; variant: "primary" | "secondary" }) {
  const reduceMotion = useReducedMotion();
  const classes =
    variant === "primary"
      ? "bg-[#d72638] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_10px_24px_rgba(215,38,56,0.18)] hover:bg-[#bf2232]"
      : "border border-white/10 bg-white/[0.02] text-[#f7f4ef] hover:border-white/16 hover:bg-white/[0.04]";

  return (
    <motion.div
      animate={
        reduceMotion || variant !== "primary"
          ? {}
          : {
              scale: [1, 1.006, 1],
              boxShadow: [
                "0 10px 24px rgba(215,38,56,0.12)",
                "0 14px 30px rgba(215,38,56,0.18)",
                "0 10px 24px rgba(215,38,56,0.12)",
              ],
            }
      }
      whileHover={
        variant === "primary"
          ? { scale: 1.015, y: -1, boxShadow: "0 14px 30px rgba(215,38,56,0.18)" }
          : { scale: 1.01, y: -1 }
      }
      whileTap={{ scale: 0.99 }}
      transition={
        reduceMotion || variant !== "primary"
          ? baseTransition
          : {
              scale: { duration: 4.8, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" },
              boxShadow: { duration: 4.8, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" },
            }
      }
    >
      <Link
        href={href}
        className={`inline-flex min-w-[190px] items-center justify-center rounded-[14px] px-5 py-3 text-sm font-semibold transition ${classes}`}
      >
        {label}
      </Link>
    </motion.div>
  );
}

function SectionReveal({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: reduceMotion ? 0 : 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={baseTransition}
      className={className}
    >
      {children}
    </motion.section>
  );
}

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...heroTransition, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function HoverCard({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ ...baseTransition, delay }}
      whileHover={{ y: -3, borderColor: "rgba(255,255,255,0.14)", boxShadow: "0 18px 44px rgba(0,0,0,0.24)" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function ProblemCard({
  title,
  body,
  delay,
}: {
  title: string;
  body: string;
  delay: number;
}) {
  return (
    <HoverCard
      delay={delay}
      className="rounded-[26px] border border-white/8 bg-[#0b0b0d] p-6"
    >
      <div className="text-[19px] font-semibold tracking-[-0.04em] text-[#fbfaf8]">{title}</div>
      <p className="mt-4 text-[15px] leading-7 text-[#9d9da6]">{body}</p>
    </HoverCard>
  );
}

function SystemCard({
  title,
  body,
  step,
  delay,
}: {
  title: string;
  body: string;
  step: string;
  delay: number;
}) {
  const reduceMotion = useReducedMotion();
  const loopDelay = delay * 18;

  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      animate={
        reduceMotion
          ? {}
          : {
              scale: [1, 1.006, 1],
              borderColor: [
                "rgba(255,255,255,0.08)",
                "rgba(215,38,56,0.22)",
                "rgba(255,255,255,0.08)",
              ],
              boxShadow: [
                "0 18px 44px rgba(0,0,0,0.16)",
                "0 22px 48px rgba(215,38,56,0.10)",
                "0 18px 44px rgba(0,0,0,0.16)",
              ],
            }
      }
      whileHover={{ y: -3, borderColor: "rgba(255,255,255,0.14)", boxShadow: "0 18px 44px rgba(0,0,0,0.24)" }}
      transition={{
        opacity: { ...baseTransition, delay },
        scale: reduceMotion
          ? baseTransition
          : { duration: 5.4, delay: loopDelay, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" },
        borderColor: reduceMotion
          ? baseTransition
          : { duration: 5.4, delay: loopDelay, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" },
        boxShadow: reduceMotion
          ? baseTransition
          : { duration: 5.4, delay: loopDelay, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" },
      }}
      className="rounded-[24px] border border-white/8 bg-[#0b0b0d] px-5 py-6"
    >
      <div className="text-[11px] uppercase tracking-[0.18em] text-[#767680]">{step}</div>
      <div className="mt-6 text-[22px] font-semibold tracking-[-0.05em] text-[#fbfaf8]">{title}</div>
      <p className="mt-4 text-[14px] leading-7 text-[#9d9da6]">{body}</p>
    </motion.div>
  );
}

function WorkspaceCard({
  href,
  eyebrow,
  title,
  body,
  bullets,
  primary = false,
}: {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  primary?: boolean;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      animate={
        reduceMotion
          ? {}
          : {
              scale: [1, 1.004, 1],
            }
      }
      transition={{
        opacity: baseTransition,
        scale: reduceMotion
          ? baseTransition
          : { duration: 6, delay: primary ? 0.3 : 1.1, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" },
      }}
      whileHover={{
        y: -5,
        boxShadow: "0 20px 48px rgba(0,0,0,0.28)",
        borderColor: primary ? "rgba(215,38,56,0.24)" : "rgba(255,255,255,0.14)",
      }}
      className={`rounded-[30px] border p-8 sm:p-9 ${
        primary ? "border-[#4c1d24] bg-[#0a090a]" : "border-white/8 bg-[#09090b]"
      }`}
    >
      <div className="text-[12px] uppercase tracking-[0.16em] text-[#f2b6be]">{eyebrow}</div>
      <h3 className="mt-5 text-[30px] font-semibold leading-[1.06] tracking-[-0.05em] text-[#fbfaf8]">{title}</h3>
      <p className="mt-5 max-w-[520px] text-[15px] leading-7 text-[#9d9da6]">{body}</p>
      <div className="mt-8 grid gap-3">
        {bullets.map((bullet) => (
          <div key={bullet} className="flex items-start gap-3 text-[14px] leading-7 text-[#d6d1c8]">
            <span className="mt-2 h-2 w-2 rounded-full bg-[#d72638]" />
            <span>{bullet}</span>
          </div>
        ))}
      </div>
      <div className="mt-10">
        <MotionLink
          href={href}
          label={primary ? "Continue as Client" : "Continue as Freelancer"}
          variant={primary ? "primary" : "secondary"}
        />
      </div>
    </motion.div>
  );
}

function TalentCard({
  agent,
  reputation,
  isMine,
  href,
  delay,
}: {
  agent: Agent;
  reputation: ReturnType<typeof getReputationForWallet>;
  isMine: boolean;
  href: string;
  delay: number;
}) {
  return (
    <HoverCard delay={delay} className="h-full">
      <Link href={href} className="block h-full">
        <div className="flex h-full flex-col rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,16,18,0.96),rgba(10,10,12,0.9))] p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[20px] font-semibold tracking-[-0.04em] text-[#fbfaf8]">{agent.name}</h3>
              <p className="mt-2 text-[14px] text-[#9d9da6]">{agent.skill}</p>
            </div>
            {isMine && (
              <span className="rounded-full border border-[#4c1d24] bg-[#160b0d] px-3 py-1 text-[11px] font-medium text-[#f2b6be]">
                My profile
              </span>
            )}
          </div>

          <p className="mt-4 text-[14px] leading-7 text-[#d4d1ca]">{agent.description}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Tag text={agent.location} />
            <Tag text={agent.availability} />
            <Tag text={`$${agent.hourlyRate.toString()}/hr`} />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <MetricMini label="Guild Score" value={`${reputation.guildScore}/100`} />
            <MetricMini label="Completed" value={`${reputation.completedContracts}`} />
            <MetricMini label="Earned" value={`$${reputation.totalEarned}`} />
            <MetricMini label="Credit" value={reputation.creditUnlocked ? `$${reputation.creditAmount}` : "Locked"} />
          </div>
          <div className="mt-6 border-t border-white/6 pt-4 text-[12px] text-[#71717a]">
            Owner: {shortenAddress(agent.owner)}
          </div>
        </div>
      </Link>
    </HoverCard>
  );
}

function PlaceholderTalentCard({
  name,
  skill,
  description,
  rate,
  location,
  availability,
  guildScore,
  completed,
  delay,
}: {
  name: string;
  skill: string;
  description: string;
  rate: string;
  location: string;
  availability: string;
  guildScore: string;
  completed: string;
  delay: number;
}) {
  return (
    <HoverCard delay={delay} className="h-full">
      <div className="flex h-full flex-col rounded-[24px] border border-white/8 bg-[#0b0b0d] p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[20px] font-semibold tracking-[-0.04em] text-[#fbfaf8]">{name}</h3>
            <p className="mt-2 text-[14px] text-[#9d9da6]">{skill}</p>
          </div>
          <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-[#cfc9c1]">
            Featured
          </span>
        </div>

        <p className="mt-4 text-[14px] leading-7 text-[#d4d1ca]">{description}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Tag text={location} />
          <Tag text={availability} />
          <Tag text={rate} />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <MetricMini label="Guild Score" value={guildScore} />
          <MetricMini label="Completed" value={completed} />
          <MetricMini label="Focus" value={skill} />
          <MetricMini label="Status" value="Ready" />
        </div>
      </div>
    </HoverCard>
  );
}

function Tag({ text }: { text: string }) {
  return (
    <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-[12px] text-[#c9c4bc]">
      {text}
    </span>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-white/8 bg-[#0d0d10] p-3">
      <div className="text-[11px] uppercase tracking-[0.12em] text-[#71717a]">{label}</div>
      <div className="mt-2 text-[14px] font-semibold text-[#fbfaf8]">{value}</div>
    </div>
  );
}

function shortenAddress(address: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
