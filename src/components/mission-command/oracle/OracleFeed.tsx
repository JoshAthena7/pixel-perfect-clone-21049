import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, Loader2, Sparkles, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { ErrorBanner, SkeletonList, OlympusLink } from "./OracleShared";
import { runIrisSweep } from "@/lib/iris-sweep.functions";
import type { Database } from "@/integrations/supabase/types";

type FeedItem = Database["public"]["Tables"]["intelligence_feed_items"]["Row"];

const GOLD = "#C49A2B";

// Display category buckets (the user-facing dashboard groups)
type GroupId =
  | "competitive"
  | "program"
  | "state"
  | "regulatory"
  | "risk"
  | "lesson"
  | "stakeholder";

const GROUP_META: Record<GroupId, { label: string; color: string; bg: string; border: string }> = {
  competitive: { label: "Competitive Intelligence", color: "#f08080", bg: "rgba(224,74,74,0.10)", border: "rgba(224,74,74,0.3)" },
  program: { label: "Program Intelligence", color: "#7BA7D4", bg: "rgba(123,167,212,0.10)", border: "rgba(123,167,212,0.3)" },
  state: { label: "State Intelligence", color: "#7DCF7D", bg: "rgba(125,207,125,0.10)", border: "rgba(125,207,125,0.3)" },
  regulatory: { label: "Regulatory", color: "#EFBF27", bg: "rgba(239,191,39,0.10)", border: "rgba(239,191,39,0.3)" },
  risk: { label: "Risk Signals", color: "#f0a070", bg: "rgba(240,160,112,0.10)", border: "rgba(240,160,112,0.35)" },
  lesson: { label: "Lessons & Patterns", color: "#a39adf", bg: "rgba(140,130,230,0.10)", border: "rgba(140,130,230,0.3)" },
  stakeholder: { label: "Stakeholders", color: "#c9a1d4", bg: "rgba(201,161,212,0.10)", border: "rgba(201,161,212,0.3)" },
};

const GROUP_ORDER: GroupId[] = ["risk", "competitive", "program", "state", "regulatory", "lesson", "stakeholder"];

function categoryToGroup(cat: string): GroupId {
  if (cat === "competitive") return "competitive";
  if (cat === "mission_risk") return "risk";
  if (cat === "state_policy") return "state";
  if (cat === "federal_policy" || cat === "legislative" || cat === "procurement") return "program";
  if (cat === "regulatory") return "regulatory";
  if (cat === "research") return "lesson";
  if (cat === "stakeholder") return "stakeholder";
  return "program";
}

type Confidence = "HIGH" | "MEDIUM" | "LOW";
function relevanceToConfidence(rel: number): Confidence {
  if (rel >= 80) return "HIGH";
  if (rel >= 55) return "MEDIUM";
  return "LOW";
}

function sourceLabel(item: FeedItem): string {
  const name = (item.source_name ?? "").toLowerCase();
  if (name.includes("iris") || name.includes("sweep") || name.includes("pattern") || name.includes("lessons"))
    return "From: IRIS Memory";
  if (name.includes("thread")) return "From: Thread";
  if (name.includes("rfp")) return "From: RFP";
  return item.source_name ? `From: ${item.source_name}` : "From: IRIS";
}

export function OracleFeed({
  missionId,
  isAdmin,
  highlightId,
  completeness = 0,
}: {
  missionId: string;
  isAdmin: boolean;
  highlightId?: string | null;
  completeness?: number;
}) {
  const [group, setGroup] = useState<GroupId | "all">("all");
  const [search, setSearch] = useState("");
  const qc = useQueryClient();
  const sweepFn = useServerFn(runIrisSweep);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["oracle-ro-feed", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("intelligence_feed_items")
        .select("*")
        .eq("mission_id", missionId)
        .eq("is_dismissed", false)
        .order("iris_relevance_score", { ascending: false })
        .order("published_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as FeedItem[];
    },
    staleTime: 60_000,
  });

  const sweep = useMutation({
    mutationFn: () => sweepFn({ data: { missionId } }),
    onSuccess: (r) => {
      const dup = (r as { skipped_duplicates?: number }).skipped_duplicates ?? 0;
      const msg = `IRIS added ${r.inserted} intelligence item${r.inserted === 1 ? "" : "s"}${
        dup > 0 ? ` · ${dup} duplicate${dup === 1 ? "" : "s"} skipped` : ""
      }.`;
      toast.success(msg);
      if (r.failures.length) toast.warning(`${r.failures.length} category(ies) had issues`);
      qc.invalidateQueries({ queryKey: ["oracle-ro-feed", missionId] });
      qc.invalidateQueries({ queryKey: ["oracle-counts", missionId] });
      qc.invalidateQueries({ queryKey: ["oracle-mission-header", missionId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "IRIS sweep failed"),
  });

  // Auto-sweep on first load when feed is thin OR completeness very low
  const autoTriggered = useRef(false);
  useEffect(() => {
    if (autoTriggered.current) return;
    if (!isAdmin) return; // server requires admin
    if (isLoading || !data || sweep.isPending) return;
    if (data.length >= 5 && completeness >= 20) return;
    autoTriggered.current = true;
    sweep.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isLoading, completeness, isAdmin]);

  // Group + filter
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result: Record<GroupId, FeedItem[]> = {
      competitive: [],
      program: [],
      state: [],
      regulatory: [],
      risk: [],
      lesson: [],
      stakeholder: [],
    };
    for (const i of data ?? []) {
      if (q && !`${i.headline} ${i.iris_assessment ?? ""}`.toLowerCase().includes(q)) continue;
      const g = categoryToGroup(i.category);
      if (group !== "all" && g !== group) continue;
      result[g].push(i);
    }
    return result;
  }, [data, search, group]);

  const totalCount = (data ?? []).length;
  const visibleCount = Object.values(grouped).reduce((a, b) => a + b.length, 0);
  const countsByGroup = useMemo(() => {
    const c: Record<GroupId, number> = {
      competitive: 0, program: 0, state: 0, regulatory: 0, risk: 0, lesson: 0, stakeholder: 0,
    };
    for (const i of data ?? []) c[categoryToGroup(i.category)] += 1;
    return c;
  }, [data]);

  const lastUpdated = useMemo(() => {
    if (!data || data.length === 0) return null;
    const ts = data
      .map((d) => (d.published_at ? new Date(d.published_at).getTime() : 0))
      .reduce((a, b) => (b > a ? b : a), 0);
    return ts > 0 ? new Date(ts) : null;
  }, [data]);

  // Highlight scroll
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  useEffect(() => {
    if (!highlightId || !data || data.length === 0) return;
    const match = data.find((i) => i.id === highlightId);
    if (!match) return;
    setSearch("");
    setGroup("all");
    const t1 = setTimeout(() => {
      const el = document.getElementById(`feed-item-${highlightId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightedItemId(highlightId);
        const t2 = setTimeout(() => setHighlightedItemId(null), 3000);
        return () => clearTimeout(t2);
      }
    }, 500);
    return () => clearTimeout(t1);
  }, [highlightId, data]);

  if (isError) return <ErrorBanner>Could not load this intelligence. Try refreshing.</ErrorBanner>;

  return (
    <div className="space-y-4">
      {/* Dashboard stat row */}
      <DashboardHeader
        completeness={completeness}
        totalCount={totalCount}
        countsByGroup={countsByGroup}
        lastUpdated={lastUpdated}
        canSweep={isAdmin}
        sweepPending={sweep.isPending}
        onSweep={() => sweep.mutate()}
      />

      {/* Auto-sweep banner */}
      {sweep.isPending && (
        <div
          className="rounded-md px-4 py-2.5 flex items-center gap-3 animate-pulse"
          style={{ background: "rgba(196,154,43,0.08)", border: "1px solid rgba(196,154,43,0.3)" }}
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: GOLD }} />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.8)" }}>
            IRIS is analyzing your mission context…
          </span>
        </div>
      )}

      {/* Search + group chips */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search intelligence…"
          className="h-8 w-full sm:w-64"
          style={{ fontSize: 12 }}
        />
        <GroupChip active={group === "all"} onClick={() => setGroup("all")} label="All" count={totalCount} />
        {GROUP_ORDER.map((g) => (
          <GroupChip
            key={g}
            active={group === g}
            onClick={() => setGroup(g)}
            label={GROUP_META[g].label}
            count={countsByGroup[g]}
            accent={GROUP_META[g].color}
          />
        ))}
      </div>

      {isLoading ? (
        <SkeletonList count={3} />
      ) : visibleCount === 0 ? (
        <FeedEmptyState missionId={missionId} hasAny={totalCount > 0} />
      ) : (
        <div className="space-y-6">
          {GROUP_ORDER.map((g) => {
            const items = grouped[g];
            if (items.length === 0) return null;
            return (
              <section key={g} className="space-y-2">
                <GroupDivider id={g} count={items.length} />
                <div className="space-y-2">
                  {items.map((i) => (
                    <FeedCard key={i.id} item={i} group={g} highlighted={highlightedItemId === i.id} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="italic" style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
          IRIS monitors continuously. Sources configured in Olympus.
        </div>
        {isAdmin && <OlympusLink>Manage sources in Olympus →</OlympusLink>}
      </div>
    </div>
  );
}

function DashboardHeader({
  completeness,
  totalCount,
  countsByGroup,
  lastUpdated,
  canSweep,
  sweepPending,
  onSweep,
}: {
  completeness: number;
  totalCount: number;
  countsByGroup: Record<GroupId, number>;
  lastUpdated: Date | null;
  canSweep: boolean;
  sweepPending: boolean;
  onSweep: () => void;
}) {
  const topChips: { g: GroupId; label: string }[] = [
    { g: "competitive", label: "Competitor" },
    { g: "program", label: "Program" },
    { g: "state", label: "State" },
    { g: "risk", label: "Risk" },
  ];
  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: "linear-gradient(180deg, rgba(196,154,43,0.04), rgba(255,255,255,0.015))",
        border: `1px solid rgba(196,154,43,0.2)`,
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Completeness */}
        <div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)" }}>
            Intelligence Completeness
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <span style={{ color: GOLD, fontWeight: 600, fontSize: 22, lineHeight: 1 }}>
              {Math.round(completeness)}%
            </span>
          </div>
          <div
            className="mt-2 relative"
            style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.max(0, completeness))}%`,
                height: "100%",
                background: `linear-gradient(90deg, ${GOLD}, #e3c46c)`,
                transition: "width 600ms ease",
              }}
            />
          </div>
        </div>

        {/* Feed items + chip breakdown */}
        <div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)" }}>
            Feed Items
          </div>
          <div style={{ color: "white", fontWeight: 600, fontSize: 22, lineHeight: 1, marginTop: 6 }}>
            {totalCount}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {topChips.map(({ g, label }) => (
              <span
                key={g}
                style={{
                  fontSize: 10,
                  padding: "1px 7px",
                  borderRadius: 999,
                  color: GROUP_META[g].color,
                  background: GROUP_META[g].bg,
                  border: `0.5px solid ${GROUP_META[g].border}`,
                }}
              >
                {label}: {countsByGroup[g]}
              </span>
            ))}
          </div>
        </div>

        {/* Last updated + sweep button */}
        <div className="flex flex-col items-start md:items-end justify-between gap-2">
          <div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)" }}>
              Last Updated
            </div>
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 6 }}>
              {lastUpdated ? formatDistanceToNow(lastUpdated, { addSuffix: true }) : "—"}
            </div>
          </div>
          {canSweep && (
            <button
              type="button"
              onClick={onSweep}
              disabled={sweepPending}
              className="inline-flex items-center gap-2 rounded transition-colors disabled:opacity-60"
              style={{
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 600,
                color: "#1a1306",
                background: sweepPending
                  ? "rgba(196,154,43,0.5)"
                  : `linear-gradient(180deg, #e3c46c, ${GOLD})`,
                border: `1px solid ${GOLD}`,
                boxShadow: sweepPending ? "none" : `0 4px 14px -4px rgba(196,154,43,0.55)`,
              }}
            >
              {sweepPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" /> Run Full IRIS Analysis
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function GroupChip({
  active,
  onClick,
  label,
  count,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  accent?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full transition-colors whitespace-nowrap"
      style={{
        padding: "3px 10px",
        fontSize: 11,
        color: active ? (accent ?? GOLD) : "rgba(255,255,255,0.5)",
        background: active ? `${accent ?? GOLD}1a` : "transparent",
        border: `0.5px solid ${active ? (accent ?? GOLD) + "55" : "rgba(255,255,255,0.08)"}`,
      }}
    >
      {label}
      <span style={{ opacity: 0.7, fontSize: 10 }}>{count}</span>
    </button>
  );
}

function GroupDivider({ id, count }: { id: GroupId; count: number }) {
  const meta = GROUP_META[id];
  return (
    <div className="flex items-center gap-3 pt-1">
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: meta.color,
          boxShadow: `0 0 8px ${meta.color}80`,
        }}
      />
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: meta.color,
        }}
      >
        {meta.label}
      </span>
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
        {count} item{count === 1 ? "" : "s"}
      </span>
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${meta.color}30, transparent)` }} />
    </div>
  );
}

function FeedEmptyState({ missionId, hasAny }: { missionId: string; hasAny: boolean }) {
  if (hasAny) {
    return (
      <div
        className="rounded-lg p-8 text-center"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.08)" }}
      >
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>No items match this filter.</div>
        <div className="mt-1" style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
          Try clearing search or switching to All.
        </div>
      </div>
    );
  }
  return (
    <div
      className="rounded-lg p-8 text-center"
      style={{ background: "rgba(196,154,43,0.04)", border: "1px dashed rgba(196,154,43,0.25)" }}
    >
      <Sparkles className="h-5 w-5 mx-auto mb-3" style={{ color: GOLD }} />
      <div style={{ fontSize: 13, color: "white" }}>
        IRIS needs more mission context to generate intelligence.
      </div>
      <div className="mt-1" style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", maxWidth: 460, marginLeft: "auto", marginRight: "auto" }}>
        Complete Steps 2–4 of Mission Setup to unlock full analysis.
      </div>
      <Link
        to="/olympus/wizard/$missionId"
        params={{ missionId } as never}
        className="inline-flex items-center gap-1.5 rounded mt-4"
        style={{
          padding: "6px 12px",
          fontSize: 11,
          fontWeight: 600,
          color: "#1a1306",
          background: `linear-gradient(180deg, #e3c46c, ${GOLD})`,
          border: `1px solid ${GOLD}`,
        }}
      >
        Go to Mission Setup <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function ConfidenceBadge({ level }: { level: Confidence }) {
  const palette =
    level === "HIGH"
      ? { fg: "#7DCF7D", bg: "rgba(125,207,125,0.12)", border: "rgba(125,207,125,0.3)" }
      : level === "MEDIUM"
        ? { fg: "#EF9F27", bg: "rgba(239,159,39,0.12)", border: "rgba(239,159,39,0.3)" }
        : { fg: "rgba(255,255,255,0.55)", bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.12)" };
  return (
    <span
      className="rounded"
      style={{
        fontSize: 9,
        padding: "1px 6px",
        color: palette.fg,
        background: palette.bg,
        border: `0.5px solid ${palette.border}`,
        fontWeight: 600,
        letterSpacing: "0.06em",
      }}
    >
      {level}
    </span>
  );
}

function FeedCard({ item, group, highlighted }: { item: FeedItem; group: GroupId; highlighted?: boolean }) {
  const meta = GROUP_META[group];
  const rel = item.iris_relevance_score ?? 0;
  const conf = relevanceToConfidence(rel);

  const onAsk = () => {
    window.dispatchEvent(
      new CustomEvent("atlas:iris:prefill", {
        detail: `Tell me more about: ${item.headline} — and how it affects this mission.`,
      }),
    );
  };

  return (
    <div
      id={`feed-item-${item.id}`}
      className="rounded-lg p-3.5"
      style={{
        background: highlighted ? "rgba(196,154,43,0.08)" : meta.bg,
        border: `1px solid ${highlighted ? "rgba(196,154,43,0.6)" : meta.border}`,
        transition: "background-color 1s ease, border-color 1s ease",
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span
          className="rounded"
          style={{
            padding: "2px 8px",
            fontSize: 10,
            background: `${meta.color}20`,
            color: meta.color,
            border: `0.5px solid ${meta.color}55`,
            fontWeight: 500,
            letterSpacing: "0.04em",
          }}
        >
          {meta.label.toUpperCase()}
        </span>
        <ConfidenceBadge level={conf} />
      </div>

      <div
        className="text-white truncate"
        style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}
        title={item.headline}
      >
        {item.source_url ? (
          <a href={item.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
            {item.headline}
            <ExternalLink className="h-3 w-3 opacity-50" />
          </a>
        ) : (
          item.headline
        )}
      </div>

      {item.iris_assessment && (
        <p
          className="italic mt-2"
          style={{
            fontSize: 11,
            lineHeight: 1.5,
            color: "rgba(255,255,255,0.7)",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {item.iris_assessment}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
          {sourceLabel(item)}
          {item.published_at && (
            <> · {formatDistanceToNow(new Date(item.published_at), { addSuffix: true })}</>
          )}
        </span>
        <button
          type="button"
          onClick={onAsk}
          className="inline-flex items-center gap-1 rounded"
          style={{
            padding: "3px 10px",
            fontSize: 10,
            color: GOLD,
            background: "transparent",
            border: "1px solid rgba(196,154,43,0.4)",
          }}
        >
          Ask IRIS <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
