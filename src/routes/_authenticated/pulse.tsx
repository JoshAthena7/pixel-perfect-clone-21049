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
  head: () => ({ meta: [{ title: "Alignment Hub — Athena Command" }] }),
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

  const [winThemes, setWinThemes] = useState<any[]>([]);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  async function load() {
    if (!eid) return;
    const [wt, dec] = await Promise.all([
      supabase.from("win_themes").select("*").eq("engagement_id", eid).order("created_at", { ascending: false }),
      supabase.from("decisions").select("*").eq("engagement_id", eid).order("decision_date", { ascending: false }),
    ]);
    setWinThemes(wt.data ?? []);
    setDecisions(dec.data ?? []);
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

      <Tabs defaultValue="win-strategy" className="w-full">
        <TabsList className="flex h-auto flex-wrap gap-1 bg-transparent p-0 mb-6">
          {[
            ["win-strategy", `Win Themes (${winThemes.length})`],
            ["decisions", `Decisions (${decisions.length})`],
          ].map(([v, l]) => (
            <TabsTrigger key={v} value={v}
              className="rounded-md border border-border/40 bg-card px-3 py-1.5 text-xs font-medium data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-primary/8">
              {l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="win-strategy">
          <WinStrategyTab eid={eid} winThemes={winThemes} canWrite={canWrite} onSaved={load} user={user} search={search} setSearch={setSearch} />
        </TabsContent>
        <TabsContent value="decisions">
          <DecisionsTab eid={eid} decisions={decisions} canWrite={canWrite} onSaved={load} user={user} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function WinStrategyTab({ eid, winThemes, canWrite, onSaved, user }: any) {
  const [section, setSection] = useState<"themes"|"diff">("themes");
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState("");
  const [extra1, setExtra1] = useState(""); const [extra2, setExtra2] = useState("");
  const [saving, setSaving] = useState(false); const [open, setOpen] = useState(false);
  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    if (section === "themes") {
      await supabase.from("win_themes").insert({ engagement_id: eid, title, description: desc, evidence: extra1, owner: extra2, status: "Active", created_by: user?.id });
    } else {
    }
    setSaving(false); toast.success("Saved"); setTitle(""); setDesc(""); setExtra1(""); setExtra2(""); setOpen(false); onSaved();
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">The core story you're telling — win themes and what makes Athena distinctly better.</p>
        {canWrite && <Button size="sm" onClick={() => setOpen(v => !v)}>+ Add</Button>}
      </div>
      {open && canWrite && (
        <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
          <div className="flex gap-2 mb-2">
            {[["themes","Win Theme"],["diff","Differentiator"]].map(([v,l]) => (
              <button key={v} type="button" onClick={() => { setSection(v as any); setExtra1(""); setExtra2(""); }}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${section===v?"border-primary text-primary bg-primary/8":"border-border text-muted-foreground"}`}>{l}</button>
            ))}
          </div>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={section==="themes" ? "Theme title e.g. Community-First Delivery" : "Differentiator e.g. Embedded clinical expertise"} />
          <Textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description" rows={2} />
          <Input value={extra1} onChange={e => setExtra1(e.target.value)} placeholder={section==="themes" ? "Evidence / substantiation" : "How we prove it"} />
          <Input value={extra2} onChange={e => setExtra2(e.target.value)} placeholder={section==="themes" ? "Owner" : "Which competitors this beats"} />
          <div className="flex gap-2 justify-end"><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" onClick={save} disabled={saving}>{saving?"Saving…":"Save"}</Button></div>
        </div>
      )}
      {winThemes.length === 0 ? (
        <Empty>Win themes are the core story you're telling across every section. Add your first one to anchor the proposal.</Empty>
      ) : (
        <>
          {winThemes.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Win Themes</div>
              {winThemes.map((t: any) => (
                <div key={t.id} className={CARD + " mb-2"}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm">{t.title}</p>
                    <StatusBadge value={t.status ?? "Active"} map={{ Active: "border-emerald-500/40 text-emerald-400 bg-emerald-500/8", Draft: "border-amber-500/40 text-amber-400 bg-amber-500/8", Retired: "border-slate-500/40 text-slate-400 bg-slate-500/8" }} />
                  </div>
                  {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
                  {t.evidence && <p className="text-xs text-muted-foreground border-t border-border/40 pt-2 mt-2"><span className="font-medium text-foreground/70">Evidence: </span>{t.evidence}</p>}
                </div>
              ))}
            </div>
          )}
          
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Stakeholders & Partners Tab ───────────────────────────────────
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
      {items.length === 0 ? <Empty>Log decisions as you make them. This prevents revisiting the same ground and gives IRIS context for alignment monitoring.</Empty> : items.map((d: any) => (
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