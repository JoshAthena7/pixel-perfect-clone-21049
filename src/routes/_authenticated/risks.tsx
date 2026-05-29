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

export const Route = createFileRoute("/_authenticated/risks")({
  head: () => ({ meta: [{ title: "Risks — Athena" }] }),
  component: RisksPage,
});

const SEVERITY = ["Low", "Medium", "High", "Critical"] as const;
const LIKELIHOOD = ["Unlikely", "Possible", "Likely", "Almost Certain"] as const;
const STATUSES = ["Open", "Mitigating", "Closed"] as const;

const SEV_COLOR: Record<string, string> = {
  Low: "border-emerald-500/40 text-emerald-400 bg-emerald-500/5",
  Medium: "border-amber-500/40 text-amber-400 bg-amber-500/5",
  High: "border-orange-500/40 text-orange-400 bg-orange-500/5",
  Critical: "border-red-500/40 text-red-400 bg-red-500/5",
};
const STATUS_COLOR: Record<string, string> = {
  Open: "border-red-500/40 text-red-400",
  Mitigating: "border-amber-500/40 text-amber-400",
  Closed: "border-emerald-500/40 text-emerald-400",
};

function RisksPage() {
  const { engagement, member, isLeadership } = useEngagement();
  const { user } = useSession();
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<"All" | (typeof STATUSES)[number]>("Open");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<(typeof SEVERITY)[number]>("Medium");
  const [likelihood, setLikelihood] = useState<(typeof LIKELIHOOD)[number]>("Possible");
  const [owner, setOwner] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load(eid: string) {
    const { data } = await supabase
      .from("risks")
      .select("*")
      .eq("engagement_id", eid)
      .order("created_at", { ascending: false });
    setItems(data ?? []);
  }

  useEffect(() => {
    if (!engagement) return;
    load(engagement.id);
    if (member) setOwner((o) => o || member.display_name);
  }, [engagement?.id, member?.display_name]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!engagement || !user || !title.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from("risks").insert({
      engagement_id: engagement.id,
      title: title.trim(),
      description: description || null,
      severity,
      likelihood,
      status: "Open",
      owner_name: owner || null,
      target_date: targetDate || null,
      created_by: user.id,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Risk logged");
    setTitle(""); setDescription(""); setSeverity("Medium"); setLikelihood("Possible"); setTargetDate("");
    load(engagement.id);
  }

  async function updateStatus(r: any, status: (typeof STATUSES)[number]) {
    const { error } = await supabase.from("risks").update({ status, updated_at: new Date().toISOString() }).eq("id", r.id);
    if (error) return toast.error(error.message);
    load(engagement!.id);
  }

  const counts = items.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const visible = filter === "All" ? items : items.filter((r) => r.status === filter);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border bg-surface p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Total</div>
          <div className="mt-2 text-3xl font-bold">{items.length}</div>
        </Card>
        {STATUSES.map((s) => (
          <Card key={s} className="border-border bg-surface p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{s}</div>
            <div className="mt-2 text-3xl font-bold">{counts[s] ?? 0}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {isLeadership && (
          <Card className="border-border bg-surface p-6 lg:col-span-2">
            <h1 className="text-xl font-bold">Log Risk</h1>
            <p className="mt-1 text-sm text-muted-foreground">Name it before it bites us.</p>
            <form onSubmit={submit} className="mt-5 space-y-4">
              <div>
                <Label htmlFor="title">Risk</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="E.g. SME availability for technical section" />
              </div>
              <div>
                <Label htmlFor="desc">Description</Label>
                <Textarea id="desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's the impact? What's the mitigation?" />
              </div>
              <div>
                <Label>Severity</Label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {SEVERITY.map((s) => (
                    <button key={s} type="button" onClick={() => setSeverity(s)} className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${severity === s ? SEV_COLOR[s] + " ring-2 ring-primary/40" : "border-border text-muted-foreground hover:text-foreground"}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Likelihood</Label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {LIKELIHOOD.map((l) => (
                    <button key={l} type="button" onClick={() => setLikelihood(l)} className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${likelihood === l ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="owner">Owner</Label>
                  <Input id="owner" value={owner} onChange={(e) => setOwner(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="target">Target date</Label>
                  <Input id="target" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
                </div>
              </div>
              <Button type="submit" disabled={submitting || !title.trim()} className="w-full">
                {submitting ? "Saving…" : "Log Risk"}
              </Button>
            </form>
          </Card>
        )}

        <Card className={`border-border bg-surface p-6 ${isLeadership ? "lg:col-span-3" : "lg:col-span-5"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Risk Register</h2>
            <div className="flex gap-1.5">
              {(["All", ...STATUSES] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${filter === f ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="mt-4 text-sm text-muted-foreground">No risks {filter !== "All" ? `with status "${filter}"` : "logged yet"}.</div>
          ) : (
            <ul className="mt-4 space-y-3 max-h-[70vh] overflow-auto">
              {visible.map((r) => (
                <li key={r.id} className="rounded-md border border-border bg-surface-hover/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">{r.title}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${SEV_COLOR[r.severity]}`}>{r.severity}</span>
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{r.likelihood}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_COLOR[r.status]}`}>{r.status}</span>
                      </div>
                    </div>
                    {isLeadership && (
                      <div className="flex shrink-0 gap-1">
                        {STATUSES.filter((s) => s !== r.status).map((s) => (
                          <button key={s} onClick={() => updateStatus(r, s)} className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:border-primary/50 hover:text-foreground">
                            → {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {r.description && <p className="mt-2 text-sm text-muted-foreground">{r.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-x-4 text-[11px] text-muted-foreground">
                    {r.owner_name && <span>Owner: {r.owner_name}</span>}
                    {r.target_date && <span>Target: {r.target_date}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
