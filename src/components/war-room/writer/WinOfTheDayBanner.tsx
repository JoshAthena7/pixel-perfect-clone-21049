import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Trophy } from "lucide-react";

export function WinOfTheDayBanner() {
  const { engagement } = useEngagement();
  const [win, setWin] = useState<any | null>(null);

  useEffect(() => {
    if (!engagement) return;
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    supabase
      .from("win_of_the_day")
      .select("*")
      .eq("engagement_id", engagement.id)
      .gt("posted_at", since)
      .order("posted_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setWin(data));
  }, [engagement?.id]);

  if (!win) return null;
  return (
    <div className="mx-auto mt-4 max-w-3xl rounded-md border border-[var(--gold)]/40 bg-[var(--gold)]/10 p-4">
      <div className="flex items-start gap-3">
        <Trophy className="h-5 w-5 text-[var(--gold)] mt-0.5" />
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--gold)] font-semibold">Win of the Day</div>
          <div className="mt-1 text-sm font-semibold">{win.title}</div>
          {win.body && <div className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{win.body}</div>}
          <div className="mt-2 text-[11px] text-muted-foreground">Posted by {win.posted_by_name}</div>
        </div>
      </div>
    </div>
  );
}
