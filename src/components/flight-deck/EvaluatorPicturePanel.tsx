import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const GOLD = "#C9A55C";

type Confidence = "high" | "medium" | "low";
type Pressure = { pressure?: string; fear?: string; need?: string; confidence?: Confidence };
type Snapshot = { section_id: string; relevance?: string; one_thing_to_know?: string };

interface PictureRow {
  one_sentence_bottom_line: string | null;
  inferred_fears: Pressure[];
  inferred_defensibility_needs: Pressure[];
  question_snapshots: Snapshot[];
}

export function EvaluatorPicturePanel({
  missionId,
  sectionId,
}: {
  missionId: string | null;
  sectionId: string | null;
}) {
  const { data: picture } = useQuery({
    queryKey: ["evaluator-picture-fd", missionId],
    enabled: !!missionId,
    queryFn: async (): Promise<PictureRow | null> => {
      const { data } = await supabase
        .from("evaluator_pictures")
        .select("one_sentence_bottom_line,inferred_fears,inferred_defensibility_needs,question_snapshots")
        .eq("mission_id", missionId!)
        .maybeSingle();
      return (data as unknown as PictureRow) ?? null;
    },
    staleTime: 60_000,
  });

  if (!missionId) return null;

  if (!picture) {
    return (
      <div className="text-[11px] italic text-muted-foreground py-2">
        Evaluator Picture not yet built. It will appear after IRIS processes the intelligence.
      </div>
    );
  }

  const snapshot =
    sectionId && Array.isArray(picture.question_snapshots)
      ? picture.question_snapshots.find((s) => s.section_id === sectionId)
      : null;
  const oneThing = snapshot?.one_thing_to_know ?? picture.one_sentence_bottom_line ?? null;
  const fears = (picture.inferred_fears ?? []).slice(0, 2);
  const needs = (picture.inferred_defensibility_needs ?? []).slice(0, 2);

  return (
    <div className="space-y-3 text-[12px]">
      {oneThing && (
        <div
          className="pl-3 italic text-white/90"
          style={{ borderLeft: `2px solid ${GOLD}`, lineHeight: 1.5, fontSize: 12 }}
        >
          {oneThing}
        </div>
      )}
      {fears.length > 0 && (
        <ul className="space-y-1.5">
          {fears.map((f, i) => (
            <li key={`fear-${i}`} className="flex items-start gap-2">
              <span className="mt-1.5 inline-block rounded-full" style={{ width: 5, height: 5, background: "#ef4444" }} />
              <span className="text-[11px] text-muted-foreground leading-snug">{f.fear ?? f.pressure}</span>
            </li>
          ))}
        </ul>
      )}
      {needs.length > 0 && (
        <ul className="space-y-1.5">
          {needs.map((n, i) => (
            <li key={`need-${i}`} className="flex items-start gap-2">
              <span className="mt-1.5 inline-block rounded-full" style={{ width: 5, height: 5, background: GOLD }} />
              <span className="text-[11px] text-muted-foreground leading-snug">{n.need ?? n.pressure}</span>
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/missions/$missionId/oracle"
        params={{ missionId }}
        className="inline-block text-[11px] hover:underline"
        style={{ color: GOLD }}
      >
        Full Evaluator Picture →
      </Link>
    </div>
  );
}

export { Search as EvaluatorPictureIcon };
