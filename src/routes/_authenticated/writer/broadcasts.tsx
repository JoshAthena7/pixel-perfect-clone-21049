import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Card } from "@/components/ui/card";
import { relativeTime } from "@/lib/time";
import { Pin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/writer/broadcasts")({
  head: () => ({ meta: [{ title: "Broadcasts — Writer Portal" }] }),
  component: WriterBroadcasts,
});

function WriterBroadcasts() {
  const { engagement } = useEngagement();
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    if (!engagement) return;
    let cancelled = false;
    supabase
      .from("broadcasts")
      .select("*")
      .eq("engagement_id", engagement.id)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => { if (!cancelled) setItems(data ?? []); });
    const ch = supabase
      .channel(`writer-broadcasts:${engagement.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "broadcasts", filter: `engagement_id=eq.${engagement.id}` }, async () => {
        const { data } = await supabase.from("broadcasts").select("*").eq("engagement_id", engagement.id).order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(200);
        setItems(data ?? []);
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [engagement?.id]);

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Broadcasts</h1>
        <p className="mt-1 text-sm text-muted-foreground">Latest announcements from leadership.</p>
      </div>
      {items.length === 0 ? (
        <Card className="border-border bg-surface p-6 text-sm text-muted-foreground">No broadcasts yet.</Card>
      ) : (
        items.map((b) => (
          <Card key={b.id} className="border-border bg-surface p-4">
            <div className="flex items-start gap-3">
              <div className="text-xl">{b.pinned ? <Pin className="h-4 w-4 text-[var(--gold)]" /> : "📣"}</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-foreground whitespace-pre-wrap">{b.content}</div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {b.author_name} · {relativeTime(b.created_at)}
                </div>
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
