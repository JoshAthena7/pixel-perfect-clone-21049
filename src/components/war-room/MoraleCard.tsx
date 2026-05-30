import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Card } from "@/components/ui/card";

type Row = { checkin_date: string; response: "ready" | "okay" | "struggling" };

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function MoraleCard() {
  const { engagement } = useEngagement();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!engagement) return;
    const sevenAgo = new Date(Date.now() - 7 * 86400000);
    supabase
      .from("daily_checkins")
      .select("checkin_date, response")
      .eq("engagement_id", engagement.id)
      .gte("checkin_date", ymd(sevenAgo))
      .order("checkin_date", { ascending: true })
      .then(({ data }) => setRows((data as Row[]) ?? []));
  }, [engagement?.id]);

  const today = ymd(new Date());
  const todayRows = rows.filter((r) => r.checkin_date === today);
  const ready = todayRows.filter((r) => r.response === "ready").length;
  const okay = todayRows.filter((r) => r.response === "okay").length;
  const struggling = todayRows.filter((r) => r.response === "struggling").length;
  const total = todayRows.length;
  const strugglingPct = total > 0 ? Math.round((struggling / total) * 100) : 0;
  const flag = total >= 3 && strugglingPct > 30;

  // 7-day trend — weighted score per day (ready=1, okay=0.5, struggling=0)
  const byDay = useMemo(() => {
    const map = new Map<string, { ready: number; okay: number; struggling: number }>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      map.set(ymd(d), { ready: 0, okay: 0, struggling: 0 });
    }
    rows.forEach((r) => {
      const m = map.get(r.checkin_date);
      if (m) m[r.response]++;
    });
    return Array.from(map.entries()).map(([d, c]) => {
      const t = c.ready + c.okay + c.struggling;
      const score = t > 0 ? (c.ready * 1 + c.okay * 0.5) / t : null;
      return { date: d, score, total: t };
    });
  }, [rows]);

  const points = byDay.filter((d) => d.score !== null);
  let trendPath = "";
  if (points.length > 1) {
    const w = 100, h = 30;
    const step = w / (points.length - 1);
    trendPath = points.map((p, i) => `${i === 0 ? "M" : "L"}${i * step},${h - (p.score! * h)}`).join(" ");
  }

  return (
    <Card className="border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">Today's morale</div>
          <div className="mt-1 text-xs text-muted-foreground">{total} anonymous check-in{total === 1 ? "" : "s"}</div>
        </div>
        <div className="text-lg font-semibold tabular-nums">
          💪 {ready} <span className="text-muted-foreground">·</span> 😐 {okay} <span className="text-muted-foreground">·</span> 😓 {struggling}
        </div>
      </div>
      {flag && (
        <div className="mt-3 rounded-md border border-[#ef4444]/40 bg-[#ef4444]/[0.08] px-3 py-2 text-xs text-[#ef4444]">
          ⚠️ Morale flag: more than 30% of the team is struggling today
        </div>
      )}
      <div className="mt-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">7-day trend</div>
        {points.length > 1 ? (
          <svg viewBox="0 0 100 30" className="mt-1 h-10 w-full" preserveAspectRatio="none">
            <path d={trendPath} fill="none" stroke="#eab308" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : (
          <div className="mt-1 text-[11px] italic text-muted-foreground">Not enough data yet.</div>
        )}
      </div>
    </Card>
  );
}
