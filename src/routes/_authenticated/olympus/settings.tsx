import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Zap, Save, AlertTriangle, Settings as Cog, Sparkles, X, Plus } from "lucide-react";
import { useSelectedOlympusMission } from "../olympus";
import { logOlympusAction } from "@/lib/audit";
import { IrisRfpReviewModal } from "@/components/v2/IrisRfpReviewModal";

export const Route = createFileRoute("/_authenticated/olympus/settings")({
  component: SettingsPage,
});

type Mission = {
  id: string;
  name: string;
  client: string;
  state: string | null;
  status: string | null;
  health: string | null;
  submission_date: string | null;
  description: string | null;
  program_type: string | null;
  win_themes: string[] | null;
  priority_topics: string[] | null;
  competitors: string[] | null;
  slack_webhook: string | null;
};

function SettingsPage() {
  const missionId = useSelectedOlympusMission();

  return (
    <div className="mx-auto max-w-5xl px-8 py-8 space-y-6">
      <header>
        <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Settings</div>
        <h1 className="h1-display mt-1">Mission Configuration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update mission metadata, scoring inputs, integrations, and (with care) destructive actions.
        </p>
      </header>

      {missionId ? <MissionSettingsForm missionId={missionId} /> : (
        <div className="rounded-[10px] border border-dashed border-border bg-surface/40 p-8 text-center text-sm text-muted-foreground">
          Select a mission from the header to edit its settings.
        </div>
      )}

      {missionId && <IrisIntelligencePanel missionId={missionId} />}

      <IrisOperationsPanel />
    </div>
  );
}

/* ────────── Mission Settings Form ────────── */

function MissionSettingsForm({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Mission | null>(null);

  const { data: mission } = useQuery({
    queryKey: ["olympus-mission-settings", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("missions")
        .select("id,name,client,state,status,health,submission_date,description,program_type,win_themes,priority_topics,competitors")
        .eq("id", missionId)
        .maybeSingle();
      if (error) throw error;
      return data as Mission | null;
    },
  });

  useEffect(() => { if (mission) setForm(mission); }, [mission]);

  if (!form) {
    return <div className="rounded-[10px] border border-border bg-surface p-8"><div className="skeleton h-40 w-full" /></div>;
  }

  function update<K extends keyof Mission>(k: K, v: Mission[K]) {
    setForm((f) => f ? { ...f, [k]: v } : f);
  }

  function csvUpdate(k: "win_themes" | "priority_topics" | "competitors", csv: string) {
    update(k, csv.split(",").map((s) => s.trim()).filter(Boolean));
  }

  async function save() {
    const f = form;
    if (!f) return;
    if (!f.name.trim() || !f.client.trim()) { toast.error("Name and client are required"); return; }
    setBusy(true);
    const { error } = await supabase.from("missions").update({
      name: f.name.trim(),
      client: f.client.trim(),
      state: f.state?.trim() || null,
      status: f.status,
      health: f.health,
      submission_date: f.submission_date || null,
      description: f.description?.trim() || null,
      program_type: f.program_type?.trim() || null,
      win_themes: f.win_themes,
      priority_topics: f.priority_topics,
      competitors: f.competitors,
      ...(f.slack_webhook && f.slack_webhook.trim() ? { slack_webhook: f.slack_webhook.trim() } : {}),
    }).eq("id", missionId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Mission updated");
    await logOlympusAction({
      action_type: "mission.update",
      action_summary: `Updated mission "${f.name.trim()}"`,
      mission_id: missionId,
      target_table: "missions",
      target_id: missionId,
    });
    qc.invalidateQueries({ queryKey: ["olympus-mission-settings", missionId] });
    qc.invalidateQueries({ queryKey: ["olympus-missions"] });
    qc.invalidateQueries({ queryKey: ["olympus-header-missions"] });
  }

  async function destroy() {
    const text = prompt(`Type the mission name "${form!.name}" to confirm DELETE. This cannot be undone.`);
    if (text !== form!.name) { if (text !== null) toast.error("Name did not match — cancelled"); return; }
    setBusy(true);
    const { error } = await supabase.from("missions").delete().eq("id", missionId);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Mission deleted");
    await logOlympusAction({
      action_type: "mission.delete",
      action_summary: `Deleted mission "${form!.name}"`,
      mission_id: null,
      target_table: "missions",
      target_id: missionId,
    });
    window.localStorage.removeItem("olympus:mission");
    qc.invalidateQueries({ queryKey: ["olympus-missions"] });
    qc.invalidateQueries({ queryKey: ["olympus-header-missions"] });
    navigate({ to: "/olympus" });
  }

  return (
    <div className="space-y-6">
      <Section title="Identity">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mission name *">
            <input value={form.name} onChange={(e) => update("name", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Client *">
            <input value={form.client} onChange={(e) => update("client", e.target.value)} className={inputCls} />
          </Field>
          <Field label="State">
            <input value={form.state ?? ""} onChange={(e) => update("state", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Program type">
            <input value={form.program_type ?? ""} onChange={(e) => update("program_type", e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Description">
          <textarea value={form.description ?? ""} onChange={(e) => update("description", e.target.value)} rows={3} className={inputCls} />
        </Field>
      </Section>

      <Section title="Timeline & Status">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Submission deadline">
            <input type="date" value={form.submission_date ?? ""} onChange={(e) => update("submission_date", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Status">
            <select value={form.status ?? "Draft"} onChange={(e) => update("status", e.target.value)} className={inputCls}>
              {["Draft","Active","Pens Down","Submitted","Closed","Archived"].map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Health">
            <select value={form.health ?? "Yellow"} onChange={(e) => update("health", e.target.value)} className={inputCls}>
              {["Green","Yellow","Red"].map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Strategy">
        <Field label="Win themes (comma-separated)" hint="Used by IRIS to surface theme alignment in the Cockpit.">
          <input value={(form.win_themes ?? []).join(", ")} onChange={(e) => csvUpdate("win_themes", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Priority topics (comma-separated)">
          <input value={(form.priority_topics ?? []).join(", ")} onChange={(e) => csvUpdate("priority_topics", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Known competitors (comma-separated)">
          <input value={(form.competitors ?? []).join(", ")} onChange={(e) => csvUpdate("competitors", e.target.value)} className={inputCls} />
        </Field>
      </Section>

      <Section title="Integrations">
        <Field label="Slack incoming webhook" hint="Stored securely. Existing value is hidden; enter a new URL to replace it, or leave blank to keep the current one.">
          <input value={form.slack_webhook ?? ""} onChange={(e) => update("slack_webhook", e.target.value)} placeholder="https://hooks.slack.com/services/… (leave blank to keep existing)" className={inputCls} />
        </Field>
      </Section>

      <div className="flex justify-end">
        <button onClick={save} disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-[#C49A22] px-5 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50">
          <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {/* Danger zone */}
      <div className="rounded-[10px] border border-red-500/30 bg-red-500/5 p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-300">
          <AlertTriangle className="h-4 w-4" /> Danger Zone
        </div>
        <p className="text-xs text-muted-foreground">
          Deleting a mission permanently removes its questions, team memberships, gates, win themes, vault metadata, and audit history. Storage files in the vault must be cleaned up separately. This cannot be undone.
        </p>
        <button onClick={destroy} disabled={busy}
          className="mt-3 inline-flex items-center gap-2 rounded-md border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-50">
          Delete this mission
        </button>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-border bg-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <Cog className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{title}</h2>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</label>
      {children}
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

/* ────────── IRIS Operations (preserved) ────────── */

function IrisOperationsPanel() {
  const qc = useQueryClient();
  const [running, setRunning] = useState<string | null>(null);

  const { data: rfpDocs = [] } = useQuery({
    queryKey: ["olympus-rfp-docs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_library")
        .select("id, name, mission_id, missions:mission_id(name)")
        .eq("is_rfp", true)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []) as Array<{ id: string; name: string; mission_id: string; missions: { name: string } | null }>;
    },
  });

  const { data: missionsList = [] } = useQuery({
    queryKey: ["olympus-missions-list"],
    queryFn: async () => {
      const { data } = await supabase.from("missions").select("id,name,client").order("name");
      return (data ?? []) as Array<{ id: string; name: string; client: string }>;
    },
  });

  async function runRfpParse(documentId: string, label: string) {
    setRunning(`rfp:${documentId}`);
    try {
      const { parseRfpDocument } = await import("@/lib/rfp-parser.functions");
      const res = await parseRfpDocument({ data: { documentId } });
      toast.success(`Parsed "${label}": ${res.inserted} new questions (${res.total_detected ?? 0} detected)`);
      qc.invalidateQueries({ queryKey: ["olympus-audit"] });
    } catch (e) {
      toast.error(`RFP parse failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setRunning(null); }
  }

  async function runMarketIntel() {
    setRunning("market");
    try {
      const { ingestMarketIntel } = await import("@/lib/market-intel.functions");
      const res = await ingestMarketIntel();
      toast.success(`Horizon Feed refreshed: ${res.inserted} new items (${res.fetched} fetched)`);
      qc.invalidateQueries({ queryKey: ["olympus-audit"] });
    } catch (e) {
      toast.error(`Market intel failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setRunning(null); }
  }

  async function runMorningBriefs(missionId: string, missionName: string) {
    setRunning(`brief:${missionId}`);
    try {
      const { generateMissionQuestionBriefs } = await import("@/lib/iris-question-brief.functions");
      const res = await generateMissionQuestionBriefs({ data: { missionId, overwrite: false } });
      toast.success(`${missionName}: ${res.updated}/${res.total} morning briefs generated${res.failed ? ` (${res.failed} failed)` : ""}`);
      qc.invalidateQueries({ queryKey: ["olympus-audit"] });
    } catch (e) {
      toast.error(`Brief generation failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setRunning(null); }
  }

  return (
    <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">IRIS Operations</h2>
        <p className="mt-1 text-xs text-muted-foreground">Manually trigger IRIS background jobs.</p>
      </div>
      <div className="divide-y divide-border">
        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Refresh Horizon Feed</div>
              <div className="text-xs text-muted-foreground">Pull fresh items from Federal Register, CMS, HHS, Medicaid.gov.</div>
            </div>
            <button onClick={runMarketIntel} disabled={running !== null}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-surface-hover disabled:opacity-50">
              <Zap className="h-3.5 w-3.5" />{running === "market" ? "Running…" : "Run now"}
            </button>
          </div>
        </div>
        <div className="px-5 py-4">
          <div className="mb-3 text-sm font-medium">Parse RFP → Question Records</div>
          {rfpDocs.length === 0 ? <div className="text-xs text-muted-foreground">No RFPs uploaded yet.</div> : (
            <ul className="space-y-2">
              {rfpDocs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{d.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{d.missions?.name ?? "—"}</div>
                  </div>
                  <button onClick={() => runRfpParse(d.id, d.name)} disabled={running !== null}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-surface-hover disabled:opacity-50 shrink-0">
                    <Zap className="h-3 w-3" />{running === `rfp:${d.id}` ? "Parsing…" : "Parse"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="px-5 py-4">
          <div className="mb-1 text-sm font-medium">Generate Morning Briefs</div>
          <div className="mb-3 text-xs text-muted-foreground">Fill <code>current_focus</code>, <code>next_step</code>, <code>waiting_on</code> for every question in a mission.</div>
          {missionsList.length === 0 ? <div className="text-xs text-muted-foreground">No missions yet.</div> : (
            <ul className="space-y-2">
              {missionsList.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{m.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{m.client}</div>
                  </div>
                  <button onClick={() => runMorningBriefs(m.id, m.name)} disabled={running !== null}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-surface-hover disabled:opacity-50 shrink-0">
                    <Zap className="h-3 w-3" />{running === `brief:${m.id}` ? "Briefing…" : "Generate"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────── IRIS Intelligence Panel ────────── */

function IrisIntelligencePanel({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [draftTerm, setDraftTerm] = useState("");
  const [running, setRunning] = useState(false);

  const { data: mission } = useQuery({
    queryKey: ["olympus-iris-intelligence", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id, name, state, state_agency, procurement_name, rfp_number, focus_areas, qa_deadline, pens_down_date, contract_start_date, contract_value, contract_term, incumbent_name, page_limit, key_requirements, evaluation_criteria, iris_search_terms, rfp_extraction_status, rfp_extracted_at")
        .eq("id", missionId)
        .maybeSingle();
      return data as any;
    },
  });

  const { data: rfpDoc } = useQuery({
    queryKey: ["olympus-iris-rfp-doc", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_library")
        .select("id, name")
        .eq("mission_id", missionId)
        .eq("is_rfp", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as { id: string; name: string } | null;
    },
  });

  async function updateTerms(next: string[]) {
    const { error } = await supabase
      .from("missions")
      .update({ iris_search_terms: next })
      .eq("id", missionId);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["olympus-iris-intelligence", missionId] });
  }

  async function runPerplexitySweep() {
    setRunning(true);
    try {
      const { ingestMarketIntel } = await import("@/lib/market-intel.functions");
      const res = await ingestMarketIntel();
      toast.success(`Sweep complete: ${res.inserted} new items`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sweep failed");
    } finally {
      setRunning(false);
    }
  }

  if (!mission) return null;
  const terms = (mission.iris_search_terms ?? []) as string[];
  const status = mission.rfp_extraction_status as string | null;
  const extractedAt = mission.rfp_extracted_at ? new Date(mission.rfp_extracted_at) : null;

  return (
    <>
      <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-2">
              <Sparkles className="h-3 w-3 text-teal-400" /> IRIS Intelligence
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {status === "running" && <span className="text-teal-300">● IRIS is reading the RFP…</span>}
              {status === "review" && <span className="text-amber-300">● Extraction ready for review</span>}
              {status === "confirmed" && <span className="text-teal-300">● Intelligence active</span>}
              {status === "failed" && <span className="text-red-400">● Extraction failed</span>}
              {!status && <span>No RFP extraction yet</span>}
              {extractedAt && ` · last run ${extractedAt.toLocaleString()}`}
            </p>
          </div>
          <button onClick={() => setReviewOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-teal-500/40 bg-teal-500/10 px-3 py-1.5 text-xs text-teal-300 hover:bg-teal-500/20">
            <Sparkles className="h-3 w-3" /> {status === "confirmed" ? "Edit extraction" : "Review extraction"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 px-5 py-4 text-xs">
          <Row label="State agency" value={mission.state_agency} />
          <Row label="Procurement" value={mission.procurement_name} />
          <Row label="RFP number" value={mission.rfp_number} />
          <Row label="Incumbent" value={mission.incumbent_name} />
          <Row label="Q&A deadline" value={mission.qa_deadline} />
          <Row label="Pens Down" value={mission.pens_down_date} />
          <Row label="Contract start" value={mission.contract_start_date} />
          <Row label="Contract value" value={mission.contract_value} />
          <Row label="Contract term" value={mission.contract_term} />
          <Row label="Page limit" value={mission.page_limit?.toString()} />
        </div>

        {(mission.focus_areas ?? []).length > 0 && (
          <div className="border-t border-border px-5 py-4">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Focus areas</div>
            <div className="flex flex-wrap gap-1.5">
              {(mission.focus_areas as string[]).map((f) => (
                <span key={f} className="rounded-full bg-teal-500/10 px-2.5 py-0.5 text-[11px] text-teal-300">{f}</span>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-border px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">IRIS Search Terms</div>
            <span className="text-[10px] text-muted-foreground">{terms.length} term{terms.length === 1 ? "" : "s"}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {terms.map((t, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px]">
                {t}
                <button onClick={() => updateTerms(terms.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-red-400">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            {terms.length === 0 && <span className="text-[11px] text-muted-foreground">No terms yet — IRIS will generate these from state + focus areas after extraction.</span>}
          </div>
          <div className="flex gap-2">
            <input value={draftTerm} onChange={(e) => setDraftTerm(e.target.value)} placeholder="Add custom term…"
              onKeyDown={(e) => { if (e.key === "Enter" && draftTerm.trim()) { updateTerms([...terms, draftTerm.trim()]); setDraftTerm(""); } }}
              className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs" />
            <button onClick={() => { if (draftTerm.trim()) { updateTerms([...terms, draftTerm.trim()]); setDraftTerm(""); } }}
              className="rounded-md border border-border bg-background px-3 text-xs hover:bg-surface-hover">
              <Plus className="h-3 w-3" />
            </button>
          </div>
        </div>

        <div className="border-t border-border px-5 py-4">
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Intelligence Feed Status</div>
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-teal-400" /> Industry feed: <span className="text-muted-foreground">Active</span></div>
            <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-teal-400" /> Mission feed: <span className="text-muted-foreground">{terms.length > 0 ? "Active" : "Awaiting search terms"}</span></div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Perplexity sweep: <span className="text-muted-foreground">on demand</span>
              </div>
              <button onClick={runPerplexitySweep} disabled={running}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] hover:bg-surface-hover disabled:opacity-50">
                <Zap className="h-3 w-3" /> {running ? "Running…" : "Run now"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <IrisRfpReviewModal
        missionId={missionId}
        documentId={rfpDoc?.id}
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between border-b border-border/40 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={value ? "text-foreground" : "text-muted-foreground/60"}>{value || "—"}</span>
    </div>
  );
}
