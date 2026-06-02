import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles, X, CheckCircle2, AlertCircle, RefreshCw, Plus, Trash2 } from "lucide-react";

const FOCUS_CATEGORIES = [
  "Medicaid Managed Care (Full Risk)",
  "LTSS — Home and Community Based (HCBS)",
  "LTSS — Nursing Facility / Institutional",
  "Behavioral Health",
  "Substance Use Disorder",
  "Childrens Medicaid / CHIP",
  "Dual Eligibles (Medicare-Medicaid)",
  "Pharmacy Benefits Management",
  "Dental Benefits",
  "Vision Benefits",
  "Care Management / SDOH",
  "Provider Network Management",
  "Quality Improvement / HEDIS / Stars",
];

type Extraction = {
  state: string | null;
  state_agency: string | null;
  procurement_name: string | null;
  rfp_number: string | null;
  focus_areas: string[];
  submission_deadline: string | null;
  qa_deadline: string | null;
  pens_down_date: string | null;
  contract_start_date: string | null;
  contract_value: string | null;
  contract_term: string | null;
  incumbent: string | null;
  evaluation_criteria: Array<{ category: string; weight: string }>;
  page_limit: number | null;
  key_requirements: string[];
  confidence: Record<string, "high" | "low" | "missing">;
};

type Form = {
  name: string;
  state: string;
  state_agency: string;
  procurement_name: string;
  rfp_number: string;
  submission_date: string;
  qa_deadline: string;
  pens_down_date: string;
  contract_start_date: string;
  contract_value: string;
  contract_term: string;
  incumbent_name: string;
  page_limit: string;
  focus_areas: string[];
  key_requirements: string[];
  evaluation_criteria: Array<{ category: string; weight: string }>;
  iris_search_terms: string[];
};

export function IrisRfpReviewModal({
  missionId,
  documentId,
  open,
  onClose,
}: {
  missionId: string;
  documentId?: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [searchTerms, setSearchTerms] = useState<string[]>([]);

  const { data: mission, refetch } = useQuery({
    queryKey: ["iris-rfp-mission", missionId],
    enabled: open && !!missionId,
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("*")
        .eq("id", missionId)
        .maybeSingle();
      return data as any;
    },
  });

  useEffect(() => {
    if (!mission) return;
    const ex = (mission.rfp_extraction ?? null) as Extraction | null;
    setExtraction(ex);
    setSearchTerms((mission.iris_search_terms ?? []) as string[]);
    setForm({
      name: mission.name ?? "",
      state: mission.state ?? ex?.state ?? "",
      state_agency: mission.state_agency ?? ex?.state_agency ?? "",
      procurement_name: mission.procurement_name ?? ex?.procurement_name ?? "",
      rfp_number: mission.rfp_number ?? ex?.rfp_number ?? "",
      submission_date: mission.submission_date ?? ex?.submission_deadline ?? "",
      qa_deadline: mission.qa_deadline ?? ex?.qa_deadline ?? "",
      pens_down_date: mission.pens_down_date ?? ex?.pens_down_date ?? "",
      contract_start_date: mission.contract_start_date ?? ex?.contract_start_date ?? "",
      contract_value: mission.contract_value ?? ex?.contract_value ?? "",
      contract_term: mission.contract_term ?? ex?.contract_term ?? "",
      incumbent_name: mission.incumbent_name ?? ex?.incumbent ?? "",
      page_limit: (mission.page_limit ?? ex?.page_limit ?? "").toString(),
      focus_areas: (mission.focus_areas ?? ex?.focus_areas ?? []) as string[],
      key_requirements: (mission.key_requirements ?? ex?.key_requirements ?? []) as string[],
      evaluation_criteria: (mission.evaluation_criteria ?? ex?.evaluation_criteria ?? []) as any,
      iris_search_terms: (mission.iris_search_terms ?? []) as string[],
    });
  }, [mission]);

  async function runExtraction() {
    if (!documentId) {
      toast.error("No RFP document selected to re-extract");
      return;
    }
    setRunning(true);
    try {
      const { extractRfpConfig } = await import("@/lib/rfp-config-extractor.functions");
      const res = await extractRfpConfig({ data: { documentId } });
      toast.success("IRIS finished reading the RFP");
      setSearchTerms(res.searchTerms);
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setRunning(false);
    }
  }

  async function save(activate: boolean) {
    if (!form) return;
    setRunning(true);
    try {
      const { confirmRfpConfig } = await import("@/lib/rfp-config-extractor.functions");
      await confirmRfpConfig({
        data: {
          missionId,
          activate,
          fields: {
            name: form.name.trim() || undefined,
            state: form.state.trim() || null,
            state_agency: form.state_agency.trim() || null,
            procurement_name: form.procurement_name.trim() || null,
            rfp_number: form.rfp_number.trim() || null,
            submission_date: form.submission_date || null,
            qa_deadline: form.qa_deadline || null,
            pens_down_date: form.pens_down_date || null,
            contract_start_date: form.contract_start_date || null,
            contract_value: form.contract_value.trim() || null,
            contract_term: form.contract_term.trim() || null,
            incumbent_name: form.incumbent_name.trim() || null,
            page_limit: form.page_limit ? parseInt(form.page_limit, 10) : null,
            focus_areas: form.focus_areas,
            key_requirements: form.key_requirements,
            evaluation_criteria: form.evaluation_criteria,
            iris_search_terms: searchTerms,
          },
        },
      });
      toast.success(activate ? "Intelligence activated for this mission" : "Saved as draft");
      qc.invalidateQueries({ queryKey: ["olympus-mission-settings", missionId] });
      qc.invalidateQueries({ queryKey: ["olympus-missions"] });

      // ─── Phase 2 trigger: deep RFP comprehension + research agenda ───
      // Fire-and-forget so the modal closes immediately; the DNA build can
      // take 60–120s. Status surfaces in Olympus > Research Agenda.
      if (activate) {
        toast.loading("IRIS is reading the full RFP and building the research agenda…", {
          id: "iris-dna",
          duration: 8000,
        });
        (async () => {
          try {
            const { generateMissionDna } = await import("@/lib/iris-dna.functions");
            const out = await generateMissionDna({
              data: { missionId, documentId },
            });
            toast.success(
              `IRIS comprehension complete — ${out.questionsGenerated} research questions queued. Executing now…`,
              { id: "iris-dna" },
            );
            qc.invalidateQueries({ queryKey: ["mission-dna", missionId] });
            qc.invalidateQueries({ queryKey: ["research-agenda", missionId] });

            // ─── Phase 3: execute research agenda via Perplexity ───
            try {
              const { executeResearchAgenda } = await import("@/lib/iris-research.functions");
              const res = await executeResearchAgenda({
                data: { missionId, limit: 12 },
              });
              toast.success(
                `IRIS research complete — ${res.succeeded}/${res.executed} answered`,
                { id: "iris-research", duration: 6000 },
              );
              qc.invalidateQueries({ queryKey: ["research-agenda", missionId] });
              qc.invalidateQueries({ queryKey: ["research-results", missionId] });
            } catch (rerr) {
              toast.error(
                `Research execution failed: ${rerr instanceof Error ? rerr.message : "unknown error"}`,
                { id: "iris-research" },
              );
            }

          } catch (err) {
            toast.error(
              `Deep RFP comprehension failed: ${err instanceof Error ? err.message : "unknown error"}`,
              { id: "iris-dna" },
            );
          }
        })();
      }

      onClose();

    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setRunning(false);
    }
  }

  function update<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => (f ? { ...f, [k]: v } : f));
  }

  function toggleFocus(area: string) {
    if (!form) return;
    const has = form.focus_areas.includes(area);
    update("focus_areas", has ? form.focus_areas.filter((a) => a !== area) : [...form.focus_areas, area]);
  }

  if (!open) return null;

  const status = mission?.rfp_extraction_status as string | null;
  const isRunning = running || status === "running";
  const extractedCount = extraction
    ? Object.values(extraction.confidence).filter((c) => c === "high").length
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-[12px] border border-border bg-surface flex flex-col">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2.5 w-2.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-teal-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal-400" />
            </span>
            <div>
              <div className="h2-label text-teal-300" style={{ letterSpacing: "0.32em" }}>IRIS Extraction</div>
              <h2 className="text-lg font-semibold mt-0.5">
                {isRunning
                  ? "IRIS is reading the RFP…"
                  : extraction
                    ? "IRIS read the RFP. Review what was found."
                    : "No extraction yet"}
              </h2>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-2 text-muted-foreground hover:bg-surface-hover">
            <X className="h-4 w-4" />
          </button>
        </header>

        {isRunning && (
          <div className="flex-1 flex flex-col items-center justify-center p-12 gap-3">
            <Sparkles className="h-8 w-8 text-teal-400 animate-pulse" />
            <div className="text-sm text-muted-foreground">IRIS is reading the RFP — typically 30–60 seconds…</div>
          </div>
        )}

        {!isRunning && !extraction && form && (
          <div className="flex-1 flex flex-col items-center justify-center p-12 gap-4 text-center">
            <Sparkles className="h-8 w-8 text-teal-400" />
            <div>
              <div className="text-base font-medium">Have IRIS configure this mission from the RFP?</div>
              <div className="mt-1 text-sm text-muted-foreground">IRIS reads the RFP and pre-populates state, agency, deadlines, focus areas, evaluation criteria, and more.</div>
            </div>
            <button onClick={runExtraction} disabled={!documentId}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-teal-400 disabled:opacity-50">
              <Sparkles className="h-4 w-4" /> Yes, configure mission
            </button>
            {!documentId && <div className="text-xs text-muted-foreground">Upload an RFP to the Vault first.</div>}
          </div>
        )}

        {!isRunning && extraction && form && (
          <>
            <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 p-6">
              {/* LEFT: editable fields */}
              <div className="space-y-5">
                <Section title="Identity">
                  <Grid2>
                    <Field label="Mission name">
                      <input value={form.name} onChange={(e) => update("name", e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="RFP number" warn={extraction.confidence.rfp_number !== "high"}>
                      <input value={form.rfp_number} onChange={(e) => update("rfp_number", e.target.value)} className={inputCls} placeholder="Not found in RFP — enter manually" />
                    </Field>
                    <Field label="State" warn={extraction.confidence.state !== "high"}>
                      <input value={form.state} onChange={(e) => update("state", e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="State agency" warn={extraction.confidence.state_agency !== "high"}>
                      <input value={form.state_agency} onChange={(e) => update("state_agency", e.target.value)} className={inputCls} placeholder="Not found in RFP — enter manually" />
                    </Field>
                  </Grid2>
                  <Field label="Procurement name" warn={extraction.confidence.procurement_name !== "high"}>
                    <input value={form.procurement_name} onChange={(e) => update("procurement_name", e.target.value)} className={inputCls} />
                  </Field>
                </Section>

                <Section title="Timeline">
                  <Grid2>
                    <Field label="Submission deadline" warn={extraction.confidence.submission_deadline !== "high"}>
                      <input type="date" value={form.submission_date} onChange={(e) => update("submission_date", e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="Q&A deadline" warn={extraction.confidence.qa_deadline !== "high"}>
                      <input type="date" value={form.qa_deadline} onChange={(e) => update("qa_deadline", e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="Pens Down" warn={extraction.confidence.pens_down_date !== "high"}>
                      <input type="date" value={form.pens_down_date} onChange={(e) => update("pens_down_date", e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="Contract start" warn={extraction.confidence.contract_start_date !== "high"}>
                      <input type="date" value={form.contract_start_date} onChange={(e) => update("contract_start_date", e.target.value)} className={inputCls} />
                    </Field>
                  </Grid2>
                </Section>

                <Section title="Contract">
                  <Grid2>
                    <Field label="Contract value" warn={extraction.confidence.contract_value !== "high"}>
                      <input value={form.contract_value} onChange={(e) => update("contract_value", e.target.value)} className={inputCls} placeholder="$X million" />
                    </Field>
                    <Field label="Contract term" warn={extraction.confidence.contract_term !== "high"}>
                      <input value={form.contract_term} onChange={(e) => update("contract_term", e.target.value)} className={inputCls} placeholder="5 years + 2 one-year renewals" />
                    </Field>
                    <Field label="Incumbent" warn={extraction.confidence.incumbent !== "high"}>
                      <input value={form.incumbent_name} onChange={(e) => update("incumbent_name", e.target.value)} className={inputCls} placeholder="Not found in RFP — enter manually" />
                    </Field>
                    <Field label="Page limit" warn={extraction.confidence.page_limit !== "high"}>
                      <input type="number" value={form.page_limit} onChange={(e) => update("page_limit", e.target.value)} className={inputCls} />
                    </Field>
                  </Grid2>
                </Section>

                <Section title="Focus Areas" warn={extraction.confidence.focus_areas !== "high"}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {FOCUS_CATEGORIES.map((c) => (
                      <label key={c} className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs cursor-pointer hover:bg-surface-hover">
                        <input type="checkbox" checked={form.focus_areas.includes(c)} onChange={() => toggleFocus(c)} />
                        <span className="truncate">{c}</span>
                      </label>
                    ))}
                  </div>
                </Section>

                <Section title="Key Requirements" warn={extraction.confidence.key_requirements !== "high"}>
                  <EditableList items={form.key_requirements} onChange={(v) => update("key_requirements", v)} placeholder="Add requirement…" />
                </Section>

                <Section title="Evaluation Criteria" warn={extraction.confidence.evaluation_criteria !== "high"}>
                  <CriteriaEditor items={form.evaluation_criteria} onChange={(v) => update("evaluation_criteria", v)} />
                </Section>

                <Section title="IRIS Search Terms">
                  <div className="mb-2 text-[11px] text-muted-foreground">Auto-generated from state + focus areas. Edit freely.</div>
                  <EditableList items={searchTerms} onChange={setSearchTerms} placeholder="Add search term…" />
                </Section>
              </div>

              {/* RIGHT: confidence summary */}
              <aside className="space-y-3">
                <div className="rounded-[10px] border border-teal-500/30 bg-teal-500/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-teal-300">
                    <Sparkles className="h-3.5 w-3.5" /> IRIS Confidence
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Extracted <span className="text-foreground font-semibold">{extractedCount}</span> of 15 fields with high confidence.
                  </div>
                </div>

                <div className="rounded-[10px] border border-border bg-surface/60 divide-y divide-border">
                  {Object.entries({
                    state: "State",
                    state_agency: "State agency",
                    procurement_name: "Procurement name",
                    rfp_number: "RFP number",
                    submission_deadline: "Submission deadline",
                    qa_deadline: "Q&A deadline",
                    pens_down_date: "Pens Down",
                    contract_start_date: "Contract start",
                    contract_value: "Contract value",
                    contract_term: "Contract term",
                    incumbent: "Incumbent",
                    page_limit: "Page limit",
                    focus_areas: "Focus areas",
                    evaluation_criteria: "Evaluation criteria",
                    key_requirements: "Key requirements",
                  }).map(([k, label]) => {
                    const c = extraction.confidence[k];
                    return (
                      <div key={k} className="flex items-center justify-between px-3 py-1.5 text-xs">
                        <span className="text-muted-foreground">{label}</span>
                        {c === "high" ? (
                          <span className="inline-flex items-center gap-1 text-teal-300">
                            <CheckCircle2 className="h-3 w-3" /> High
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-400">
                            <AlertCircle className="h-3 w-3" /> Not found
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {documentId && (
                  <button onClick={runExtraction} disabled={running}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs hover:bg-surface-hover disabled:opacity-50">
                    <RefreshCw className="h-3.5 w-3.5" /> Re-extract from RFP
                  </button>
                )}
              </aside>
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
              <button onClick={() => save(false)} disabled={running}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-hover disabled:opacity-50">
                Save Draft
              </button>
              <button onClick={() => save(true)} disabled={running}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-5 py-2 text-sm font-semibold text-black hover:bg-teal-400 disabled:opacity-50">
                <Sparkles className="h-4 w-4" /> Confirm and Activate Intelligence
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary";

function Section({ title, warn, children }: { title: string; warn?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-border bg-surface/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{title}</h3>
        {warn && <AlertCircle className="h-3 w-3 text-amber-400" />}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, warn, children }: { label: string; warn?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className={`mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${warn ? "text-amber-400" : "text-muted-foreground"}`}>
        {label} {warn && <AlertCircle className="h-3 w-3" />}
      </label>
      {children}
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>;
}

function EditableList({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs">
            <input value={item} onChange={(e) => { const next = [...items]; next[i] = e.target.value; onChange(next); }}
              className="flex-1 bg-transparent focus:outline-none" />
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-400">
              <Trash2 className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { onChange([...items, draft.trim()]); setDraft(""); } }}
          className={inputCls} />
        <button onClick={() => { if (draft.trim()) { onChange([...items, draft.trim()]); setDraft(""); } }}
          className="rounded-md border border-border bg-background px-3 text-xs hover:bg-surface-hover">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function CriteriaEditor({ items, onChange }: { items: Array<{ category: string; weight: string }>; onChange: (v: Array<{ category: string; weight: string }>) => void }) {
  return (
    <div className="space-y-2">
      {items.map((c, i) => (
        <div key={i} className="flex items-center gap-2">
          <input value={c.category} onChange={(e) => { const next = [...items]; next[i] = { ...c, category: e.target.value }; onChange(next); }}
            placeholder="Category" className={`${inputCls} flex-1`} />
          <input value={c.weight} onChange={(e) => { const next = [...items]; next[i] = { ...c, weight: e.target.value }; onChange(next); }}
            placeholder="40%" className={`${inputCls} w-24`} />
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-400">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button onClick={() => onChange([...items, { category: "", weight: "" }])}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-surface-hover">
        <Plus className="h-3 w-3" /> Add criterion
      </button>
    </div>
  );
}
