import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Sparkles, Trash2, Pencil, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { generateCompetitorProfile, suggestCompetitors } from "@/lib/intelligence-loadout.functions";

const TYPE_BADGE: Record<string, string> = {
  incumbent: "bg-red-100 text-red-700",
  likely_bidder: "bg-amber-100 text-amber-700",
  possible_bidder: "bg-gray-100 text-gray-700",
  dark_horse: "bg-slate-200 text-slate-700",
};
const TYPE_LABEL: Record<string, string> = {
  incumbent: "Incumbent",
  likely_bidder: "Likely Bidder",
  possible_bidder: "Possible Bidder",
  dark_horse: "Dark Horse",
};

export function Step10Competitive({ missionId, onAdvance }: { missionId: string; onAdvance: () => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [suggestions, setSuggestions] = useState<any[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  const suggestFn = useServerFn(suggestCompetitors);

  const { data: mission } = useQuery({
    queryKey: ["mission-step10-ctx", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("state, state_code, agency_name, program_type, intelligence_graph_completeness")
        .eq("id", missionId)
        .single();
      return data;
    },
  });

  const { data: competitors } = useQuery({
    queryKey: ["competitors", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("competitor_profiles")
        .select("*")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  const { data: tiers } = useQuery({
    queryKey: ["loadout-tiers", missionId],
    queryFn: async () => {
      const [docs, feeds, evo, comps, m] = await Promise.all([
        supabase.from("mission_documents").select("id, document_type, metadata").eq("mission_id", missionId),
        supabase.from("intelligence_feed_configs").select("id, is_active, feed_type").eq("mission_id", missionId),
        supabase.from("procurement_evolution_records").select("analysis_completed_at, prior_rfp_document_id").eq("mission_id", missionId).maybeSingle(),
        supabase.from("competitor_profiles").select("id").eq("mission_id", missionId),
        supabase.from("missions").select("state, agency_name, program_type").eq("id", missionId).single(),
      ]);
      const documents = docs.data ?? [];
      const feedRows = feeds.data ?? [];
      const hasPrimary = documents.some((d) => d.document_type === "primary_rfp");
      const client = documents.filter((d) => (d as any).metadata?.intelligence_tier === "client").length;
      const historical = documents.filter((d) => (d as any).metadata?.intelligence_tier === "historical").length;
      const internal = documents.filter((d) => (d as any).metadata?.intelligence_tier === "internal").length;
      const federalFeeds = feedRows.filter((f) => f.is_active && ["cms_guidance", "federal_register", "samhsa", "acf", "cmmi", "cms_idd"].includes(f.feed_type)).length;
      const stateFeeds = feedRows.filter((f) => f.is_active && f.feed_type?.startsWith("state_")).length;
      const researchFeeds = feedRows.filter((f) => f.is_active && f.feed_type === "research").length;
      const allActive = feedRows.filter((f) => f.is_active).length;
      return {
        primaryRfp: hasPrimary,
        territoryComplete: !!(m.data?.state && m.data?.agency_name && m.data?.program_type),
        client,
        historical,
        priorRfpAnalyzed: !!evo.data?.analysis_completed_at,
        priorAwardAndContract: false, // best-effort; we can refine in future sprints
        federalFeeds,
        stateFeeds,
        researchFeeds,
        internal,
        competitors: (comps.data ?? []).length,
        allActiveFeeds: allActive,
      };
    },
  });

  const completeness = useMemo(() => {
    if (!tiers) return 0;
    let s = 0;
    if (tiers.primaryRfp) s += 25;
    if (tiers.territoryComplete) s += 10;
    if (tiers.client > 0) s += 10;
    if (tiers.priorRfpAnalyzed) s += 15;
    if (tiers.allActiveFeeds >= 3) s += 10;
    if (tiers.competitors > 0) s += 10;
    if (tiers.internal > 0) s += 10;
    if (tiers.allActiveFeeds >= 5) s += 5;
    if (tiers.priorAwardAndContract) s += 5;
    return Math.min(100, s);
  }, [tiers]);

  // Save completeness whenever it changes
  useMemo(() => {
    if (tiers) {
      supabase
        .from("missions")
        .update({ intelligence_graph_completeness: completeness })
        .eq("id", missionId);
    }
  }, [completeness, tiers, missionId]);

  async function askIris() {
    setSuggesting(true);
    try {
      const r = await suggestFn({ data: { missionId } });
      setSuggestions(r.suggestions ?? []);
    } catch (e: any) {
      setSuggestions([]);
    } finally {
      setSuggesting(false);
    }
  }

  async function addSuggestion(s: any) {
    const { data: u } = await supabase.auth.getUser();
    const { data: row } = await supabase
      .from("competitor_profiles")
      .insert({
        mission_id: missionId,
        organization_name: s.name,
        competitor_type: normalizeType(s.competitor_type),
        known_relationships: s.rationale ?? null,
        iris_confidence: "medium",
        is_manually_added: false,
      })
      .select("id")
      .single();
    setSuggestions((cur) => cur?.filter((x) => x.name !== s.name) ?? null);
    qc.invalidateQueries({ queryKey: ["competitors", missionId] });
    if (row) generateProfile(row.id);
  }

  const generateFn = useServerFn(generateCompetitorProfile);
  async function generateProfile(competitorId: string) {
    try {
      await generateFn({ data: { competitorId } });
    } catch {
      /* swallow */
    } finally {
      qc.invalidateQueries({ queryKey: ["competitors", missionId] });
    }
  }

  if (!mission || !competitors) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold text-[var(--athena-navy)]">Know your competition.</h1>
        <p className="text-muted-foreground">
          IRIS will build profiles on every competitor you identify. The more you tell her, the sharper her analysis.
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-6">
        {/* LEFT: Competitors */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Likely Competitors</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={askIris} disabled={suggesting}>
                {suggesting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                Ask IRIS who else might bid
              </Button>
              <Button size="sm" onClick={() => { setEditing(null); setShowAdd(true); }} className="bg-[var(--athena-gold)] text-[var(--athena-navy)] hover:bg-[var(--athena-gold-light)]">
                <Plus className="h-3 w-3 mr-1" /> Add Competitor
              </Button>
            </div>
          </div>

          {competitors.length === 0 && !suggestions && (
            <div className="rounded border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">No competitors added yet. Add known or likely bidders.</p>
            </div>
          )}

          {suggestions && suggestions.length > 0 && (
            <div className="rounded border border-[var(--athena-gold)]/60 bg-[var(--athena-gold)]/5 p-3 space-y-2">
              <p className="text-xs font-semibold text-[var(--athena-navy)] flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-[var(--athena-gold)]" /> IRIS suggestions — click to add
              </p>
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => addSuggestion(s)}
                  className="w-full text-left rounded border border-border bg-card p-2 hover:bg-muted text-sm"
                >
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.rationale}</p>
                </button>
              ))}
            </div>
          )}

          {competitors.map((c) => (
            <CompetitorCard
              key={c.id}
              competitor={c}
              onEdit={() => { setEditing(c); setShowAdd(true); }}
              onRemove={async () => {
                if (!confirm(`Remove ${c.organization_name}?`)) return;
                await supabase.from("competitor_profiles").delete().eq("id", c.id);
                qc.invalidateQueries({ queryKey: ["competitors", missionId] });
              }}
              onRegenerate={() => generateProfile(c.id)}
            />
          ))}
        </div>

        {/* RIGHT: Summary */}
        <div className="space-y-3">
          <h2 className="font-semibold">Intelligence Loadout Status</h2>
          {tiers && (
            <div className="rounded border border-border bg-card p-4 space-y-2 text-sm">
              <TierRow ok={tiers.primaryRfp} label="Tier 1 — Procurement Documents" detail={tiers.primaryRfp ? "Primary RFP loaded" : "Required"} required />
              <TierRow ok={tiers.client > 0} label="Tier 2 — Client Intelligence" detail={`${tiers.client} document(s)`} amberIfZero />
              <TierRow ok={tiers.priorRfpAnalyzed} label="Tier 3 — Historical Procurement" detail={tiers.priorRfpAnalyzed ? "Evolution analysis complete" : "Prior RFP not yet analyzed"} amberIfZero />
              <TierRow ok={tiers.federalFeeds > 0} label="Tier 4 — Federal Feeds" detail={`${tiers.federalFeeds} active`} />
              <TierRow ok={tiers.stateFeeds > 0} label="Tier 5 — State Feeds" detail={`${tiers.stateFeeds} active`} />
              <TierRow ok={tiers.researchFeeds > 0} label="Tier 6 — Research Feeds" detail={`${tiers.researchFeeds} active`} />
              <TierRow ok={tiers.internal > 0} label="Tier 7 — Internal Materials" detail={`${tiers.internal} document(s)`} amberIfZero />
              <TierRow ok={tiers.competitors > 0} label="Tier 8 — Competitors" detail={`${tiers.competitors} added`} amberIfZero />
            </div>
          )}

          <div className="rounded border border-border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Intelligence Completeness</p>
              <span className="text-sm font-bold text-[var(--athena-navy)]">{completeness} / 100</span>
            </div>
            <Progress value={completeness} className="h-2 bg-muted [&>div]:bg-[var(--athena-gold)]" />
            <p className="text-xs text-muted-foreground">
              A higher Intelligence Completeness score means IRIS has more context to work with. 70+ is recommended before BLAST OFF.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t">
        <button onClick={() => window.history.back()} className="text-sm text-muted-foreground hover:text-foreground">
          Save and continue later
        </button>
        <Button
          onClick={async () => {
            await supabase.from("missions").update({ intelligence_loadout_step: 4 }).eq("id", missionId);
            onAdvance();
          }}
          className="bg-[var(--athena-gold)] text-[var(--athena-navy)] hover:bg-[var(--athena-gold-light)] font-semibold"
        >
          Review Launch Checklist →
        </Button>
      </div>

      {showAdd && (
        <CompetitorForm
          missionId={missionId}
          initial={editing}
          onClose={() => { setShowAdd(false); setEditing(null); }}
          onSaved={(id) => {
            setShowAdd(false);
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["competitors", missionId] });
            if (id) generateProfile(id);
          }}
        />
      )}
    </div>
  );
}

function TierRow({ ok, label, detail, required, amberIfZero }: { ok: boolean; label: string; detail: string; required?: boolean; amberIfZero?: boolean }) {
  const color = ok ? "bg-green-500" : required ? "bg-red-500" : amberIfZero ? "bg-amber-500" : "bg-muted-foreground/40";
  return (
    <div className="flex items-center gap-2">
      <span className={cn("h-2 w-2 rounded-full", color)} />
      <span className="flex-1">{label}</span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </div>
  );
}

function CompetitorCard({ competitor: c, onEdit, onRemove, onRegenerate }: { competitor: any; onEdit: () => void; onRemove: () => void; onRegenerate: () => void }) {
  return (
    <div className="rounded border border-border bg-card p-3 space-y-1.5">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <p className="font-semibold">{c.organization_name}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn("text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded", TYPE_BADGE[c.competitor_type] ?? "bg-muted")}>
              {TYPE_LABEL[c.competitor_type] ?? c.competitor_type}
            </span>
            <span className="text-xs text-muted-foreground">IRIS confidence: {c.iris_confidence}</span>
          </div>
        </div>
        <button onClick={onEdit} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      {c.likely_narrative ? (
        <p className="text-xs text-muted-foreground line-clamp-3">{c.likely_narrative}</p>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground italic">IRIS is building the competitive profile…</p>
          <button onClick={onRegenerate} className="text-xs text-[var(--athena-gold)] hover:underline">Generate IRIS Profile</button>
        </div>
      )}
    </div>
  );
}

function normalizeType(s: string): string {
  const v = (s ?? "").toLowerCase();
  if (v.includes("incumb")) return "incumbent";
  if (v.includes("dark")) return "dark_horse";
  if (v.includes("possible")) return "possible_bidder";
  return "likely_bidder";
}

function CompetitorForm({ missionId, initial, onClose, onSaved }: { missionId: string; initial: any | null; onClose: () => void; onSaved: (id?: string) => void }) {
  const [name, setName] = useState(initial?.organization_name ?? "");
  const [type, setType] = useState(initial?.competitor_type ?? "likely_bidder");
  const [rel, setRel] = useState(initial?.known_relationships ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (initial) {
        await supabase
          .from("competitor_profiles")
          .update({
            organization_name: name,
            competitor_type: type,
            known_relationships: rel || null,
          })
          .eq("id", initial.id);
        onSaved(initial.id);
      } else {
        const { data: row } = await supabase
          .from("competitor_profiles")
          .insert({
            mission_id: missionId,
            organization_name: name,
            competitor_type: type,
            known_relationships: rel || null,
            is_manually_added: true,
          })
          .select("id")
          .single();
        onSaved(row?.id);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={onClose}>
      <div className="bg-background w-[400px] max-w-full h-full overflow-y-auto p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{initial ? "Edit competitor" : "Add competitor"}</h2>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-1">
          <Label>Organization Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>Competitor Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="incumbent">Incumbent</SelectItem>
              <SelectItem value="likely_bidder">Likely Bidder</SelectItem>
              <SelectItem value="possible_bidder">Possible Bidder</SelectItem>
              <SelectItem value="dark_horse">Dark Horse</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Known Relationships</Label>
          <Textarea value={rel} onChange={(e) => setRel(e.target.value)} rows={3} placeholder="Any known relationships with this agency or state officials" />
        </div>
        <div className="space-y-1">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Anything else you know about them" />
        </div>
        <Button onClick={save} disabled={busy || !name.trim()} className="w-full bg-[var(--athena-gold)] text-[var(--athena-navy)] hover:bg-[var(--athena-gold-light)]">
          {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          Save Competitor
        </Button>
      </div>
    </div>
  );
}
