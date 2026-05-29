import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Card } from "@/components/ui/card";
import { Star } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/writer/recognition-feed")({
  head: () => ({ meta: [{ title: "Recognition — Writer Portal" }] }),
  component: WriterRecognition,
});

function WriterRecognition() {
  const { engagement } = useEngagement();
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    if (!engagement) return;
    supabase
      .from("engagement_pulses")
      .select("id, member_id, last_recognition_note, last_recognition_type, updated_at, star_count")
      .eq("engagement_id", engagement.id)
      .not("last_recognition_note", "is", null)
      .order("updated_at", { ascending: false })
      .then(async ({ data }) => {
        const rows = data ?? [];
        const ids = rows.map((r: any) => r.member_id);
        if (ids.length === 0) return setItems([]);
        const { data: mems } = await supabase
          .from("engagement_members")
          .select("user_id, display_name")
          .in("user_id", ids);
        const map = Object.fromEntries((mems ?? []).map((m: any) => [m.user_id, m.display_name]));
        setItems(rows.map((r: any) => ({ ...r, name: map[r.member_id] ?? "Teammate" })));
      });
  }, [engagement?.id]);

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Recognition</h1>
        <p className="mt-1 text-sm text-muted-foreground">Shout-outs from across the team.</p>
      </div>
      {items.length === 0 ? (
        <Card className="border-border bg-surface p-6 text-sm text-muted-foreground">No recognition yet.</Card>
      ) : (
        items.map((it) => (
          <Card key={it.id} className="border-border bg-surface p-4">
            <div className="flex items-start gap-3">
              <Star className="mt-0.5 h-4 w-4 fill-[var(--gold)] text-[var(--gold)]" />
              <div className="min-w-0">
                <div className="text-sm font-semibold">{it.name}</div>
                <div className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{it.last_recognition_note}</div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {format(new Date(it.updated_at), "MMM d, yyyy")}
                </div>
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
