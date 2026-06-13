/**
 * CompetitorIntelPanel — loads all competitor_card_* extractions for a
 * mission plus the landscape summary, renders one CompetitorCard per
 * competitor, and exposes a Generate / Re-run button that calls the IRIS
 * server fn.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateCompetitorIntelligence } from "@/lib/iris-competitor-intel.functions";
import type { CompetitorCard as Card } from "@/lib/iris-competitor-intel.functions";
import { CompetitorCard } from "./CompetitorCard";

type Row = {
  id: string;
  extracted_field: string;
  extracted_value: string | null;
  user_override_value: string | null;
  source_file_name: string | null;
};

export function CompetitorIntelPanel({
  missionId,
  readOnly = false,
}: {
  missionId: string;
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const generateFn = useServerFn(generateCompetitorIntelligence);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryKey = ["competitor-cards", missionId] as const;

  const { data: rows } = useQuery({
    queryKey,
    queryFn: async (): Promise<Row[]> => {
      const { data } = await supabase
        .from("mission_iris_extractions")
        .select("id, extracted_field, extracted_value, user_override_value, source_file_name")
        .eq("mission_id", missionId)
        .like("extracted_field", "competitor_card_%");
      return (data ?? []) as Row[];
    },
  });

  const { data: summaryRow } = useQuery({
    queryKey: ["competitor-landscape", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_iris_extractions")
        .select("extracted_value, user_override_value")
        .eq("mission_id", missionId)
        .eq("extracted_field", "competitive_landscape_summary")
        .maybeSingle();
      return data as { extracted_value: string | null; user_override_value: string | null } | null;
    },
  });

  const cards = useMemo<Array<{ extractionId: string; card: Card }>>(() => {
    return (rows ?? [])
      .map((r) => {
        const raw = r.user_override_value ?? r.extracted_value ?? "";
        try {
          const card = JSON.parse(raw) as Card;
          return { extractionId: r.id, card };
        } catch {
          return null;
        }
      })
      .filter((x): x is { extractionId: string; card: Card } => x !== null)
      .sort((a, b) => a.card.competitor_name.localeCompare(b.card.competitor_name));
  }, [rows]);

  const summary = summaryRow?.user_override_value ?? summaryRow?.extracted_value ?? "";

  async function run() {
    setRunning(true);
    setError(null);
    try {
      await generateFn({ data: { mission_id: missionId } });
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["competitor-landscape", missionId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-medium text-white">
            Competitor Intelligence Cards
          </h3>
          <p className="text-[12.5px] text-white/55 mt-0.5">
            IRIS generates a profile for every confirmed competitor using only what's in IRIS
            Memory. Add intelligence to sharpen future analyses.
          </p>
        </div>
        {!readOnly && (
          <button
            onClick={run}
            disabled={running}
            className="inline-flex items-center gap-2 text-[13px] px-4 py-2 rounded font-medium disabled:opacity-50"
            style={{ background: "#C49A2B", color: "#0D1B3E" }}
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : cards.length > 0 ? (
              <RefreshCw className="h-3.5 w-3.5" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {running
              ? "IRIS is researching…"
              : cards.length > 0
                ? "Re-run intelligence"
                : "Confirm & Generate Intelligence"}
          </button>
        )}
      </div>

      {error && <div className="text-[12.5px] text-red-400">{error}</div>}

      {cards.length === 0 && !running ? (
        <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
          <Sparkles className="h-6 w-6 mx-auto mb-2" style={{ color: "#C49A2B" }} />
          <p className="text-[13px] text-white/70">
            No competitor cards yet. Confirm your competitors above, then click{" "}
            <span className="text-amber-300">Confirm &amp; Generate Intelligence</span>.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {cards.map(({ extractionId, card }) => (
            <CompetitorCard
              key={extractionId}
              card={card}
              extractionId={extractionId}
              missionId={missionId}
              readOnly={readOnly}
              onChanged={() => {
                qc.invalidateQueries({ queryKey });
                qc.invalidateQueries({ queryKey: ["competitor-landscape", missionId] });
              }}
            />
          ))}
        </div>
      )}

      {summary && (
        <div
          className="rounded-xl p-5"
          style={{
            background: "rgba(196,154,43,0.06)",
            border: "1px solid rgba(196,154,43,0.25)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4" style={{ color: "#C49A2B" }} />
            <h4 className="text-[13px] font-semibold tracking-wide text-white">
              IRIS Competitive Landscape Summary
            </h4>
          </div>
          <p className="text-[13.5px] text-white/90 leading-relaxed whitespace-pre-wrap">
            {summary}
          </p>
        </div>
      )}
    </div>
  );
}
