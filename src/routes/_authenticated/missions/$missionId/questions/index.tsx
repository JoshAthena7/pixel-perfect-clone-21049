import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { relativeTime } from "@/lib/signals";

export const Route = createFileRoute("/_authenticated/missions/$missionId/questions/")({
  component: ResponsesList,
});

function MissionBriefStrip({ missionId }: { missionId: string }) {
  const [open, setOpen] = useState(false);

  const { data: mission } = useQuery({
    queryKey: ["brief-strip-mission", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("name,client,submission_date")
        .eq("id", missionId)
        .maybeSingle();
      return data;
    },
  });

  const { data: activeGate } = useQuery({
    queryKey: ["brief-strip-gate", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_review_gates")
        .select("gate_name,target_date")
        .eq("mission_id", missionId)
        .order("gate_order");
      const upcoming = (data ?? []).find(
        (g: any) => g.target_date && new Date(g.target_date) >= new Date(),
      );
      return upcoming ?? null;
    },
  });

  const { data: latestSignal } = useQuery({
    queryKey: ["brief-strip-signal", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("signals")
        .select("signal_title,created_at")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const submission = mission?.submission_date
    ? new Date(mission.submission_date).toLocaleDateString()
    : "—";

  return (
    <div className="mb-6 rounded-[10px] border border-border bg-surface/80">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs"
      >
        <span className="flex items-center gap-2 font-semibold text-foreground">
          <span className="text-[color:var(--athena-gold)]">⚡</span>
          {mission?.name ?? "Mission"}
        </span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-border px-4 py-3 text-[11px] md:grid-cols-4">
          <BriefCell label="Client" value={mission?.client ?? "—"} />
          <BriefCell label="Submission Date" value={submission} />
          <BriefCell label="Current Gate" value={activeGate?.gate_name ?? "No active gate"} />
          <BriefCell label="IRIS Alert" value={latestSignal?.signal_title ?? "No alerts"} />
        </div>
      )}
    </div>
  );
}

function BriefCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 truncate text-foreground">{value}</div>
    </div>
  );
}


type Q = {
  id: string;
  mission_id: string;
  question_number: string;
  title: string;
  pens_down_date: string | null;
  assigned_writer_id: string | null;
};

type Gate = { id: string; gate_name: string; target_date: string | null };
type Profile = { id: string; display_name: string | null; email: string | null };
type RU = { question_id: string; signal_type: "learned" | "need" | "unchanged"; resolved: boolean; created_at: string };

type Filter = "all" | "mine" | "attention" | "noactivity";

const SIGNAL_BADGE: Record<string, { label: string; cls: string }> = {
  learned: { label: "Learned", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  need: { label: "Need", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  unchanged: { label: "Unchanged", cls: "bg-muted text-muted-foreground border-border" },
};

function ResponsesList() {
  const { missionId } = Route.useParams();
  const [filter, setFilter] = useState<Filter>("all");

  const { data: me } = useQuery({
    queryKey: ["me-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ["mission-questions", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,mission_id,question_number,title,pens_down_date,assigned_writer_id")
        .eq("mission_id", missionId)
        .order("sort_order", { ascending: true });
      return (data ?? []) as Q[];
    },
  });

  const { data: gates = [] } = useQuery({
    queryKey: ["mission-gates", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_review_gates")
        .select("id,gate_name,target_date")
        .eq("mission_id", missionId)
        .order("gate_order");
      return (data ?? []) as Gate[];
    },
  });
  const nextGate = gates
    .filter((g) => g.target_date && new Date(g.target_date) > new Date())
    .sort((a, b) => new Date(a.target_date!).getTime() - new Date(b.target_date!).getTime())[0];

  const writerIds = Array.from(new Set(questions.map((q) => q.assigned_writer_id).filter(Boolean) as string[]));
  const { data: profiles = [] } = useQuery({
    queryKey: ["mission-writers", missionId, writerIds.join(",")],
    enabled: writerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,display_name,email").in("id", writerIds);
      return (data ?? []) as Profile[];
    },
  });
  const writerById = Object.fromEntries(profiles.map((p) => [p.id, p]));

  const { data: latestRU = {} } = useQuery<Record<string, RU>>({
    queryKey: ["mission-reality-latest", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("reality_updates")
        .select("question_id,signal_type,resolved,created_at")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false })
        .limit(500);
      const map: Record<string, RU> = {};
      for (const r of (data ?? []) as RU[]) {
        if (!map[r.question_id]) map[r.question_id] = r;
      }
      return map;
    },
    refetchInterval: 60_000,
  });

  const filtered = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    return questions.filter((q) => {
      if (filter === "mine") return me && q.assigned_writer_id === me;
      const ru = latestRU[q.id];
      if (filter === "attention") return ru && ru.signal_type === "need" && !ru.resolved;
      if (filter === "noactivity") return !ru || new Date(ru.created_at).getTime() < sevenDaysAgo;
      return true;
    });
  }, [questions, filter, me, latestRU]);

  const gateDays = nextGate?.target_date
    ? Math.ceil((new Date(nextGate.target_date).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div className="mx-auto max-w-[1200px] px-8 py-10">
      <MissionBriefStrip missionId={missionId} />
      <div className="mb-8">
        <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">The Studio</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Responses</h1>
      </div>


      <div className="mb-5 flex flex-wrap gap-2">
        {([
          ["all", "All"],
          ["mine", "My Responses"],
          ["attention", "Needs Attention"],
          ["noactivity", "No Activity"],
        ] as [Filter, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-full border px-3 py-1.5 text-xs transition ${
              filter === k
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border bg-surface text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="rounded-[12px] border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
          Loading responses…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-border bg-surface/40 p-12 text-center text-sm text-muted-foreground">
          No responses match this filter.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-[12px] border border-border bg-surface">
          {filtered.map((q) => {
            const writer = q.assigned_writer_id ? writerById[q.assigned_writer_id] : null;
            const ru = latestRU[q.id];
            const badge = ru ? SIGNAL_BADGE[ru.signal_type] : null;
            return (
              <li key={q.id}>
                <Link
                  to="/missions/$missionId/questions/$questionId"
                  params={{ missionId, questionId: q.id }}
                  className="block px-5 py-4 hover:bg-surface-hover"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[11px] text-muted-foreground shrink-0">{q.question_number}</span>
                    <span className="flex-1 truncate text-sm font-medium">{q.title}</span>
                    {badge && (
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badge.cls}`}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 pl-[3.25rem] text-[11px] text-muted-foreground">
                    <span>{writer?.display_name || writer?.email || "Unassigned"}</span>
                    {nextGate && (
                      <span>
                        Next gate: {nextGate.gate_name} · {gateDays}d
                      </span>
                    )}
                    {ru && <span>Last update {relativeTime(ru.created_at)}</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
