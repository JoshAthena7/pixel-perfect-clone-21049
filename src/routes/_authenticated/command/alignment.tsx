import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GitMerge, AlertTriangle, Target } from "lucide-react";

export const Route = createFileRoute("/_authenticated/command/alignment")({
  component: AlignmentPage,
});

type Mission = { id: string; name: string; client: string };
type Conflict = {
  id: string;
  mission_id: string;
  conflict_type: string;
  description: string;
  severity: string | null;
  question_a_id: string;
  question_b_id: string;
  iris_recommendation: string | null;
  resolved_at: string | null;
  detected_at: string | null;
};
type WinTheme = {
  id: string;
  mission_id: string;
  title: string;
  description: string | null;
  key_message: string | null;
  status: string | null;
  question_ids: string[] | null;
};
type QRef = { id: string; question_number: string; title: string; mission_id: string };

const sevColor: Record<string, string> = {
  critical: "bg-red-500/15 text-red-300 border-red-500/40",
  warning: "bg-yellow-500/15 text-yellow-300 border-yellow-500/40",
  info: "bg-blue-500/15 text-blue-300 border-blue-500/40",
};

function AlignmentPage() {
  const [missionId, setMissionId] = useState<string | "all">("all");
  const [showResolved, setShowResolved] = useState(false);

  const { data: missions = [] } = useQuery({
    queryKey: ["align-missions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client")
        .eq("status", "Active")
        .order("name");
      return (data ?? []) as Mission[];
    },
  });

  const { data: conflicts = [], isLoading } = useQuery({
    queryKey: ["align-conflicts", missionId, showResolved],
    queryFn: async () => {
      let q = supabase
        .from("alignment_conflicts")
        .select("*")
        .order("detected_at", { ascending: false });
      if (missionId !== "all") q = q.eq("mission_id", missionId);
      if (!showResolved) q = q.is("resolved_at", null);
      const { data } = await q;
      return (data ?? []) as Conflict[];
    },
  });

  const { data: themes = [] } = useQuery({
    queryKey: ["align-themes", missionId],
    queryFn: async () => {
      let q = supabase.from("win_themes").select("*").eq("status", "active").order("created_at", { ascending: false });
      if (missionId !== "all") q = q.eq("mission_id", missionId);
      const { data } = await q;
      return (data ?? []) as WinTheme[];
    },
  });

  const refIds = Array.from(new Set(conflicts.flatMap((c) => [c.question_a_id, c.question_b_id])));
  const { data: qrefs = [] } = useQuery({
    queryKey: ["align-qrefs", refIds.sort().join(",")],
    enabled: refIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,title,mission_id")
        .in("id", refIds);
      return (data ?? []) as QRef[];
    },
  });
  const qMap = new Map(qrefs.map((q) => [q.id, q]));

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <GitMerge className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Alignment</h1>
          <p className="text-sm text-muted-foreground">
            Cross-question conflicts and active win themes across every mission.
          </p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setMissionId("all")}
          className={`rounded-full px-3 py-1 text-xs ${
            missionId === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/80"
          }`}
        >
          All Missions
        </button>
        {missions.map((m) => (
          <button
            key={m.id}
            onClick={() => setMissionId(m.id)}
            className={`rounded-full px-3 py-1 text-xs ${
              missionId === m.id ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/80"
            }`}
          >
            {m.name}
          </button>
        ))}
        <label className="ml-auto inline-flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          Include resolved
        </label>
      </div>

      {/* Conflicts */}
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-muted-foreground">
          <AlertTriangle className="h-4 w-4" /> Alignment Conflicts ({conflicts.length})
        </h2>
        {isLoading && <div className="text-sm text-muted-foreground">One moment…</div>}
        {!isLoading && conflicts.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No alignment conflicts {showResolved ? "found" : "open"}.
          </div>
        )}
        <div className="space-y-3">
          {conflicts.map((c) => {
            const a = qMap.get(c.question_a_id);
            const b = qMap.get(c.question_b_id);
            const sev = (c.severity ?? "warning").toLowerCase();
            return (
              <div key={c.id} className="rounded-lg border border-border bg-card p-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`rounded border px-2 py-0.5 text-[11px] uppercase ${sevColor[sev] ?? sevColor.warning}`}>
                      {sev}
                    </span>
                    <span className="text-xs text-muted-foreground">{c.conflict_type}</span>
                    {c.resolved_at && (
                      <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">Resolved</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {c.detected_at && new Date(c.detected_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm text-foreground">{c.description}</p>
                <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                  {a && (
                    <Link
                      to="/missions/$missionId/sections/$questionId"
                      params={{ missionId: a.mission_id, questionId: a.id }}
                      className="rounded border border-border bg-background px-3 py-2 hover:border-primary/50"
                    >
                      <span className="font-mono text-muted-foreground mr-2">{a.question_number}</span>
                      {a.title}
                    </Link>
                  )}
                  {b && (
                    <Link
                      to="/missions/$missionId/sections/$questionId"
                      params={{ missionId: b.mission_id, questionId: b.id }}
                      className="rounded border border-border bg-background px-3 py-2 hover:border-primary/50"
                    >
                      <span className="font-mono text-muted-foreground mr-2">{b.question_number}</span>
                      {b.title}
                    </Link>
                  )}
                </div>
                {c.iris_recommendation && (
                  <div className="mt-3 rounded border-l-2 border-primary/60 bg-primary/5 px-3 py-2 text-xs text-foreground">
                    <span className="font-semibold text-primary">IRIS:</span> {c.iris_recommendation}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Win Themes */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-muted-foreground">
          <Target className="h-4 w-4" /> Active Win Themes ({themes.length})
        </h2>
        {themes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No active win themes.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {themes.map((t) => (
              <div key={t.id} className="rounded-lg border border-border bg-card p-4">
                <div className="text-sm font-semibold text-foreground">{t.title}</div>
                {t.key_message && (
                  <div className="mt-1 text-xs italic text-primary">"{t.key_message}"</div>
                )}
                {t.description && (
                  <p className="mt-2 text-xs text-muted-foreground line-clamp-3">{t.description}</p>
                )}
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Connected to {t.question_ids?.length ?? 0} question{t.question_ids?.length === 1 ? "" : "s"}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
