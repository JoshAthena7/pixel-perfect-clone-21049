import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Search, Plus, Sparkles, MapPin, Layers as LayersIcon,
  Target, Brain, Shield, ArrowRight, Loader2, Inbox, Zap,
} from "lucide-react";
import {
  hubStats, listStates, listPrograms, listMissionsForHub,
  listLessons, globalAtlasSearch,
} from "@/lib/atlas-intelligence.functions";
import { listAtlasSources } from "@/lib/atlas-sources.functions";
import {
  activateCanonStarterKit, discoverProgramSources,
  createProgram, listReviewQueue,
} from "@/lib/atlas-onboarding.functions";

export const Route = createFileRoute("/_authenticated/intelligence")({
  component: IntelligenceHub,
  head: () => ({
    meta: [
      { title: "Atlas Intelligence — Athena" },
      { name: "description", content: "Athena's permanent knowledge infrastructure across five layers." },
    ],
  }),
});

type Tab = "canon" | "states" | "programs" | "missions" | "collective";

const LAYER_COLOR: Record<Tab, string> = {
  canon: "var(--yellow, #f59e0b)",
  states: "#3b82f6",
  programs: "var(--iris, #22d3ee)",
  missions: "var(--accent, #60a5fa)",
  collective: "#8b5cf6",
};

const LAYER_LABEL: Record<Tab, string> = {
  canon: "⊕ Canon",
  states: "◎ States",
  programs: "◉ Programs",
  missions: "◈ Missions",
  collective: "● Collective",
};

function IntelligenceHub() {
  const [tab, setTab] = useState<Tab>("canon");
  const [query, setQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);

  const statsFn = useServerFn(hubStats);
  const { data: stats } = useQuery({
    queryKey: ["atlas-hub-stats"],
    queryFn: () => statsFn({ data: {} as any }),
  });

  const searchFn = useServerFn(globalAtlasSearch);
  const { data: searchResults, isFetching: searchFetching } = useQuery({
    queryKey: ["atlas-global-search", query],
    queryFn: () => searchFn({ data: { q: query } }),
    enabled: searchActive && query.trim().length > 1,
  });

  return (
    <div
      className="min-h-[calc(100vh-56px)] text-foreground"
      style={{
        background: "#060b14",
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
      }}
    >
      <div className="mx-auto max-w-[1400px] px-8 py-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-red-400">CLASSIFIED</span>
            <h1
              className="mt-2 text-white"
              style={{
                fontSize: 32, fontWeight: 300, letterSpacing: "0.15em", textTransform: "uppercase",
              }}
            >
              ⚡ Atlas Intelligence
            </h1>
            <p className="mt-2 max-w-2xl text-[13px] text-muted-foreground">
              Athena's permanent knowledge infrastructure. Every source. Every program. Every lesson learned.
            </p>
          </div>
          <IntelligenceHealth stats={stats} />
        </div>

        {/* Live stats pills */}
        <div className="mt-5 flex flex-wrap gap-2">
          <StatPill label="Canon" value={stats?.canonSources ?? 0} suffix="sources" borderColor="var(--yellow, #f59e0b)" />
          <StatPill label="States" value={stats?.states ?? 0} suffix="domains" />
          <StatPill label="Programs" value={stats?.programs ?? 0} suffix="domains" />
          <StatPill label="Collective" value={stats?.lessons ?? 0} suffix="lessons" borderColor="var(--iris, #22d3ee)" />
        </div>

        {/* Global search */}
        <div className="mt-8 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSearchActive(e.target.value.trim().length > 1); }}
            placeholder="Search all of Atlas Intelligence…"
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-4 pl-12 pr-4 text-sm placeholder:text-muted-foreground/60 focus:border-[color:var(--iris,#22d3ee)]/40 focus:outline-none"
          />
        </div>

        {searchActive && query.trim().length > 1 ? (
          <SearchResults results={searchResults} loading={searchFetching} />
        ) : (
          <>
            {/* Tabs */}
            <div className="mt-8 flex flex-wrap gap-1 border-b border-white/10">
              {(Object.keys(LAYER_LABEL) as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="px-5 py-3 text-sm transition-colors"
                  style={{
                    color: tab === t ? "var(--foreground)" : "var(--muted-foreground)",
                    borderBottom: tab === t ? `2px solid ${LAYER_COLOR[t]}` : "2px solid transparent",
                    marginBottom: -1,
                  }}
                >
                  {LAYER_LABEL[t]}
                </button>
              ))}
            </div>

            <div className="mt-8">
              {tab === "canon" && <CanonTab />}
              {tab === "states" && <StatesTab />}
              {tab === "programs" && <ProgramsTab />}
              {tab === "missions" && <MissionsTab />}
              {tab === "collective" && <CollectiveTab />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ────────────── shared bits ────────────── */

function StatPill({ label, value, suffix, borderColor }: {
  label: string; value: number; suffix: string; borderColor?: string;
}) {
  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px]"
      style={{
        background: "var(--bg-surface, rgba(255,255,255,0.03))",
        border: `1px solid ${borderColor ?? "var(--border-default, rgba(255,255,255,0.08))"}`,
      }}
    >
      <span className="font-semibold">{label}:</span>
      <span>{value.toLocaleString()} {suffix}</span>
    </div>
  );
}

function LayerBadge({ layer }: { layer: Tab }) {
  const labels: Record<Tab, string> = {
    canon: "LAYER 1 · ATHENA CANON",
    states: "LAYER 2 · STATE INTELLIGENCE",
    programs: "LAYER 3 · PROGRAM INTELLIGENCE",
    missions: "LAYER 4 · MISSION INTELLIGENCE",
    collective: "LAYER 5 · ATHENA COLLECTIVE MEMORY",
  };
  return (
    <span
      className="inline-block rounded px-2 py-1 text-[10px] font-semibold tracking-[0.2em]"
      style={{
        background: `color-mix(in oklab, ${LAYER_COLOR[layer]} 12%, transparent)`,
        color: LAYER_COLOR[layer],
        border: `1px solid color-mix(in oklab, ${LAYER_COLOR[layer]} 30%, transparent)`,
      }}
    >
      {labels[layer]}
    </span>
  );
}

function SourceCard({ s, layer }: { s: any; layer: Tab }) {
  const hi = layer === "canon" && (s.authority_score ?? 0) >= 10;
  return (
    <div
      className="rounded-lg border p-4 transition-colors hover:bg-white/[0.04]"
      style={{
        background: "var(--bg-surface, rgba(255,255,255,0.02))",
        borderColor: "var(--border-default, rgba(255,255,255,0.08))",
        borderLeft: hi ? `3px solid ${LAYER_COLOR.canon}` : undefined,
        boxShadow: hi ? "inset 0 0 30px rgba(245,158,11,0.08)" : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium leading-snug">{s.source_title}</div>
          {s.issuing_authority && (
            <div className="mt-1 text-[11px] text-muted-foreground">{s.issuing_authority}</div>
          )}
          {s.summary && <p className="mt-2 line-clamp-2 text-[12px] text-muted-foreground">{s.summary}</p>}
        </div>
        <span
          className="shrink-0 rounded px-2 py-0.5 text-[10px] font-bold tracking-wider"
          style={{
            background: LAYER_COLOR[layer],
            color: layer === "canon" ? "#0b0b0b" : "#fff",
          }}
        >
          {layer === "canon" ? `CANON ${s.authority_score ?? "?"}/10`
            : layer === "states" ? `${s.state_code ?? "STATE"} ${s.authority_score ?? "?"}/10`
            : layer === "programs" ? `${s.program_code ?? "PROG"} ${s.authority_score ?? "?"}/10`
            : `${layer.toUpperCase()} ${s.authority_score ?? "?"}/10`}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        {s.source_url && (
          <a href={s.source_url} target="_blank" rel="noopener" className="hover:text-foreground underline-offset-2 hover:underline">
            Source ↗
          </a>
        )}
      </div>
    </div>
  );
}

/* ────────────── tabs ────────────── */

function CanonTab() {
  const listFn = useServerFn(listAtlasSources);
  const { data, isLoading } = useQuery({
    queryKey: ["atlas-sources", "canon"],
    queryFn: () => listFn({ data: { layer: "canon" } as any }),
  });
  const sources = data?.sources ?? [];

  const categories = useMemo(() => {
    const cats: Record<string, number> = {};
    sources.forEach((s: any) => {
      const k = s.library_category ?? "Uncategorized";
      cats[k] = (cats[k] ?? 0) + 1;
    });
    return cats;
  }, [sources]);

  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const filtered = selectedCat ? sources.filter((s: any) => (s.library_category ?? "Uncategorized") === selectedCat) : sources;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2">
        <LayerBadge layer="canon" />
        <p className="text-[13px] text-muted-foreground max-w-3xl">
          Federal regulations, CMS guidance, Medicaid authorities, and Athena methodology. These sources are always available to IRIS regardless of mission.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
        <aside>
          <button
            onClick={() => setSelectedCat(null)}
            className={`flex w-full items-center justify-between rounded px-3 py-2 text-sm ${!selectedCat ? "bg-white/[0.06] text-foreground" : "text-muted-foreground hover:bg-white/[0.04]"}`}
          >
            <span>All Canon</span>
            <span className="text-xs">{sources.length}</span>
          </button>
          <div className="my-2 border-t border-white/10" />
          {Object.entries(categories).map(([cat, n]) => (
            <button
              key={cat}
              onClick={() => setSelectedCat(cat)}
              className={`flex w-full items-center justify-between rounded px-3 py-2 text-sm ${selectedCat === cat ? "bg-white/[0.06] text-foreground" : "text-muted-foreground hover:bg-white/[0.04]"}`}
            >
              <span className="truncate text-left">{cat}</span>
              <span className="text-xs">{n}</span>
            </button>
          ))}
        </aside>
        <div className="space-y-3">
          {isLoading ? <Loading /> : filtered.length === 0 ? <Empty msg="No Canon sources yet." /> :
            filtered.map((s: any) => <SourceCard key={s.id} s={s} layer="canon" />)}
        </div>
      </div>
    </div>
  );
}

function StatesTab() {
  const statesFn = useServerFn(listStates);
  const { data } = useQuery({ queryKey: ["atlas-states"], queryFn: () => statesFn({ data: {} as any }) });
  const states = data?.states ?? [];
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const selected = states.find((s: any) => s.state_code === selectedCode) ?? states[0] ?? null;

  const sourcesFn = useServerFn(listAtlasSources);
  const { data: srcData } = useQuery({
    queryKey: ["atlas-sources", "state", selected?.state_code],
    queryFn: () => sourcesFn({ data: { layer: "state", stateCode: selected!.state_code } as any }),
    enabled: !!selected,
  });
  const programsFn = useServerFn(listPrograms);
  const { data: progData } = useQuery({
    queryKey: ["atlas-programs", selected?.state_code],
    queryFn: () => programsFn({ data: { stateCode: selected!.state_code } }),
    enabled: !!selected,
  });

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2">
        <LayerBadge layer="states" />
        <p className="text-[13px] text-muted-foreground">Build state intelligence once. Use it on every pursuit in that state.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6">
        <aside className="space-y-1">
          {states.map((s: any) => {
            const active = s.source_count > 0;
            const isSel = selected?.state_code === s.state_code;
            return (
              <button
                key={s.state_code}
                onClick={() => setSelectedCode(s.state_code)}
                className={`flex w-full items-center justify-between rounded px-3 py-2.5 text-sm ${isSel ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"}`}
              >
                <div className="flex items-center gap-2.5">
                  <span className={`h-2 w-2 rounded-full ${active ? "bg-blue-400" : "bg-white/15"}`} />
                  <span className="font-mono text-[11px] text-muted-foreground">{s.state_code}</span>
                  <span>{s.state_name}</span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {active ? `${s.source_count} src` : "—"}
                </span>
              </button>
            );
          })}
        </aside>
        <div>
          {selected ? (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-semibold">{selected.state_name}</h2>
                <span className="rounded bg-blue-500/15 px-2 py-0.5 text-[11px] font-mono text-blue-300">{selected.state_code}</span>
              </div>
              <IrisBriefBox brief={selected.iris_state_brief} updatedAt={selected.iris_brief_updated_at} emptyMsg="No state intelligence ingested yet. Add sources to generate a brief." />
              <CoverageGrid
                topics={[
                  "Agencies", "Regulations & Law", "Waivers",
                  "Managed Care", "Procurement History", "Political Environment",
                  "Stakeholders", "Provider Landscape", "Market Intel",
                ]}
                sources={srcData?.sources ?? []}
              />
              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Sources</h3>
                <div className="space-y-3">
                  {(srcData?.sources ?? []).map((s: any) => <SourceCard key={s.id} s={s} layer="states" />)}
                  {(srcData?.sources ?? []).length === 0 && <Empty msg="No sources yet for this state." />}
                </div>
              </div>
              {(progData?.programs ?? []).length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Programs in this state</h3>
                  <div className="space-y-1.5">
                    {(progData?.programs ?? []).map((p: any) => (
                      <div key={p.program_code} className="flex items-center justify-between rounded border border-white/10 bg-white/[0.02] px-3 py-2 text-sm">
                        <span>{p.program_name}</span>
                        <span className="text-xs text-muted-foreground">{p.source_count} sources</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : <Empty msg="No states yet." />}
        </div>
      </div>
    </div>
  );
}

function ProgramsTab() {
  const progFn = useServerFn(listPrograms);
  const { data } = useQuery({ queryKey: ["atlas-programs", "all"], queryFn: () => progFn({ data: {} }) });
  const programs = data?.programs ?? [];
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const selected = programs.find((p: any) => p.program_code === selectedCode) ?? programs[0] ?? null;

  const sourcesFn = useServerFn(listAtlasSources);
  const { data: srcData } = useQuery({
    queryKey: ["atlas-sources", "program", selected?.program_code],
    queryFn: () => sourcesFn({ data: { layer: "program", programCode: selected!.program_code } as any }),
    enabled: !!selected,
  });

  // group programs by state
  const byState = useMemo(() => {
    const m: Record<string, any[]> = {};
    programs.forEach((p: any) => {
      const k = p.state_code ?? "—";
      (m[k] ??= []).push(p);
    });
    return m;
  }, [programs]);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2">
        <LayerBadge layer="programs" />
        <p className="text-[13px] text-muted-foreground">Program intelligence built once, reused across every bid for that program.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6">
        <aside className="space-y-3">
          {Object.entries(byState).map(([state, ps]) => (
            <div key={state}>
              <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{state}</div>
              {ps.map((p) => {
                const isSel = selected?.program_code === p.program_code;
                const active = p.source_count > 0;
                return (
                  <button
                    key={p.program_code}
                    onClick={() => setSelectedCode(p.program_code)}
                    className={`flex w-full items-center justify-between rounded px-3 py-2 text-sm ${isSel ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${active ? "bg-[color:var(--iris,#22d3ee)]" : "bg-white/15"}`} />
                      <span className="truncate">{p.program_name}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{p.source_count}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </aside>
        <div>
          {selected ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold">{selected.program_name}</h2>
                <div className="mt-1 text-[12px] text-muted-foreground">{selected.state_code} · {selected.program_type ?? "Program"}</div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Vital label="Current Contractor" value={selected.current_contractor} />
                <Vital label="Contract Value" value={selected.contract_value} />
                <Vital label="Last Procurement" value={selected.last_procurement} />
                <Vital label="Next Procurement" value={selected.next_procurement ?? "TBD"} />
              </div>
              <IrisBriefBox brief={selected.iris_program_brief} updatedAt={selected.iris_brief_updated_at} emptyMsg="No program intelligence ingested yet." />
              <CoverageGrid
                topics={["Program Overview", "Population", "Service Array", "Operations", "Quality & Reporting", "Proposal Insights"]}
                sources={srcData?.sources ?? []}
              />
              <ProposalImplications programCode={selected.program_code} sources={srcData?.sources ?? []} />
              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Program sources</h3>
                <div className="space-y-3">
                  {(srcData?.sources ?? []).map((s: any) => <SourceCard key={s.id} s={s} layer="programs" />)}
                  {(srcData?.sources ?? []).length === 0 && <Empty msg="No sources yet." />}
                </div>
              </div>
            </div>
          ) : <Empty msg="No programs yet." />}
        </div>
      </div>
    </div>
  );
}

function MissionsTab() {
  const fn = useServerFn(listMissionsForHub);
  const { data, isLoading } = useQuery({ queryKey: ["hub-missions"], queryFn: () => fn({ data: {} as any }) });
  const missions = data?.missions ?? [];
  const active = missions.filter((m: any) => (m.status ?? "Active") !== "Closed");
  const closed = missions.filter((m: any) => m.status === "Closed");

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2">
        <LayerBadge layer="missions" />
        <p className="text-[13px] text-muted-foreground">Active missions link to Mission Room. Closed missions preserve their learning.</p>
      </div>

      {isLoading ? <Loading /> : (
        <div className="space-y-8">
          <Section title="ACTIVE" dotColor="bg-green-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {active.map((m: any) => (
                <MissionCard key={m.id} m={m} active />
              ))}
              {active.length === 0 && <Empty msg="No active missions." />}
            </div>
          </Section>
          <Section title="ARCHIVED" dotColor="bg-white/30">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {closed.map((m: any) => (
                <MissionCard key={m.id} m={m} active={false} />
              ))}
              {closed.length === 0 && <Empty msg="No archived missions." />}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

function CollectiveTab() {
  const fn = useServerFn(listLessons);
  const [type, setType] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["atlas-lessons", type],
    queryFn: () => fn({ data: { lessonType: type ?? undefined } }),
  });
  const lessons = data?.lessons ?? [];
  const wins = lessons.filter((l: any) => l.win_or_loss === "win").length;
  const losses = lessons.filter((l: any) => l.win_or_loss === "loss").length;
  const types = ["Winning Themes", "Evaluator Preferences", "Compliance Lessons", "Writing Patterns", "Market Intelligence", "Operational Lessons"];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2">
        <LayerBadge layer="collective" />
        <p className="text-[13px] text-muted-foreground">Every lesson Athena has ever learned from winning and losing. This layer never closes.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Vital label="Total Lessons" value={lessons.length.toString()} />
        <Vital label="From Wins" value={wins.toString()} />
        <Vital label="From Losses" value={losses.toString()} />
        <Vital label="Programs Covered" value={new Set(lessons.flatMap((l: any) => l.applies_to_programs ?? [])).size.toString()} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <FilterChip active={!type} onClick={() => setType(null)}>All</FilterChip>
        {types.map((t) => <FilterChip key={t} active={type === t} onClick={() => setType(t)}>{t}</FilterChip>)}
      </div>

      {isLoading ? <Loading /> : lessons.length === 0 ? <Empty msg="No lessons yet. Promote learning from a closed mission to grow Collective Memory." /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {lessons.map((l: any) => <LessonCard key={l.id} l={l} />)}
        </div>
      )}
    </div>
  );
}

/* ────────────── helper components ────────────── */

function IrisBriefBox({ brief, updatedAt, emptyMsg }: { brief?: string | null; updatedAt?: string | null; emptyMsg: string }) {
  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: "color-mix(in oklab, var(--iris, #22d3ee) 6%, transparent)",
        border: "1px solid color-mix(in oklab, var(--iris, #22d3ee) 25%, transparent)",
      }}
    >
      <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--iris, #22d3ee)" }}>
        <Brain size={13} /> IRIS Brief
      </div>
      {brief ? (
        <>
          <p className="text-sm leading-relaxed text-foreground/90">{brief}</p>
          {updatedAt && <div className="mt-2 text-[11px] text-muted-foreground">Updated {new Date(updatedAt).toLocaleDateString()}</div>}
        </>
      ) : <p className="text-sm text-muted-foreground">{emptyMsg}</p>}
    </div>
  );
}

function CoverageGrid({ topics, sources }: { topics: string[]; sources: any[] }) {
  // naive bucketing by tags / library_category
  const buckets: Record<string, number> = {};
  topics.forEach((t) => (buckets[t] = 0));
  sources.forEach((s: any) => {
    const txt = `${s.library_category ?? ""} ${(s.tags ?? []).join(" ")}`.toLowerCase();
    topics.forEach((t) => {
      if (txt.includes(t.toLowerCase().split(" ")[0])) buckets[t]++;
    });
  });
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Intelligence Coverage</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {topics.map((t) => {
          const n = buckets[t];
          const color = n >= 3 ? "rgba(34,197,94,0.4)" : n >= 1 ? "rgba(245,158,11,0.4)" : "rgba(239,68,68,0.4)";
          const bg = n >= 3 ? "rgba(34,197,94,0.06)" : n >= 1 ? "rgba(245,158,11,0.06)" : "rgba(239,68,68,0.06)";
          return (
            <div key={t} className="rounded-lg p-3" style={{ border: `1px solid ${color}`, background: bg }}>
              <div className="text-sm font-medium">{t}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">{n} source{n === 1 ? "" : "s"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Vital({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value || "—"}</div>
    </div>
  );
}

function ProposalImplications({ programCode, sources }: { programCode: string; sources: any[] }) {
  const fn = useServerFn(listLessons);
  const { data } = useQuery({
    queryKey: ["program-lessons", programCode],
    queryFn: () => fn({ data: { programCode } }),
  });
  const lessons = data?.lessons ?? [];
  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: "color-mix(in oklab, var(--iris, #22d3ee) 6%, transparent)",
        border: "1px solid color-mix(in oklab, var(--iris, #22d3ee) 25%, transparent)",
      }}
    >
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--iris, #22d3ee)" }}>
        <Target size={13} /> Proposal Implications
      </div>
      {lessons.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          IRIS will surface winning themes for this program once Collective Memory has lessons tagged with <code className="text-foreground">{programCode}</code>.
        </p>
      ) : (
        <ul className="list-disc pl-5 text-sm space-y-1.5">
          {lessons.slice(0, 5).map((l: any) => <li key={l.id}><span className="font-medium">{l.title}</span> — {l.lesson_body.slice(0, 160)}…</li>)}
        </ul>
      )}
    </div>
  );
}

function MissionCard({ m, active }: { m: any; active: boolean }) {
  const won = (m.status === "Closed" && m.health === "Green") || m.status === "Won";
  return (
    <Link
      to="/missions/$missionId/overview"
      params={{ missionId: m.id }}
      className="block rounded-lg border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.05] transition-colors"
    >
      <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em]">
        {active ? (
          <><span className="h-2 w-2 rounded-full bg-green-500" /> <span className="text-green-400">ACTIVE</span></>
        ) : (
          <><span className="h-2 w-2 rounded-full bg-white/30" /> <span className="text-muted-foreground">CLOSED · {won ? "WON" : "LOST"}</span></>
        )}
      </div>
      <div className="text-base font-semibold">{m.name}</div>
      <div className="mt-0.5 text-[12px] text-muted-foreground">{m.state ?? "—"} · {m.program_type ?? m.client}</div>
      <div className="mt-3 text-[11px] text-muted-foreground">
        {m.question_count ?? 0} questions · RFP: {m.rfp_parsed ? "✓ Ingested" : "Pending"}
      </div>
      <div className="mt-3 inline-flex items-center gap-1 text-xs text-foreground/80">
        {active ? "Open Mission Room" : "View Archive"} <ArrowRight size={12} />
      </div>
    </Link>
  );
}

function LessonCard({ l }: { l: any }) {
  const wlColor = l.win_or_loss === "win" ? "text-green-400" : l.win_or_loss === "loss" ? "text-amber-400" : "text-purple-400";
  const wlSym = l.win_or_loss === "win" ? "● WIN" : l.win_or_loss === "loss" ? "○ LOSS" : "◉ BOTH";
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em]">
        <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-purple-300">{l.lesson_type}</span>
        <span className={wlColor}>{wlSym}</span>
        <span className="text-muted-foreground">· {l.confidence?.toUpperCase() ?? "MEDIUM"}</span>
      </div>
      <div className="text-sm font-semibold">{l.title}</div>
      <p className="mt-1.5 line-clamp-4 text-[13px] text-muted-foreground">{l.lesson_body}</p>
      <div className="mt-3 flex flex-wrap gap-1">
        {(l.applies_to_states ?? []).map((st: string) => (
          <span key={st} className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-mono text-blue-300">{st}</span>
        ))}
        {(l.applies_to_programs ?? []).map((p: string) => (
          <span key={p} className="rounded bg-[color:var(--iris,#22d3ee)]/15 px-1.5 py-0.5 text-[10px] font-mono text-[color:var(--iris,#22d3ee)]">{p}</span>
        ))}
      </div>
      <div className="mt-3 text-[11px] text-muted-foreground">
        Applied {l.times_applied ?? 0} times{l.last_applied_at ? ` · last ${new Date(l.last_applied_at).toLocaleDateString()}` : ""}
      </div>
    </div>
  );
}

function IntelligenceHealth({ stats }: { stats: any }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs hover:bg-white/[0.06]"
      >
        <Shield size={12} /> Intelligence Health
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-30 w-80 rounded-lg border border-white/10 bg-[#0b1220] p-4 shadow-xl">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Atlas Intelligence Health</div>
          <HealthBar label="Canon Coverage" value={Math.min(100, (stats?.canonSources ?? 0) * 5)} />
          <HealthBar label="State Coverage" value={Math.min(100, (stats?.stateSources ?? 0) * 4)} />
          <HealthBar label="Program Coverage" value={Math.min(100, (stats?.programSources ?? 0) * 6)} />
          <HealthBar label="Collective Memory" value={Math.min(100, (stats?.lessons ?? 0) * 4)} note={`${stats?.lessons ?? 0} lessons · Growing`} />
        </div>
      )}
    </div>
  );
}

function HealthBar({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{value}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-[color:var(--iris,#22d3ee)]" style={{ width: `${value}%` }} />
      </div>
      {note && <div className="mt-1 text-[10px] text-muted-foreground">{note}</div>}
    </div>
  );
}

function Section({ title, dotColor, children }: { title: string; dotColor: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dotColor}`} />
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-3 py-1 text-xs transition-colors"
      style={{
        background: active ? "var(--iris, #22d3ee)" : "transparent",
        color: active ? "#04141a" : "var(--muted-foreground)",
        border: `1px solid ${active ? "var(--iris, #22d3ee)" : "rgba(255,255,255,0.1)"}`,
      }}
    >
      {children}
    </button>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="rounded-lg border border-dashed border-white/10 px-6 py-8 text-center text-sm text-muted-foreground">{msg}</div>;
}
function Loading() {
  return <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>;
}

function SearchResults({ results, loading }: { results: any; loading: boolean }) {
  if (loading) return <Loading />;
  if (!results) return null;
  const groups: { key: Tab; label: string; items: any[] }[] = [
    { key: "canon", label: "Canon Results", items: results.canon ?? [] },
    { key: "states", label: "State Results", items: results.state ?? [] },
    { key: "programs", label: "Program Results", items: results.program ?? [] },
    { key: "missions", label: "Mission Results", items: results.mission ?? [] },
    { key: "collective", label: "Collective Memory", items: results.collective ?? [] },
  ];
  const total = groups.reduce((a, g) => a + g.items.length, 0);
  return (
    <div className="mt-6 space-y-6">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{total} results across all layers</div>
      {groups.map((g) => g.items.length === 0 ? null : (
        <div key={g.key}>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: LAYER_COLOR[g.key] }} />
            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: LAYER_COLOR[g.key] }}>
              {g.label} ({g.items.length})
            </h3>
          </div>
          <div className="space-y-2">
            {g.key === "collective"
              ? g.items.map((l: any) => <LessonCard key={l.id} l={l} />)
              : g.items.map((s: any) => <SourceCard key={s.id} s={s} layer={g.key} />)}
          </div>
        </div>
      ))}
      {total === 0 && <Empty msg="No matches across any layer." />}
    </div>
  );
}
