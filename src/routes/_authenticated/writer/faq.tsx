import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/writer/faq")({
  head: () => ({ meta: [{ title: "FAQ — Writer Portal" }] }),
  component: WriterFaq,
});

function WriterFaq() {
  const { engagement } = useEngagement();
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!engagement) return;
    supabase
      .from("faqs")
      .select("*")
      .eq("engagement_id", engagement.id)
      .order("sort_order")
      .then(({ data }) => setItems(data ?? []));
  }, [engagement?.id]);

  const term = q.toLowerCase().trim();
  const visible = !term
    ? items
    : items.filter((f) => (f.question + " " + f.answer).toLowerCase().includes(term));

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">FAQ</h1>
        <p className="mt-1 text-sm text-muted-foreground">Check here before messaging your lead.</p>
      </div>
      <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      {visible.length === 0 ? (
        <Card className="border-border bg-surface p-6 text-sm text-muted-foreground">No matches.</Card>
      ) : (
        visible.map((f) => (
          <Card key={f.id} className="border-border bg-surface p-4">
            <div className="text-sm font-semibold">{f.question}</div>
            <div className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{f.answer}</div>
          </Card>
        ))
      )}
    </div>
  );
}
