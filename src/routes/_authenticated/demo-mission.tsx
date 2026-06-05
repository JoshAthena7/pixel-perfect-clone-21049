import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Megaphone,
  Inbox,
  FileText,
  FileEdit,
  BookOpen,
  FileArchive,
  MessageSquare,
  Send,
  AlertTriangle,
  Sparkles,
  Target,
  Handshake,
  Trophy,
  Calendar,
  ShieldCheck,
  Users,
  CheckCircle2,
  Circle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/demo-mission")({
  component: DemoMissionPage,
});

/* ─────────────────────────────────────────────────────────────────────────────
   ONE curated demo mission — NJ CSOC. Fully static; safe to walk through.
   All data lives in this file. No DB calls, no auth dependencies.
   ──────────────────────────────────────────────────────────────────────────── */

function DemoMissionPage() {
  return (
    <div className="min-h-screen bg-background">
      <MissionHeader />

      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-8 px-8 py-10 lg:grid-cols-[1fr_340px]">
        <main className="space-y-8">
          <GlobalBriefing />
          <DirectBriefing />
          <IntelligenceHighlights />
          <SectionsList />
          <ArtifactsGrid />
        </main>

        <aside className="space-y-6">
          <MissionSummaryCard />
          <ThreadPanel />
        </aside>
      </div>
    </div>
  );
}

/* ── Header ──────────────────────────────────────────────────────────────── */
function MissionHeader() {
  return (
    <header className="border-b border-border bg-gradient-to-b from-surface to-background">
      <div className="mx-auto max-w-[1400px] px-8 py-8">
        <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
          Mission · Active
        </div>
        <h1 className="mt-2 text-3xl font-light tracking-tight">
          New Jersey CSOC — Contracted System Administrator
        </h1>
        <div className="mt-1.5 text-sm text-muted-foreground">
          NJ Department of Children and Families · Children's System of Care · RFP #25-CSOC-001
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Chip tone="amber" icon={Calendar} label="Submission Aug 15, 2026 · 71 days" />
          <Chip tone="emerald" icon={ShieldCheck} label="QA gate Aug 10" />
          <Chip tone="sky" icon={Users} label="9 contributors" />
          <Chip tone="violet" icon={Trophy} label="Health · On Track" />
        </div>
      </div>
    </header>
  );
}

function Chip({ tone, icon: Icon, label }: { tone: string; icon: any; label: string }) {
  const tones: Record<string, string> = {
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    sky: "border-sky-500/30 bg-sky-500/10 text-sky-300",
    violet: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${tones[tone]}`}>
      <Icon className="h-3 w-3" strokeWidth={2} />
      {label}
    </span>
  );
}

/* ── Briefings ───────────────────────────────────────────────────────────── */
function GlobalBriefing() {
  return (
    <section className="overflow-hidden rounded-[12px] border border-amber-500/30 bg-gradient-to-br from-amber-950/30 via-surface to-surface">
      <div className="flex items-center justify-between border-b border-amber-500/20 px-5 py-2.5">
        <div className="flex items-center gap-2">
          <Megaphone className="h-3.5 w-3.5 text-amber-400" strokeWidth={2} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-400">
            Global Briefing
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">Firm-wide · pinned</span>
      </div>
      <div className="px-5 py-4">
        <h3 className="text-base font-semibold tracking-tight">NJ CSOC Submission Timeline Update</h3>
        <p className="mt-2 text-sm leading-relaxed text-foreground/90">
          The Division has confirmed the submission deadline remains August 15, 2026. All sections must clear final
          QA gate by August 10. Engage leads are expected to confirm section status by EOD Friday.
        </p>
      </div>
    </section>
  );
}

function DirectBriefing() {
  return (
    <section className="overflow-hidden rounded-[12px] border border-sky-500/30 bg-gradient-to-br from-sky-950/30 via-surface to-surface">
      <div className="flex items-center justify-between border-b border-sky-500/20 px-5 py-2.5">
        <div className="flex items-center gap-2">
          <Inbox className="h-3.5 w-3.5 text-sky-400" strokeWidth={2} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-400">
            Direct Briefing · For You
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">From Maya Patel · Engage Lead · 1h ago</span>
      </div>
      <div className="px-5 py-4">
        <p className="text-sm leading-relaxed text-foreground/90">
          Please review <span className="font-semibold text-foreground">Section 4.2</span> before it advances to final
          QA. Specific attention to the <span className="font-semibold text-foreground">ICC framing</span> and{" "}
          <span className="font-semibold text-foreground">DCF partnership language</span>.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 rounded-md bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/25">
            Open Section 4.2
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-surface-hover hover:text-foreground">
            Acknowledge
          </button>
        </div>
      </div>
    </section>
  );
}

/* ── Intelligence ────────────────────────────────────────────────────────── */
const INTEL_CARDS = [
  {
    kind: "Win Theme",
    title: "Family-Driven System of Care",
    icon: Target,
    accent: "emerald",
    body:
      "NJ's CSOC has prioritized family voice and youth-guided care since the 2011 redesign. Lead every section with how the model amplifies family decision-making — not how Athena delivers services.",
  },
  {
    kind: "Terminology Alert",
    title: "CSA vs MCO Language",
    icon: AlertTriangle,
    accent: "amber",
    body:
      "Do not refer to the Contracted System Administrator as an MCO. NJ DCF explicitly rejects managed-care framing. Use 'CSA,' 'care coordination,' and 'system administration' — never 'utilization management' or 'medical necessity gatekeeping.'",
  },
  {
    kind: "Strategic Note",
    title: "DCF Partnership Framing",
    icon: Handshake,
    accent: "sky",
    body:
      "DCF sees the CSA as an extension of the Department, not a vendor. Frame every operational decision as collaborative governance with DCF, CMOs, and family partners. Avoid 'we will deliver' — prefer 'we will partner with DCF to...'",
  },
] as const;

const INTEL_TONE: Record<string, { border: string; bg: string; chip: string; icon: string }> = {
  emerald: { border: "border-emerald-500/30", bg: "from-emerald-950/30", chip: "bg-emerald-500/15 text-emerald-300", icon: "text-emerald-400" },
  amber: { border: "border-amber-500/30", bg: "from-amber-950/30", chip: "bg-amber-500/15 text-amber-300", icon: "text-amber-400" },
  sky: { border: "border-sky-500/30", bg: "from-sky-950/30", chip: "bg-sky-500/15 text-sky-300", icon: "text-sky-400" },
};

function IntelligenceHighlights() {
  return (
    <section>
      <SectionHeader icon={Sparkles} label="Intelligence · From Iris" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {INTEL_CARDS.map((c) => {
          const Icon = c.icon;
          const tone = INTEL_TONE[c.accent];
          return (
            <article
              key={c.title}
              className={`overflow-hidden rounded-[12px] border ${tone.border} bg-gradient-to-br ${tone.bg} via-surface to-surface p-4`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-3.5 w-3.5 ${tone.icon}`} strokeWidth={2} />
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${tone.chip}`}>
                  {c.kind}
                </span>
              </div>
              <h3 className="mt-2.5 text-sm font-semibold tracking-tight">{c.title}</h3>
              <p className="mt-2 text-[12px] leading-relaxed text-foreground/85">{c.body}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ── Sections ────────────────────────────────────────────────────────────── */
const SECTIONS: Array<{ id: string; title: string; status: string; lead: string; flagged?: boolean }> = [
  { id: "4.1", title: "Population and Needs Assessment", status: "QA Complete", lead: "Sarah Chen" },
  { id: "4.2", title: "Care Coordination Model", status: "In Review", lead: "You", flagged: true },
  { id: "4.3", title: "Provider Network Strategy", status: "Drafting", lead: "Josh Bernstein" },
  { id: "4.4", title: "Quality Management & Outcomes", status: "Drafting", lead: "Maya Patel" },
  { id: "4.5", title: "Information Systems & Data", status: "Not Started", lead: "Unassigned" },
];

function SectionsList() {
  return (
    <section>
      <SectionHeader icon={FileText} label="Sections · Volume IV — Technical Approach" />
      <div className="overflow-hidden rounded-[12px] border border-border bg-surface">
        <ul className="divide-y divide-border">
          {SECTIONS.map((s) => (
            <li key={s.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-hover">
              <div className="w-12 shrink-0 font-mono text-xs text-muted-foreground">{s.id}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{s.title}</span>
                  {s.flagged && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-300">
                      <AlertTriangle className="h-2.5 w-2.5" /> Needs review
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">Lead: {s.lead}</div>
              </div>
              <StatusBadge status={s.status} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: any }> = {
    "QA Complete": { cls: "bg-emerald-500/15 text-emerald-300", icon: CheckCircle2 },
    "In Review": { cls: "bg-amber-500/15 text-amber-300", icon: AlertTriangle },
    "Drafting": { cls: "bg-sky-500/15 text-sky-300", icon: Circle },
    "Not Started": { cls: "bg-muted text-muted-foreground", icon: Circle },
  };
  const m = map[status] ?? map["Not Started"];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${m.cls}`}>
      <Icon className="h-3 w-3" strokeWidth={2} />
      {status}
    </span>
  );
}

/* ── Artifacts ───────────────────────────────────────────────────────────── */
const ARTIFACTS = [
  { title: "NJ CSOC RFP — Final", kind: "RFP", uploaded: "Uploaded Jun 1, 2026", icon: FileText, tone: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  { title: "Amendment 3 — Scope Clarification", kind: "Amendment", uploaded: "Uploaded Jun 12, 2026", icon: FileEdit, tone: "text-rose-400 bg-rose-500/10 border-rose-500/30" },
  { title: "Athena Style Guide — NJ CSOC", kind: "Style Guide", uploaded: "Uploaded May 28, 2026", icon: BookOpen, tone: "text-violet-400 bg-violet-500/10 border-violet-500/30" },
  { title: "Prior CSA Contract Reference", kind: "Reference", uploaded: "Uploaded Apr 15, 2026", icon: FileArchive, tone: "text-sky-400 bg-sky-500/10 border-sky-500/30" },
] as const;

function ArtifactsGrid() {
  return (
    <section>
      <SectionHeader icon={FileArchive} label="Artifacts · The Vault" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ARTIFACTS.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.title}
              className="group flex items-start gap-3 rounded-[12px] border border-border bg-surface p-4 text-left transition hover:border-primary/40 hover:bg-surface-hover"
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${a.tone}`}>
                <Icon className="h-4 w-4" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{a.kind}</span>
                <div className="mt-0.5 truncate text-sm font-medium text-foreground group-hover:text-primary">{a.title}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{a.uploaded}</div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ── Mission summary (right rail) ────────────────────────────────────────── */
function MissionSummaryCard() {
  return (
    <div className="rounded-[12px] border border-border bg-gradient-to-br from-surface via-surface/80 to-background p-5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">At a glance</div>
      <ul className="mt-4 space-y-2.5 text-sm">
        <Row label="Sections complete" value="1 / 5" tone="text-emerald-400" />
        <Row label="QA gate" value="Aug 10" tone="text-amber-400" />
        <Row label="Submission" value="Aug 15" tone="text-foreground" />
        <Row label="Page budget" value="142 / 200" tone="text-sky-400" />
        <Row label="Open threads" value="3" tone="text-violet-400" />
      </ul>
      <p className="mt-5 border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">
        Iris is monitoring scope, terminology, and DCF framing across all sections in real time.
      </p>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${tone}`}>{value}</span>
    </li>
  );
}

/* ── Thread ──────────────────────────────────────────────────────────────── */
function ThreadPanel() {
  const [draft, setDraft] = useState("");
  return (
    <div className="rounded-[12px] border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Section 4.2 · Thread · 2
          </div>
        </div>
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-400">
          Open
        </span>
      </div>

      <ul className="divide-y divide-border">
        <li className="px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Avatar name="Josh Bernstein" size={28} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Josh B.</div>
              <div className="text-[10px] text-muted-foreground">2h ago · flagged</div>
            </div>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" strokeWidth={2} />
          </div>
          <p className="mt-2.5 text-sm leading-relaxed text-foreground/90">
            The ICC framing here reads as advocacy — we're positioning ICC as the solution rather than describing the
            member population. Reviewers will flag this. Can we rework to lead with the population's clinical and social
            needs, then bring ICC in as the delivery model?
          </p>
        </li>

        <li className="px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Avatar name="Sarah Chen" size={28} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Sarah Chen</div>
              <div className="text-[10px] text-muted-foreground">38m ago · replied</div>
            </div>
          </div>
          <p className="mt-2.5 text-sm leading-relaxed text-foreground/90">
            Good catch. Reframing now — leading with SDoH burden and care-gap data from the state's 1115 waiver, then
            ICC as the operational answer. Will push a revision before noon and tag you for re-review.
          </p>
        </li>
      </ul>

      <form className="border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); setDraft(""); }}>
        <div className="flex items-end gap-2 rounded-[10px] border border-border bg-background px-3 py-2 focus-within:border-primary/60">
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Reply to thread…"
            className="flex-1 resize-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="submit"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary hover:bg-primary/25"
            aria-label="Send"
          >
            <Send className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
        <div className="mt-1.5 px-1 text-[10px] text-muted-foreground">
          ⌘↵ to send · @ to mention
        </div>
      </form>
    </div>
  );
}

/* ── Shared ──────────────────────────────────────────────────────────────── */
function SectionHeader({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-[color:var(--athena-gold,#f59e0b)]" />
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{label}</h2>
    </div>
  );
}

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  const hue = Math.abs(hashCode(name)) % 360;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.floor(size * 0.38)),
        background: `hsl(${hue}, 40%, 22%)`,
        color: `hsl(${hue}, 70%, 78%)`,
        border: `1px solid hsl(${hue}, 50%, 32%)`,
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
