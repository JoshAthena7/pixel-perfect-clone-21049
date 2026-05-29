import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { WinOfTheDayBanner } from "@/components/war-room/writer/WinOfTheDayBanner";
import { bigConfetti } from "@/lib/confetti";
import { Trophy } from "lucide-react";
import { TriviaLeaderboard } from "@/components/war-room/writer/TriviaLeaderboard";

export const Route = createFileRoute("/_authenticated/writer/progress")({
  head: () => ({ meta: [{ title: "Progress — Writer Portal" }] }),
  component: WriterProgress,
});

const STATUSES = ["Not Started", "In Progress", "Under Review", "Complete"] as const;
const STATUS_COLORS: Record<string, string> = {
  "Not Started": "bg-muted-foreground/40",
  "In Progress": "bg-amber-500",
  "Under Review": "bg-blue-500",
  Complete: "bg-emerald-500",
};
const MILESTONES = [25, 50, 75, 100];

function WriterProgress() {
  const { engagement, member } = useEngagement();
  const [rows, setRows] = useState<any[]>([]);
  const celebrated = useRef(false);

  useEffect(() => {
    if (!engagement) return;
    supabase
      .from("section_assignments")
      .select("status")
      .eq("engagement_id", engagement.id)
      .then(({ data }) => setRows(data ?? []));
  }, [engagement?.id]);

  const total = rows.length || 0;
  const counts: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  rows.forEach((r) => { counts[r.status] = (counts[r.status] ?? 0) + 1; });
  const completePct = total ? Math.round((counts.Complete / total) * 100) : 0;

  useEffect(() => {
    if (!engagement || celebrated.current || total === 0) return;
    const key = `wallOfWin:${engagement.id}`;
    const last = Number(localStorage.getItem(key) ?? "0");
    const crossed = MILESTONES.find((m) => completePct >= m && last < m);
    if (crossed) {
      celebrated.current = true;
      bigConfetti();
      localStorage.setItem(key, String(crossed));
      // Auto-post celebratory broadcast
      supabase.from("broadcasts").insert({
        engagement_id: engagement.id,
        author_id: "00000000-0000-0000-0000-000000000000",
        author_name: "War Room",
        content: `🎉 We just hit ${crossed}% sections Complete! Keep going, team.`,
        pinned: crossed === 100,
      }).then(() => {}, () => {});
    }
  }, [completePct, engagement?.id, total]);

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
        <p className="mt-1 text-sm text-muted-foreground">How the team is tracking — aggregate only.</p>
      </div>

      <WinOfTheDayBanner />

      <Card className="border-[var(--gold)]/30 bg-surface p-5">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-[var(--gold)]" />
          <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--gold)] font-semibold">War Room Wall of Win</div>
        </div>
        <div className="mt-3 text-3xl font-bold">{counts.Complete} / {total}</div>
        <div className="mt-1 text-xs text-muted-foreground">{completePct}% of sections Complete</div>
        <Progress value={completePct} className="mt-3 h-2" />
        <div className="mt-4 flex justify-between">
          {MILESTONES.map((m) => (
            <div
              key={m}
              className={`flex flex-col items-center gap-1 text-[11px] ${completePct >= m ? "text-[var(--gold)]" : "text-muted-foreground"}`}
            >
              <div className={`h-3 w-3 rounded-full ${completePct >= m ? "bg-[var(--gold)] shadow-[0_0_10px_var(--gold)]" : "bg-muted-foreground/30"}`} />
              {m}%
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {STATUSES.map((s) => {
          const pct = total ? Math.round((counts[s] / total) * 100) : 0;
          return (
            <Card key={s} className="border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{s}</span>
                <span className="text-xs text-muted-foreground">{counts[s]} of {total}</span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted-foreground/20">
                <div className={`h-full rounded-full ${STATUS_COLORS[s]}`} style={{ width: `${pct}%` }} />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
