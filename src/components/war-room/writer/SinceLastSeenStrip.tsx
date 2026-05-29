import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { Sparkles } from "lucide-react";

export function SinceLastSeenStrip() {
  const { engagement } = useEngagement();
  const { user } = useSession();
  const [counts, setCounts] = useState<{ broadcasts: number; decisions: number; risks: number; recognition: number } | null>(null);

  useEffect(() => {
    if (!engagement || !user) return;
    let active = true;
    (async () => {
      // Fetch the user's previous last_seen
      const { data: row } = await supabase
        .from("writer_last_seen")
        .select("last_seen_at")
        .eq("engagement_id", engagement.id)
        .eq("user_id", user.id)
        .maybeSingle();
      const since = row?.last_seen_at ?? new Date(Date.now() - 7 * 86400000).toISOString();

      const [b, d, r, p] = await Promise.all([
        supabase.from("broadcasts").select("id", { count: "exact", head: true }).eq("engagement_id", engagement.id).gt("created_at", since),
        supabase.from("decisions").select("id", { count: "exact", head: true }).eq("engagement_id", engagement.id).gt("created_at", since),
        supabase.from("risks").select("id", { count: "exact", head: true }).eq("engagement_id", engagement.id).gt("created_at", since),
        supabase.from("engagement_pulses").select("id", { count: "exact", head: true }).eq("engagement_id", engagement.id).eq("member_id", user.id).gt("updated_at", since),
      ]);

      if (!active) return;
      setCounts({
        broadcasts: b.count ?? 0,
        decisions: d.count ?? 0,
        risks: r.count ?? 0,
        recognition: p.count ?? 0,
      });

      // Update last_seen after a brief delay so the strip stays visible this session
      setTimeout(async () => {
        const today = new Date().toISOString().slice(0, 10);
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const prevDay = row ? (await supabase.from("writer_last_seen").select("streak_count, streak_last_day").eq("engagement_id", engagement.id).eq("user_id", user.id).maybeSingle()).data : null;
        let streak = 1;
        if (prevDay?.streak_last_day === today) streak = prevDay.streak_count;
        else if (prevDay?.streak_last_day === yesterday) streak = (prevDay.streak_count ?? 0) + 1;

        await supabase.from("writer_last_seen").upsert(
          {
            engagement_id: engagement.id,
            user_id: user.id,
            last_seen_at: new Date().toISOString(),
            streak_count: streak,
            streak_last_day: today,
          },
          { onConflict: "engagement_id,user_id" },
        );
      }, 5000);
    })();
    return () => { active = false; };
  }, [engagement?.id, user?.id]);

  if (!counts) return null;
  const items: string[] = [];
  if (counts.broadcasts) items.push(`${counts.broadcasts} new broadcast${counts.broadcasts === 1 ? "" : "s"}`);
  if (counts.decisions) items.push(`${counts.decisions} new decision${counts.decisions === 1 ? "" : "s"}`);
  if (counts.risks) items.push(`${counts.risks} new risk${counts.risks === 1 ? "" : "s"}`);
  if (counts.recognition) items.push(`${counts.recognition} new recognition`);
  if (items.length === 0) return null;

  return (
    <div className="w-full border-b border-[var(--gold)]/30 bg-[var(--gold)]/10">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 text-xs">
        <Sparkles className="h-3.5 w-3.5 text-[var(--gold)]" />
        <span className="uppercase tracking-[0.18em] text-[var(--gold)] font-semibold">Since your last login</span>
        <span className="text-foreground">{items.join(" · ")}</span>
      </div>
    </div>
  );
}
