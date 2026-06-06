import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { getIrisData } from "@/lib/iris-read.functions";
import { runIrisPipeline } from "@/lib/iris-extractors/run-all.functions";

/**
 * IRIS — the intelligence experience layer.
 *
 * Wired to the live extractor pipeline. Each tab reads from its backing
 * table (signals · mission_risks · win_themes · mission_strategy ·
 * mission_client_intel). The "Generate Intelligence" action runs all 5
 * extractors for the selected mission and refreshes the page.
 */

export const Route = createFileRoute("/_authenticated/iris")({
  component: IrisPage,
});

type TabId = "brief" | "environment" | "wants" | "risks" | "strategy";

const TABS: { id: TabId; label: string }[] = [
  { id: "brief", label: "Mission Brief" },
  { id: "environment", label: "Environmental Assessment" },
  { id: "wants", label: "What the State Wants" },
  { id: "risks", label: "Emerging Risks" },
  { id: "strategy", label: "Recommended Strategy" },
];

function IrisPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("brief");
  const [missionId, setMissionId] = useState<string | undefined>(undefined);

  const fetchIris = useServerFn(getIrisData);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["iris", missionId ?? "default"],
    queryFn: () => fetchIris({ data: { missionId } }),
  });

  const runPipeline = useServerFn(runIrisPipeline);
  const mutation = useMutation({
    mutationFn: (id: string) => runPipeline({ data: { missionId: id } }),
    onSuccess: (res) => {
      const ok = res.results.filter((r) => r.ok && !r.skipped);
      const skipped = res.results.filter((r) => r.skipped);
      const failed = res.results.filter((r) => !r.ok);
      const total = ok.reduce((n, r) => n + r.inserted, 0);
      toast.success(
        `IRIS pipeline complete · ${total} rows generated across ${ok.length}/${res.results.length} stages` +
          (skipped.length ? ` · ${skipped.length} skipped` : "") +
          (failed.length ? ` · ${failed.length} failed` : ""),
      );
      void router.invalidate();
    },
    onError: (e) => toast.error(`Pipeline failed: ${(e as Error).message}`),
  });

  const activeMissionId = data?.mission?.id;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-amber-400/80">
              IRIS · Intelligence
            </div>
            <h1 className="mt-1 font-serif text-3xl tracking-tight text-foreground">
              {data?.mission?.name ?? (isLoading ? "Loading…" : "No mission selected")}
            </h1>
            {data?.mission?.client && (
              <div className="mt-1 text-sm text-muted-foreground">
                {data.mission.client}
                {data.mission.state ? ` · ${data.mission.state}` : ""}
                {data.mission.procurement_name ? ` · ${data.mission.procurement_name}` : ""}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <IrisAttribution />
            {(data?.missions?.length ?? 0) > 1 && (
              <select
                className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                value={activeMissionId ?? ""}
                onChange={(e) => setMissionId(e.target.value)}
              >
                {data!.missions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
            {activeMissionId && (
              <button
                type="button"
                onClick={() => mutation.mutate(activeMissionId)}
                disabled={mutation.isPending}
                className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300 transition hover:bg-amber-500/15 disabled:opacity-50"
              >
                {mutation.isPending ? "Generating…" : "Generate Intelligence"}
              </button>
            )}
          </div>
        </header>

        <nav className="mb-8 flex flex-wrap gap-1 border-b border-border/60">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className="relative px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.18em] transition-colors"
                style={{
                  color: active ? "var(--athena-gold, #f59e0b)" : "var(--muted-foreground)",
                }}
              >
                {t.label}
                {active && (
                  <span
                    className="absolute bottom-[-1px] left-2 right-2 h-[2px] rounded-full"
                    style={{ background: "var(--athena-gold, #f59e0b)" }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        <section>
          {isLoading && <PanelSkeleton />}
          {isError && (
            <EmptyState
              title="Couldn't load IRIS"
              body={(error as Error).message}
            />
          )}
          {!isLoading && !isError && data && (
            <>
              {tab === "brief" && <MissionBriefView data={data} />}
              {tab === "environment" && <EnvironmentalView signals={data.signals} />}
              {tab === "wants" && <WantsView priorities={data.strategy} />}
              {tab === "risks" && <RisksView risks={data.risks} />}
              {tab === "strategy" && <StrategyView themes={data.winThemes} />}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Atoms                                                                   */
/* ─────────────────────────────────────────────────────────────────────── */

function IrisAttribution() {
  const ts = new Date().toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <div className="flex items-center gap-2 text-[10px] tracking-[0.18em] text-muted-foreground/70">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: "var(--iris, #5cbdf2)", boxShadow: "0 0 10px var(--iris, #5cbdf2)" }}
        aria-hidden
      />
      <span className="uppercase">Generated by IRIS</span>
      <span aria-hidden>·</span>
      <span>{ts}</span>
    </div>
  );
}

function SourceBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </span>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-lg border border-border/40 bg-muted/20" />
      ))}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-surface/30 p-8 text-center">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-2 max-w-xl mx-auto text-[13px] leading-relaxed text-muted-foreground">{body}</div>
    </div>
  );
}

function severityChip(level: string) {
  const map: Record<string, { color: string; bg: string; border: string; label: string }> = {
    critical: { color: "#fca5a5", bg: "rgba(220,38,38,0.14)", border: "rgba(220,38,38,0.40)", label: "Critical" },
    high: { color: "#fca5a5", bg: "rgba(220,38,38,0.12)", border: "rgba(220,38,38,0.35)", label: "High" },
    elevated: { color: "#fcd34d", bg: "rgba(245,158,11,0.14)", border: "rgba(245,158,11,0.40)", label: "Elevated" },
    medium: { color: "#fcd34d", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.35)", label: "Medium" },
    watch: { color: "#a7f3d0", bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.35)", label: "Watch" },
    info: { color: "#a7f3d0", bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.30)", label: "Info" },
  };
  const s = map[level] ?? map.info;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}
    >
      {s.label}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Tabs                                                                    */
/* ─────────────────────────────────────────────────────────────────────── */

type IrisData = Awaited<ReturnType<typeof getIrisData>>;

function MissionBriefView({ data }: { data: IrisData }) {
  const m = data.mission;
  const intel = data.clientIntel;
  if (!m) {
    return <EmptyState title="No mission" body="Create or select a mission to see its brief." />;
  }

  return (
    <article className="prose prose-invert max-w-none">
      <div className="mb-6 border-l-2 border-amber-500/40 pl-4 text-sm italic text-muted-foreground">
        Read this first. The brief sets the orientation before any drafting begins.
      </div>

      <section className="mb-7">
        <h2 className="font-serif text-xl tracking-tight text-foreground">What This Procurement Is</h2>
        <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
          <p>
            {m.description ??
              `${m.procurement_name ?? m.name} — ${m.client ?? "client"} ${m.state ? `· ${m.state}` : ""}.`}
          </p>
          {m.submission_date && <p>Submission target: {m.submission_date}. Status: {m.status ?? "active"}.</p>}
        </div>
      </section>

      {m.key_requirements?.length ? (
        <section className="mb-7">
          <h2 className="font-serif text-xl tracking-tight text-foreground">Key Requirements</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-relaxed text-muted-foreground">
            {m.key_requirements.map((k, i) => (
              <li key={i}>{k}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mb-7">
        <h2 className="font-serif text-xl tracking-tight text-foreground">Who The Client Is</h2>
        <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
          {intel ? (
            <>
              {intel.decision_makers?.length ? (
                <p>
                  <strong className="text-foreground">Decision-makers:</strong>{" "}
                  {(intel.decision_makers as Array<{ name: string; role: string }>)
                    .map((d) => `${d.name} (${d.role})`)
                    .join("; ")}
                </p>
              ) : null}
              {intel.political_considerations && <p>{intel.political_considerations}</p>}
              {intel.notes && <p className="text-[13px] text-muted-foreground/80">{intel.notes}</p>}
            </>
          ) : (
            <p className="italic text-muted-foreground/70">
              No client intel generated yet. Click <strong>Generate Intelligence</strong> to populate.
            </p>
          )}
        </div>
      </section>
    </article>
  );
}

function EnvironmentalView({ signals }: { signals: IrisData["signals"] }) {
  if (!signals.length) {
    return (
      <EmptyState
        title="No environmental signals yet"
        body="Click Generate Intelligence to extract political, regulatory, and competitive signals from your market intelligence feed."
      />
    );
  }
  const groups: Record<string, typeof signals> = { political: [], regulatory: [], competitive: [], operational: [] };
  for (const s of signals) (groups[s.signal_type] ?? (groups[s.signal_type] = [])).push(s);

  const COLS: { key: keyof typeof groups; title: string }[] = [
    { key: "political", title: "Political Context" },
    { key: "regulatory", title: "Regulatory Landscape" },
    { key: "competitive", title: "Competitive Situation" },
  ];

  return (
    <div>
      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
        Not a research dump. A picture of the room we are walking into — political, regulatory, competitive.
        Each signal carries its source and recommended action.
      </p>
      <div className="grid gap-5 md:grid-cols-3">
        {COLS.map((col) => (
          <div key={col.key} className="rounded-lg border border-border/70 bg-surface/40 p-4">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-amber-400/80">
              {col.title}
            </div>
            <div className="space-y-3">
              {(groups[col.key] ?? []).length === 0 && (
                <div className="text-[12px] italic text-muted-foreground/70">No signals in this category.</div>
              )}
              {(groups[col.key] ?? []).map((s) => (
                <div key={s.id} className="rounded-md border border-border/60 bg-background/60 p-3">
                  <div className="mb-1 flex items-center gap-2">
                    {severityChip(s.severity)}
                    {typeof s.confidence === "number" && (
                      <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60">
                        {Math.round(s.confidence * 100)}% conf
                      </span>
                    )}
                  </div>
                  <div className="text-[13px] font-medium leading-snug text-foreground">{s.signal_title}</div>
                  <div className="mt-1 text-[12px] leading-snug text-muted-foreground">{s.signal_summary}</div>
                  {s.tags?.[0] && (
                    <div className="mt-2">
                      <SourceBadge>{s.tags[0]}</SourceBadge>
                    </div>
                  )}
                  {s.recommended_action && (
                    <div className="mt-2 text-[11px] italic text-muted-foreground/80">
                      → {s.recommended_action}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {groups.operational.length > 0 && (
        <div className="mt-5 rounded-lg border border-border/70 bg-surface/40 p-4">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-amber-400/80">
            Operational
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {groups.operational.map((s) => (
              <div key={s.id} className="rounded-md border border-border/60 bg-background/60 p-3">
                <div className="mb-1">{severityChip(s.severity)}</div>
                <div className="text-[13px] font-medium text-foreground">{s.signal_title}</div>
                <div className="mt-1 text-[12px] text-muted-foreground">{s.signal_summary}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WantsView({ priorities }: { priorities: IrisData["strategy"] }) {
  if (!priorities.length) {
    return (
      <EmptyState
        title="No state priorities decoded yet"
        body="Click Generate Intelligence to decode what the state actually wants — beyond what the RFP says."
      />
    );
  }
  return (
    <div>
      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
        Decoded priorities — not what the RFP says, what the State actually cares about.
      </p>
      <ol className="space-y-3">
        {priorities.map((p, i) => (
          <li key={p.id} className="rounded-lg border border-border/70 bg-surface/40 p-4">
            <div className="flex items-start gap-4">
              <div
                className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                style={{
                  color: "var(--athena-gold, #f59e0b)",
                  background: "rgba(245,158,11,0.10)",
                  border: "1px solid rgba(245,158,11,0.35)",
                }}
              >
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium text-foreground">{p.label}</div>
                {p.notes && (
                  <div className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
                    {p.notes}
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RisksView({ risks }: { risks: IrisData["risks"] }) {
  if (!risks.length) {
    return (
      <EmptyState
        title="No risks identified yet"
        body="Click Generate Intelligence to surface emerging risks from your market intelligence feed."
      />
    );
  }
  return (
    <div>
      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
        Live feed, not a one-time register. These shift as the environment shifts.
      </p>
      <div className="space-y-3">
        {risks.map((r) => {
          const category = r.owner?.startsWith("iris_extractor:") ? r.owner.slice("iris_extractor:".length) : null;
          return (
            <div key={r.id} className="flex items-start gap-4 rounded-lg border border-border/70 bg-surface/40 p-4">
              <div className="flex flex-col items-start gap-2">
                {severityChip(r.severity ?? "watch")}
                {category && <SourceBadge>{category}</SourceBadge>}
              </div>
              <div className="flex-1">
                <div className="text-[14px] font-medium leading-snug text-foreground">{r.title}</div>
                {r.description && (
                  <div className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{r.description}</div>
                )}
                <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60">
                  Identified {new Date(r.created_at ?? Date.now()).toLocaleDateString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StrategyView({ themes }: { themes: IrisData["winThemes"] }) {
  if (!themes.length) {
    return (
      <EmptyState
        title="No win themes generated yet"
        body="Click Generate Intelligence to recommend mission-specific win themes built from the brief, signals, and risk picture."
      />
    );
  }
  return (
    <div>
      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
        Mission-specific. Each theme is ready to carry into Studio.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {themes.map((t) => (
          <article key={t.id} className="flex flex-col rounded-lg border border-border/70 bg-surface/40 p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-400/80">Win Theme</div>
            <h3 className="mt-1 font-serif text-xl tracking-tight text-foreground">{t.title}</h3>
            {t.key_message && (
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{t.key_message}</p>
            )}
            {t.description && (
              <div className="mt-4 rounded-md border border-border/60 bg-background/60 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                  Detail
                </div>
                <div className="mt-1 text-[13px] leading-snug text-foreground">{t.description}</div>
              </div>
            )}
            <button
              type="button"
              className="mt-4 self-start rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300 transition hover:bg-amber-500/15"
            >
              Use in Studio →
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
