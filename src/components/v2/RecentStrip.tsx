import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clock, PenTool } from "lucide-react";

type Recent = { missionId: string; questionId: string; ts: number };
const KEY = "atlas.recent.questions";
const MAX = 5;

function read(): Recent[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Recent[];
  } catch {
    return [];
  }
}

function write(list: Recent[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {}
}

/** Mount once globally — tracks every visit to a question route. */
export function RecentTracker() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    const m = path.match(/^\/missions\/([0-9a-f-]+)\/questions\/([0-9a-f-]+)/i);
    if (!m) return;
    const [, missionId, questionId] = m;
    const list = read().filter((r) => r.questionId !== questionId);
    list.unshift({ missionId, questionId, ts: Date.now() });
    write(list);
  }, [path]);
  return null;
}

/** Compact strip shown in Studio: last 3 questions touched. */
export function RecentStrip({ missionId }: { missionId: string }) {
  const [recents, setRecents] = useState<Recent[]>([]);

  useEffect(() => {
    setRecents(read().filter((r) => r.missionId === missionId).slice(0, 3));
  }, [missionId]);

  const ids = recents.map((r) => r.questionId);
  const { data: rows = [] } = useQuery({
    queryKey: ["recent-questions", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,title,health")
        .in("id", ids);
      return (data ?? []) as { id: string; question_number: string; title: string; health: string | null }[];
    },
  });

  if (recents.length === 0) return null;

  // Preserve order from recents
  const ordered = recents
    .map((r) => rows.find((x) => x.id === r.questionId))
    .filter((x): x is { id: string; question_number: string; title: string; health: string | null } => !!x);
  if (ordered.length === 0) return null;

  return (
    <div
      className="flex h-9 items-center gap-2 overflow-x-auto px-6 text-[11px]"
      style={{
        background: "rgba(59,127,255,0.025)",
        borderBottom: "1px solid rgba(59,127,255,0.08)",
      }}
    >
      <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground uppercase tracking-[0.12em] font-semibold">
        <Clock size={11} /> Recent
      </span>
      {ordered.map((q) => {
        const dot =
          q.health === "Red" ? "#ef4444" : q.health === "Yellow" ? "#f59e0b" : "#22c55e";
        return (
          <Link
            key={q.id}
            to="/missions/$missionId/questions/$questionId"
            params={{ missionId, questionId: q.id }}
            className="group inline-flex shrink-0 items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1 text-muted-foreground hover:border-[#3b7fff]/30 hover:bg-[#3b7fff]/[0.06] hover:text-foreground transition-colors"
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
            <PenTool size={10} className="opacity-60 group-hover:opacity-100" />
            <span className="font-mono text-[10px] text-muted-foreground/80">Q{q.question_number}</span>
            <span className="max-w-[180px] truncate">· {q.title}</span>
          </Link>
        );
      })}
    </div>
  );
}
