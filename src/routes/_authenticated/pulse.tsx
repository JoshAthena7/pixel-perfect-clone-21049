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

export const Route = createFileRoute("/_authenticated/pulse")({
  head: () => ({ meta: [{ title: "Alignment Hub — Athena" }] }),
  component: () => <PageGate page="pulse"><AlignmentHub /></PageGate>,
});

// ── helpers ──────────────────────────────────────────────────────
const CARD = "rounded-lg border border-border/60 bg-card p-4 space-y-1";
const SECTION = "mb-6";
const LABEL_SM = "text-[10px] font-bold uppercase tracking-widest text-muted-foreground";

function StatusBadge({ value, map }: { value: string; map: Record<string, string> }) {
  const cls = map[value] ?? "border-border text-muted-foreground bg-muted/30";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{value}</span>;
}

const CONFIDENCE_MAP: Record<string, string> = {
  Confirmed: "border-emerald-500/40 text-emerald-400 bg-emerald-500/8",
  Negotiating: "border-amber-500/40 text-amber-400 bg-amber-500/8",
  Exploring: "border-slate-500/40 text-slate-400 bg-slate-500/8",
};
const PRIORITY_MAP: Record<string, string> = {
  Critical: "border-red-500/40 text-red-400 bg-red-500/8",
  High: "border-orange-500/40 text-orange-400 bg-orange-500/8",
  Medium: "border-amber-500/40 text-amber-400 bg-amber-500/8",
  Low: "border-slate-500/40 text-slate-400 bg-slate-500/8",
};
const RELATIONSHIP_MAP: Record<string, string> = {
  Champion: "border-emerald-500/40 text-emerald-400 bg-emerald-500/8",
  Neutral: "border-amber-500/40 text-amber-400 bg-amber-500/8",
  Risk: "border-red-500/40 text-red-400 bg-red-500/8",
  Unknown: "border-slate-500/40 text-slate-400 bg-slate-500/8",
};
const ASSUMPTION_MAP: Record<string, string> = {
  High: "border-emerald-500/40 text-emerald-400 bg-emerald-500/8",
  Medium: "border-amber-500/40 text-amber-400 bg-amber-500/8",
  Low: "border-red-500/40 text-red-400 bg-red-500/8",
};

// ── main component ────────────────────────────────────────────────
function AlignmentHub() {
  const { engagement, canEdit } = useEngagement();
  const { user } = useSession();
  const canWrite = canEdit("pulse");
  const eid = engagement?.id ?? "";

  // data
  const [winThemes, setWinThemes] = useState<any[]>([]);
  const [differentiators, setDifferentiators] = useState<any[]>([]);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [assumptions, setAssumptions] = useState<any[]>([]);
  const [partnerships, setPartnerships] = useState<any[]>([]);
  const [terminology, setTerminology] = useState<any[]>([]);
  const [stakeholders, setStakeholders] = useState<any[]>([]);
  const [changes, setChanges] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  async function load() {
    if (!eid) return;
    const [wt, diff, dec, ass, part, term, stak, chg] = await Promise.all([
      supabase.from("win_themes").select("*").eq("engagement_id", eid).order("created_at", { ascending: false }),
      supabase.from("differentiators").select("*").eq("engagement_id", eid).order("created_at", { ascending: false }),
      supabase.from("decisions").select("*").eq("engagement_id", eid).order("decision_date", { ascending: false }),
      supabase.from("assumptions").select("*").eq("engagement_id", eid).order("created_at", { ascending: false }),
      supabase.from("partnerships").select("*").eq("engagement_id", eid).order("created_at", { ascending: false }),
      supabase.from("terminology").select("*").eq("engagement_id", eid).order("term"),
      supabase.from("stakeholders").select("*").eq("engagement_id", eid).order("priority"),
      supabase.from("change_tracker").select("*").eq("engagement_id", eid).order("created_at", { ascending: false }),
    ]);
    setWinThemes(wt.data ?? []);
    setDifferentiators(diff.data ?? []);
    setDecisions(dec.data ?? []);
    setAssumptions(ass.data ?? []);
    setPartnerships(part.data ?? []);
    setTerminology(term.data ?? []);
    setStakeholders(stak.data ?? []);
    setChanges(chg.data ?? []);
  }

  useEffect(() => { load(); }, [eid]);

  if (!engagement) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Alignment Hub</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Strategic alignment for {engagement.name}</p>
        </div>
      </div>

      <Tabs defaultValue="win-themes" className="w-full">
        <TabsList className="flex h-auto flex-wrap gap-1 bg-transparent p-0 mb-6">
          {[
            ["win-themes", "Win Themes"],
            ["differentiators", "Differentiators"],
            ["decisions", "Strategic Decisions"],
            ["assumptions", "Assumptions"],
            ["partnerships", "Partnerships"],
            ["terminology", "Terminology"],
            ["stakeholders", "Stakeholder Map"],
            ["changes", "Change Tracker"],
          ].map(([v, l]) => (
            <TabsTrigger key={v} value={v}
              className="rounded-md border border-border/40 bg-card px-3 py-1.5 text-xs font-medium data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-primary/8">
              {l}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* WIN THEMES */}
        <TabsContent value="win-themes">
          <WinThemesTab eid={eid} items={winThemes} canWrite={canWrite} onSaved={load} user={user} />
        </TabsContent>

        {/* DIFFERENTIATORS */}
        <TabsContent value="differentiators">
          <DifferentiatorsTab eid={eid} items={differentiators} canWrite={canWrite} onSaved={load} user={user} />
        </TabsContent>

        {/* STRATEGIC DECISIONS */}
        <TabsContent value="decisions">
          <DecisionsTab eid={eid} items={decisions} canWrite={canWrite} onSaved={load} user={user} />
        </TabsContent>

        {/* ASSUMPTIONS */}
        <TabsContent value="assumptions">
          <AssumptionsTab eid={eid} items={assumptions} canWrite={canWrite} onSaved={load} user={user} />
        </TabsContent>

        {/* PARTNERSHIPS */}
        <TabsContent value="partnerships">
          <PartnershipsTab eid={eid} items={partnerships} canWrite={canWrite} onSaved={load} user={user} />
        </TabsContent>

        {/* TERMINOLOGY */}
        <TabsContent value="terminology">
          <TerminologyTab eid={eid} items={terminology} canWrite={canWrite} onSaved={load} user={user} search={search} setSearch={setSearch} />
        </TabsContent>

        {/* STAKEHOLDER MAP */}
        <TabsContent value="stakeholders">
          <StakeholdersTab eid={eid} items={stakeholders} canWrite={canWrite} onSaved={load} user={user} />
        </TabsContent>

        {/* CHANGE TRACKER */}
        <TabsContent value="changes">
          <ChangesTab eid={eid} items={changes} canWrite={canWrite} onSaved={load} user={user} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Win Themes Tab ────────────────────────────────────────────────
function WinThemesTab({ eid, items, canWrite, onSaved, user }: any) {
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState("");
  const [evidence, setEvidence] = useState(""); const [owner, setOwner] = useState("");
  const [saving, setSaving] = useState(false); const [open, setOpen] = useState(false);
  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("win_themes").insert({ engagement_id: eid, title, description: desc, evidence, owner, status: "Active", created_by: user?.id });
    setSaving(false);
    if (error) { toast.error("Failed to save"); return; }
    toast.success("Win theme added"); setTitle(""); setDesc(""); setEvidence(""); setOwner(""); setOpen(false); onSaved();
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">The core story you're telling across every section of the proposal.</p>{canWrite && <Button size="sm" onClick={() => setOpen(v => !v)}>+ Add Win Theme</Button>}</div>
      {open && canWrite && (
        <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3"><div><Label className={LABEL_SM}>Theme Title *</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Community-First Delivery Model" /></div><div><Label className={LABEL_SM}>Owner</Label><Input value={owner} onChange={e => setOwner(e.target.value)} placeholder="Name" /></div></div>
          <div><Label className={LABEL_SM}>Description</Label><Textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="What is this win theme about?" rows={2} /></div>
          <div><Label className={LABEL_SM}>Evidence / Substantiation</Label><Textarea value={evidence} onChange={e => setEvidence(e.target.value)} placeholder="How do we prove this?" rows={2} /></div>
          <div className="flex gap-2 justify-end"><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></div>
        </div>
      )}
      {items.length === 0 ? <Empty>No win themes yet. Add the first one above.</Empty> : items.map((t: any) => (
        <div key={t.id} className={CARD}>
          <div className="flex items-start justify-between gap-2">
            <div><p className="font-semibold text-sm">{t.title}</p>{t.owner && <p className="text-xs text-muted-foreground">Owner: {t.owner}</p>}</div>
            <StatusBadge value={t.status ?? "Active"} map={{ Active: "border-emerald-500/40 text-emerald-400 bg-emerald-500/8", Draft: "border-amber-500/40 text-amber-400 bg-amber-500/8", Retired: "border-slate-500/40 text-slate-400 bg-slate-500/8" }} />
          </div>
          {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
          {t.evidence && <p className="text-xs text-muted-foreground border-t border-border/40 pt-2 mt-2"><span className="font-medium text-foreground/70">Evidence: </span>{t.evidence}</p>}
          <p className="text-[10px] text-muted-foreground/60">{relativeTime(t.created_at)}</p>
        </div>
      ))}
    </div>
  );
}

// ── Differentiators Tab ───────────────────────────────────────────
function DifferentiatorsTab({ eid, items, canWrite, onSaved, user }: any) {
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState("");
  const [sub, setSub] = useState(""); const [versus, setVersus] = useState("");
  const [saving, setSaving] = useState(false); const [open, setOpen] = useState(false);
  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("differentiators").insert({ engagement_id: eid, title, description: desc, substantiation: sub, versus, created_by: user?.id });
    setSaving(false);
    if (error) { toast.error("Failed to save"); return; }
    toast.success("Differentiator added"); setTitle(""); setDesc(""); setSub(""); setVersus(""); setOpen(false); onSaved();
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">What makes Athena's approach distinctly better than the competition.</p>{canWrite && <Button size="sm" onClick={() => setOpen(v => !v)}>+ Add Differentiator</Button>}</div>
      {open && canWrite && (
        <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
          <div><Label className={LABEL_SM}>Differentiator *</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Embedded clinical expertise in every workstream" /></div>
          <div><Label className={LABEL_SM}>Description</Label><Textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="What does this mean in practice?" rows={2} /></div>
          <div><Label className={LABEL_SM}>How We Substantiate It</Label><Textarea value={sub} onChange={e => setSub(e.target.value)} placeholder="Evidence, case studies, data" rows={2} /></div>
          <div><Label className={LABEL_SM}>Which Competitors This Beats</Label><Input value={versus} onChange={e => setVersus(e.target.value)} placeholder="e.g. Generic consultancies without clinical staff" /></div>
          <div className="flex gap-2 justify-end"><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></div>
        </div>
      )}
      {items.length === 0 ? <Empty>No differentiators yet.</Empty> : items.map((d: any) => (
        <div key={d.id} className={CARD}>
          <p className="font-semibold text-sm">{d.title}</p>
          {d.description && <p className="text-sm text-muted-foreground">{d.description}</p>}
          {d.substantiation && <p className="text-xs text-muted-foreground border-t border-border/40 pt-2 mt-2"><span className="font-medium text-foreground/70">Substantiation: </span>{d.substantiation}</p>}
          {d.versus && <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground/70">Beats: </span>{d.versus}</p>}
          <p className="text-[10px] text-muted-foreground/60">{relativeTime(d.created_at)}</p>
        </div>
      ))}
    </div>
  );
}

// ── Decisions Tab ─────────────────────────────────────────────────
function DecisionsTab({ eid, items, canWrite, onSaved, user }: any) {
  const [title, setTitle] = useState(""); const [rationale, setRationale] = useState("");
  const [impact, setImpact] = useState(""); const [owner, setOwner] = useState("");
  const [status, setStatus] = useState("Final");
  const [saving, setSaving] = useState(false); const [open, setOpen] = useState(false);
  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    const today = new Date().toISOString().split("T")[0];
    const { error } = await supabase.from("decisions").insert({ engagement_id: eid, title, rationale, impacted_areas: impact, owner_name: owner, status, decision_date: today, created_by: user?.id });
    setSaving(false);
    if (error) { toast.error("Failed to save"); return; }
    toast.success("Decision logged"); setTitle(""); setRationale(""); setImpact(""); setOwner(""); setOpen(false); onSaved();
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Strategic decisions that shape how the proposal is built.</p>{canWrite && <Button size="sm" onClick={() => setOpen(v => !v)}>+ Log Decision</Button>}</div>
      {open && canWrite && (
        <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
          <div><Label className={LABEL_SM}>Decision *</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="What was decided?" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className={LABEL_SM}>Owner</Label><Input value={owner} onChange={e => setOwner(e.target.value)} /></div>
            <div><Label className={LABEL_SM}>Status</Label><select className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={status} onChange={e => setStatus(e.target.value)}><option>Final</option><option>Pending Confirmation</option><option>Revisited</option></select></div>
          </div>
          <div><Label className={LABEL_SM}>Rationale</Label><Textarea value={rationale} onChange={e => setRationale(e.target.value)} placeholder="Why was this decided?" rows={2} /></div>
          <div><Label className={LABEL_SM}>Impacted Areas</Label><Input value={impact} onChange={e => setImpact(e.target.value)} placeholder="e.g. LTSS, Quality, Timeline" /></div>
          <div className="flex gap-2 justify-end"><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></div>
        </div>
      )}
      {items.length === 0 ? <Empty>No decisions logged yet.</Empty> : items.map((d: any) => (
        <div key={d.id} className={CARD}>
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm">{d.title}</p>
            <StatusBadge value={d.status} map={{ Final: "border-emerald-500/40 text-emerald-400 bg-emerald-500/8", "Pending Confirmation": "border-amber-500/40 text-amber-400 bg-amber-500/8", Revisited: "border-orange-500/40 text-orange-400 bg-orange-500/8" }} />
          </div>
          {d.owner_name && <p className="text-xs text-muted-foreground">Owner: {d.owner_name} · {d.decision_date}</p>}
          {d.rationale && <p className="text-sm text-muted-foreground">{d.rationale}</p>}
          {d.impacted_areas && <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground/70">Impact: </span>{d.impacted_areas}</p>}
        </div>
      ))}
    </div>
  );
}

// ── Assumptions Tab ───────────────────────────────────────────────
function AssumptionsTab({ eid, items, canWrite, onSaved, user }: any) {
  const [text, setText] = useState(""); const [confidence, setConfidence] = useState("Medium");
  const [risk, setRisk] = useState(""); const [owner, setOwner] = useState("");
  const [saving, setSaving] = useState(false); const [open, setOpen] = useState(false);
  async function save() {
    if (!text.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("assumptions").insert({ engagement_id: eid, text, confidence, risk_if_wrong: risk, owner, created_by: user?.id });
    setSaving(false);
    if (error) { toast.error("Failed to save"); return; }
    toast.success("Assumption added"); setText(""); setRisk(""); setOwner(""); setOpen(false); onSaved();
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Key assumptions the proposal is built on. Track confidence and risk.</p>{canWrite && <Button size="sm" onClick={() => setOpen(v => !v)}>+ Add Assumption</Button>}</div>
      {open && canWrite && (
        <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
          <div><Label className={LABEL_SM}>Assumption *</Label><Textarea value={text} onChange={e => setText(e.target.value)} placeholder="e.g. State will allow a 90-day transition period" rows={2} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className={LABEL_SM}>Confidence</Label><select className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={confidence} onChange={e => setConfidence(e.target.value)}><option>High</option><option>Medium</option><option>Low</option></select></div>
            <div><Label className={LABEL_SM}>Owner</Label><Input value={owner} onChange={e => setOwner(e.target.value)} /></div>
          </div>
          <div><Label className={LABEL_SM}>Risk If Wrong</Label><Textarea value={risk} onChange={e => setRisk(e.target.value)} placeholder="What breaks if this assumption is incorrect?" rows={2} /></div>
          <div className="flex gap-2 justify-end"><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></div>
        </div>
      )}
      {items.length === 0 ? <Empty>No assumptions logged yet.</Empty> : items.map((a: any) => (
        <div key={a.id} className={CARD}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm">{a.text}</p>
            <StatusBadge value={a.confidence} map={ASSUMPTION_MAP} />
          </div>
          {a.owner && <p className="text-xs text-muted-foreground">Owner: {a.owner}</p>}
          {a.risk_if_wrong && <p className="text-xs text-muted-foreground border-t border-border/40 pt-2 mt-2"><span className="font-medium text-foreground/70">Risk if wrong: </span>{a.risk_if_wrong}</p>}
          <p className="text-[10px] text-muted-foreground/60">{relativeTime(a.created_at)}</p>
        </div>
      ))}
    </div>
  );
}

// ── Partnerships Tab ──────────────────────────────────────────────
function PartnershipsTab({ eid, items, canWrite, onSaved, user }: any) {
  const [name, setName] = useState(""); const [role, setRole] = useState("");
  const [commitment, setCommitment] = useState("Exploring");
  const [contact, setContact] = useState(""); const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false); const [open, setOpen] = useState(false);
  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("partnerships").insert({ engagement_id: eid, partner_name: name, role, commitment, contact, notes, created_by: user?.id });
    setSaving(false);
    if (error) { toast.error("Failed to save"); return; }
    toast.success("Partner added"); setName(""); setRole(""); setContact(""); setNotes(""); setOpen(false); onSaved();
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Teaming partners, subcontractors, and strategic relationships.</p>{canWrite && <Button size="sm" onClick={() => setOpen(v => !v)}>+ Add Partner</Button>}</div>
      {open && canWrite && (
        <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className={LABEL_SM}>Partner Name *</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
            <div><Label className={LABEL_SM}>Commitment Status</Label><select className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={commitment} onChange={e => setCommitment(e.target.value)}><option>Confirmed</option><option>Negotiating</option><option>Exploring</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-3"><div><Label className={LABEL_SM}>Role on Proposal</Label><Input value={role} onChange={e => setRole(e.target.value)} /></div><div><Label className={LABEL_SM}>Contact</Label><Input value={contact} onChange={e => setContact(e.target.value)} /></div></div>
          <div><Label className={LABEL_SM}>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
          <div className="flex gap-2 justify-end"><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></div>
        </div>
      )}
      {items.length === 0 ? <Empty>No partners added yet.</Empty> : items.map((p: any) => (
        <div key={p.id} className={CARD}>
          <div className="flex items-start justify-between gap-2">
            <div><p className="font-semibold text-sm">{p.partner_name}</p>{p.role && <p className="text-xs text-muted-foreground">{p.role}</p>}</div>
            <StatusBadge value={p.commitment} map={CONFIDENCE_MAP} />
          </div>
          {p.contact && <p className="text-xs text-muted-foreground">Contact: {p.contact}</p>}
          {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
        </div>
      ))}
    </div>
  );
}

// ── Terminology Tab ───────────────────────────────────────────────
function TerminologyTab({ eid, items, canWrite, onSaved, user, search, setSearch }: any) {
  const [term, setTerm] = useState(""); const [def, setDef] = useState("");
  const [usage, setUsage] = useState(""); const [context, setContext] = useState("");
  const [saving, setSaving] = useState(false); const [open, setOpen] = useState(false);
  async function save() {
    if (!term.trim() || !def.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("terminology").insert({ engagement_id: eid, term, definition: def, preferred_usage: usage, context, created_by: user?.id });
    setSaving(false);
    if (error) { toast.error("Failed to save"); return; }
    toast.success("Term added"); setTerm(""); setDef(""); setUsage(""); setContext(""); setOpen(false); onSaved();
  }
  const filtered = items.filter((t: any) => !search || t.term.toLowerCase().includes(search.toLowerCase()) || t.definition.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Approved terms, acronyms, and preferred language for this engagement.</p>{canWrite && <Button size="sm" onClick={() => setOpen(v => !v)}>+ Add Term</Button>}</div>
      <Input placeholder="Search terminology…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
      {open && canWrite && (
        <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3"><div><Label className={LABEL_SM}>Term *</Label><Input value={term} onChange={e => setTerm(e.target.value)} /></div><div><Label className={LABEL_SM}>Preferred Usage</Label><Input value={usage} onChange={e => setUsage(e.target.value)} /></div></div>
          <div><Label className={LABEL_SM}>Definition *</Label><Textarea value={def} onChange={e => setDef(e.target.value)} rows={2} /></div>
          <div><Label className={LABEL_SM}>Context / Notes</Label><Input value={context} onChange={e => setContext(e.target.value)} /></div>
          <div className="flex gap-2 justify-end"><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></div>
        </div>
      )}
      {filtered.length === 0 ? <Empty>{search ? "No terms match your search." : "No terminology added yet."}</Empty> : (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <table className="w-full text-sm"><thead className="bg-muted/30"><tr><th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Term</th><th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Definition</th><th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground hidden md:table-cell">Preferred Usage</th></tr></thead>
          <tbody>{filtered.map((t: any) => (<tr key={t.id} className="border-t border-border/40 hover:bg-muted/20"><td className="px-3 py-2 font-medium">{t.term}</td><td className="px-3 py-2 text-muted-foreground">{t.definition}</td><td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{t.preferred_usage ?? "—"}</td></tr>))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Stakeholders Tab ──────────────────────────────────────────────
function StakeholdersTab({ eid, items, canWrite, onSaved, user }: any) {
  const [name, setName] = useState(""); const [title, setTitle] = useState("");
  const [org, setOrg] = useState(""); const [priority, setPriority] = useState("Medium");
  const [rel, setRel] = useState("Unknown"); const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false); const [open, setOpen] = useState(false);
  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("stakeholders").insert({ engagement_id: eid, name, title, organization: org, priority, relationship: rel, notes, created_by: user?.id });
    setSaving(false);
    if (error) { toast.error("Failed to save"); return; }
    toast.success("Stakeholder added"); setName(""); setTitle(""); setOrg(""); setNotes(""); setOpen(false); onSaved();
  }
  const sorted = [...items].sort((a, b) => { const o = ["Critical","High","Medium","Low"]; return o.indexOf(a.priority) - o.indexOf(b.priority); });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Key people in the client organization and their relationship to us.</p>{canWrite && <Button size="sm" onClick={() => setOpen(v => !v)}>+ Add Stakeholder</Button>}</div>
      {open && canWrite && (
        <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3"><div><Label className={LABEL_SM}>Name *</Label><Input value={name} onChange={e => setName(e.target.value)} /></div><div><Label className={LABEL_SM}>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} /></div></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label className={LABEL_SM}>Organization</Label><Input value={org} onChange={e => setOrg(e.target.value)} /></div>
            <div><Label className={LABEL_SM}>Priority</Label><select className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={priority} onChange={e => setPriority(e.target.value)}><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></div>
            <div><Label className={LABEL_SM}>Relationship</Label><select className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={rel} onChange={e => setRel(e.target.value)}><option>Champion</option><option>Neutral</option><option>Risk</option><option>Unknown</option></select></div>
          </div>
          <div><Label className={LABEL_SM}>Notes / Strategy</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
          <div className="flex gap-2 justify-end"><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></div>
        </div>
      )}
      {sorted.length === 0 ? <Empty>No stakeholders mapped yet.</Empty> : sorted.map((s: any) => (
        <div key={s.id} className={CARD}>
          <div className="flex items-start justify-between gap-2">
            <div><p className="font-semibold text-sm">{s.name}</p>{(s.title || s.organization) && <p className="text-xs text-muted-foreground">{[s.title, s.organization].filter(Boolean).join(" · ")}</p>}</div>
            <div className="flex gap-1.5 flex-wrap justify-end"><StatusBadge value={s.priority} map={PRIORITY_MAP} /><StatusBadge value={s.relationship} map={RELATIONSHIP_MAP} /></div>
          </div>
          {s.notes && <p className="text-xs text-muted-foreground border-t border-border/40 pt-2 mt-2">{s.notes}</p>}
        </div>
      ))}
    </div>
  );
}

// ── Change Tracker Tab ────────────────────────────────────────────
function ChangesTab({ eid, items, canWrite, onSaved, user }: any) {
  const [type, setType] = useState("Win Theme"); const [itemName, setItemName] = useState("");
  const [desc, setDesc] = useState(""); const [impact, setImpact] = useState("");
  const [loggedBy, setLoggedBy] = useState("");
  const [saving, setSaving] = useState(false); const [open, setOpen] = useState(false);
  async function save() {
    if (!desc.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("change_tracker").insert({ engagement_id: eid, change_type: type, item_name: itemName, description: desc, impact, logged_by: loggedBy, created_by: user?.id });
    setSaving(false);
    if (error) { toast.error("Failed to save"); return; }
    toast.success("Change logged"); setItemName(""); setDesc(""); setImpact(""); setOpen(false); onSaved();
  }
  const TYPE_ICONS: Record<string, string> = { "Win Theme": "💡", "Differentiator": "🎯", "Strategic Decision": "📌", "Assumption": "🔍", "Partnership": "🤝", "Other": "📝" };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">A log of significant strategic changes. Auto-logged when key items are modified, or add manually.</p>{canWrite && <Button size="sm" onClick={() => setOpen(v => !v)}>+ Log Change</Button>}</div>
      {open && canWrite && (
        <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className={LABEL_SM}>Change Type</Label><select className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={type} onChange={e => setType(e.target.value)}><option>Win Theme</option><option>Differentiator</option><option>Strategic Decision</option><option>Assumption</option><option>Partnership</option><option>Other</option></select></div>
            <div><Label className={LABEL_SM}>Item Name</Label><Input value={itemName} onChange={e => setItemName(e.target.value)} placeholder="Which item changed?" /></div>
          </div>
          <div><Label className={LABEL_SM}>What Changed *</Label><Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} /></div>
          <div className="grid grid-cols-2 gap-3"><div><Label className={LABEL_SM}>Impact</Label><Input value={impact} onChange={e => setImpact(e.target.value)} /></div><div><Label className={LABEL_SM}>Logged By</Label><Input value={loggedBy} onChange={e => setLoggedBy(e.target.value)} /></div></div>
          <div className="flex gap-2 justify-end"><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></div>
        </div>
      )}
      {items.length === 0 ? <Empty>No changes logged yet.</Empty> : items.map((c: any) => (
        <div key={c.id} className={CARD}>
          <div className="flex items-center gap-2 mb-1">
            <span>{TYPE_ICONS[c.change_type] ?? "📝"}</span>
            <span className="text-xs font-semibold text-muted-foreground">{c.change_type}{c.item_name ? ` · ${c.item_name}` : ""}</span>
            <span className="ml-auto text-[10px] text-muted-foreground/60">{relativeTime(c.created_at)}{c.logged_by ? ` · ${c.logged_by}` : ""}</span>
          </div>
          <p className="text-sm">{c.description}</p>
          {c.impact && <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground/70">Impact: </span>{c.impact}</p>}
        </div>
      ))}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-border/40 p-10 text-center text-sm text-muted-foreground">{children}</div>;
}
