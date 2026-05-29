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
import { StatusPill, type StatusColor } from "@/components/war-room/StatusPill";
import { toast } from "sonner";
import { relativeTime } from "@/lib/time";
import { Siren } from "lucide-react";
import { notifySlack } from "@/lib/api/slack.functions";

export const Route = createFileRoute("/_authenticated/sos")({
  head: () => ({ meta: [{ title: "SOS Alerts — Athena" }] }),
  component: SosPage,
});

const SEVERITY = ["Critical", "High", "Medium"] as const;
const CATEGORY = ["Client", "Staffing", "Compliance", "Tech", "Schedule", "Other"];

function sevColor(s: string): StatusColor {
  return s === "Critical" ? "Red" : s === "High" ? "Orange" : "Yellow";
}

function SosPage() {
  const { engagement, member, isLeadership } = useEngagement();
  const { user } = useSession();

  const [severity, setSeverity] = useState<(typeof SEVERITY)[number]>("High");
  const [category, setCategory] = useState(CATEGORY[0]);
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");
  const [action, setAction] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [alerts, setAlerts] = useState<any[]>([]);

  async function load(eid: string) {
    const { data } = await supabase.from("sos_alerts").select("*").eq("engagement_id", eid).order("created_at", { ascending: false });
    setAlerts(data ?? []);
  }

  useEffect(() => {
    if (!engagement) return;
    load(engagement.id);
    const ch = supabase
      .channel(`sos:${engagement.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sos_alerts", filter: `engagement_id=eq.${engagement.id}` }, () => load(engagement.id))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [engagement?.id]);

  async function raise(e: React.FormEvent) {
    e.preventDefault();
    if (!engagement || !user || !member) return;
    setSubmitting(true);
    const { error } = await supabase.from("sos_alerts").insert({
      engagement_id: engagement.id,
      submitted_by: user.id,
      submitter_name: member.display_name,
      severity, category, description,
      owner_name: owner || null,
      recommended_action: action || null,
      status: "Open",
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("SOS raised");
    setDescription(""); setOwner(""); setAction("");
  }

  async function setStatus(id: string, status: string) {
    const patch: any = { status };
    if (status === "Resolved") patch.resolved_at = new Date().toISOString();
    const { error } = await supabase.from("sos_alerts").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  }

  const open = alerts.filter((a) => a.status !== "Resolved");
  const resolved = alerts.filter((a) => a.status === "Resolved");

  return (
    <div className="mx-auto grid max-w-7xl gap-6 p-4 md:p-8 lg:grid-cols-5">
      <Card className="border-[color:var(--red)]/40 bg-surface p-6 lg:col-span-2">
        <h1 className="flex items-center gap-2 text-xl font-bold text-[color:var(--red)]"><Siren className="h-5 w-5" /> Raise SOS</h1>
        <p className="mt-1 text-sm text-muted-foreground">Escalate something that needs immediate leadership attention.</p>
        <form onSubmit={raise} className="mt-6 space-y-4">
          <div>
            <Label className="mb-2 block">Severity</Label>
            <div className="flex gap-2">
              {SEVERITY.map((s) => (
                <button key={s} type="button" onClick={() => setSeverity(s)} className={`rounded-md px-3 py-1.5 text-sm transition ${severity === s ? "ring-2 ring-primary" : "opacity-60 hover:opacity-100"}`}>
                  <StatusPill status={sevColor(s)} label={s} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="mb-2 block">Category</Label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY.map((c) => (
                <button key={c} type="button" onClick={() => setCategory(c)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${category === c ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="desc">What's happening?</Label>
            <Textarea id="desc" required rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="owner">Suggested owner</Label>
            <Input id="owner" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Who should drive resolution?" />
          </div>
          <div>
            <Label htmlFor="action">Recommended action</Label>
            <Textarea id="action" rows={2} value={action} onChange={(e) => setAction(e.target.value)} />
          </div>
          <Button type="submit" variant="destructive" disabled={submitting} className="w-full">
            {submitting ? "Raising…" : "Raise SOS"}
          </Button>
        </form>
      </Card>

      <div className="space-y-6 lg:col-span-3">
        <Card className="border-border bg-surface p-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Open ({open.length})</h2>
          {open.length === 0 ? (
            <div className="mt-4 text-sm text-muted-foreground">No open alerts. 👌</div>
          ) : (
            <ul className="mt-4 space-y-3">
              {open.map((a) => (
                <li key={a.id} className="rounded-md border border-border bg-surface-hover/40 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={sevColor(a.severity)} label={a.severity} />
                    <span className="text-sm font-bold">{a.category}</span>
                    <StatusPill status={a.status === "Acknowledged" ? "Yellow" : "Red"} label={a.status} />
                    <span className="ml-auto text-xs text-muted-foreground">{a.submitter_name} • {relativeTime(a.created_at)}</span>
                  </div>
                  <div className="mt-2 text-sm">{a.description}</div>
                  {a.owner_name && <div className="mt-1 text-xs"><span className="text-muted-foreground">Owner:</span> {a.owner_name}</div>}
                  {a.recommended_action && <div className="mt-1 text-xs"><span className="text-muted-foreground">Action:</span> {a.recommended_action}</div>}
                  {isLeadership && (
                    <div className="mt-3 flex gap-2">
                      {a.status === "Open" && <Button size="sm" variant="outline" onClick={() => setStatus(a.id, "Acknowledged")}>Acknowledge</Button>}
                      <Button size="sm" onClick={() => setStatus(a.id, "Resolved")}>Resolve</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {resolved.length > 0 && (
          <Card className="border-border bg-surface p-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Resolved ({resolved.length})</h2>
            <ul className="mt-4 space-y-2">
              {resolved.slice(0, 10).map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-hover/20 px-3 py-2 text-sm">
                  <StatusPill status="Green" label="Resolved" />
                  <span className="font-medium">{a.category}</span>
                  <span className="text-muted-foreground truncate flex-1">{a.description}</span>
                  <span className="text-xs text-muted-foreground">{relativeTime(a.resolved_at ?? a.created_at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
