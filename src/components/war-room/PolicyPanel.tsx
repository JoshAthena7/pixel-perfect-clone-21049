import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2, ShieldAlert, Sparkles, Check, X, Plus } from "lucide-react";
import { relativeTime } from "@/lib/time";
import { toast } from "sonner";
import {
  generatePolicyImplications,
  mapPolicyToEngagements,
  POLICY_SOURCES,
  POLICY_TYPES,
  PROGRAM_AREAS,
} from "@/lib/ai/policy.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Mapping = {
  id: string;
  policy_id: string;
  section_id: string | null;
  question_id: string | null;
  writing_implication: string | null;
  ai_generated: boolean;
  confirmed: boolean;
  policy_intelligence: {
    id: string;
    title: string;
    source: string;
    source_detail: string | null;
    policy_type: string;
    summary: string | null;
    url: string | null;
    published_date: string | null;
    effective_date: string | null;
    cfr_reference: string | null;
  } | null;
};

const FEDERAL_SOURCES = new Set([
  "CMS",
  "Federal Register",
  "MACPAC",
  "KFF",
  "CMS Informational Bulletin",
]);

function isNew(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr).getTime();
  return Date.now() - d < 1000 * 60 * 60 * 24 * 14; // 14 days
}

export function PolicyPanel({
  engagementId,
  questionFilter,
  isLeadership = false,
}: {
  engagementId: string;
  questionFilter?: string | null;
  isLeadership?: boolean;
}) {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("policy_section_mappings")
      .select(
        "id, policy_id, section_id, question_id, writing_implication, ai_generated, confirmed, policy_intelligence!inner(id, title, source, source_detail, policy_type, summary, url, published_date, effective_date, cfr_reference)",
      )
      .eq("engagement_id", engagementId)
      .order("created_at", { ascending: false });
    if (questionFilter) q = q.eq("question_id", questionFilter);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setMappings(((data as any[]) ?? []) as Mapping[]);
    setLoading(false);
  }, [engagementId, questionFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function confirmMapping(id: string, confirmed: boolean) {
    const { error } = await supabase
      .from("policy_section_mappings")
      .update({ confirmed, ai_generated: false })
      .eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  async function deleteMapping(id: string) {
    const { error } = await supabase.from("policy_section_mappings").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  async function runImplications() {
    if (busy) return;
    setBusy(true);
    try {
      const r = (await generatePolicyImplications({
        data: { engagementId, onlyMissing: true },
      })) as any;
      toast.success(`${r.updated} writing implication${r.updated === 1 ? "" : "s"} generated.`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  // Dedupe to one card per (engagement, policy, section) — collapse question rows under section
  const grouped = new Map<string, Mapping>();
  for (const m of mappings) {
    const key = `${m.policy_id}:${m.section_id ?? "-"}:${questionFilter ? m.question_id ?? "-" : "-"}`;
    const existing = grouped.get(key);
    if (!existing) grouped.set(key, m);
    else if (m.writing_implication && !existing.writing_implication) grouped.set(key, m);
  }
  const items = Array.from(grouped.values());

  const federal = items.filter((m) => m.policy_intelligence && FEDERAL_SOURCES.has(m.policy_intelligence.source));
  const state = items.filter((m) => m.policy_intelligence && !FEDERAL_SOURCES.has(m.policy_intelligence.source));

  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-red-500" />
          <h3 className="text-sm font-bold">Policy Intelligence</h3>
          <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
          {questionFilter && (
            <Badge variant="outline" className="text-[10px] bg-primary/10">Filtered to question</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLeadership && (
            <Button size="sm" variant="outline" onClick={runImplications} disabled={busy}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              <span className="ml-1.5">Generate implications</span>
            </Button>
          )}
          {isLeadership && <AddPolicyDialog engagementId={engagementId} onCreated={load} />}
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading policy items…</p>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-surface/60 p-4 text-center">
          <p className="text-sm text-muted-foreground">
            No policy items mapped yet.
            {isLeadership && " Add one manually or run the ingestion job."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {federal.length > 0 && (
            <PolicyGroup label="Federal" items={federal} isLeadership={isLeadership} onConfirm={confirmMapping} onDelete={deleteMapping} />
          )}
          {state.length > 0 && (
            <PolicyGroup label="State" items={state} isLeadership={isLeadership} onConfirm={confirmMapping} onDelete={deleteMapping} tone="state" />
          )}
        </div>
      )}
    </div>
  );
}

function PolicyGroup({
  label,
  items,
  isLeadership,
  onConfirm,
  onDelete,
  tone = "federal",
}: {
  label: string;
  items: Mapping[];
  isLeadership: boolean;
  onConfirm: (id: string, c: boolean) => void;
  onDelete: (id: string) => void;
  tone?: "federal" | "state";
}) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="space-y-2">
        {items.map((m) => {
          const p = m.policy_intelligence!;
          const fresh = isNew(p.published_date);
          return (
            <div key={m.id} className="rounded-md border border-border bg-surface/80 p-3">
              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                <Badge className={tone === "federal" ? "bg-blue-500/15 text-blue-600 hover:bg-blue-500/15" : "bg-purple-500/15 text-purple-600 hover:bg-purple-500/15"}>
                  {p.source}
                </Badge>
                <Badge variant="outline">{p.policy_type}</Badge>
                {fresh && <Badge className="bg-red-500/15 text-red-600 hover:bg-red-500/15">NEW</Badge>}
                {p.cfr_reference && <span className="text-muted-foreground">{p.cfr_reference}</span>}
                {p.published_date && (
                  <span className="ml-auto text-muted-foreground">{relativeTime(p.published_date)}</span>
                )}
              </div>
              <p className="mt-1.5 text-sm font-semibold">{p.title}</p>
              {p.summary && <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{p.summary}</p>}
              {m.writing_implication && (
                <div className="mt-2 border-l-2 border-amber-500 bg-amber-500/5 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">Writing implication</p>
                  <p className="mt-0.5 text-xs leading-relaxed">{m.writing_implication}</p>
                </div>
              )}
              <div className="mt-2 flex items-center justify-between gap-2">
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <ExternalLink className="h-3 w-3" /> View source
                  </a>
                ) : <span />}
                {isLeadership && (
                  <div className="flex items-center gap-1">
                    {m.ai_generated && !m.confirmed && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onConfirm(m.id, true)}>
                          <Check className="h-3 w-3" /> Confirm
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => onDelete(m.id)}>
                          <X className="h-3 w-3" /> Dismiss
                        </Button>
                      </>
                    )}
                    {(!m.ai_generated || m.confirmed) && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => onDelete(m.id)}>
                        Remove
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddPolicyDialog({ engagementId, onCreated }: { engagementId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [source, setSource] = useState<string>("CMS");
  const [policyType, setPolicyType] = useState<string>("Guidance");
  const [summary, setSummary] = useState("");
  const [implication, setImplication] = useState("");
  const [url, setUrl] = useState("");
  const [states, setStates] = useState("");
  const [areas, setAreas] = useState<string[]>([]);
  const [cfr, setCfr] = useState("");

  function toggleArea(a: string) {
    setAreas((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  }

  async function submit() {
    if (!title.trim()) return toast.error("Title is required");
    setSaving(true);
    try {
      const { data: policy, error: pErr } = await supabase
        .from("policy_intelligence")
        .insert({
          title: title.trim(),
          source,
          policy_type: policyType,
          summary: summary.trim() || null,
          url: url.trim() || null,
          cfr_reference: cfr.trim() || null,
          relevant_states: states
            .split(",")
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean),
          relevant_program_areas: areas,
          published_date: new Date().toISOString().slice(0, 10),
        })
        .select("id")
        .single();
      if (pErr) throw pErr;

      // Find a section matching one of the chosen program areas, fallback to first section
      let sectionId: string | null = null;
      if (areas.length) {
        const { data: sec } = await supabase
          .from("heatmap_sections")
          .select("id, section_name")
          .eq("engagement_id", engagementId);
        const match = (sec ?? []).find((s: any) =>
          areas.some((a) => a.toLowerCase() === String(s.section_name).toLowerCase()),
        );
        sectionId = match?.id ?? null;
      }

      const { error: mErr } = await supabase.from("policy_section_mappings").insert({
        policy_id: policy.id,
        engagement_id: engagementId,
        section_id: sectionId,
        question_id: null,
        ai_generated: false,
        confirmed: true,
        writing_implication: implication.trim() || null,
      });
      if (mErr) throw mErr;

      // Auto-map to other sections matching program areas in this engagement
      try {
        await mapPolicyToEngagements({
          data: { policyId: policy.id, engagementIds: [engagementId], generateImplications: false },
        });
      } catch {
        /* non-fatal */
      }

      toast.success("Policy added");
      setOpen(false);
      setTitle(""); setSummary(""); setImplication(""); setUrl(""); setStates(""); setAreas([]); setCfr("");
      onCreated();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add policy");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-3 w-3" />
          <span className="ml-1.5">Add Policy Reference</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Policy Reference</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. CMS Access Rule §438.68 update" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Source</Label>
              <select className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm" value={source} onChange={(e) => setSource(e.target.value)}>
                {POLICY_SOURCES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Policy type</Label>
              <select className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm" value={policyType} onChange={(e) => setPolicyType(e.target.value)}>
                {POLICY_TYPES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Summary</Label>
            <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Writing implication (what writers should do)</Label>
            <Textarea rows={3} value={implication} onChange={(e) => setImplication(e.target.value)} placeholder="One specific sentence: cite §, include metric X, address Y…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">URL</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
            </div>
            <div>
              <Label className="text-xs">CFR reference</Label>
              <Input value={cfr} onChange={(e) => setCfr(e.target.value)} placeholder="42 CFR 438.208" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Relevant states (comma-separated)</Label>
            <Input value={states} onChange={(e) => setStates(e.target.value)} placeholder="NJ, NY, CA" />
          </div>
          <div>
            <Label className="text-xs">Program areas</Label>
            <div className="mt-1 flex flex-wrap gap-1">
              {PROGRAM_AREAS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleArea(a)}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${
                    areas.includes(a)
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : null}
              Save policy
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
