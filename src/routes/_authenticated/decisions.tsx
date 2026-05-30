import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { LoadingSkeleton, ErrorBanner } from "@/components/war-room/LoadState";

export const Route = createFileRoute("/_authenticated/decisions")({
  head: () => ({ meta: [{ title: "Decisions Log — Athena" }] }),
  component: DecisionsPage,
});

const STATUSES = ["Final", "Pending Confirmation", "Revisited"] as const;

function DecisionsPage() {
  const { engagement, member, isLeadership } = useEngagement();
  const { user } = useSession();
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [rationale, setRationale] = useState("");
  const [impactedAreas, setImpactedAreas] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("Final");
  const [decisionDate, setDecisionDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [submitting, setSubmitting] = useState(false);

  async function load(eid: string) {
    setIsLoading(true);
    setLoadError(null);
    const { data, error } = await supabase.from("decisions").select("*").eq("engagement_id", eid).order("decision_date", { ascending: false });
    setIsLoading(false);
    if (error) { setLoadError(error.message); return; }
    setItems(data ?? []);
  }

  useEffect(() => { if (engagement) load(engagement.id); }, [engagement?.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!engagement || !user || !member || !title.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from("decisions").insert({
      engagement_id: engagement.id,
      title: title.trim(),
      owner_name: member.display_name,
      rationale: rationale || null,
      impacted_areas: impactedAreas || null,
      status,
      decision_date: decisionDate,
      created_by: user.id,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Decision logged");
    setTitle(""); setRationale(""); setImpactedAreas(""); setStatus("Final");
    load(engagement.id);
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-6 p-4 md:p-8 lg:grid-cols-5">
      {(loadError || (isLoading && items.length === 0)) && (
        <div className="lg:col-span-5 space-y-3">
          <ErrorBanner error={loadError} onRetry={() => engagement && load(engagement.id)} label="Couldn't load decisions." />
          {isLoading && items.length === 0 && <LoadingSkeleton label="Loading decisions…" />}
        </div>
      )}
      {isLeadership && (
        <Card className="border-border bg-surface p-6 lg:col-span-2">
          <h1 className="text-xl font-bold">Log Decision</h1>
          <p className="mt-1 text-sm text-muted-foreground">Capture the call so nobody re-litigates later.</p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <Label htmlFor="title">Decision</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="E.g. Go with hybrid pricing model" />
            </div>
            <div>
              <Label htmlFor="rationale">Rationale</Label>
              <Textarea id="rationale" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Why this call?" />
            </div>
            <div>
              <Label htmlFor="areas">Impacted areas</Label>
              <Input id="areas" value={impactedAreas} onChange={(e) => setImpactedAreas(e.target.value)} placeholder="Pricing, staffing plan, technical approach" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" value={decisionDate} onChange={(e) => setDecisionDate(e.target.value)} />
              </div>
              <div>
                <Label>Status</Label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {STATUSES.map((s) => (
                    <button key={s} type="button" onClick={() => setStatus(s)} className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${status === s ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <Button type="submit" disabled={submitting || !title.trim()} className="w-full">
              {submitting ? "Saving…" : "Log Decision"}
            </Button>
          </form>
        </Card>
      )}

      <Card className={`border-border bg-surface p-6 ${isLeadership ? "lg:col-span-3" : "lg:col-span-5"}`}>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Decision Log</h2>
        {items.length === 0 ? (
          <div className="mt-4 text-sm text-muted-foreground">No decisions logged yet.</div>
        ) : (
          <ul className="mt-4 space-y-3 max-h-[75vh] overflow-auto">
            {items.map((d) => (
              <li key={d.id} className="rounded-md border border-border bg-surface-hover/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold">{d.title}</h3>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                    d.status === "Final" ? "border-emerald-500/40 text-emerald-400" :
                    d.status === "Pending Confirmation" ? "border-amber-500/40 text-amber-400" :
                    "border-sky-500/40 text-sky-400"
                  }`}>{d.status}</span>
                </div>
                {d.rationale && <p className="mt-1 text-sm text-muted-foreground">{d.rationale}</p>}
                {d.impacted_areas && <p className="mt-1 text-xs"><span className="text-muted-foreground">Impacts:</span> {d.impacted_areas}</p>}
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {d.owner_name ?? "Unknown"} • {d.decision_date}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
