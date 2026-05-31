import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/faq")({
  head: () => ({ meta: [{ title: "FAQ — Athena" }] }),
  component: () => <Navigate to="/intel" replace />,
});

function LeadFaq() {
  const { engagement, isLeadership } = useEngagement();
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [a, setA] = useState("");

  async function load() {
    if (!engagement) return;
    const { data } = await supabase.from("faqs").select("*").eq("engagement_id", engagement.id).order("sort_order");
    setItems(data ?? []);
  }
  useEffect(() => { load(); }, [engagement?.id]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!engagement || !q.trim() || !a.trim()) return;
    const { error } = await supabase.from("faqs").insert({ engagement_id: engagement.id, question: q.trim(), answer: a.trim(), sort_order: items.length });
    if (error) return toast.error(error.message);
    setQ(""); setA(""); load();
  }
  async function remove(id: string) {
    const { error } = await supabase.from("faqs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">FAQ</h1>
        <p className="mt-1 text-sm text-muted-foreground">Answers writers can find without messaging you.</p>
      </div>
      {isLeadership && (
        <Card className="border-border bg-surface p-4">
          <form onSubmit={add} className="space-y-3">
            <div><Label>Question</Label><Input value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div><Label>Answer</Label><Textarea rows={3} value={a} onChange={(e) => setA(e.target.value)} /></div>
            <Button type="submit" disabled={!q.trim() || !a.trim()}>Add Q&A</Button>
          </form>
        </Card>
      )}
      {items.map((it) => (
        <Card key={it.id} className="border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">{it.question}</div>
              <div className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{it.answer}</div>
            </div>
            {isLeadership && <Button size="sm" variant="ghost" onClick={() => remove(it.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
          </div>
        </Card>
      ))}
    </div>
  );
}
