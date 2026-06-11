import { useState } from "react";
import { ChevronDown, ChevronUp, AlertTriangle, RotateCw, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

const GOLD = "#C9A55C";
const IRIS_PURPLE = "rgba(140,130,230,0.8)";
const RED = "#E5484D";

export type AthenaInsight = {
  id: string;
  mission_id: string;
  section_id: string | null;
  question_id: string | null;
  title: string | null;
  strategic_quote: string | null;
  quote: string | null;
  why_it_matters: string | null;
  writers_note: string | null;
  tags: string[] | null;
  insight_type: string | null;
  is_daily_insight: boolean;
  is_iris_generated: boolean | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

type Props = {
  insight: AthenaInsight;
  variant?: "daily" | "section" | "at_risk";
  sectionLabel?: string | null;
  defaultExpanded?: boolean;
  canRegenerate?: boolean;
  onRegenerate?: () => void | Promise<void>;
  regenerating?: boolean;
};

export function AthenaInsightCard({
  insight, variant = "section", sectionLabel, defaultExpanded, canRegenerate, onRegenerate, regenerating,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? variant !== "section");

  const isDaily = variant === "daily" || insight.is_daily_insight;
  const isAtRisk = variant === "at_risk" || insight.insight_type === "at_risk";

  const borderColor = isAtRisk ? RED : isDaily ? GOLD : "rgba(255,255,255,0.08)";
  const borderClass = isAtRisk ? "border-l-4" : isDaily ? "border-2" : "border";
  const quote = insight.strategic_quote ?? insight.quote ?? "";

  return (
    <article
      className={cn("rounded-lg p-4 transition-colors", borderClass)}
      style={{
        borderColor,
        background: isDaily ? `${GOLD}0a` : isAtRisk ? `${RED}0a` : "rgba(255,255,255,0.02)",
      }}
    >
      {sectionLabel && (
        <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">{sectionLabel}</div>
      )}
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isDaily && (
            <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: GOLD }}>
              ✦ Today's Insight
            </span>
          )}
          {isAtRisk && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider" style={{ color: RED }}>
              <AlertTriangle className="h-3 w-3" /> At Risk
            </span>
          )}
          {!isDaily && !isAtRisk && insight.title && (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{insight.title}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canRegenerate && (
            <button
              type="button"
              disabled={regenerating}
              onClick={() => onRegenerate?.()}
              className="inline-flex items-center gap-1 rounded border border-border/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:border-border disabled:opacity-50"
              aria-label="Regenerate insight"
            >
              <Eye className="h-3 w-3" style={{ color: IRIS_PURPLE }} />
              {regenerating ? "Regenerating..." : "Regenerate"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground hover:text-foreground"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <p className="text-[15px] leading-snug text-foreground font-medium">{quote}</p>

      {expanded && (
        <>
          {insight.why_it_matters && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Why it matters</div>
              <p className="text-[13px] leading-relaxed text-muted-foreground">{insight.why_it_matters}</p>
            </div>
          )}
          {insight.writers_note && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Writer's Note</div>
              <p className="text-[13px] leading-relaxed text-foreground/90">{insight.writers_note}</p>
            </div>
          )}
          {insight.tags && insight.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {insight.tags.map((t) => (
                <span key={t} className="rounded-sm bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">{t}</span>
              ))}
            </div>
          )}
        </>
      )}

      <footer className="mt-3 flex items-center justify-between text-[9px]">
        {insight.is_iris_generated ? (
          <span style={{ color: IRIS_PURPLE }}>Generated by IRIS</span>
        ) : (
          <span className="text-muted-foreground/70">By {insight.created_by_name ?? "Athena"}</span>
        )}
        <span className="text-muted-foreground/50">{new Date(insight.updated_at).toLocaleDateString()}</span>
      </footer>
    </article>
  );
}

export function AthenaInsightLoading() {
  return (
    <div className="rounded-lg border border-border/40 p-6 text-center">
      <Eye className="mx-auto mb-2 h-6 w-6 animate-pulse" style={{ color: IRIS_PURPLE }} />
      <p className="text-xs text-muted-foreground">
        IRIS is generating insights for this mission. Check back in a moment.
      </p>
    </div>
  );
}
