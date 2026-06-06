import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAtrium, type AtriumPayload } from "@/lib/atrium.functions";
import { Trophy, DollarSign, Users, MapPin, Flame, Sparkles, Circle, MessageSquare, Send, AlertTriangle, Megaphone, Inbox, FileText, FileEdit, BookOpen, FileArchive } from "lucide-react";
import { IrisGreeting } from "@/components/v2/IrisGreeting";
import { AmbientWisdom } from "@/components/v2/AmbientWisdom";
import { AnimatedNumber, Constellation, IrisType } from "@/components/v2/polish";

export const Route = createFileRoute("/_authenticated/atrium")({
  component: AtriumPage,
});

function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}
function fmtPeople(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}
function rel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const EVENT_VERB: Record<string, string> = {
  question_answered: "answered a question",
  question_reviewed: "reviewed a question",
  source_uploaded: "uploaded a source",
  section_contributed: "contributed a section",
  score_submitted: "scored a draft",
};

function AtriumPage() {
  const fn = useServerFn(getAtrium);
  const { data, isLoading } = useQuery({
    queryKey: ["atrium"],
    queryFn: () => fn(),
    refetchInterval: 60_000,
  });

  return (
    <div className="relative min-h-screen bg-background">
      <Constellation opacity={0.06} className="constellation-bg" />
      <header className="relative border-b border-border bg-gradient-to-b from-surface to-background">
        <div className="mx-auto max-w-[1400px] px-8 py-8">
          <IrisGreeting screen="atrium" />
          <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
            The Atrium
          </div>
          <h1 className="h1-display mt-2">Where every win lives.</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Cross-engagement common space. Every writer. Every win. One legacy.
          </p>
          {data && (
            <FirmTotals totals={data.totals} />
          )}
        </div>
      </header>

      <div className="relative mx-auto grid max-w-[1400px] grid-cols-1 gap-8 px-8 py-10 lg:grid-cols-[1fr_360px]">
        <main className="space-y-10">
          <GlobalBriefing />
          <DirectBriefing />
          {isLoading ? (
            <div className="rounded-[12px] border border-border bg-surface p-12 text-center text-sm text-muted-foreground">
              Loading the Atrium…
            </div>
          ) : (
            <>
              <LatestWinSection win={data?.latestWin ?? null} />
              <ActivityFeed activity={data?.activity ?? []} />
            </>
          )}
        </main>

        <aside className="space-y-6">
          <ViewerProfileCard viewer={data?.viewer ?? null} />
          <LiveWritersCard writers={data?.liveWriters ?? []} />
        </aside>
      </div>

      <div className="relative mx-auto mt-16 mb-6 max-w-[640px] px-6">
        <AmbientWisdom />
      </div>
    </div>
  );
}


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
        <h3 className="text-base font-semibold tracking-tight">
          <IrisType text="NJ CSOC Submission Timeline Update" />
        </h3>
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

const ARTIFACTS = [
  {
    title: "NJ CSOC RFP — Final",
    kind: "RFP",
    uploaded: "Uploaded Jun 1, 2026",
    icon: FileText,
    tone: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  },
  {
    title: "Amendment 3 — Scope Clarification",
    kind: "Amendment",
    uploaded: "Uploaded Jun 12, 2026",
    icon: FileEdit,
    tone: "text-rose-400 bg-rose-500/10 border-rose-500/30",
  },
  {
    title: "Athena Style Guide — NJ CSOC",
    kind: "Style Guide",
    uploaded: "Uploaded May 28, 2026",
    icon: BookOpen,
    tone: "text-violet-400 bg-violet-500/10 border-violet-500/30",
  },
  {
    title: "Prior CSA Contract Reference",
    kind: "Reference",
    uploaded: "Uploaded Apr 15, 2026",
    icon: FileArchive,
    tone: "text-sky-400 bg-sky-500/10 border-sky-500/30",
  },
] as const;

function ArtifactsSection() {
  return (
    <section>
      <SectionHeader label="Artifacts" sub="Documents grounding this engagement" />
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
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {a.kind}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-sm font-medium text-foreground group-hover:text-primary">
                  {a.title}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">{a.uploaded}</div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}


function ThreadPanel() {
  return (
    <div className="rounded-[12px] border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Thread · 2
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

      <form
        className="border-t border-border p-3"
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="flex items-end gap-2 rounded-[10px] border border-border bg-background px-3 py-2 focus-within:border-primary/60">
          <textarea
            rows={2}
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

function FirmTotals({ totals }: { totals: AtriumPayload["totals"] }) {
  const items = [
    { label: "Wins", raw: totals.wins, format: (n: number) => Math.round(n).toLocaleString(), icon: Trophy, tone: "text-emerald-400" },
    { label: "Awarded", raw: totals.awardedUsd, format: (n: number) => fmtUsd(Math.round(n)), icon: DollarSign, tone: "text-amber-400" },
    { label: "States", raw: totals.states, format: (n: number) => Math.round(n).toLocaleString(), icon: MapPin, tone: "text-sky-400" },
    { label: "People served", raw: totals.peopleServed, format: (n: number) => fmtPeople(Math.round(n)), icon: Users, tone: "text-violet-400" },
  ];
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <div key={it.label} className="rounded-[8px] border border-border/60 bg-background/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <Icon className={`h-3.5 w-3.5 ${it.tone}`} strokeWidth={2} />
              <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {it.label}
              </span>
            </div>
            <div className={`mt-1.5 text-2xl font-medium tracking-tight ${it.tone}`}>
              <AnimatedNumber value={it.raw} format={it.format} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LatestWinSection({ win }: { win: AtriumPayload["latestWin"] }) {
  if (!win) {
    return (
      <section>
        <SectionHeader label="Latest Win" />
        <div className="rounded-[12px] border border-dashed border-border bg-surface/40 py-12 text-center">
          <Trophy className="mx-auto h-8 w-8 text-muted-foreground opacity-40" strokeWidth={1.5} />
          <p className="mt-4 text-sm text-muted-foreground">
            The next win will appear here — and so will every name behind it.
          </p>
        </div>
      </section>
    );
  }
  return (
    <section>
      <SectionHeader label="Latest Win" />
      <div className="relative overflow-hidden rounded-[16px] border border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 via-surface to-surface p-8">
        <div className="absolute right-6 top-6">
          <Trophy className="h-12 w-12 text-emerald-400/30" strokeWidth={1.5} />
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
          Won {win.wonAt ? rel(win.wonAt) : ""}
        </div>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">{win.missionName}</h2>
        <div className="mt-1 text-sm text-muted-foreground">
          {win.client}{win.state ? ` · ${win.state}` : ""}
        </div>
        <div className="mt-6 flex flex-wrap gap-6">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Contract</div>
            <div className="mt-1 text-2xl font-medium text-amber-400">{fmtUsd(win.awardedUsd)}</div>
          </div>
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">People served</div>
            <div className="mt-1 text-2xl font-medium text-violet-400">{fmtPeople(win.peopleServed)}</div>
          </div>
        </div>
        {win.contributors.length > 0 && (
          <div className="mt-8 border-t border-emerald-500/20 pt-6">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {win.contributors.length} {win.contributors.length === 1 ? "person" : "people"} made this happen
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {win.contributors.map((c) => (
                <div
                  key={c.writerId}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1.5"
                  title={`${c.contributionCount} contribution${c.contributionCount === 1 ? "" : "s"}`}
                >
                  <Avatar name={c.displayName} size={20} />
                  <span className="text-xs font-medium">{c.displayName}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ActivityFeed({ activity }: { activity: AtriumPayload["activity"] }) {
  return (
    <section>
      <SectionHeader label="Activity" sub="What writers across the firm are doing now" />
      {activity.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-border bg-surface/40 py-12 text-center text-sm text-muted-foreground">
          The feed is quiet right now.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-[12px] border border-border bg-surface">
          {activity.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-5 py-3">
              <Avatar name={a.displayName} size={28} />
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{a.displayName}</span>{" "}
                <span className="text-muted-foreground">
                  {EVENT_VERB[a.eventType] ?? a.eventType.replace(/_/g, " ")}
                </span>
                {a.missionName && (
                  <span className="text-muted-foreground">
                    {" "}on{" "}
                    {a.missionId ? (
                      <Link
                        to="/missions/$missionId"
                        params={{ missionId: a.missionId }}
                        className="text-foreground hover:underline"
                      >
                        {a.missionName}
                      </Link>
                    ) : (
                      <span className="text-foreground">{a.missionName}</span>
                    )}
                  </span>
                )}
              </div>
              <div className="shrink-0 text-[11px] text-muted-foreground">{rel(a.occurredAt)}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ViewerProfileCard({ viewer }: { viewer: AtriumPayload["viewer"] }) {
  if (!viewer) {
    return (
      <div className="rounded-[12px] border border-border bg-surface p-6">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Your Card</div>
        <p className="mt-3 text-sm text-muted-foreground">
          Your card appears once you make your first contribution.
        </p>
      </div>
    );
  }
  const rows = [
    { label: "Wins", value: viewer.wins, icon: Trophy, tone: "text-emerald-400" },
    { label: "Awarded", value: fmtUsd(viewer.awardedUsd), icon: DollarSign, tone: "text-amber-400" },
    { label: "States", value: viewer.states, icon: MapPin, tone: "text-sky-400" },
    { label: "People served", value: fmtPeople(viewer.peopleServed), icon: Users, tone: "text-violet-400" },
    { label: "Day streak", value: viewer.streakDays, icon: Flame, tone: "text-orange-400" },
  ];
  return (
    <div className="rounded-[12px] border border-border bg-gradient-to-br from-surface via-surface/80 to-background p-6">
      <div className="flex items-center gap-3">
        <Avatar name={viewer.displayName} size={40} />
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Your Card</div>
          <div className="text-base font-semibold">{viewer.displayName}</div>
        </div>
      </div>
      <ul className="mt-5 space-y-2">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <li key={r.label} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Icon className={`h-3.5 w-3.5 ${r.tone}`} strokeWidth={2} />
                {r.label}
              </span>
              <span className={`font-medium ${r.tone}`}>{r.value}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-5 border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">
        Yours. Always. Travels with you across every engagement.
      </p>
    </div>
  );
}

function LiveWritersCard({ writers }: { writers: AtriumPayload["liveWriters"] }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface p-6">
      <div className="flex items-center gap-2">
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Live now · {writers.length}
        </div>
      </div>
      {writers.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No one is active in the last 30 minutes.</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {writers.slice(0, 10).map((w) => (
            <li key={w.writerId} className="flex items-center gap-2.5 text-sm">
              <Avatar name={w.displayName} size={22} />
              <span className="flex-1 truncate">{w.displayName}</span>
              <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SectionHeader({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="h2-label flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-[color:var(--athena-gold,#f59e0b)]" /> {label}
        </h2>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>
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
