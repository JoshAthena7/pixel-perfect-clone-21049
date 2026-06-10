/**
 * Daily Pulse — personalized brief modal. Uses today's
 * daily_intelligence_briefs row if one exists, else generates one
 * inline via the same gateway used by IRIS.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

const GOLD = "#C9A55C";

export function DailyPulseModal({ open, onOpenChange, missionId }: { open: boolean; onOpenChange: (v: boolean) => void; missionId: string | null }) {
  const [loading, setLoading] = useState(false);
  const [briefText, setBriefText] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ newIntel: number; atRisk: number } | null>(null);

  useEffect(() => {
    if (!open || !missionId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setBriefText(null);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Use today's daily_intelligence_briefs row if present.
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        const { data: existing } = await supabase
          .from("daily_intelligence_briefs")
          .select("content,key_intelligence_summary")
          .eq("recipient_id", user.id)
          .eq("mission_id", missionId)
          .gte("created_at", startOfDay.toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const [{ data: newIntel }, { data: atRiskQ }] = await Promise.all([
          supabase.from("intelligence_feed_items").select("headline,iris_assessment").eq("mission_id", missionId).gte("iris_relevance_score", 60).gte("created_at", startOfDay.toISOString()),
          supabase.from("questions").select("question_number,status").eq("mission_id", missionId).in("status", ["at_risk", "blocked", "overdue"]),
        ]);
        if (cancelled) return;
        setCounts({ newIntel: (newIntel ?? []).length, atRisk: (atRiskQ ?? []).length });

        const existingText = existing?.key_intelligence_summary
          ?? (typeof existing?.content === "string" ? existing.content : null);
        if (existingText) { setBriefText(existingText); return; }

        // Otherwise generate inline through the iris chat endpoint (auth via JWT).
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/chat/iris", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
          body: JSON.stringify({
            missionId,
            pageLabel: "Daily Pulse",
            messages: [{
              role: "user",
              content: `Deliver my personalized Daily Pulse brief for this mission. Cover: (1) what's new since yesterday, (2) the single most important priority for today, (3) any risk I should know about. Keep it under 180 words. Use plain prose, no headings.`,
            }],
          }),
        });
        if (!res.ok || !res.body) {
          setBriefText("IRIS couldn't generate a pulse right now.");
          return;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let acc = "";
        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          setBriefText(acc);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, missionId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle style={{ color: GOLD }}>Daily Pulse</DialogTitle></DialogHeader>
        {!missionId ? (
          <p className="text-sm text-muted-foreground">Open a mission to see today's pulse.</p>
        ) : (
          <div className="space-y-3">
            {counts && (
              <div className="flex gap-4 text-xs">
                <span><strong style={{ color: GOLD }}>{counts.newIntel}</strong> new intel today</span>
                <span><strong style={{ color: GOLD }}>{counts.atRisk}</strong> at-risk questions</span>
              </div>
            )}
            {loading && !briefText ? <Skeleton className="h-32 w-full" /> : null}
            {briefText && <p className="text-sm whitespace-pre-wrap leading-relaxed">{briefText}</p>}
            {loading && briefText && <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> IRIS is finishing…</div>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
