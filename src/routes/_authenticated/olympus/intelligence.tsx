import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listLayer, upsertCanon, upsertStateIntelligence,
  upsertProgramIntelligence, promoteToCollectiveMemory, deleteLayerEntry,
} from "@/lib/intelligence-layers.functions";
import { Layers, Plus, Trash2, X, Globe, BookOpen, Network, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/olympus/intelligence")({
  component: IntelligenceLayersPage,
});

type LayerKey = "canon" | "state" | "program" | "collective";

const TABS: Array<{ key: LayerKey; label: string; sub: string; icon: any; layerN: string }> = [
  { key: "canon",      label: "Athena Canon",       sub: "Federal · Regs · Playbooks", icon: BookOpen, layerN: "LAYER 1" },
  { key: "state",      label: "State Intelligence", sub: "Per-state · Reusable",       icon: Globe,    layerN: "LAYER 2" },
  { key: "program",    label: "Program Intelligence", sub: "NJ CSOC · OhioRISE · STAR Kids · TennCare · PASSE", icon: Network, layerN: "LAYER 3" },
  { key: "collective", label: "Collective Memory",  sub: "Cross-engagement learning",  icon: Sparkles, layerN: "LAYER 5" },
];

function IntelligenceLayersPage() {
  const [tab, setTab] = useState<LayerKey>("canon");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const fetchList = useServerFn(listLayer);
  const del = useServerFn(deleteLayerEntry);
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["intel-layer", tab],
    queryFn: () => fetchList({ data: { layer: tab } }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { layer: tab, id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intel-layer", tab] }),
  });

  const active = TABS.find((t) => t.key === tab)!;

  return (
    <div className="px-8 py-8 max-w-6xl">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-300">
        <Layers className="h-3 w-3" /> Athena Intelligence Architecture
      </div>
      <h1 className="mt-2 text-2xl font-semibold">Layered Intelligence</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        Five layers form Athena's strategic moat. Layer 4 (mission-specific) lives inside each mission. The other four are managed here and feed IRIS reasoning across every mission.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setCreating(false); setEditing(null); }}
              className={`rounded-[10px] border p-4 text-left transition-colors ${isActive ? "border-cyan-500/40 bg-cyan-500/[0.05]" : "border-border bg-card hover:bg-surface-hover"}`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${isActive ? "text-cyan-300" : "text-muted-foreground"}`} />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{t.layerN}</span>
              </div>
              <div className="mt-2 text-sm font-semibold">{t.label}</div>
              <div className="text-[11px] text-muted-foreground">{t.sub}</div>
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{active.label} entries {!isLoading && <span className="text-muted-foreground">({rows.length})</span>}</h2>
        <button
          onClick={() => { setEditing(null); setCreating(true); }}
          className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25"
        >
          <Plus className="h-3.5 w-3.5" /> New entry
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {!isLoading && rows.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No entries yet. Click "New entry" to add one.
          </div>
        )}
        {rows.map((r: any) => (
          <div key={r.id} className="rounded-[10px] border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <RowHeader layer={tab} row={r} />
                <div className="mt-1 text-sm text-foreground/85 line-clamp-3">
                  {tab === "canon" ? r.content :
                   tab === "state" ? r.content :
                   tab === "program" ? r.proposal_implications || r.population || "—" :
                   r.detail || r.summary}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => { setCreating(false); setEditing(r); }} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-surface-hover">Edit</button>
                <button onClick={() => { if (confirm("Delete this entry?")) remove.mutate(r.id); }} className="rounded-md p-1.5 text-muted-foreground hover:text-rose-400 hover:bg-surface-hover">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <EntryDrawer
          layer={tab}
          row={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); qc.invalidateQueries({ queryKey: ["intel-layer", tab] }); }}
        />
      )}
    </div>
  );
}

function RowHeader({ layer, row }: { layer: LayerKey; row: any }) {
  if (layer === "canon") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">{row.category}</span>
        <span className="font-semibold text-foreground">{row.topic}</span>
        {row.citation && <span className="text-muted-foreground">· {row.citation}</span>}
        <span className="text-muted-foreground">· P{row.priority}</span>
      </div>
    );
  }
  if (layer === "state") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">{row.state_code}</span>
        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{row.section}</span>
        <span className="font-semibold text-foreground">{row.title}</span>
      </div>
    );
  }
  if (layer === "program") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300">{row.program_name}</span>
        {row.state_code && <span className="text-muted-foreground">· {row.state_code}</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">{String(row.kind).replace(/_/g, " ")}</span>
      <span className="font-semibold text-foreground">{row.summary}</span>
      {row.outcome && <span className="text-muted-foreground">· {row.outcome}</span>}
      {row.state_code && <span className="text-muted-foreground">· {row.state_code}</span>}
      {row.program_name && <span className="text-muted-foreground">· {row.program_name}</span>}
    </div>
  );
}

function EntryDrawer({ layer, row, onClose, onSaved }: { layer: LayerKey; row: any | null; onClose: () => void; onSaved: () => void }) {
  const upCanon = useServerFn(upsertCanon);
  const upState = useServerFn(upsertStateIntelligence);
  const upProgram = useServerFn(upsertProgramIntelligence);
  const upCollective = useServerFn(promoteToCollectiveMemory);
  const [form, setForm] = useState<any>(row ?? defaultsFor(layer));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true); setErr(null);
    try {
      if (layer === "canon") await upCanon({ data: { ...form } });
      else if (layer === "state") await upState({ data: { ...form } });
      else if (layer === "program") await upProgram({ data: { ...form } });
      else await upCollective({ data: { ...form } });
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-background p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">{row ? "Edit entry" : "New entry"} · {layer}</h3>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-surface-hover"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          {layer === "canon" && <CanonForm form={form} setForm={setForm} />}
          {layer === "state" && <StateForm form={form} setForm={setForm} />}
          {layer === "program" && <ProgramForm form={form} setForm={setForm} />}
          {layer === "collective" && <CollectiveForm form={form} setForm={setForm} />}
        </div>
        {err && <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-300">{err}</div>}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-surface-hover">Cancel</button>
          <button onClick={save} disabled={saving} className="rounded-md bg-cyan-500 px-4 py-1.5 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-50">
            {saving ? "Saving…" : (row ? "Save changes" : "Create")}
          </button>
        </div>
      </div>
    </div>
  );
}

function defaultsFor(layer: LayerKey): any {
  if (layer === "canon") return { topic: "", category: "cms_regulation", citation: "", content: "", priority: 5 };
  if (layer === "state") return { state_code: "", section: "agencies", title: "", content: "" };
  if (layer === "program") return { program_name: "", state_code: "", population: "", eligibility: "", service_array: "", proposal_implications: "" };
  return { kind: "winning_theme", summary: "", detail: "", outcome: "n/a" };
}

const Field = ({ label, children }: { label: string; children: any }) => (
  <label className="block">
    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
    {children}
  </label>
);
const cls = "w-full rounded-md border border-border bg-card px-3 py-2 text-sm";

function CanonForm({ form, setForm }: any) {
  return (
    <>
      <Field label="Topic"><input className={cls} value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} /></Field>
      <Field label="Category">
        <select className={cls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {["cms_regulation","federal_statute","medicaid_authority","macpac","medpac","kff","athena_playbook","writing_standard"].map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Citation (e.g., 42 CFR 438)"><input className={cls} value={form.citation ?? ""} onChange={(e) => setForm({ ...form, citation: e.target.value })} /></Field>
      <Field label="Content"><textarea rows={6} className={cls} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></Field>
      <Field label="Priority (1=critical, 10=fyi)"><input type="number" min={1} max={10} className={cls} value={form.priority ?? 5} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} /></Field>
    </>
  );
}
function StateForm({ form, setForm }: any) {
  return (
    <>
      <Field label="State code (2 letters)"><input className={cls} maxLength={2} value={form.state_code} onChange={(e) => setForm({ ...form, state_code: e.target.value.toUpperCase() })} /></Field>
      <Field label="Section">
        <select className={cls} value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })}>
          {["agencies","regulations","waivers","managed_care","procurement_history","political","stakeholders","market_intel"].map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Title"><input className={cls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
      <Field label="Content"><textarea rows={8} className={cls} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></Field>
    </>
  );
}
function ProgramForm({ form, setForm }: any) {
  return (
    <>
      <Field label="Program name (e.g., OhioRISE)"><input className={cls} value={form.program_name} onChange={(e) => setForm({ ...form, program_name: e.target.value })} /></Field>
      <Field label="State code (optional)"><input className={cls} maxLength={2} value={form.state_code ?? ""} onChange={(e) => setForm({ ...form, state_code: e.target.value.toUpperCase() })} /></Field>
      <Field label="Population"><textarea rows={3} className={cls} value={form.population ?? ""} onChange={(e) => setForm({ ...form, population: e.target.value })} /></Field>
      <Field label="Eligibility"><textarea rows={3} className={cls} value={form.eligibility ?? ""} onChange={(e) => setForm({ ...form, eligibility: e.target.value })} /></Field>
      <Field label="Service array"><textarea rows={4} className={cls} value={form.service_array ?? ""} onChange={(e) => setForm({ ...form, service_array: e.target.value })} /></Field>
      <Field label="Operational requirements"><textarea rows={3} className={cls} value={form.operational_requirements ?? ""} onChange={(e) => setForm({ ...form, operational_requirements: e.target.value })} /></Field>
      <Field label="Quality requirements"><textarea rows={3} className={cls} value={form.quality_requirements ?? ""} onChange={(e) => setForm({ ...form, quality_requirements: e.target.value })} /></Field>
      <Field label="Reporting requirements"><textarea rows={3} className={cls} value={form.reporting_requirements ?? ""} onChange={(e) => setForm({ ...form, reporting_requirements: e.target.value })} /></Field>
      <Field label="Proposal implications"><textarea rows={4} className={cls} value={form.proposal_implications ?? ""} onChange={(e) => setForm({ ...form, proposal_implications: e.target.value })} /></Field>
    </>
  );
}
function CollectiveForm({ form, setForm }: any) {
  return (
    <>
      <Field label="Kind">
        <select className={cls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
          {["winning_theme","evaluator_preference","compliance_lesson","best_practice","operational_wisdom"].map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Summary"><input className={cls} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></Field>
      <Field label="Detail"><textarea rows={6} className={cls} value={form.detail ?? ""} onChange={(e) => setForm({ ...form, detail: e.target.value })} /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="State"><input className={cls} maxLength={2} value={form.state_code ?? ""} onChange={(e) => setForm({ ...form, state_code: e.target.value.toUpperCase() })} /></Field>
        <Field label="Program"><input className={cls} value={form.program_name ?? ""} onChange={(e) => setForm({ ...form, program_name: e.target.value })} /></Field>
        <Field label="Outcome">
          <select className={cls} value={form.outcome ?? "n/a"} onChange={(e) => setForm({ ...form, outcome: e.target.value })}>
            {["won","lost","shortlisted","n/a"].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
      </div>
    </>
  );
}
