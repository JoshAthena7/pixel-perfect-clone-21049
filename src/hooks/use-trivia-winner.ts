import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";

/** Returns the engagement_members.id of the declared trivia champion, if any. */
export function useTriviaWinnerId(): string | null {
  const { engagement } = useEngagement();
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    if (!engagement) return;
    let active = true;
    async function load() {
      const { data } = await supabase
        .from("trivia_winners")
        .select("winner_member_id")
        .eq("engagement_id", engagement!.id)
        .maybeSingle();
      if (active) setId((data as any)?.winner_member_id ?? null);
    }
    load();
    const ch = supabase
      .channel(`trivia-winner:${engagement.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "trivia_winners", filter: `engagement_id=eq.${engagement.id}` }, load)
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [engagement?.id]);

  return id;
}
