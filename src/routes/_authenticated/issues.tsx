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
  head: () => ({ meta: [{ title: "Signals — Athena" }] }),
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
  const [quality, setQuality] = useState<any[]>([]);
  const [confidence, setConfidence] = useState<any[]>([]);
  const [resourceHealth, setResourceHealth] = useState<any[]>([]);

  async function load() {
    if (!eid) return;
    const [h, s, sup, q, c, rh] = await Promise.all([
      supabase.from("huddles").select("*").eq("engagement_id", eid).order("created_at", { ascending: false }),
      supabase.from("sos_alerts").select("*").eq("engagement_id", eid).order("created_at", { ascending: false }),
      supabase.from("support_requests").select("*").eq("engagement_id", eid).order("created_at", { ascending: false }),
      supabase.from("quality_signals").select("*").eq("engagement_id", eid).order("created_at", { ascending: false }),
      supabase.from("writer_confidence").select("*").eq("engagement_id", eid).order("created_at", { ascending: false }),
      supabase.from("resource_health").select("*").eq("engagement_id", eid).order("created_at", { ascending: false }),
    ]);
    setHuddles(h.data ?? []);
    setSos(s.data ?? []);
    setSupport(sup.data ?? []);
    setQuality(q.data ?? []);
    setConfidence(c.data ?? []);
    setResourceHealth(rh.data ?? []);
  }

  useEffect(() => { load(); }, [eid]);
  if (!engagement) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Signals</h1>
        <p className="text-sm text-muted-foreground mt-0.5">How the team is doing on {engagement.name}</p>
      </div>
      <Tabs defaultValue="daily" className="w-full">
        <TabsList className="flex h-auto flex-wrap gap-1 bg-transparent p-0 mb-6">
          {[
            ["daily", `Daily Signal (${huddles.length})`],
            ["escalations", `Issues (${(sos.filter((s:any) => s.status !== "Resolved").length + support.filter((s:any) => s.status !== "Resolved").length)})`],
            ["quality", "Section Status"],
            ["resource", "Team Health"],
          ].map(([v, l]) => (
            <TabsTrigger key={v} value={v}
              className="rounded-md border border-border/40 bg-card px-3 py-1.5 text-xs font-medium data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-primary/8">
              {l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="daily"><DailyTab eid={eid} items={huddles} canWrite={canWrite} onSaved={load} user={user} /></TabsContent>
        <TabsContent value="escalations"><EscalationsTab eid={eid} sos={sos} support={support} canWrite={canWrite} onSaved={load} user={user} /></TabsContent>
        <TabsContent value="quality"><QualityConfidenceTab eid={eid} quality={quality} confidence={confidence} canWrite={true} onSaved={load} user={user} /></TabsContent>
        <TabsContent value="resource"><ResourceTab eid={eid} items={resourceHealth} canWrite={canWrite} onSaved={load} user={user} /></TabsContent>
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

// ── Quality & Confidence Tab (combined) ───────────────────────────
function QualityConfidenceTab({ eid, quality, confidence, canWrite, onSaved, user }: any) {
  const [section, setSection] = useState<"quality"|"confidence">("confidence");
  const [sectionName, setSectionName] = useState("");
  const [submitter, setSubmitter] = useState("");
  const [rating, setRating] = useState("Good");
  const [conf, setConf] = useState(3);
  const [notes, setNotes] = useState("");
  const [flag, setFlag] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  async function save() {
    if (!sectionName.trim()) { toast.error("Section name required"); return; }
    setSaving(true);
    if (section === "quality") {
      await supabase.from("quality_signals").insert({ engagement_id: eid, section_name: sectionName, submitted_by: submitter||"Team", quality: rating, notes, leadership_needed: flag, created_by: user?.id });
    } else {
      await supabase.from("writer_confidence").insert({ engagement_id: eid, writer: submitter||"Team", section_name: sectionName, confidence: conf, notes, needs_help: flag, created_by: user?.id });
    }
    setSaving(false); toast.success("Saved"); setSectionName(""); setNotes(""); setOpen(false); onSaved();
  }

  // Latest confidence per section
  const confBySection: Record<string,any> = {};
  confidence.forEach((c:any) => { if (!confBySection[c.section_name] || c.created_at > confBySection[c.section_name].created_at) confBySection[c.section_name] = c; });
  const confSections = Object.values(confBySection).sort((a:any,b:any) => a.confidence - b.confidence);

  const qualitySorted = [...quality].sort((a:any,b:any) => ["At Risk","Needs Work","Good","Strong"].indexOf(a.quality) - ["At Risk","Needs Work","Good","Strong"].indexOf(b.quality));

  const confColor = (c: number) => c <= 2 ? "border-red-500/40 text-red-400" : c === 3 ? "border-amber-500/40 text-amber-400" : "border-emerald-500/40 text-emerald-400";
  const CONF_LABELS: Record<number,string> = { 1:"Not Started", 2:"Outline Only", 3:"Draft", 4:"Nearly Final", 5:"Complete" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Writer confidence ratings and quality flags by section.</p>
        <Button size="sm" onClick={() => setOpen(v => !v)}>+ Log</Button>
      </div>

      {open && (
        <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
          <div className="flex gap-2">
            {[["confidence","Writer Confidence"],["quality","Quality Flag"]].map(([v,l]) => (
              <button key={v} type="button" onClick={() => setSection(v as any)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${section===v?"border-primary text-primary bg-primary/8":"border-border text-muted-foreground"}`}>{l}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input value={sectionName} onChange={e=>setSectionName(e.target.value)} placeholder="Section name *" />
            <Input value={submitter} onChange={e=>setSubmitter(e.target.value)} placeholder={section==="confidence"?"Writer name":"Submitted by"} />
          </div>
          {section === "confidence" ? (
            <div><Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{conf} — {CONF_LABELS[conf]}</Label><input type="range" min={1} max={5} value={conf} onChange={e=>setConf(+e.target.value)} className="w-full mt-1" /></div>
          ) : (
            <div className="flex gap-2">{["Strong","Good","Needs Work","At Risk"].map(q=>(
              <button key={q} type="button" onClick={()=>setRating(q)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${rating===q?QUALITY_MAP[q]:"border-border text-muted-foreground"}`}>{q}</button>
            ))}</div>
          )}
          <Textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} />
          <div className="flex items-center gap-2"><input type="checkbox" checked={flag} onChange={e=>setFlag(e.target.checked)} className="rounded" /><label className="text-sm">{section==="confidence"?"I need help":"Leadership attention needed"}</label></div>
          <div className="flex gap-2 justify-end"><Button variant="ghost" size="sm" onClick={()=>setOpen(false)}>Cancel</Button><Button size="sm" onClick={save} disabled={saving}>{saving?"Saving…":"Save"}</Button></div>
        </div>
      )}

      {confSections.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Writer Confidence by Section</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {confSections.map((s:any) => (
              <div key={s.section_name} className={`rounded-lg border p-3 bg-card ${confColor(s.confidence)}`}>
                <div className="flex items-center justify-between mb-0.5"><span className="text-sm font-semibold">{s.section_name}</span><span className="text-lg font-bold">{s.confidence}/5</span></div>
                <div className="text-xs">{CONF_LABELS[s.confidence]}</div>
                {s.needs_help && <div className="text-xs mt-1 text-amber-400">🙋 Needs help</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {qualitySorted.length > 0 && (
        <div className={confSections.length > 0 ? "mt-4" : ""}>
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Quality Flags</div>
          {qualitySorted.map((i:any) => (
            <div key={i.id} className={CARD + " mb-2"}>
              <div className="flex items-center gap-2"><span className="font-medium text-sm">{i.section_name}</span><StatusBadge value={i.quality} map={QUALITY_MAP} />{i.leadership_needed&&<span className="text-xs text-amber-400">👋</span>}<span className="ml-auto text-xs text-muted-foreground">{i.submitted_by}</span></div>
              {i.notes&&<p className="text-xs text-muted-foreground">{i.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {confSections.length === 0 && qualitySorted.length === 0 && <Empty>Writers rate their own sections. Reviewers flag quality concerns. Both show here.</Empty>}
    </div>
  );
}

// ── Daily Signals ─────────────────────────────────────────────────
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
function SosTab({ eid, items, canWrite, onSaved, user }: any) {
  const [cat, setCat] = useState(""); const [sev, setSev] = useState("Orange");
  const [desc, setDesc] = useState(""); const [action, setAction] = useState("");
  const [owner, setOwner] = useState(""); const [submitter, setSubmitter] = useState("");
  const [saving, setSaving] = useState(false); const [open, setOpen] = useState(false);
  const cats = ["Writer Issue","SME Issue","Client Issue","Scope Issue","Timeline Issue","Compliance Issue","Other"];
  async function save() {
    if (!desc.trim()) { toast.error("Description required"); return; }
    setSaving(true);
    const { error } = await supabase.from("sos_alerts").insert({ engagement_id: eid, category: cat || "Other", severity: sev, description: desc, recommended_action: action, owner_name: owner, status: "Open", submitted_by: submitter || "Team", created_by: user?.id });
    setSaving(false);
    if (error) { toast.error("Failed"); return; }
    toast.success("SOS submitted"); setDesc(""); setAction(""); setOwner(""); setOpen(false); onSaved();
  }
  async function resolve(id: string) {
    await supabase.from("sos_alerts").update({ status: "Resolved" }).eq("id", id);
    onSaved();
  }
  const open_items = items.filter((i: any) => i.status !== "Resolved");
  const resolved = items.filter((i: any) => i.status === "Resolved");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Urgent escalations requiring immediate leadership attention.</p><Button size="sm" variant="destructive" onClick={() => setOpen(v => !v)}>🚨 Raise SOS</Button></div>
      {open && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3"><div><Label className={LABEL_SM}>Submitted By</Label><Input value={submitter} onChange={e => setSubmitter(e.target.value)} /></div><div><Label className={LABEL_SM}>Category</Label><select className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={cat} onChange={e => setCat(e.target.value)}><option value="">Select…</option>{cats.map(c => <option key={c}>{c}</option>)}</select></div></div>
          <div><Label className={LABEL_SM}>Severity</Label><div className="flex gap-2 mt-1">{["Yellow","Orange","Red"].map(s => (<button key={s} type="button" onClick={() => setSev(s)} className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${sev===s ? SEV_MAP[s] : "border-border text-muted-foreground"}`}>{s}</button>))}</div></div>
          <div><Label className={LABEL_SM}>Description *</Label><Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} /></div>
          <div><Label className={LABEL_SM}>Recommended Action</Label><Textarea value={action} onChange={e => setAction(e.target.value)} rows={2} /></div>
          <div><Label className={LABEL_SM}>Owner</Label><Input value={owner} onChange={e => setOwner(e.target.value)} /></div>
          <div className="flex gap-2 justify-end"><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" variant="destructive" onClick={save} disabled={saving}>{saving ? "Submitting…" : "Submit SOS"}</Button></div>
        </div>
      )}
      {open_items.length === 0 && <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-center text-sm text-emerald-400">✅ No active SOS alerts</div>}
      {open_items.map((i: any) => (
        <div key={i.id} className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap"><span className="text-xs font-bold text-red-400 uppercase">SOS</span><StatusBadge value={i.severity} map={SEV_MAP} />{i.category && <span className="text-xs text-muted-foreground">{i.category}</span>}<span className="ml-auto text-xs text-muted-foreground">{relativeTime(i.created_at)}</span></div>
          <p className="text-sm font-medium">{i.description}</p>
          {i.recommended_action && <p className="text-xs text-muted-foreground">Recommended: {i.recommended_action}</p>}
          {i.owner_name && <p className="text-xs text-muted-foreground">Owner: {i.owner_name}</p>}
          <Button size="sm" variant="ghost" onClick={() => resolve(i.id)}>Mark Resolved</Button>
        </div>
      ))}
      {resolved.length > 0 && <details className="text-sm text-muted-foreground cursor-pointer"><summary>{resolved.length} resolved</summary><div className="mt-2 space-y-2">{resolved.map((i: any) => (<div key={i.id} className={CARD+" opacity-50"}><p className="text-xs">{i.category} · {i.description.slice(0,80)}</p></div>))}</div></details>}
    </div>
  );
}

// ── Support Requests Tab ──────────────────────────────────────────
function SupportTab({ eid, items, canWrite, onSaved, user }: any) {
  const [submitter, setSubmitter] = useState(""); const [cat, setCat] = useState("");
  const [priority, setPriority] = useState("Normal"); const [desc, setDesc] = useState("");
  const [needed, setNeeded] = useState(""); const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  async function save() {
    if (!desc.trim()) { toast.error("Description required"); return; }
    setSaving(true);
    const { error } = await supabase.from("support_requests").insert({ engagement_id: eid, submitted_by: submitter || "Team", category: cat || "General", priority, description: desc, what_is_needed: needed, status: "Open", created_by: user?.id });
    setSaving(false);
    if (error) { toast.error("Failed"); return; }
    toast.success("Request submitted"); setDesc(""); setNeeded(""); setOpen(false); onSaved();
  }
  async function updateStatus(id: string, status: string) {
    await supabase.from("support_requests").update({ status }).eq("id", id);
    onSaved();
  }
  const open_items = items.filter((i: any) => i.status !== "Resolved");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Non-urgent requests for help, resources, or information.</p><Button size="sm" onClick={() => setOpen(v => !v)}>+ Submit Request</Button></div>
      {open && (
        <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3"><div><Label className={LABEL_SM}>Submitted By</Label><Input value={submitter} onChange={e => setSubmitter(e.target.value)} /></div><div><Label className={LABEL_SM}>Category</Label><Input value={cat} onChange={e => setCat(e.target.value)} placeholder="e.g. SME, Data, Review" /></div></div>
          <div><Label className={LABEL_SM}>Priority</Label><div className="flex gap-2 mt-1">{["Normal","High"].map(p => (<button key={p} type="button" onClick={() => setPriority(p)} className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${priority===p?"border-primary text-primary bg-primary/8":"border-border text-muted-foreground"}`}>{p}</button>))}</div></div>
          <div><Label className={LABEL_SM}>Description *</Label><Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} /></div>
          <div><Label className={LABEL_SM}>What Is Needed</Label><Textarea value={needed} onChange={e => setNeeded(e.target.value)} rows={2} /></div>
          <div className="flex gap-2 justify-end"><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Submit"}</Button></div>
        </div>
      )}
      {open_items.length === 0 ? <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-center text-sm text-emerald-400">✅ No open support requests</div> : open_items.map((i: any) => (
        <div key={i.id} className={CARD}>
          <div className="flex items-center gap-2 flex-wrap"><span className="text-xs font-medium text-muted-foreground">{i.category}</span>{i.priority === "High" && <StatusBadge value="High" map={{ High: "border-orange-500/40 text-orange-400 bg-orange-500/8" }} />}<span className="ml-auto text-xs text-muted-foreground">{relativeTime(i.created_at)}</span></div>
          <p className="text-sm">{i.description}</p>
          {i.what_is_needed && <p className="text-xs text-muted-foreground">Needs: {i.what_is_needed}</p>}
          <div className="flex gap-2 pt-1"><Button size="sm" variant="ghost" onClick={() => updateStatus(i.id, "In Progress")}>In Progress</Button><Button size="sm" variant="ghost" onClick={() => updateStatus(i.id, "Resolved")}>Resolve</Button></div>
        </div>
      ))}
    </div>
  );
}

// ── Quality Signals ───────────────────────────────────────────────
function QualityTab({ eid, items, canWrite, onSaved, user }: any) {
  const [section, setSection] = useState(""); const [submitter, setSubmitter] = useState("");
  const [quality, setQuality] = useState("Good"); const [notes, setNotes] = useState("");
  const [leadership, setLeadership] = useState(false);
  const [saving, setSaving] = useState(false); const [open, setOpen] = useState(false);
  async function save() {
    if (!section.trim()) { toast.error("Section name required"); return; }
    setSaving(true);
    const { error } = await supabase.from("quality_signals").insert({ engagement_id: eid, section_name: section, submitted_by: submitter || "Team", quality, notes, leadership_needed: leadership, created_by: user?.id });
    setSaving(false);
    if (error) { toast.error("Failed"); return; }
    toast.success("Quality signal submitted"); setSection(""); setNotes(""); setOpen(false); onSaved();
  }
  const sorted = [...items].sort((a, b) => { const o = ["At Risk","Needs Work","Good","Strong"]; return o.indexOf(a.quality) - o.indexOf(b.quality); });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Flag content quality issues by section. At Risk items appear on Mission Control.</p><Button size="sm" onClick={() => setOpen(v => !v)}>+ Quality Signal</Button></div>
      {open && (
        <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3"><div><Label className={LABEL_SM}>Section Name *</Label><Input value={section} onChange={e => setSection(e.target.value)} placeholder="e.g. LTSS Narrative" /></div><div><Label className={LABEL_SM}>Submitted By</Label><Input value={submitter} onChange={e => setSubmitter(e.target.value)} /></div></div>
          <div><Label className={LABEL_SM}>Quality Rating</Label><div className="flex gap-2 mt-1">{["Strong","Good","Needs Work","At Risk"].map(q => (<button key={q} type="button" onClick={() => setQuality(q)} className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${quality===q ? QUALITY_MAP[q] : "border-border text-muted-foreground"}`}>{q}</button>))}</div></div>
          <div><Label className={LABEL_SM}>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
          <div className="flex items-center gap-2"><input type="checkbox" checked={leadership} onChange={e => setLeadership(e.target.checked)} className="rounded" /><label className="text-sm">Leadership attention needed</label></div>
          <div className="flex gap-2 justify-end"><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Submit"}</Button></div>
        </div>
      )}
      {sorted.length === 0 ? <Empty>No quality signals yet.</Empty> : sorted.map((i: any) => (
        <div key={i.id} className={CARD}>
          <div className="flex items-center gap-2"><span className="font-medium text-sm">{i.section_name}</span><StatusBadge value={i.quality} map={QUALITY_MAP} />{i.leadership_needed && <span className="text-xs text-amber-400">👋 Leadership</span>}<span className="ml-auto text-xs text-muted-foreground">{i.submitted_by} · {relativeTime(i.created_at)}</span></div>
          {i.notes && <p className="text-xs text-muted-foreground">{i.notes}</p>}
        </div>
      ))}
    </div>
  );
}

// ── Writer Confidence ─────────────────────────────────────────────
function ConfidenceTab({ eid, items, canWrite, onSaved, user }: any) {
  const [writer, setWriter] = useState(""); const [section, setSection] = useState("");
  const [conf, setConf] = useState(3); const [notes, setNotes] = useState("");
  const [needsHelp, setNeedsHelp] = useState(false);
  const [saving, setSaving] = useState(false); const [open, setOpen] = useState(false);
  async function save() {
    if (!section.trim()) { toast.error("Section name required"); return; }
    setSaving(true);
    const { error } = await supabase.from("writer_confidence").insert({ engagement_id: eid, writer: writer || "Team", section_name: section, confidence: conf, notes, needs_help: needsHelp, created_by: user?.id });
    setSaving(false);
    if (error) { toast.error("Failed"); return; }
    toast.success("Confidence logged"); setSection(""); setNotes(""); setOpen(false); onSaved();
  }
  // Latest per section
  const bySection: Record<string, any> = {};
  items.forEach((i: any) => { if (!bySection[i.section_name] || i.created_at > bySection[i.section_name].created_at) bySection[i.section_name] = i; });
  const sections = Object.values(bySection).sort((a: any, b: any) => a.confidence - b.confidence);
  const confColor = (c: number) => c <= 2 ? "border-red-500/40 text-red-400 bg-red-500/8" : c === 3 ? "border-amber-500/40 text-amber-400 bg-amber-500/8" : "border-emerald-500/40 text-emerald-400 bg-emerald-500/8";
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Writers rate their progress on each section. 1=Not Started → 5=Complete.</p><Button size="sm" onClick={() => setOpen(v => !v)}>+ Log Confidence</Button></div>
      {open && (
        <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3"><div><Label className={LABEL_SM}>Writer</Label><Input value={writer} onChange={e => setWriter(e.target.value)} /></div><div><Label className={LABEL_SM}>Section *</Label><Input value={section} onChange={e => setSection(e.target.value)} placeholder="e.g. LTSS Narrative" /></div></div>
          <div><Label className={LABEL_SM}>Confidence: {conf} — {CONF_LABELS[conf]}</Label><input type="range" min={1} max={5} value={conf} onChange={e => setConf(+e.target.value)} className="w-full mt-1" /></div>
          <div><Label className={LABEL_SM}>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
          <div className="flex items-center gap-2"><input type="checkbox" checked={needsHelp} onChange={e => setNeedsHelp(e.target.checked)} className="rounded" /><label className="text-sm">I need help with this section</label></div>
          <div className="flex gap-2 justify-end"><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Log"}</Button></div>
        </div>
      )}
      {sections.length === 0 ? <Empty>No confidence ratings yet.</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((s: any) => (
            <div key={s.section_name} className={`rounded-lg border p-3 ${confColor(s.confidence)}`}>
              <div className="flex items-center justify-between mb-1"><span className="text-sm font-semibold">{s.section_name}</span><span className="text-lg font-bold">{s.confidence}/5</span></div>
              <div className="text-xs">{CONF_LABELS[s.confidence]}</div>
              {s.needs_help && <div className="text-xs mt-1">🙋 Needs help</div>}
              {s.writer && <div className="text-xs text-muted-foreground mt-1">{s.writer}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Mission Health (read-only aggregate) ──────────────────────────
function MissionHealthTab({ huddles, quality, sos, confidence, resourceHealth }: any) {
  const latestHuddle = huddles[0];
  const atRisk = quality.filter((q: any) => q.quality === "At Risk").length;
  const needsWork = quality.filter((q: any) => q.quality === "Needs Work").length;
  const activeSos = sos.filter((s: any) => s.status !== "Resolved").length;
  const avgConf = confidence.length > 0 ? (confidence.reduce((a: number, c: any) => a + c.confidence, 0) / confidence.length).toFixed(1) : null;
  const latestRH = resourceHealth[0];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Aggregated mission health from all signal types. Submit signals in other tabs to update this view.</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Current Health", value: latestHuddle?.health ?? "—", sub: latestHuddle ? `Last signal: ${relativeTime(latestHuddle.created_at)}` : "No signals yet" },
          { label: "Active SOS", value: activeSos, sub: activeSos > 0 ? "Requires immediate attention" : "All clear" },
          { label: "Quality At Risk", value: atRisk, sub: `${needsWork} needs work` },
          { label: "Writer Confidence Avg", value: avgConf ?? "—", sub: confidence.length > 0 ? `Across ${confidence.length} sections` : "No ratings yet" },
          { label: "Staffing", value: latestRH?.staffing ?? "—", sub: latestRH ? relativeTime(latestRH.created_at) : "No resource health logged" },
          { label: "SME Engagement", value: latestRH?.sme_engagement ?? "—", sub: latestRH?.timeline_status ? `Timeline: ${latestRH.timeline_status}` : "" },
        ].map(({ label, value, sub }) => (
          <div key={label} className="rounded-lg border border-border/60 bg-card p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-muted-foreground mt-1">{sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Resource Health ───────────────────────────────────────────────
function ResourceTab({ eid, items, canWrite, onSaved, user }: any) {
  const [submitter, setSubmitter] = useState(""); const [staffing, setStaffing] = useState("Adequate");
  const [sme, setSme] = useState("Good"); const [timeline, setTimeline] = useState("On Track");
  const [notes, setNotes] = useState(""); const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  async function save() {
    setSaving(true);
    const { error } = await supabase.from("resource_health").insert({ engagement_id: eid, submitted_by: submitter || "Team", staffing, sme_engagement: sme, timeline_status: timeline, notes, created_by: user?.id });
    setSaving(false);
    if (error) { toast.error("Failed"); return; }
    toast.success("Resource health logged"); setNotes(""); setOpen(false); onSaved();
  }
  const STATUS_MAP: Record<string, string> = {
    Adequate: "border-emerald-500/40 text-emerald-400 bg-emerald-500/8",
    "On Track": "border-emerald-500/40 text-emerald-400 bg-emerald-500/8",
    Good: "border-emerald-500/40 text-emerald-400 bg-emerald-500/8",
    Stretched: "border-amber-500/40 text-amber-400 bg-amber-500/8",
    Delayed: "border-amber-500/40 text-amber-400 bg-amber-500/8",
    "At Risk": "border-amber-500/40 text-amber-400 bg-amber-500/8",
    Critical: "border-red-500/40 text-red-400 bg-red-500/8",
    Missing: "border-red-500/40 text-red-400 bg-red-500/8",
    Behind: "border-red-500/40 text-red-400 bg-red-500/8",
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Track team staffing, SME engagement, and timeline health.</p>{canWrite && <Button size="sm" onClick={() => setOpen(v => !v)}>+ Log Resource Health</Button>}</div>
      {open && canWrite && (
        <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
          <div><Label className={LABEL_SM}>Submitted By</Label><Input value={submitter} onChange={e => setSubmitter(e.target.value)} /></div>
          <div><Label className={LABEL_SM}>Staffing Level</Label><div className="flex gap-2 mt-1">{["Adequate","Stretched","Critical"].map(s => (<button key={s} type="button" onClick={() => setStaffing(s)} className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${staffing===s ? STATUS_MAP[s] : "border-border text-muted-foreground"}`}>{s}</button>))}</div></div>
          <div><Label className={LABEL_SM}>SME Engagement</Label><div className="flex gap-2 mt-1">{["Good","Delayed","Missing"].map(s => (<button key={s} type="button" onClick={() => setSme(s)} className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${sme===s ? STATUS_MAP[s] : "border-border text-muted-foreground"}`}>{s}</button>))}</div></div>
          <div><Label className={LABEL_SM}>Timeline Status</Label><div className="flex gap-2 mt-1">{["On Track","At Risk","Behind"].map(s => (<button key={s} type="button" onClick={() => setTimeline(s)} className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${timeline===s ? STATUS_MAP[s] : "border-border text-muted-foreground"}`}>{s}</button>))}</div></div>
          <div><Label className={LABEL_SM}>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
          <div className="flex gap-2 justify-end"><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Log"}</Button></div>
        </div>
      )}
      {items.length === 0 ? <Empty>Track whether the team is properly staffed, SMEs are engaged, and the timeline is on track.</Empty> : items.map((i: any) => (
        <div key={i.id} className={CARD}>
          <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground"><span className="font-medium text-foreground">{i.submitted_by}</span><span>{relativeTime(i.created_at)}</span></div>
          <div className="flex gap-2 flex-wrap mt-1"><StatusBadge value={i.staffing} map={STATUS_MAP} /><StatusBadge value={i.sme_engagement} map={STATUS_MAP} /><StatusBadge value={i.timeline_status} map={STATUS_MAP} /></div>
          {i.notes && <p className="text-xs text-muted-foreground">{i.notes}</p>}
        </div>
      ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-border/40 p-10 text-center text-sm text-muted-foreground">{children}</div>;
}
