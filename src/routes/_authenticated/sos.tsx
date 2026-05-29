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
import { Siren, ShieldCheck } from "lucide-react";
import { notifySlack } from "@/lib/api/slack.functions";
import { EmptyState } from "@/components/war-room/EmptyState";
import { ConfirmAction } from "@/components/war-room/ConfirmAction";

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
    toast.success("🚨 SOS Alert submitted. Leadership has been notified.");
    notifySlack({
      data: {
        engagementId: engagement.id,
        event: "sos",
        title: `[${severity}] ${category}`,
        body: description,
        fields: [
          ...(owner ? [{ label: "Owner", value: owner }] : []),
          ...(action ? [{ label: "Action", value: action }] : []),
        ],
        author: member.display_name,
      },
    }).catch(() => {});
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
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">SOS Alerts</h1>
        <p className="mt-1 text-sm text-muted-foreground">Escalate urgent issues that need immediate leadership attention.</p>
      </div>

      {/* Top banner — visible whenever there are open alerts */}
      {open.length > 0 && (
        <div className="rounded-xl border border-[color:var(--red)]/40 bg-[color:color-mix(in_oklab,var(--red)_14%,transparent)] px-5 py-3 glow-red">
          <div className="flex items-center gap-3">
            <Siren className="h-5 w-5 text-[color:var(--red)]" />
            <span className="text-sm font-bold uppercase tracking-wide text-[color:var(--red)]">
              🚨 {open.length} alert{open.length > 1 ? "s" : ""} require attention
            </span>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
      <Card className="border-[color:var(--red)]/40 bg-surface p-6 lg:col-span-2">
        <h2 className="flex items-center gap-2 text-xl font-bold text-[color:var(--red)]"><Siren className="h-5 w-5" /> Raise SOS</h2>
        <p className="mt-1 text-sm text-muted-foreground">Takes less than 30 seconds. Required fields marked with <span className="text-[color:var(--red)]">*</span></p>
        <form onSubmit={raise} className="mt-6 space-y-4">
          <div>
            <Label className="mb-2 block">Severity <span className="text-[color:var(--red)]">*</span></Label>
            <div className="grid grid-cols-3 gap-2">
              {SEVERITY.map((s) => {
                const color = sevColor(s);
                const cssVar = color === "Red" ? "--red" : color === "Orange" ? "--orange" : "--yellow";
                const active = severity === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeverity(s)}
                    className={`flex flex-col items-center justify-center rounded-lg border-2 px-3 py-4 text-sm font-bold uppercase tracking-wide transition ${
                      active
                        ? `border-[color:var(${cssVar})] bg-[color:color-mix(in_oklab,var(${cssVar})_20%,transparent)] text-[color:var(${cssVar})] ring-2 ring-[color:var(${cssVar})]/40`
                        : "border-border opacity-70 hover:opacity-100"
                    }`}
                  >
                    <span className="text-xl">{s === "Critical" ? "🔴" : s === "High" ? "🟠" : "🟡"}</span>
                    <span className="mt-1">{s}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label className="mb-2 block">Category <span className="text-[color:var(--red)]">*</span></Label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY.map((c) => (
                <button key={c} type="button" onClick={() => setCategory(c)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${category === c ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="desc">What's happening? <span className="text-[color:var(--red)]">*</span></Label>
            <Textarea id="desc" required rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what's wrong in plain language — who, what, when, impact." />
          </div>
          <div>
            <Label htmlFor="owner">Suggested owner</Label>
            <Input id="owner" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Who should drive resolution?" />
          </div>
          <div>
            <Label htmlFor="action">Recommended action</Label>
            <Textarea id="action" rows={2} value={action} onChange={(e) => setAction(e.target.value)} placeholder="What should leadership do right now?" />
          </div>
          <Button type="submit" variant="destructive" disabled={submitting || !description.trim()} className="w-full">
            {submitting ? "Raising…" : "🚨 Raise SOS"}
          </Button>
        </form>
      </Card>
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
            <EmptyState
              icon={ShieldCheck}
              title="All clear"
              description="No open SOS alerts right now. If something urgent comes up, raise an SOS from the form on the left."
              className="mt-4"
            />
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
                      <ConfirmAction
                        trigger={<Button size="sm">Resolve</Button>}
                        title="Resolve this SOS alert?"
                        description="Mark this alert as resolved. It will move to the resolved list and stop appearing on the Command Center banner."
                        confirmLabel="Resolve alert"
                        onConfirm={() => setStatus(a.id, "Resolved")}
                      />
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
    </div>
  );
}
