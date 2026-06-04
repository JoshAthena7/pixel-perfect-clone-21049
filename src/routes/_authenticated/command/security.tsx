import { createFileRoute } from "@tanstack/react-router";
import {
  ShieldCheck,
  Lock,
  Trash2,
  KeyRound,
  ScrollText,
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/command/security")({
  component: SecurityPage,
  head: () => ({
    meta: [
      { title: "Security & Ephemeral Processing — Atlas" },
      {
        name: "description",
        content:
          "How Atlas processes draft content: in memory, scored, and discarded. No storage, no training, contractually binding.",
      },
    ],
  }),
});

function SecurityPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <div className="mx-auto max-w-4xl px-6 py-12">
        {/* Header */}
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-400/90">
          <ShieldCheck className="h-3.5 w-3.5" />
          Security spec · v1
        </div>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          The intelligence stays in the room.
        </h1>
        <p className="mt-4 text-base text-muted-foreground max-w-2xl leading-relaxed">
          When a writer submits a draft to IRIS, the content is processed in memory,
          scored, and immediately discarded. Atlas never stores it, never logs it, and
          never uses it to train any model. This commitment is contractually binding.
        </p>

        {/* One-sentence card */}
        <section
          className="mt-8 rounded-[14px] border px-6 py-5"
          style={{
            background: "linear-gradient(135deg, rgba(34,211,238,0.06), rgba(8,145,178,0.02))",
            borderColor: "rgba(34,211,238,0.25)",
          }}
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-400/90">
            The one-sentence answer
          </div>
          <p className="mt-2 text-[15px] leading-relaxed text-foreground/95">
            "Draft content is processed in memory to generate the IRIS assessment and
            immediately discarded — it is never stored, never logged, and never used to
            train any model. Our Data Processing Agreement commits to this contractually."
          </p>
        </section>

        {/* Retains / never retains */}
        <section className="mt-10 grid gap-4 md:grid-cols-2">
          <Pillar
            tone="ok"
            icon={CheckCircle2}
            title="What Atlas retains"
            items={[
              "The Score Me result — gap analysis, compliance flags, recommendations",
              "Metadata: writer ID, question ID, timestamp, engagement ID, tier",
              "No draft content. No excerpts. No paraphrases.",
            ]}
          />
          <Pillar
            tone="bad"
            icon={Trash2}
            title="What Atlas never retains"
            items={[
              "Draft text, in full or in part",
              "Any reproduction or summary of proprietary content",
              "Pricing, methodology, or program-specific details from the draft",
              "Anything that could be extracted and used outside the engagement",
            ]}
          />
        </section>

        {/* Processing flow */}
        <SectionHeader index="01" title="The processing flow" />
        <ol className="mt-4 space-y-3">
          {PROCESSING_STEPS.map((step, i) => (
            <li key={i} className="flex gap-4 rounded-[10px] border border-white/8 bg-white/[0.02] px-4 py-3">
              <div className="text-[11px] font-bold tabular-nums text-cyan-400/80 mt-0.5 w-6 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="text-[13px] leading-relaxed text-foreground/85">{step}</div>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[11px] text-muted-foreground italic">
          At no point in this flow does draft content touch a database, a log file, a
          cache, or any persistent storage layer.
        </p>

        {/* Architecture pillars */}
        <SectionHeader index="02" title="Technical architecture" />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <ArchCard
            icon={Lock}
            title="Encryption"
            body="TLS 1.3 in transit. AES-256 at rest. Scoring results are encrypted and access-controlled to the engagement team only."
          />
          <ArchCard
            icon={KeyRound}
            title="No model training"
            body="Client drafts, scoring inputs, and engagement data are never used to train, fine-tune, or evaluate any AI model. Contractually binding."
          />
          <ArchCard
            icon={ScrollText}
            title="Audit trail"
            body="Metadata-only processing log: timestamp, writer ID, question ID, processing duration, confirmation of deletion. No content. Available to clients on request."
          />
          <ArchCard
            icon={FileCheck2}
            title="Data residency"
            body="All processing within US-based infrastructure. Enterprise tier supports geographic processing constraints for specific residency requirements."
          />
        </div>

        {/* Active protections — implemented today */}
        <SectionHeader index="03" title="Active protections — shipped in Atlas today" />
        <p className="mt-3 text-sm text-muted-foreground max-w-2xl">
          These are not roadmap items. Every safeguard below is live in production
          and enforced server-side on every request.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {ACTIVE_PROTECTIONS.map((p, i) => (
            <div
              key={i}
              className="rounded-[12px] border border-emerald-500/20 bg-emerald-500/[0.03] px-5 py-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p.icon className="h-4 w-4 text-emerald-400" />
                  <div className="text-[13px] font-semibold text-foreground/95">{p.title}</div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Live
                </span>
              </div>
              <p className="mt-2 text-[12px] text-muted-foreground leading-relaxed">{p.body}</p>
              {p.detail && (
                <div className="mt-2 text-[11px] text-foreground/70 font-mono leading-relaxed">
                  {p.detail}
                </div>
              )}
            </div>
          ))}
        </div>


        {/* Contractual commitments */}
        <SectionHeader index="03" title="The Data Processing Agreement" />
        <p className="mt-3 text-sm text-muted-foreground max-w-2xl">
          The Atlas DPA is a standard addendum to all client contracts. It commits Atlas to:
        </p>
        <div className="mt-4 space-y-2">
          {DPA_TERMS.map((t, i) => (
            <div
              key={i}
              className="flex gap-3 rounded-[10px] border border-white/8 bg-white/[0.015] px-4 py-3"
            >
              <div className="text-[10px] font-bold tabular-nums text-cyan-400/70 mt-0.5 w-5 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div>
                <div className="text-[13px] font-semibold text-foreground/95">{t.title}</div>
                <div className="mt-0.5 text-[12px] text-muted-foreground leading-relaxed">
                  {t.body}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Coverage */}
        <SectionHeader index="04" title="What this covers — and what it doesn't" />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Pillar
            tone="ok"
            icon={CheckCircle2}
            title="Fully covered today"
            items={[
              "Commercial clients with standard data handling",
              "State government clients with typical data protection expectations",
              "Clients under NDAs restricting proposal content sharing",
              "Clients where the DPA satisfies external-processing security review",
            ]}
          />
          <Pillar
            tone="warn"
            icon={AlertTriangle}
            title="Not yet covered"
            items={[
              "FedRAMP-scope federal engagements (Score Me hard-blocks; Phase 4)",
              "Classified or CUI engagements — require on-prem or FedRAMP High",
              "Clients who prohibit any external processing — wait for Phase 2 plugin",
            ]}
          />
        </div>

        {/* Roadmap */}
        <SectionHeader index="05" title="Roadmap" />
        <div className="mt-4 overflow-hidden rounded-[12px] border border-white/8">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-white/[0.03] text-left">
                <th className="px-4 py-2.5 font-semibold text-foreground/80">Phase</th>
                <th className="px-4 py-2.5 font-semibold text-foreground/80">Capability</th>
                <th className="px-4 py-2.5 font-semibold text-foreground/80">Security posture</th>
                <th className="px-4 py-2.5 font-semibold text-foreground/80">Status</th>
              </tr>
            </thead>
            <tbody>
              {ROADMAP.map((r, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="px-4 py-3 text-muted-foreground">{r.phase}</td>
                  <td className="px-4 py-3 text-foreground/90 font-medium">{r.capability}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.posture}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-12 flex items-center justify-between rounded-[12px] border border-white/8 bg-white/[0.02] px-5 py-4">
          <div className="text-[11px] text-muted-foreground">
            Read alongside the Atlas Product Brief, Health Spec, and Writer Trust Framework.
          </div>
          <div className="text-[10px] text-muted-foreground/70 tabular-nums">
            Compiled June 2026
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── helpers ─────────────────────────── */

function SectionHeader({ index, title }: { index: string; title: string }) {
  return (
    <div className="mt-12 flex items-baseline gap-3">
      <span className="text-[10px] font-bold tabular-nums tracking-[0.28em] text-cyan-400/80">
        {index}
      </span>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
    </div>
  );
}

function Pillar({
  tone,
  icon: Icon,
  title,
  items,
}: {
  tone: "ok" | "bad" | "warn";
  icon: typeof CheckCircle2;
  title: string;
  items: string[];
}) {
  const color =
    tone === "ok"
      ? "rgba(34,197,94,0.35)"
      : tone === "warn"
      ? "rgba(245,158,11,0.35)"
      : "rgba(244,63,94,0.35)";
  const iconColor =
    tone === "ok" ? "rgb(34,197,94)" : tone === "warn" ? "rgb(245,158,11)" : "rgb(244,63,94)";
  return (
    <div
      className="rounded-[12px] border bg-white/[0.02] px-5 py-4"
      style={{ borderColor: color }}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" style={{ color: iconColor }} />
        <div className="text-[12px] font-semibold uppercase tracking-[0.15em] text-foreground/90">
          {title}
        </div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-[12px] text-muted-foreground leading-relaxed">
            <ArrowRight className="h-3 w-3 mt-1 shrink-0 opacity-50" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ArchCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Lock;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[12px] border border-white/8 bg-white/[0.02] px-5 py-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" style={{ color: "var(--iris, #22d3ee)" }} />
        <div className="text-[13px] font-semibold text-foreground/95">{title}</div>
      </div>
      <p className="mt-2 text-[12px] text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: "live" | "next" | "planned" }) {
  const map = {
    live: { label: "Live", color: "rgb(34,197,94)", bg: "rgba(34,197,94,0.12)" },
    next: { label: "Next", color: "rgb(34,211,238)", bg: "rgba(34,211,238,0.12)" },
    planned: { label: "Planned", color: "rgb(148,163,184)", bg: "rgba(148,163,184,0.12)" },
  }[status];
  const Icon = status === "live" ? CheckCircle2 : Clock;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{ color: map.color, background: map.bg }}
    >
      <Icon className="h-2.5 w-2.5" />
      {map.label}
    </span>
  );
}

/* ─────────────────────────── content ─────────────────────────── */

const PROCESSING_STEPS = [
  "Writer initiates Score Me in the Atlas Cockpit.",
  "Draft content is submitted over a TLS 1.3 encrypted connection.",
  "A stateless ephemeral processing service receives the content — no write access to any persistent database.",
  "The service calls the IRIS scoring model with the draft and the RFP question context.",
  "The model returns a structured assessment: gap flags, compliance checks, specificity signals, recommendations.",
  "The structured assessment is written to the Atlas database — no draft content included.",
  "The draft content is released from memory and the processing function terminates.",
  "The encrypted connection closes.",
];

const DPA_TERMS = [
  {
    title: "No persistent storage of draft content",
    body: "Atlas will not store, cache, or retain any draft content submitted via Score Me, in whole or in part.",
  },
  {
    title: "No training use",
    body: "Atlas will not use client draft content, scoring inputs, or engagement data to train, fine-tune, or evaluate any AI model.",
  },
  {
    title: "Encryption in transit and at rest",
    body: "All data transmitted to and from Atlas is encrypted in transit using TLS 1.3. All data stored by Atlas is encrypted at rest using AES-256.",
  },
  {
    title: "Audit rights",
    body: "Clients may request a processing audit log demonstrating ephemeral handling. Atlas provides the log within 5 business days of request.",
  },
  {
    title: "Breach notification",
    body: "In the event of any security incident affecting client data, Atlas will notify the client within 72 hours.",
  },
  {
    title: "Data residency",
    body: "Atlas processes all data within US-based infrastructure. Specific residency requirements are accommodated at the enterprise tier.",
  },
  {
    title: "Right to deletion",
    body: "Clients may request deletion of all Atlas-held metadata associated with their engagement. Deletion is completed within 30 days with written confirmation.",
  },
];

const ROADMAP: Array<{
  phase: string;
  capability: string;
  posture: string;
  status: "live" | "next" | "planned";
}> = [
  {
    phase: "Now",
    capability: "Cut-and-paste Score Me + ephemeral processing + DPA",
    posture: "Covers commercial and most state clients",
    status: "live",
  },
  {
    phase: "Phase 2",
    capability: "Word / Google Docs plugin with local processing",
    posture: "Eliminates data transmission entirely",
    status: "next",
  },
  {
    phase: "Phase 3",
    capability: "SOC 2 Type II certification",
    posture: "Formal third-party verification",
    status: "planned",
  },
  {
    phase: "Phase 4",
    capability: "FedRAMP authorization",
    posture: "Unlocks federal-government Score Me",
    status: "planned",
  },
];
