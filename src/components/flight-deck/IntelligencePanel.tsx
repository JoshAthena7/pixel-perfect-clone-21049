/**
 * Flight Deck Intelligence Panel — right column persistent panel.
 * Replaces the old shallow chip row with full intelligence inline.
 *
 * Five collapsible sections (collapse state saved per question in localStorage):
 *   1. Athena Insight (placeholder until AthenaInsightCard ships)
 *   2. IRIS Intelligence Brief (existing component)
 *   3. Key Requirements
 *   4. Win Themes
 *   5. Live Intelligence
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  ChevronDown, Eye, CheckSquare, Star, Activity, Compass,
  ArrowLeft, Sparkles, ExternalLink, X as XIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { IrisIntelligenceBrief } from "@/components/iris/IrisIntelligenceBrief";
import { cn } from "@/lib/utils";

const GOLD = "#C9A55C";
const IRIS_PURPLE = "rgba(140,100,220,0.9)";

type Props = {
  missionId: string | null;
  questionId: string | null;
  questionText?: string | null;
  questionNumber?: string | null;
  sectionId: string | null;
  sectionName?: string | null;
};

export function IntelligencePanel(props: Props) {
  return (
    <aside
      className="rounded-xl border-l border-t-2 border-b border-r"
      style={{
        borderTopColor: GOLD,
        borderLeftColor: "rgba(255,255,255,0.06)",
        borderBottomColor: "rgba(255,255,255,0.06)",
        borderRightColor: "rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border/40">
        <Eye className="h-4 w-4" style={{ color: IRIS_PURPLE }} />
        <h2 className="text-[15px] font-medium text-foreground">
          {props.questionId ? "Intelligence" : "Intelligence Panel"}
        </h2>
      </header>

      {!props.questionId ? (
        <DefaultState missionId={props.missionId} />
      ) : (
        <SectionedBody {...props} questionId={props.questionId} missionId={props.missionId ?? ""} />
      )}
    </aside>
  );
}

/* ----------- Default state (no question selected) ----------- */
function DefaultState({ missionId }: { missionId: string | null }) {
  return (
    <div className="p-4 space-y-4">
      <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
        <ArrowLeft className="h-5 w-5 mx-auto text-muted-foreground/60 mb-2" />
        <p className="text-xs text-muted-foreground">
          Select a question from your workspace to see targeted intelligence.
        </p>
      </div>
      <AthenaInsightBlock missionId={missionId} questionId={null} sectionId={null} dailyOnly />
    </div>
  );
}

/* ----------- Sectioned body (question selected) ----------- */
function SectionedBody(props: Required<Pick<Props, "missionId" | "questionId">> & Props) {
  const storageKey = `atlas_intel_panel_${props.questionId}`;
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
      if (raw) return JSON.parse(raw);
    } catch {}
    return { athena: true, iris: true, evaluator: true, reqs: true, themes: true, live: true };
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(open)); } catch {}
  }, [open, storageKey]);

  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  return (
    <div className="p-3 space-y-3">
      <Section
        id="athena"
        open={open.athena}
        onToggle={() => toggle("athena")}
        header={
          <>
            <Compass className="h-3.5 w-3.5" style={{ color: GOLD }} />
            <span className="text-xs font-medium text-foreground">Athena Insight</span>
            <span
              className="ml-auto text-[10px] uppercase tracking-wider font-semibold"
              style={{ color: GOLD }}
            >
              From Athena
            </span>
          </>
        }
      >
        <AthenaInsightBlock
          missionId={props.missionId}
          questionId={props.questionId}
          sectionId={props.sectionId}
        />
      </Section>

      <Section
        id="iris"
        open={open.iris}
        onToggle={() => toggle("iris")}
        header={
          <>
            <Eye className="h-3.5 w-3.5" style={{ color: IRIS_PURPLE }} />
            <span className="text-xs font-medium text-foreground">IRIS Brief</span>
            <span
              className="ml-auto text-[10px] uppercase tracking-wider font-semibold"
              style={{ color: IRIS_PURPLE }}
            >
              From IRIS
            </span>
          </>
        }
      >
        {props.missionId && (
          <div className="text-[13px] [&_*]:!leading-relaxed">
            <IrisIntelligenceBrief
              missionId={props.missionId}
              sectionId={props.sectionId}
              questionId={props.questionId}
              contextType="flight_deck"
            />
          </div>
        )}
      </Section>

      <Section
        id="evaluator"
        open={open.evaluator}
        onToggle={() => toggle("evaluator")}
        header={
          <>
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">How They're Thinking</span>
            <span
              className="ml-auto text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
            >
              Evaluator Picture
            </span>
          </>
        }
      >
        <EvaluatorPicturePanel missionId={props.missionId} sectionId={props.sectionId} />
      </Section>


      <Section
        id="reqs"
        open={open.reqs}
        onToggle={() => toggle("reqs")}
        header={
          <>
            <CheckSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Key Requirements</span>
          </>
        }
      >
        <KeyRequirementsBlock missionId={props.missionId} sectionId={props.sectionId} />
      </Section>

      <Section
        id="themes"
        open={open.themes}
        onToggle={() => toggle("themes")}
        header={
          <>
            <Star className="h-3.5 w-3.5" style={{ color: GOLD }} />
            <span className="text-xs font-medium text-foreground">Win Themes</span>
          </>
        }
      >
        <WinThemesBlock missionId={props.missionId} />
      </Section>

      <Section
        id="live"
        open={open.live}
        onToggle={() => toggle("live")}
        header={
          <>
            <Activity className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-xs font-medium text-foreground">Live Intel</span>
            <LiveCountBadge missionId={props.missionId} />
          </>
        }
      >
        <LiveIntelBlock missionId={props.missionId} />
      </Section>
    </div>
  );
}

/* ----------- Generic Section wrapper ----------- */
function Section({
  open, onToggle, header, children,
}: {
  id: string;
  open: boolean;
  onToggle: () => void;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface/40 transition-colors"
        aria-expanded={open}
      >
        {header}
        <ChevronDown
          className={cn("h-3.5 w-3.5 ml-1 text-muted-foreground transition-transform", !open && "-rotate-90")}
        />
      </button>
      {open && <div className="px-3 pb-3 pt-1">{children}</div>}
    </div>
  );
}

/* =================== Section 1: Athena Insight =================== */
function AthenaInsightBlock({
  missionId, questionId, sectionId, dailyOnly,
}: {
  missionId: string | null;
  questionId: string | null;
  sectionId: string | null;
  dailyOnly?: boolean;
}) {
  const qc = useQueryClient();
  const queryKey = ["flight-deck-athena", missionId, questionId, sectionId, dailyOnly];

  const { data: insight, isLoading } = useQuery({
    queryKey,
    enabled: !!missionId,
    queryFn: async () => {
      // priority: at_risk for this question → section insight → daily
      if (!dailyOnly && questionId) {
        const { data: ar } = await (supabase.from("athena_insights") as any)
          .select("*").eq("mission_id", missionId!).eq("question_id", questionId)
          .eq("insight_type", "at_risk")
          .order("updated_at", { ascending: false }).limit(1).maybeSingle();
        if (ar) return ar;
      }
      if (!dailyOnly && sectionId) {
        const { data: sec } = await (supabase.from("athena_insights") as any)
          .select("*").eq("mission_id", missionId!).eq("section_id", sectionId)
          .eq("insight_type", "section")
          .order("updated_at", { ascending: false }).limit(1).maybeSingle();
        if (sec) return sec;
      }
      const { data: daily } = await (supabase.from("athena_insights") as any)
        .select("*").eq("mission_id", missionId!).eq("is_daily_insight", true)
        .order("updated_at", { ascending: false }).limit(1).maybeSingle();
      return daily ?? null;
    },
  });

  // Realtime subscription: refresh when athena_insights changes for this mission
  useEffect(() => {
    if (!missionId) return;
    const ch = supabase
      .channel(`athena-insights-${missionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "athena_insights", filter: `mission_id=eq.${missionId}` }, () => {
        qc.invalidateQueries({ queryKey: ["flight-deck-athena", missionId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [missionId, qc]);

  if (isLoading) {
    return (
      <div className="rounded-md border border-border/40 p-3.5">
        <p className="text-xs text-muted-foreground italic">Loading insight…</p>
      </div>
    );
  }

  if (!insight) {
    return (
      <div className="rounded-md border border-[color:var(--athena-gold)]/20 bg-[color:var(--athena-gold)]/[0.04] p-3.5">
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles className="h-3 w-3" style={{ color: GOLD }} />
          <span className="text-[10px] uppercase tracking-wider" style={{ color: GOLD }}>
            ✦ Daily
          </span>
        </div>
        <p className="text-xs text-muted-foreground italic leading-relaxed">
          {dailyOnly
            ? "No Daily Insight set for this mission yet."
            : "No Athena Insight mapped to this question."}
        </p>
      </div>
    );
  }

  const isAtRisk = insight.insight_type === "at_risk";
  const isDaily = insight.is_daily_insight;
  const borderColor = isAtRisk ? "#E5484D" : GOLD;
  const quote = insight.strategic_quote ?? insight.quote ?? "";

  return (
    <div
      className="rounded-md p-3.5"
      style={{
        border: `1px solid ${borderColor}33`,
        borderLeft: isAtRisk ? `3px solid ${borderColor}` : undefined,
        background: `${borderColor}0a`,
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: borderColor }}>
          {isAtRisk ? "⚠ At Risk" : isDaily ? "✦ Today" : "✦ Section"}
        </span>
        {insight.is_iris_generated && (
          <span className="text-[9px]" style={{ color: IRIS_PURPLE }}>Generated by IRIS</span>
        )}
      </div>
      <p className="text-[13px] leading-snug text-foreground font-medium">{quote}</p>
      {insight.writers_note && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{insight.writers_note}</p>
      )}
    </div>
  );
}


/* =================== Section 3: Key Requirements =================== */
function KeyRequirementsBlock({
  missionId, sectionId,
}: { missionId: string | null; sectionId: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ["intel-panel-reqs", missionId, sectionId],
    enabled: !!missionId && !!sectionId,
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_compliance_requirements")
        .select("id, requirement, status, is_high_risk, iris_extracted")
        .eq("mission_id", missionId!)
        .eq("section_id", sectionId!)
        .or("is_high_risk.eq.true,iris_extracted.eq.true")
        .limit(20);
      return data ?? [];
    },
  });

  if (!sectionId) {
    return <p className="text-xs text-muted-foreground">No section linked to this question.</p>;
  }
  if (isLoading) return <div className="space-y-2"><Sk /><Sk /><Sk /></div>;
  const rows = (data ?? []).slice().sort((a: any, b: any) => (b.is_high_risk ? 1 : 0) - (a.is_high_risk ? 1 : 0));
  if (!rows.length) {
    return <p className="text-xs text-muted-foreground">No compliance requirements mapped to this section.</p>;
  }
  const top = rows.slice(0, 8);
  return (
    <ul className="space-y-1.5">
      {top.map((r: any) => <RequirementRow key={r.id} r={r} />)}
      {rows.length > 8 && (
        <li className="pt-1">
          <span className="text-[11px] text-[color:var(--athena-gold)] hover:underline cursor-pointer">
            View all {rows.length} requirements →
          </span>
        </li>
      )}
    </ul>
  );
}

function RequirementRow({ r }: { r: any }) {
  const [expanded, setExpanded] = useState(false);
  const status = (r.status ?? "").toLowerCase();
  const color =
    status.includes("address") || status.includes("verif") ? "text-green-400"
    : status.includes("progress") ? "text-amber-400"
    : "text-red-400";
  const text = r.requirement ?? "";
  const truncated = text.length > 120 && !expanded ? text.slice(0, 120) + "…" : text;
  return (
    <li className="flex items-start gap-2">
      <CheckSquare className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", color)} />
      <div className="min-w-0 flex-1">
        <button
          className="text-left text-xs text-foreground leading-snug"
          onClick={() => setExpanded((v) => !v)}
        >
          {truncated}
        </button>
        <div className="flex gap-1 mt-0.5">
          {r.is_high_risk && (
            <span className="text-[9px] uppercase rounded px-1 py-px bg-red-500/15 text-red-400 border border-red-500/30">
              High Risk
            </span>
          )}
          {r.iris_extracted && (
            <span className="text-[9px] uppercase rounded px-1 py-px" style={{ background: "rgba(201,165,92,0.15)", color: GOLD, border: `1px solid ${GOLD}30` }}>
              IRIS
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

/* =================== Section 4: Win Themes =================== */
function WinThemesBlock({ missionId }: { missionId: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ["intel-panel-strategy", missionId],
    enabled: !!missionId,
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_win_strategy")
        .select("win_themes, north_star_message")
        .eq("mission_id", missionId!)
        .maybeSingle();
      return data;
    },
  });

  if (isLoading) return <Sk />;
  if (!data) return <p className="text-xs text-muted-foreground">Win Strategy not set.</p>;
  const themes: string[] = Array.isArray(data.win_themes)
    ? (data.win_themes as any[]).map((t) => (typeof t === "string" ? t : t?.theme ?? t?.title ?? JSON.stringify(t))).filter(Boolean)
    : [];
  return (
    <div className="space-y-2">
      {themes.length === 0 ? (
        <p className="text-xs text-muted-foreground">No win themes captured yet.</p>
      ) : (
        themes.map((t, i) => (
          <div
            key={i}
            className="border-l-2 rounded-md px-3 py-2"
            style={{
              borderLeftColor: GOLD,
              background: "rgba(196,154,43,0.05)",
              borderTop: "1px solid rgba(196,154,43,0.12)",
              borderRight: "1px solid rgba(196,154,43,0.12)",
              borderBottom: "1px solid rgba(196,154,43,0.12)",
            }}
          >
            <p className="text-[13px] text-foreground leading-snug">{t}</p>
          </div>
        ))
      )}
      {data.north_star_message && (
        <div className="pt-2 flex items-start gap-1.5">
          <Sparkles className="h-3 w-3 mt-0.5 shrink-0" style={{ color: GOLD }} />
          <p className="italic text-xs leading-relaxed" style={{ color: GOLD }}>
            {data.north_star_message}
          </p>
        </div>
      )}
    </div>
  );
}

/* =================== Section 5: Live Intelligence =================== */
const CATEGORY_COLORS: Record<string, string> = {
  federal_policy: "#3b82f6",
  state: "#14b8a6",
  research: "#22c55e",
  competitive: "#ef4444",
};
function catColor(c?: string) {
  const key = (c ?? "").toLowerCase();
  return CATEGORY_COLORS[key] ?? "rgba(255,255,255,0.2)";
}

function LiveCountBadge({ missionId }: { missionId: string | null }) {
  const { data } = useQuery({
    queryKey: ["intel-panel-live-unreviewed", missionId],
    enabled: !!missionId,
    queryFn: async () => {
      const { count } = await supabase
        .from("intelligence_feed_items")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", missionId!)
        .eq("is_reviewed", false)
        .eq("is_dismissed", false)
        .gte("iris_relevance_score", 60);
      return count ?? 0;
    },
  });
  if (!data) return null;
  return (
    <span className="ml-auto text-[10px] rounded-full px-1.5 py-px bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold">
      {data}
    </span>
  );
}

function LiveIntelBlock({ missionId }: { missionId: string | null }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["intel-panel-live", missionId],
    enabled: !!missionId,
    queryFn: async () => {
      const [items, feeds] = await Promise.all([
        supabase
          .from("intelligence_feed_items")
          .select("id, headline, iris_assessment, source_name, source_url, category, created_at, iris_relevance_score")
          .eq("mission_id", missionId!)
          .eq("is_dismissed", false)
          .gte("iris_relevance_score", 60)
          .order("created_at", { ascending: false })
          .limit(3),
        supabase.from("intelligence_feed_configs").select("id", { count: "exact", head: true }).eq("mission_id", missionId!),
      ]);
      return { items: items.data ?? [], feedCount: feeds.count ?? 0 };
    },
  });
  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("intelligence_feed_items").update({ is_dismissed: true }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intel-panel-live", missionId] }),
  });

  if (isLoading) return <div className="space-y-2"><Sk /><Sk /></div>;
  const items = data?.items ?? [];
  if (!items.length) {
    return (
      <p className="text-xs text-muted-foreground">
        No new intelligence items. IRIS is monitoring {data?.feedCount ?? 0} feeds.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((it: any) => (
        <div
          key={it.id}
          className="border-l-2 rounded-md p-2 bg-background/40 border-border/40"
          style={{ borderLeftColor: catColor(it.category) }}
        >
          <p className="text-xs font-medium text-foreground leading-snug">{it.headline}</p>
          {it.iris_assessment && (
            <p className="italic mt-0.5 text-[11px] leading-snug" style={{ color: "rgba(255,255,255,0.55)" }}>
              {String(it.iris_assessment).slice(0, 100)}{String(it.iris_assessment).length > 100 ? "…" : ""}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
            <span className="truncate">{it.source_name ?? "—"}</span>
            {it.created_at && <span>· {formatDistanceToNow(new Date(it.created_at), { addSuffix: true })}</span>}
            <span className="ml-auto flex items-center gap-1.5">
              {it.source_url && (
                <a href={it.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:underline" style={{ color: GOLD }}>
                  View <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
              <button
                onClick={() => dismiss.mutate(it.id)}
                className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Dismiss"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </span>
          </div>
        </div>
      ))}
      {missionId && (
        <Link
          to="/olympus/missions/$missionId"
          params={{ missionId }}
          search={{ tab: "oracle", sub: "feed" } as any}
          className="block text-[11px] hover:underline pt-1"
          style={{ color: GOLD }}
        >
          View all intelligence in Oracle →
        </Link>
      )}
    </div>
  );
}

function Sk() {
  return <div className="h-3.5 w-full rounded bg-surface/60 animate-pulse" />;
}
