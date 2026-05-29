import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Card } from "@/components/ui/card";
import { Trophy } from "lucide-react";
import { firstName } from "@/lib/trivia-helpers";

type Row = { member_id: string; correct: boolean };
type Member = { id: string; display_name: string };

export type LeaderboardEntry = {
  rank: number;
  member_id: string;
  first_name: string;
  correct: number;
  answered: number;
};

export function useTriviaLeaderboard() {
  const { engagement } = useEngagement();
  const [rows, setRows] = useState<Row[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [winnerId, setWinnerId] = useState<string | null>(null);

  useEffect(() => {
    if (!engagement) return;
    let active = true;
    async function load() {
      const [{ data: a }, { data: m }, { data: w }] = await Promise.all([
        supabase.from("trivia_answers").select("member_id, correct").eq("engagement_id", engagement!.id),
        supabase.from("engagement_members").select("id, display_name").eq("engagement_id", engagement!.id),
        supabase.from("trivia_winners").select("winner_member_id").eq("engagement_id", engagement!.id).maybeSingle(),
      ]);
      if (!active) return;
      setRows((a as Row[]) ?? []);
      setMembers((m as Member[]) ?? []);
      setWinnerId((w as any)?.winner_member_id ?? null);
    }
    load();
    const ch = supabase
      .channel(`trivia:${engagement.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "trivia_answers", filter: `engagement_id=eq.${engagement.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "trivia_winners", filter: `engagement_id=eq.${engagement.id}` }, load)
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [engagement?.id]);

  const entries: LeaderboardEntry[] = useMemo(() => {
    const byMember = new Map<string, { correct: number; answered: number }>();
    rows.forEach((r) => {
      const cur = byMember.get(r.member_id) ?? { correct: 0, answered: 0 };
      cur.answered += 1;
      if (r.correct) cur.correct += 1;
      byMember.set(r.member_id, cur);
    });
    const list = members
      .map((m) => {
        const s = byMember.get(m.id) ?? { correct: 0, answered: 0 };
        return { member_id: m.id, first_name: firstName(m.display_name), correct: s.correct, answered: s.answered };
      })
      .filter((e) => e.answered > 0)
      .sort((a, b) => b.correct - a.correct || b.answered - a.answered);
    // Dense ranking with ties
    let lastCorrect = -1;
    let lastRank = 0;
    return list.map((e, i) => {
      if (e.correct !== lastCorrect) {
        lastRank = i + 1;
        lastCorrect = e.correct;
      }
      return { ...e, rank: lastRank };
    });
  }, [rows, members]);

  const totalPlayers = useMemo(() => new Set(rows.map((r) => r.member_id)).size, [rows]);
  const unlocked = totalPlayers >= 3;

  return { entries, unlocked, totalPlayers, winnerId };
}

export function TriviaLeaderboard({ currentMemberId }: { currentMemberId?: string | null }) {
  const { entries, unlocked, winnerId } = useTriviaLeaderboard();

  return (
    <Card className="border-[var(--gold)]/30 bg-surface p-5">
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-[var(--gold)]" />
        <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--gold)] font-semibold">Indiana Trivia Leaderboard</div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Indiana Trivia Contest — most correct answers wins a prize at the end of the engagement 🏆
      </p>

      {!unlocked ? (
        <div className="mt-4 rounded-md border border-dashed border-border/60 p-4 text-center text-xs italic text-muted-foreground">
          Leaderboard unlocks after the first three answers are in.
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-border/60">
          {entries.map((e) => {
            const me = currentMemberId && e.member_id === currentMemberId;
            const isWinner = winnerId === e.member_id;
            return (
              <li
                key={e.member_id}
                className={`flex items-center justify-between px-2 py-2 text-sm ${me ? "rounded-md bg-[var(--gold)]/10" : ""}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 text-right text-xs font-bold text-muted-foreground">#{e.rank}</span>
                  <span className="truncate font-medium">
                    {e.first_name}
                    {isWinner && <span className="ml-1.5">🏆</span>}
                    {me && <span className="ml-1.5 text-[10px] uppercase tracking-wider text-[var(--gold)]">you</span>}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="font-semibold text-emerald-300">{e.correct} correct</span>
                  <span className="text-muted-foreground">{e.answered} answered</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
