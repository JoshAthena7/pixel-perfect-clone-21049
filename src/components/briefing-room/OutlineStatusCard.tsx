import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function OutlineStatusCard({ missionId }: { missionId: string }) {
  const [counts, setCounts] = useState<{ withOutline: number; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [{ count: withOutline }, { count: total }] = await Promise.all([
        sb
          .from("question_response_outlines")
          .select("*", { count: "exact", head: true })
          .eq("mission_id", missionId)
          .not("question_id", "is", null),
        sb
          .from("mission_questions")
          .select("*", { count: "exact", head: true })
          .eq("mission_id", missionId),
      ]);
      if (cancelled) return;
      setCounts({ withOutline: withOutline ?? 0, total: total ?? 0 });
    })();
    return () => {
      cancelled = true;
    };
  }, [missionId]);

  if (!counts) return null;

  return (
    <div
      style={{
        padding: "10px 12px",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 4,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "rgba(255,255,255,0.45)",
          letterSpacing: "0.05em",
          marginBottom: 6,
        }}
      >
        📋 RESPONSE OUTLINE COVERAGE
      </div>
      {counts.withOutline === 0 ? (
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
          No client response outline uploaded — writers are using their own structure. Add one
          via the Upload Documents drawer (tag it as &quot;Response Outline&quot;) and IRIS will
          parse it into every question cockpit.
        </div>
      ) : (
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
          Client outline active —{" "}
          <span style={{ color: "rgba(96,165,250,0.9)", fontWeight: 600 }}>
            {counts.withOutline}
          </span>{" "}
          of {counts.total} questions have structure guidance.
        </div>
      )}
    </div>
  );
}
