import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { PageGate } from "@/components/war-room/PageGate";
import { relativeTime } from "@/lib/time";

export const Route = createFileRoute("/_authenticated/issues")({
  head: () => ({ meta: [{ title: "Team Signals — Athena Command" }] }),
  component: () => <PageGate page="escalations"><TeamSignals /></PageGate>,
});

const CARD = "rounded-lg border border-border/60 bg-card p-4 space-y-1";
const LABEL_SM = "text-[10px] font-bold uppercase tracking-widest text-muted-foreground";

function StatusBadge({ value, map }: { value: string; map: Record<string, string> }) {
  const cls = map[value] ?? "border-border text-muted-foreground bg-muted/30";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{value}</span>;
}

const HEALTH_MAP: Record<string, string> = {
  Green: "border-emerald-500/40 text-emerald-400 bg-emerald-500/8",
  Yellow: "border-amber-500/40 text-amber-400 bg-amber-500/8",
  Red: "border-red-500/40 text-red-400 bg-red-500/8",
};
const SEV_MAP: Record<string, string> = {
  Red: "border-red-500/40 text-red-400 bg-red-500/8",
  Orange: "border-orange-500/40 text-orange-400 bg-orange-500/8",
  Yellow: "border-amber-500/40 text-amber-400 bg-amber-500/8",
};
const QUALITY_MAP: Record<string, string> = {
  Strong: "border-emerald-500/40 text-emerald-400 bg-emerald-500/8",
  Good: "border-blue-500/40 text-blue-400 bg-blue-500/8",
  "Needs Work": "border-amber-500/40 text-amber-400 bg-amber-500/8",
  "At Risk": "border-red-500/40 text-red-400 bg-red-500/8",
};
const CONF_LABELS: Record<number, string> = { 1: "Not Started", 2: "Outline Only", 3: "Draft In Progress", 4: "Nearly Final", 5: "Complete" };

function TeamSignals() {
  const { engagement, canEdit } = useEngagement();
  const { user } = useSession();
  const eid = engagement?.id ?? "";
  const canWrite = canEdit("escalations");

  const [huddles, setHuddles] = useState<any[]>([]);
  const [sos, setSos] = useState<any[]>([]);
  const [support, setSupport] = useState<any[]>([]);

  async function load() {
    if (!eid) return;
    const [h, s, sup] = await Promise.all([
      supabase.from("huddles").select("*").eq("engagement_id", eid).order("created_at", { ascending: false }),
      supabase.from("sos_alerts").select("*").eq("engagement_id", eid).order("created_at", { ascending: false }),
      supabase.from("support_requests").select("*").eq("engagement_id", eid).order("created_at", { ascending: false }),
    ]);
    setHuddles(h.data ?? []);
    setSos(s.data ?? []);
    setSupport(sup.data ?? []);
  }

  useEffect(() => { load(); }, [eid]);
  if (!engagement) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Signals</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Operational signals for {engagement.name}</p>
      </div>
      <Tabs defaultValue="daily" className="w-full">
        <TabsList className="flex h-auto flex-wrap gap-1 bg-transparent p-0 mb-6">
          {[
            ["daily", `Daily Signal (${huddles.length})`],
            ["escalations", `Escalations (${(sos.filter((s:any) => s.status !== "Resolved").length + support.filter((s:any) => s.status !== "Resolved").length)})`],
          ].map(([v, l]) => (
            <TabsTrigger key={v} value={v}
              className="rounded-md border border-border/40 bg-card px-3 py-1.5 text-xs font-medium data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-primary/8">
              {l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="daily"><DailyTab eid={eid} items={huddles} canWrite={canWrite} onSaved={load} user={user} /></TabsContent>
        <TabsContent value="escalations"><EscalationsTab eid={eid} sos={sos} support={support} canWrite={canWrite} onSaved={load} user={user} /></TabsContent>
      </Tabs>
    </div>
  );
}


// ── Escalations Tab (SOS + Support Requests combined) ────────────
function EscalationsTab({ eid, sos, support, canWrite, onSaved, user }: any) {
  const [mode, setMode] = useState<"sos"|"support">("sos");
  const [sev, setSev] = useState("Orange");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState("");
  const [submitter, setSubmitter] = useState("");
  const [needed, setNeeded] = useState("");
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  async function save() {
    if (!desc.trim()) { toast.error("Description required"); return; }
    setSaving(true);
    if (mode === "sos") {
      await supabase.from("sos_alerts").insert({ engagement_id: eid, category: cat||"Other", severity: sev, description: desc, status: "Open", submitted_by: submitter||"Team", created_by: user?.id });
    } else {
      await supabase.from("support_requests").insert({ engagement_id: eid, submitted_by: submitter||"Team", category: cat||"General", priority: sev==="Red"?"High":"Normal", description: desc, what_is_needed: needed, status: "Open", created_by: user?.id });
    }
    setSaving(false); toast.success("Submitted"); setDesc(""); setNeeded(""); setCat(""); setOpen(false); onSaved();
  }

  const activeSos = sos.filter((s:any) => s.status !== "Resolved");
  const activeSupport = support.filter((s:any) => s.status !== "Resolved");

  async function resolveSos(id: string) { await supabase.from("sos_alerts").update({ status: "Resolved" }).eq("id", id); onSaved(); }
  async function resolveSupport(id: string) { await supabase.from("support_requests").update({ status: "Resolved" }).eq("id", id); onSaved(); }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">SOS = urgent, needs immediate leadership attention. Support = non-urgent request for help or resources.</p>
        <Button size="sm" onClick={() => setOpen(v => !v)}>+ Raise Escalation</Button>
      </div>

      {open && (
        <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
          <div className="flex gap-2">
            {[["sos","🚨 SOS — Urgent"],["support","🙋 Support Request"]].map(([v,l]) => (
              <button key={v} type="button" onClick={() => setMode(v as any)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${mode===v?(v==="sos"?"border-red-500 text-red-400 bg-red-500/10":"border-primary text-primary bg-primary/8"):"border-border text-muted-foreground"}`}>{l}</button>
            ))}
          </div>
          {mode === "sos" && (
            <div className="flex gap-2">{["Yellow","Orange","Red"].map(s => (
              <button key={s} type="button" onClick={() => setSev(s)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${sev===s ? SEV_MAP[s] : "border-border text-muted-foreground"}`}>{s}</button>
            ))}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input value={submitter} onChange={e=>setSubmitter(e.target.value)} placeholder="Submitted by" />
            <Input value={cat} onChange={e=>setCat(e.target.value)} placeholder={mode==="sos"?"Category (optional)":"Category"} />
          </div>
          <Textarea value={desc} onChange={e=>setDesc(e.target.value)} placeholder={mode==="sos"?"Describe the urgent issue *":"What do you need help with? *"} rows={2} />
          {mode === "support" && <Input value={needed} onChange={e=>setNeeded(e.target.value)} placeholder="What specifically is needed?" />}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" variant={mode==="sos"?"destructive":"default"} onClick={save} disabled={saving}>{saving?"Submitting…":mode==="sos"?"Submit SOS":"Submit Request"}</Button>
          </div>
        </div>
      )}

      {activeSos.length === 0 && activeSupport.length === 0 && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-center text-sm text-emerald-400">✅ ✅ No open issues. Use this tab when something needs immediate leadership attention.</div>
      )}

      {activeSos.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">🚨 SOS — Active ({activeSos.length})</div>
          {activeSos.map((i:any) => (
            <div key={i.id} className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 mb-2 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge value={i.severity} map={SEV_MAP} />
                {i.category && <span className="text-xs text-muted-foreground">{i.category}</span>}
                <span className="ml-auto text-xs text-muted-foreground">{i.submitted_by} · {relativeTime(i.created_at)}</span>
              </div>
              <p className="text-sm">{i.description}</p>
              <Button size="sm" variant="ghost" onClick={() => resolveSos(i.id)}>Mark Resolved</Button>
            </div>
          ))}
        </div>
      )}

      {activeSupport.length > 0 && (
        <div className={activeSos.length > 0 ? "mt-4" : ""}>
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">🙋 Support Requests — Open ({activeSupport.length})</div>
          {activeSupport.map((i:any) => (
            <div key={i.id} className={CARD + " mb-2"}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">{i.category}</span>
                {i.priority==="High" && <StatusBadge value="High" map={{ High:"border-orange-500/40 text-orange-400 bg-orange-500/8" }} />}
                <span className="ml-auto text-xs text-muted-foreground">{i.submitted_by} · {relativeTime(i.created_at)}</span>
              </div>
              <p className="text-sm">{i.description}</p>
              {i.what_is_needed && <p className="text-xs text-muted-foreground">Needs: {i.what_is_needed}</p>}
              <Button size="sm" variant="ghost" onClick={() => resolveSupport(i.id)}>Resolve</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DailyTab({ eid, items, canWrite, onSaved, user }: any) {
  const [health, setHealth] = useState("Green"); const [priority, setPriority] = useState("");
  const [risk, setRisk] = useState(""); const [client, setClient] = useState("");
  const [leadership, setLeadership] = useState(false); const [notes, setNotes] = useState("");
  const [submitter, setSubmitter] = useState(""); const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  async function save() {
    if (!priority.trim()) { toast.error("Priority is required"); return; }
    setSaving(true);
    const { error } = await supabase.from("huddles").insert({ engagement_id: eid, health, priority, risk, client_concern: client, leadership_needed: leadership, notes, submitter_name: submitter || "Team", created_by: user?.id });
    if (error) { toast.error("Failed to save"); setSaving(false); return; }
    await supabase.from("engagements").update({ health }).eq("id", eid);
    setSaving(false); toast.success("Signal submitted"); setPriority(""); setRisk(""); setClient(""); setNotes(""); setOpen(false); onSaved();
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Daily team check-ins. Submit once per day.</p><Button size="sm" onClick={() => setOpen(v => !v)}>📡 New Signal</Button></div>
      {open && (
        <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className={LABEL_SM}>Submitted By</Label><Input value={submitter} onChange={e => setSubmitter(e.target.value)} placeholder="Your name" /></div>
            <div><Label className={LABEL_SM}>Overall Health</Label>
              <div className="flex gap-2 mt-1">{["Green","Yellow","Red"].map(h => (<button key={h} type="button" onClick={() => setHealth(h)} className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${health===h ? (h==="Green"?"border-emerald-500 text-emerald-400 bg-emerald-500/10":h==="Yellow"?"border-amber-500 text-amber-400 bg-amber-500/10":"border-red-500 text-red-400 bg-red-500/10") : "border-border text-muted-foreground"}`}>{h}</button>))}</div>
            </div>
          </div>
          <div><Label className={LABEL_SM}>Priority Today *</Label><Textarea value={priority} onChange={e => setPriority(e.target.value)} placeholder="What must get done today?" rows={2} /></div>
          <div><Label className={LABEL_SM}>Biggest Risk</Label><Textarea value={risk} onChange={e => setRisk(e.target.value)} placeholder="What could go wrong?" rows={2} /></div>
          <div><Label className={LABEL_SM}>Client Concern</Label><Input value={client} onChange={e => setClient(e.target.value)} placeholder="Any client-related concerns?" /></div>
          <div className="flex items-center gap-2"><input type="checkbox" id="leadership" checked={leadership} onChange={e => setLeadership(e.target.checked)} className="rounded" /><label htmlFor="leadership" className="text-sm">Leadership attention needed</label></div>
          <div className="flex gap-2 justify-end"><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Submit Signal"}</Button></div>
        </div>
      )}
      {items.length === 0 ? <Empty>Submit a signal to let leadership know where things stand. Takes 30 seconds.</Empty> : items.map((h: any) => (
        <div key={h.id} className={CARD}>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge value={h.health} map={HEALTH_MAP} />
            <span className="text-xs text-muted-foreground">{h.submitter_name} · {relativeTime(h.created_at)}</span>
            {h.leadership_needed && <span className="text-xs font-semibold text-amber-400">👋 Leadership Needed</span>}
          </div>
          {h.priority && <p className="text-sm"><span className="font-medium">Priority: </span>{h.priority}</p>}
          {h.risk && <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground/70">Risk: </span>{h.risk}</p>}
          {h.client_concern && <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground/70">Client: </span>{h.client_concern}</p>}
        </div>
      ))}
    </div>
  );
}

// ── SOS Tab ───────────────────────────────────────────────────────
