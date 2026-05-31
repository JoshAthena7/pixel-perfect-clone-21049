import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { PageGate } from "@/components/war-room/PageGate";

export const Route = createFileRoute("/_authenticated/pulse")({
  head: () => ({ meta: [{ title: "Pulse™ — Athena" }] }),
  component: () => <PageGate page="pulse"><PulsePage /></PageGate>,
});

const SENTIMENTS = ["Happy", "Neutral", "Concerned"] as const;
const SENT_COLOR: Record<string, string> = {
  Happy: "border-emerald-500/40 text-emerald-400 bg-emerald-500/5",
  Neutral: "border-amber-500/40 text-amber-400 bg-amber-500/5",
  Concerned: "border-red-500/40 text-red-400 bg-red-500/5",
};

function PulsePage() {
  const { engagement, member, isLeadership } = useEngagement();
  const { user } = useSession();
  const [items, setItems] = useState<any[]>([]);

  const [sentiment, setSentiment] = useState<(typeof SENTIMENTS)[number]>("Neutral");
  const [summary, setSummary] = useState("");
  const [actions, setActions] = useState("");
  const [interactionDate, setInteractionDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [submitting, setSubmitting] = useState(false);

  async function load(eid: string) {
    const { data } = await supabase.from("client_pulses").select("*").eq("engagement_id", eid).order("interaction_date", { ascending: false });
    setItems(data ?? []);
  }

  useEffect(() => { if (engagement) load(engagement.id); }, [engagement?.id]);

  const counts = items.reduce<Record<string, number>>((acc, p) => {
    acc[p.sentiment] = (acc[p.sentiment] ?? 0) + 1;
    return acc;
  }, {});
  const latest = items[0];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!engagement || !user || !member || !summary.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from("client_pulses").insert({
      engagement_id: engagement.id,
      recorded_by: user.id,
      recorder_name: member.display_name,
      interaction_date: interactionDate,
      sentiment,
      summary: summary.trim(),
      action_items: actions || null,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Pulse™ recorded");
    setSummary(""); setActions(""); setSentiment("Neutral");
    load(engagement.id);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border bg-surface p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Latest sentiment</div>
          <div className={`mt-2 inline-block rounded-full border px-3 py-1 text-xs font-medium ${latest ? SENT_COLOR[latest.sentiment] : "border-border text-muted-foreground"}`}>
            {latest?.sentiment ?? "No data"}
          </div>
          {latest && <div className="mt-2 text-[11px] text-muted-foreground">{latest.interaction_date}</div>}
        </Card>
        {SENTIMENTS.map((s) => (
          <Card key={s} className="border-border bg-surface p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{s}</div>
            <div className="mt-2 text-3xl font-bold">{counts[s] ?? 0}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {isLeadership && (
          <Card className="border-border bg-surface p-6 lg:col-span-2">
            <h1 className="text-xl font-bold">Log Interaction</h1>
            <p className="mt-1 text-sm text-muted-foreground">How did the client read in the room today?</p>
            <form onSubmit={submit} className="mt-5 space-y-4">
              <div>
                <Label>Sentiment</Label>
                <div className="mt-1 flex gap-2">
                  {SENTIMENTS.map((s) => (
                    <button key={s} type="button" onClick={() => setSentiment(s)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${sentiment === s ? SENT_COLOR[s] + " ring-2 ring-primary/40" : "border-border text-muted-foreground hover:text-foreground"}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="date">Interaction date</Label>
                <Input id="date" type="date" value={interactionDate} onChange={(e) => setInteractionDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="summary">Summary</Label>
                <Textarea id="summary" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What was discussed? What signals did you pick up?" />
              </div>
              <div>
                <Label htmlFor="actions">Action items</Label>
                <Textarea id="actions" rows={2} value={actions} onChange={(e) => setActions(e.target.value)} placeholder="Follow-ups, commitments, owners" />
              </div>
              <Button type="submit" disabled={submitting || !summary.trim()} className="w-full">
                {submitting ? "Saving…" : "Record Pulse™"}
              </Button>
            </form>
          </Card>
        )}

        <Card className={`border-border bg-surface p-6 ${isLeadership ? "lg:col-span-3" : "lg:col-span-5"}`}>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Pulse™ History</h2>
          {items.length === 0 ? (
            <div className="mt-4 text-sm text-muted-foreground">No pulse entries yet.</div>
          ) : (
            <ul className="mt-4 space-y-3 max-h-[70vh] overflow-auto">
              {items.map((p) => (
                <li key={p.id} className="rounded-md border border-border bg-surface-hover/40 p-4">
                  <div className="flex items-center justify-between">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${SENT_COLOR[p.sentiment]}`}>{p.sentiment}</span>
                    <span className="text-[11px] text-muted-foreground">{p.interaction_date}</span>
                  </div>
                  <p className="mt-2 text-sm">{p.summary}</p>
                  {p.action_items && <p className="mt-1 text-xs"><span className="text-muted-foreground">Actions:</span> {p.action_items}</p>}
                  <div className="mt-2 text-[11px] text-muted-foreground">{p.recorder_name}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
