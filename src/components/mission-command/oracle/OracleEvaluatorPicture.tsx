import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, Loader2, RefreshCw, Sparkles, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { buildEvaluatorPicture } from "@/lib/iris-evaluator.functions";
import { toast } from "sonner";

const GOLD = "#C9A55C";

type Confidence = "high" | "medium" | "low";

type Signal = { signal?: string; what_it_reveals?: string; confidence?: Confidence; source?: string };
type Pressure = { pressure?: string; fear?: string; need?: string; confidence?: Confidence; source?: string };
type NamedIndividual = { name?: string; role?: string; what_iris_knows?: string; relevance_to_scoring?: string };
type Gap = { action?: string; what_it_would_reveal?: string };

interface EvaluatorPicture {
  id: string;
  mission_id: string;
  generated_at: string;
  rfp_signals: Signal[];
  prior_procurement_signals: Signal[];
  public_record_signals: Signal[];
  political_signals: Signal[];
  named_individual_signals: NamedIndividual[];
  inferred_panel_mindset: string | null;
  inferred_pressures: Pressure[];
  inferred_fears: Pressure[];
  inferred_defensibility_needs: Pressure[];
  scoring_lens: string | null;
  what_iris_does_not_know: string | null;
  how_to_fill_gaps: Gap[];
  confidence_overall: Confidence;
  one_sentence_bottom_line: string | null;
  signals_count: number;
}

function ConfidenceBadge({ confidence }: { confidence?: Confidence }) {
  const c = confidence ?? "low";
  const styles: Record<Confidence, { bg: string; color: string; border: string }> = {
    high: { bg: "rgba(34,197,94,0.12)", color: "#4ade80", border: "rgba(34,197,94,0.35)" },
    medium: { bg: "rgba(239,159,39,0.12)", color: "#f59e0b", border: "rgba(239,159,39,0.35)" },
    low: { bg: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.55)", border: "rgba(255,255,255,0.15)" },
  };
  const s = styles[c];
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider border"
      style={{ background: s.bg, color: s.color, borderColor: s.border }}
    >
      {c}
    </span>
  );
}

function PressureCard({
  title,
  items,
  field,
  emphasizeRed,
}: {
  title: string;
  items: Pressure[];
  field: "pressure" | "fear" | "need";
  emphasizeRed?: boolean;
}) {
  const visible = items.slice(0, 4);
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02] p-4">
      <h3 className="text-[13px] font-medium text-white mb-3">{title}</h3>
      {visible.length === 0 && (
        <div className="text-[11px] italic text-white/40">No items yet.</div>
      )}
      <ul className="space-y-2">
        {visible.map((p, i) => {
          const text = p[field] ?? "";
          const dotColor = emphasizeRed && p.confidence === "high" ? "#ef4444" : GOLD;
          return (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1.5 inline-block rounded-full" style={{ width: 5, height: 5, background: dotColor }} />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-white leading-snug">{text}</div>
                <div className="mt-1 flex items-center gap-2">
                  <ConfidenceBadge confidence={p.confidence} />
                  {p.source && (
                    <span className="text-[10px] italic text-white/40 truncate">{p.source}</span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {items.length > visible.length && (
        <div className="mt-2 text-[10px] text-white/40">+{items.length - visible.length} more</div>
      )}
    </div>
  );
}

function SignalSection({
  title,
  count,
  children,
  defaultOpen = false,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-white/[0.03]"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-3.5 w-3.5 text-white/50" /> : <ChevronRight className="h-3.5 w-3.5 text-white/50" />}
          <span className="text-[13px] font-medium text-white">{title}</span>
          <span className="text-[10px] text-white/40 ml-1">({count})</span>
        </div>
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}

function SignalRow({ s }: { s: Signal }) {
  return (
    <div className="border-l border-white/10 pl-3 py-2">
      <div className="text-[12px] text-white leading-snug">{s.signal}</div>
      {s.what_it_reveals && (
        <div className="mt-1 text-[11px] italic text-white/55 leading-snug">{s.what_it_reveals}</div>
      )}
      <div className="mt-1.5 flex items-center gap-2">
        <ConfidenceBadge confidence={s.confidence} />
        {s.source && <span className="text-[10px] italic text-white/40">{s.source}</span>}
      </div>
    </div>
  );
}

export function OracleEvaluatorPicture({
  missionId,
  isAdmin,
}: {
  missionId: string;
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const build = useServerFn(buildEvaluatorPicture);

  const { data: picture, isLoading } = useQuery({
    queryKey: ["evaluator-picture", missionId],
    queryFn: async (): Promise<EvaluatorPicture | null> => {
      const { data } = await supabase
        .from("evaluator_pictures")
        .select("*")
        .eq("mission_id", missionId)
        .maybeSingle();
      return (data as unknown as EvaluatorPicture) ?? null;
    },
    refetchInterval: (q) => (q.state.data ? false : 8000),
  });

  const onRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    const tid = toast.loading("IRIS is rebuilding the evaluator picture…");
    try {
      const r = await build({ data: { missionId, forceRegenerate: true } });
      if (r.picture) {
        toast.success("Evaluator picture refreshed.", { id: tid });
        qc.invalidateQueries({ queryKey: ["evaluator-picture", missionId] });
      } else {
        toast.error("IRIS could not build a picture. Check logs.", { id: tid });
      }
    } catch (e) {
      toast.error((e as Error).message, { id: tid });
    } finally {
      setRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-white/60 py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading evaluator picture…
      </div>
    );
  }

  if (!picture) {
    return (
      <div className="rounded-md border border-white/10 bg-white/[0.02] p-8 text-center">
        <Sparkles className="h-6 w-6 mx-auto text-[#C9A55C] animate-pulse" />
        <div className="mt-3 text-sm text-white">
          IRIS is building the evaluator picture for this mission.
        </div>
        <div className="mt-1 text-xs text-white/50">
          Check back in a moment — this runs in the background after BLAST OFF.
        </div>
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            className="mt-4 border-[#C9A55C] text-[#C9A55C] hover:bg-[#C9A55C]/10"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`} />
            Build now
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-white" style={{ fontSize: 18, fontWeight: 500 }}>
            Evaluator Picture
          </div>
          <div className="mt-1 text-[12px] text-white/45">
            Built from {picture.signals_count} signals · {picture.confidence_overall} confidence · Updated{" "}
            {formatDistanceToNow(new Date(picture.generated_at), { addSuffix: true })}
          </div>
        </div>
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="border-white/20 text-white/70 hover:bg-white/5"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh Picture"}
          </Button>
        )}
      </div>

      {/* Section 1 — Bottom line */}
      {picture.one_sentence_bottom_line && (
        <div
          className="rounded-md border px-5 py-4"
          style={{ background: "rgba(196,154,43,0.06)", borderColor: "rgba(196,154,43,0.35)" }}
        >
          <div
            className="text-[10px] uppercase tracking-[0.15em] font-semibold"
            style={{ color: GOLD }}
          >
            IRIS — The one thing to know
          </div>
          <div
            className="mt-2 text-white italic"
            style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.5 }}
          >
            {picture.one_sentence_bottom_line}
          </div>
        </div>
      )}

      {/* Section 2 — Three columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <PressureCard
          title="What they're under pressure about"
          items={picture.inferred_pressures ?? []}
          field="pressure"
        />
        <PressureCard
          title="What they're afraid of"
          items={picture.inferred_fears ?? []}
          field="fear"
          emphasizeRed
        />
        <PressureCard
          title="What they need to defend this award"
          items={picture.inferred_defensibility_needs ?? []}
          field="need"
        />
      </div>

      {/* Section 3 — Signals */}
      <div className="space-y-2">
        <SignalSection title="RFP Signals" count={picture.rfp_signals.length}>
          <div className="space-y-2">
            {picture.rfp_signals.length === 0 && (
              <div className="text-[11px] italic text-white/40">No RFP-structure signals yet.</div>
            )}
            {picture.rfp_signals.map((s, i) => <SignalRow key={i} s={s} />)}
          </div>
        </SignalSection>
        <SignalSection title="Prior Procurement Signals" count={picture.prior_procurement_signals.length}>
          <div className="space-y-2">
            {picture.prior_procurement_signals.length === 0 && (
              <div className="text-[11px] italic text-white/40">No prior-procurement signals yet.</div>
            )}
            {picture.prior_procurement_signals.map((s, i) => <SignalRow key={i} s={s} />)}
          </div>
        </SignalSection>
        <SignalSection title="Public Record Signals" count={picture.public_record_signals.length}>
          <div className="space-y-2">
            {picture.public_record_signals.length === 0 && (
              <div className="text-[11px] italic text-white/40">No public-record signals yet.</div>
            )}
            {picture.public_record_signals.map((s, i) => <SignalRow key={i} s={s} />)}
          </div>
        </SignalSection>
        <SignalSection title="Named Individuals" count={picture.named_individual_signals.length}>
          {picture.named_individual_signals.length === 0 ? (
            <div className="text-[11px] italic text-white/55">
              No named evaluators identified in the RFP or public record.
            </div>
          ) : (
            <div className="space-y-2">
              {picture.named_individual_signals.map((n, i) => (
                <div key={i} className="border-l border-white/10 pl-3 py-2">
                  <div className="text-[12px] text-white">
                    {n.name}
                    {n.role && <span className="text-white/45"> — {n.role}</span>}
                  </div>
                  {n.what_iris_knows && (
                    <div className="text-[11px] italic text-white/55 mt-0.5">{n.what_iris_knows}</div>
                  )}
                  {n.relevance_to_scoring && (
                    <div className="text-[11px] text-white/70 mt-0.5">Relevance: {n.relevance_to_scoring}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SignalSection>

        {picture.political_signals.length > 0 && (
          <div
            className="rounded-md border px-4 py-3"
            style={{
              background: "rgba(239,159,39,0.06)",
              borderColor: "rgba(239,159,39,0.35)",
            }}
          >
            <div className="text-[10px] uppercase tracking-wider font-semibold text-[#f59e0b] mb-2">
              Political environment signal:
            </div>
            <ul className="space-y-1.5">
              {picture.political_signals.map((s, i) => (
                <li key={i} className="text-[12px] text-amber-100/90">
                  {s.signal}
                  {s.what_it_reveals && (
                    <span className="block text-[11px] italic text-amber-100/60 mt-0.5">{s.what_it_reveals}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Section 4 — Scoring lens */}
      {picture.scoring_lens && (
        <div className="rounded-md border border-white/10 bg-white/[0.02] p-5">
          <div className="text-[11px] uppercase tracking-wider text-white/45 font-semibold">
            How IRIS believes this panel approaches the scoring rubric
          </div>
          <p className="mt-3 text-[13px] text-white" style={{ lineHeight: 1.7 }}>
            {picture.scoring_lens}
          </p>
          {picture.inferred_panel_mindset && (
            <p
              className="mt-4 text-[13px] italic text-white pl-3"
              style={{ lineHeight: 1.7, borderLeft: `2px solid ${GOLD}` }}
            >
              {picture.inferred_panel_mindset}
            </p>
          )}
        </div>
      )}

      {/* Section 5 — Gaps */}
      <div
        className="rounded-md border px-5 py-4"
        style={{ background: "rgba(239,159,39,0.04)", borderColor: "rgba(239,159,39,0.4)" }}
      >
        <div className="text-[11px] uppercase tracking-[0.15em] font-semibold text-[#f59e0b]">
          What IRIS does not know
        </div>
        {picture.what_iris_does_not_know && (
          <p className="mt-2 text-[12px] text-white" style={{ lineHeight: 1.6 }}>
            {picture.what_iris_does_not_know}
          </p>
        )}
        {picture.how_to_fill_gaps.length > 0 && (
          <ul className="mt-3 space-y-2">
            {picture.how_to_fill_gaps.map((g, i) => (
              <li key={i} className="flex items-start gap-2">
                <ArrowRight className="h-3.5 w-3.5 mt-0.5 text-[#f59e0b] shrink-0" />
                <div>
                  <div className="text-[12px] text-white">{g.action}</div>
                  {g.what_it_would_reveal && (
                    <div className="text-[11px] italic text-white/55 mt-0.5">
                      {g.what_it_would_reveal}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
