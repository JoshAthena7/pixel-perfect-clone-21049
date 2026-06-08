import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CheckCircle2, Circle, Plus, Trash2, Upload, Rocket, ChevronDown, ChevronRight, ChevronUp,
  Lock, X, Radar, Tag, Zap, Loader2,
} from "lucide-react";
import { launchMission } from "@/lib/mission-setup.functions";
import { seedMonitoringWatchlist, saveMonitoringSource, deleteMonitoringSource } from "@/lib/mission-monitoring.functions";
import { saveEvaluationCriteria, saveExpertiseTag, removeExpertiseTag } from "@/lib/mission-evaluation.functions";
import { generateStrategicField, type StrategicFieldKey } from "@/lib/iris-strategic-foundation.functions";
import { irisPopulateSetupRecord } from "@/lib/iris-setup-autofill.functions";
import { extractClientIntel } from "@/lib/iris-extractors/client-intel.functions";
import { IrisAutofillBanner } from "@/components/admin/IrisAutofillBanner";
import { IntelligenceVault } from "@/components/intelligence/IntelligenceVault";
import { LaunchSequence } from "@/components/olympus/LaunchSequence";
import { PersonPicker } from "@/components/setup/PersonPicker";
import { UploadMatrixModal } from "@/components/questions/UploadMatrixModal";
import { MissionStaffingBanner } from "@/components/admin/MissionStaffingBanner";
import { useIsAdmin } from "@/hooks/useAccess";

export const Route = createFileRoute("/_authenticated/admin/missions/$missionId/setup")({
  component: MissionSetupRecord,
});


/* ────────────────────────────────────────────────────────────
   Section spec — order matters; ids are anchor targets.
   ──────────────────────────────────────────────────────────── */
type SectionId = "documents" | "identity" | "team" | "inputs" | "strategy" | "evaluation" | "client" | "timeline" | "questions" | "governance" | "financials";

const SECTIONS: Array<{ id: SectionId; n: string; label: string; admin?: boolean }> = [
  { id: "documents", n: "00", label: "Documents (Vault)" },
  { id: "identity", n: "01", label: "Mission Identity" },
  { id: "team", n: "02", label: "Team Assignment" },
  { id: "inputs", n: "03", label: "Monitoring Watchlist" },
  { id: "strategy", n: "04", label: "Win Strategy" },
  { id: "evaluation", n: "4B", label: "How We'll Be Scored" },
  { id: "client", n: "05", label: "Agency & Stakeholder Intelligence" },
  { id: "timeline", n: "06", label: "Deadlines & Decision Gates" },
  { id: "questions", n: "07", label: "Question Setup" },
  { id: "governance", n: "08", label: "Conflict & Ethics Review" },

];

function hasAgencyText(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  const normalized = text.toLowerCase();
  return !/^(no documented|not documented|none documented|none found|not specified|no specific|no public evidence|unknown|n\/a|not available)/.test(normalized);
}

function hasAgencyList(value: unknown) {
  return Array.isArray(value) && value.some((item) => {
    const text = typeof item === "string" ? item.trim() : "";
    if (!text || text === "[object Object]") return false;
    return !/^(no documented|not documented|none documented|none found|not specified|no specific|no public evidence|unknown|n\/a|not available)/i.test(text);
  });
}

function hasSubstantiveAgencyIntel(intel: any) {
  if (!intel) return false;
  return (
    hasAgencyList(intel.contacts) ||
    hasAgencyList(intel.stakeholders) ||
    hasAgencyList(intel.decision_makers) ||
    hasAgencyList(intel.relationship_owners) ||
    hasAgencyText(intel.political_considerations) ||
    hasAgencyText(intel.meeting_cadence)
  );
}

/* ────────────────────────────────────────────────────────────
   Page
   ──────────────────────────────────────────────────────────── */
function MissionSetupRecord() {
  const { missionId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin } = useIsAdmin();
  const launchFn = useServerFn(launchMission);
  const autofillFn = useServerFn(irisPopulateSetupRecord);
  const extractClientIntelFn = useServerFn(extractClientIntel);
  const [confirm, setConfirm] = useState(false);
  const [preLaunchError, setPreLaunchError] = useState<string | null>(null);
  const [autofillWritten, setAutofillWritten] = useState<number | undefined>(undefined);
  const [clientIntelAttempted, setClientIntelAttempted] = useState<string | null>(null);

  const setup = useSetupData(missionId);
  const completion = useCompletion(setup);
  const clientIntelSourceSignature = useMemo(() => {
    const vaultReady = (setup.docs ?? [])
      .filter((doc: any) => doc.extraction_status === "ready" || doc.extracted_at)
      .map((doc: any) => `vault:${doc.id}:${doc.extracted_at ?? doc.updated_at ?? ""}`);
    const missionReady = (setup.missionDocs ?? [])
      .filter((doc: any) => doc.processing_status === "complete")
      .map((doc: any) => `mission:${doc.id}:${doc.processed_at ?? doc.created_at ?? ""}`);
    const libraryReady = (setup.libraryExtractions ?? [])
      .filter((doc: any) => doc.status === "ready")
      .map((doc: any) => `library:${doc.id}:${doc.processed_at ?? doc.updated_at ?? ""}`);
    return [...vaultReady, ...missionReady, ...libraryReady].sort().join("|");
  }, [setup.docs, setup.missionDocs, setup.libraryExtractions]);

  // First-open auto-population from IRIS
  useEffect(() => {
    if (!setup.mission) return;
    const status = setup.mission.iris_setup_autofill_status as string | null;
    const kickoff = setup.mission.iris_kickoff_status as string | undefined;
    if (status) return; // already ran (suggested/approved/reviewing/pending)
    if (kickoff && kickoff !== "complete") return; // wait for kickoff
    let cancelled = false;
    (async () => {
      try {
        const res = await autofillFn({ data: { missionId } });
        if (cancelled) return;
        setAutofillWritten(res.written);
        setup.refetch();
      } catch {
        // silent — banner just won't appear
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup.mission?.id, setup.mission?.iris_setup_autofill_status, setup.mission?.iris_kickoff_status]);

  useEffect(() => {
    if (!setup.mission || !clientIntelSourceSignature) return;
    if (hasSubstantiveAgencyIntel(setup.clientIntel)) return;
    if (clientIntelAttempted === clientIntelSourceSignature) return;
    let cancelled = false;
    setClientIntelAttempted(clientIntelSourceSignature);
    (async () => {
      try {
        const res = await extractClientIntelFn({ data: { missionId } });
        if (!cancelled && !res.skipped) setup.refetch();
      } catch {
        // silent — Agency Intelligence can still be entered manually
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup.mission?.id, setup.clientIntel, clientIntelSourceSignature, clientIntelAttempted]);

  async function handleLaunch() {
    setPreLaunchError(null);
    try {
      // Validate readiness server-side before kicking off the animated sequence.
      const res = await launchFn({ data: { missionId } });
      if (!res.ok) {
        setPreLaunchError(`Complete first: ${res.missing.join(", ")}`);
        toast.error(`Complete first: ${res.missing.join(", ")}`);
        return;
      }
      setConfirm(true);
      qc.invalidateQueries({ queryKey: ["olympus-missions"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Launch failed");
    }
  }


  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-[1400px] gap-12 px-10 py-10">
        {/* ── Sticky sidebar ── */}
        <aside className="hidden lg:block w-[260px] shrink-0">
          <div className="sticky top-8">
            <div className="mb-6">
              <div className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground font-mono">
                Olympus / Setup Record / <span className="text-foreground/70">{setup.mission?.name ?? "Untitled"}</span>
              </div>
              <div className="mt-2 text-base font-semibold text-foreground truncate">
                {setup.mission?.name ?? "Untitled mission"}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                {setup.mission?.client ?? "—"}
              </div>
            </div>

            <nav className="space-y-1 border-l border-border pl-4">
              {SECTIONS.filter((s) => !s.admin || isAdmin).map((s) => {
                const done = completion[s.id];
                return (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    title="Jump to section"
                    className="group flex items-center gap-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:underline underline-offset-4 transition"
                  >
                    {done ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 shrink-0 opacity-40" />
                    )}
                    <span className="font-mono text-[10px] opacity-60">{s.n}</span>
                    <span className="truncate">{s.label}</span>
                    <span className="ml-auto opacity-0 group-hover:opacity-60 text-[10px]">↓</span>
                  </a>
                );
              })}
            </nav>

            <div className="mt-8 pt-6 border-t border-border">
              <CompletionMeter completion={completion} isAdmin={isAdmin} />
              {(() => {
                const list = SECTIONS.filter((s) => !s.admin || isAdmin);
                const done = list.filter((s) => completion[s.id]).length;
                const total = list.length;
                const ready = done >= Math.ceil(total * 0.7);
                const isActive = setup.mission?.status === "Active";
                return (
                  <>
                    <div className="mt-4 text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-mono">
                      Readiness: {done}/{total}
                    </div>
                    {isActive ? (
                      <div className="mt-1.5 inline-flex w-full items-center justify-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-200">
                        <CheckCircle2 className="h-4 w-4" />
                        Mission is Active
                      </div>
                    ) : (
                      <button
                        onClick={handleLaunch}
                        disabled={confirm}
                        className="mt-1.5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#C49A22] px-4 py-2.5 text-sm font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50 transition"
                      >
                        <Rocket className="h-4 w-4" />
                        {ready ? "Launch Mission" : "Launch with Partial Setup"}
                      </button>
                    )}
                  </>
                );
              })()}
              {preLaunchError && <p className="mt-2 text-[11px] text-destructive">{preLaunchError}</p>}
            </div>
          </div>
        </aside>

        {/* ── Main column ── */}
        <main className="flex-1 min-w-0 space-y-16 pb-32">
          <header>
            <div className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground font-mono">
              Mission Setup
            </div>
            <h1 className="mt-2 text-3xl font-light tracking-tight text-foreground">
              {setup.mission?.name ?? "Untitled mission"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              One page. Start by uploading documents in Section 00 — IRIS auto-populates the rest.
              Review each section, then launch.
            </p>
          </header>

          <IrisAutofillBanner
            missionId={missionId}
            status={setup.mission?.iris_setup_autofill_status}
            written={autofillWritten}
            onChange={() => setup.refetch()}
          />

          <SectionDocuments missionId={missionId} />
          <SectionIdentity missionId={missionId} mission={setup.mission} refetch={setup.refetch} />
          <SectionTeam missionId={missionId} members={setup.members} expertise={setup.expertise} refetch={setup.refetch} />
          <SectionInputs missionId={missionId} mission={setup.mission} docs={setup.docs} monitoring={setup.monitoring} refetch={setup.refetch} />
          <SectionStrategy missionId={missionId} mission={setup.mission} strategy={setup.strategy} sensitivities={setup.sensitivities} refetch={setup.refetch} />
          <SectionEvaluation missionId={missionId} criteria={setup.evaluation} questions={setup.questions} refetch={setup.refetch} />
          <SectionClientIntel missionId={missionId} intel={setup.clientIntel} refetch={setup.refetch} />
          <SectionTimeline missionId={missionId} timeline={setup.timeline} refetch={setup.refetch} />
          <SectionQuestions missionId={missionId} questions={setup.questions} volumes={setup.volumes} refetch={setup.refetch} />
          <SectionGovernance missionId={missionId} governance={setup.governance} refetch={setup.refetch} />
        </main>

      </div>

      {confirm && (
        <LaunchSequence
          missionId={missionId}
          onClose={() => setConfirm(false)}
          onView={() => navigate({ to: "/missions/$missionId/brief", params: { missionId } })}
        />
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Data hook — one query per section, keyed by mission
   ──────────────────────────────────────────────────────────── */
function useSetupData(missionId: string) {
  const q = useQuery({
    queryKey: ["mission-setup", missionId],
    queryFn: async () => {
      const [
        mission, members, docs, missionDocs, strategy, sensitivities, clientIntel, timeline,
        questions, volumes, governance, financials, monitoring, evaluation, expertise, libraryExtractions,
      ] = await Promise.all([
        supabase.from("missions").select("*").eq("id", missionId).maybeSingle(),
        supabase.from("mission_members").select("*").eq("mission_id", missionId),
        supabase.from("mission_vault_documents").select("id,title,category,uploaded_by_name,created_at,updated_at,file_path,extraction_status,extracted_at").eq("mission_id", missionId).order("created_at", { ascending: false }),
        supabase.from("mission_documents").select("id,file_name,document_type,processing_status,processed_at,created_at").eq("mission_id", missionId).order("created_at", { ascending: false }),
        supabase.from("mission_strategy").select("*").eq("mission_id", missionId).order("sort_order"),
        supabase.from("mission_sensitivities").select("*").eq("mission_id", missionId),
        supabase.from("mission_client_intel").select("*").eq("mission_id", missionId).maybeSingle(),
        supabase.from("mission_timeline").select("*").eq("mission_id", missionId).maybeSingle(),
        supabase.from("question_records").select("id,question_number,title,section_number,assigned_writer_id,assigned_sme_id,reviewer_id,pens_down_date,review_path,volume_id,point_value,competitive_risk").eq("mission_id", missionId).order("sort_order"),
        supabase.from("mission_volumes").select("*").eq("mission_id", missionId).order("sort_order"),
        supabase.from("mission_governance").select("*").eq("mission_id", missionId).maybeSingle(),
        supabase.from("mission_financials").select("*").eq("mission_id", missionId).maybeSingle(),
        supabase.from("mission_monitoring_sources").select("*").eq("mission_id", missionId).order("source_type"),
        supabase.from("mission_evaluation_criteria").select("*").eq("mission_id", missionId).order("display_order"),
        supabase.from("mission_member_expertise").select("*").eq("mission_id", missionId),
        supabase.from("document_extractions").select("id,status,processed_at,updated_at").eq("mission_id", missionId).eq("status", "ready").order("processed_at", { ascending: false }).limit(20),
      ]);
      return {
        mission: mission.data,
        members: members.data ?? [],
        docs: docs.data ?? [],
        missionDocs: missionDocs.data ?? [],
        strategy: strategy.data ?? [],
        sensitivities: sensitivities.data ?? [],
        clientIntel: clientIntel.data,
        timeline: timeline.data,
        questions: questions.data ?? [],
        volumes: volumes.data ?? [],
        governance: governance.data,
        financials: financials.data,
        monitoring: monitoring.data ?? [],
        evaluation: evaluation.data ?? [],
        expertise: expertise.data ?? [],
        libraryExtractions: libraryExtractions.data ?? [],
      };
    },
  });
  return {
    ...(q.data ?? {
      mission: null, members: [], docs: [], strategy: [], sensitivities: [],
      clientIntel: null, timeline: null, questions: [], volumes: [], governance: null, financials: null,
      monitoring: [], evaluation: [], expertise: [], missionDocs: [], libraryExtractions: [],
    }),
    refetch: q.refetch,
    isLoading: q.isLoading,
  } as any;
}

function useCompletion(setup: any): Record<SectionId, boolean> {
  return useMemo(() => {
    const qs = setup.questions ?? [];
    const assignedCount = qs.filter((q: any) => q.assigned_writer_id).length;
    // Question Setup is complete when at least half of the imported
    // questions have a Writer assigned (minimum ownership coverage).
    const questionsComplete = qs.length > 0 && assignedCount >= Math.max(1, Math.ceil(qs.length / 2));
    return {
      documents: (setup.docs?.length ?? 0) > 0 || (setup.missionDocs?.length ?? 0) > 0,
      identity: !!(setup.mission?.name && setup.mission?.client && setup.mission?.status),
      team: (setup.members?.length ?? 0) > 0,
      inputs: (setup.docs?.length ?? 0) > 0 || (setup.monitoring?.length ?? 0) > 0,
      strategy: (setup.strategy?.length ?? 0) > 0 || (setup.mission?.win_themes?.length ?? 0) > 0,
      evaluation: (setup.evaluation?.length ?? 0) > 0,
      client: !!setup.clientIntel,
      timeline: !!(setup.timeline?.submission),
      questions: questionsComplete,
      governance: !!(setup.governance?.submission_authority),
      financials: !!setup.financials,
    };
  }, [setup]);
}

function CompletionMeter({ completion, isAdmin }: { completion: Record<SectionId, boolean>; isAdmin: boolean }) {
  const list = SECTIONS.filter((s) => !s.admin || isAdmin);
  const done = list.filter((s) => completion[s.id]).length;
  const pct = Math.round((done / list.length) * 100);
  return (
    <div title={`${done} of ${list.length} required sections complete. IRIS activates at ${Math.ceil(list.length / 2)}/${list.length}. Full intelligence at ${list.length}/${list.length}.`}>
      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
        <span>Readiness</span>
        <span className="tabular-nums">{done}/{list.length}</span>
      </div>
      <div className="mt-2 h-[2px] w-full bg-border overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Reusable Section shell
   ──────────────────────────────────────────────────────────── */
function Section({ id, n, label, children, sublabel, collapsible, defaultOpen = true, locked }: {
  id: string; n: string; label: string; sublabel?: string;
  collapsible?: boolean; defaultOpen?: boolean; locked?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section id={id} className="scroll-mt-8">
      <header
        className={`flex items-center gap-4 pb-4 border-b border-border ${collapsible ? "cursor-pointer select-none" : ""}`}
        onClick={collapsible ? () => setOpen(!open) : undefined}
      >
        <span className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground tabular-nums">{n}</span>
        <div className="flex-1">
          <h2 className="text-lg font-light text-foreground flex items-center gap-2">
            {label}
            {locked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
          </h2>
          {sublabel && <p className="mt-0.5 text-xs text-muted-foreground">{sublabel}</p>}
        </div>
        {collapsible && (open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />)}
      </header>
      {(!collapsible || open) && <div className="mt-6">{children}</div>}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   Field primitives
   ──────────────────────────────────────────────────────────── */
function Field({ label, children, span = 1 }: { label: string; children: React.ReactNode; span?: 1 | 2 | 3 }) {
  const spans = { 1: "sm:col-span-1", 2: "sm:col-span-2", 3: "sm:col-span-3" };
  return (
    <label className={`block ${spans[span]}`}>
      <span className="block text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-1.5">{label}</span>
      {children}
    </label>
  );
}
function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary ${props.className ?? ""}`} />;
}
function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary ${props.className ?? ""}`} />;
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

/* ────────────────────────────────────────────────────────────
   01 — Mission Identity
   ──────────────────────────────────────────────────────────── */
function SectionIdentity({ missionId, mission, refetch }: any) {
  const [form, setForm] = useState<any>(mission ?? {});
  useEffect(() => { if (mission) setForm(mission); }, [mission]);

  async function save() {
    const { error } = await supabase.from("missions").update({
      name: form.name, client: form.client, program_type: form.program_type,
      state: form.state, state_agency: form.state_agency, incumbent_name: form.incumbent_name,
      contract_value: form.contract_value,
      submission_date: form.submission_date || null, status: form.status,
    }).eq("id", missionId);
    if (error) return toast.error(error.message);
    toast.success("Identity saved");
    refetch();
  }

  return (
    <Section id="identity" n="01" label="Mission Identity" sublabel="The foundation IRIS builds your entire intelligence profile on.">
      <p className="mb-4 rounded-md border border-cyan-500/20 bg-cyan-500/5 px-3 py-2.5 text-xs text-cyan-700 dark:text-cyan-300 leading-relaxed">
        <span className="font-mono uppercase tracking-[0.16em] text-[10px] opacity-80">IRIS</span>{" "}
        — I use the mission name, client, and procurement vehicle to begin mapping the procurement environment. This is where your intelligence profile starts.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Field label="Mission Name" span={2}>
          <TextInput value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Status">
          <Select value={form.status ?? "Setup"} onChange={(v) => setForm({ ...form, status: v })}
            options={["Setup", "Active", "Review", "Submitted", "Won", "Lost"]} />
        </Field>
        <Field label="Client"><TextInput value={form.client ?? ""} onChange={(e) => setForm({ ...form, client: e.target.value })} /></Field>
        <Field label="Procurement Vehicle"><TextInput value={form.program_type ?? ""} onChange={(e) => setForm({ ...form, program_type: e.target.value })} placeholder="RFP, IDIQ, Sole Source…" /></Field>
        <Field label="State"><TextInput value={form.state ?? ""} onChange={(e) => setForm({ ...form, state: e.target.value })} /></Field>
        <Field label="Issuing Agency"><TextInput value={form.state_agency ?? ""} onChange={(e) => setForm({ ...form, state_agency: e.target.value })} /></Field>
        <Field label="Prime Contractor"><TextInput value={form.incumbent_name ?? ""} onChange={(e) => setForm({ ...form, incumbent_name: e.target.value })} /></Field>
        <Field label="Contract Value"><TextInput value={form.contract_value ?? ""} onChange={(e) => setForm({ ...form, contract_value: e.target.value })} placeholder="$ / estimated value" /></Field>
        <Field label="Submission Date"><TextInput type="date" value={form.submission_date ?? ""} onChange={(e) => setForm({ ...form, submission_date: e.target.value })} /></Field>
      </div>
      <div className="mt-5 flex justify-end">
        <button onClick={save} className="rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-surface-hover">Save Identity</button>
      </div>
    </Section>
  );
}

/* ────────────────────────────────────────────────────────────
   02 — Team
   ──────────────────────────────────────────────────────────── */
const TEAM_ROLES = [
  { key: "engagement_lead", label: "Engagement Lead", multi: false },
  { key: "project_manager", label: "Project Manager", multi: false },
  { key: "lead_writer", label: "Lead Writer", multi: false },
  { key: "writer", label: "Writers", multi: true },
  { key: "sme", label: "SMEs", multi: true },
  { key: "reviewer", label: "Reviewers", multi: true },
  { key: "executive_reviewer", label: "Executive Review Team", multi: true },
];
function SectionTeam({ missionId, members, expertise, refetch }: any) {
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-min"],
    queryFn: async () => (await supabase.from("profiles").select("id,display_name,email").limit(500)).data ?? [],
  });
  const addTagFn = useServerFn(saveExpertiseTag);
  const removeTagFn = useServerFn(removeExpertiseTag);

  async function addMember(role: string, userId: string, displayName: string) {
    if (!userId) return;
    const { error } = await supabase.from("mission_members").insert({
      mission_id: missionId, user_id: userId, role, display_name: displayName,
    });
    if (error) return toast.error(error.message);
    refetch();
  }
  async function removeMember(id: string) {
    const { error } = await supabase.from("mission_members").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refetch();
  }
  async function addTag(userId: string, tag: string) {
    if (!tag.trim()) return;
    await addTagFn({ data: { missionId, userId, tag: tag.trim() } });
    refetch();
  }
  async function removeTag(id: string) {
    await removeTagFn({ data: { id } });
    refetch();
  }

  return (
    <Section id="team" n="02" label="Team Assignment" sublabel="Tells IRIS who's responsible for what — so the right intelligence reaches the right person.">
      <p className="mb-4 rounded-md border border-border/60 bg-surface/40 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
        <span className="text-foreground font-medium">IRIS uses these assignments to route the right intelligence to the right team member.</span>{" "}
        An Engagement Lead gets strategic analysis; Writers get proposal-ready content; SMEs get domain-specific briefings.
      </p>
      <div className="space-y-5">
        {TEAM_ROLES.map((r) => {
          const assigned = members.filter((m: any) => m.role === r.key);
          return (
            <div key={r.key} className="grid grid-cols-12 gap-4 items-start">
              <div className="col-span-3 pt-2">
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{r.label}</div>
              </div>
              <div className="col-span-9 space-y-2">
                {assigned.length === 0 && <span className="text-xs text-muted-foreground italic">Unassigned — add a team member</span>}
                {assigned.map((m: any) => {
                  const tags = expertise.filter((e: any) => e.user_id === m.user_id);
                  return (
                    <div key={m.id} className="rounded-md border border-border bg-background p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm">{m.display_name ?? m.user_id.slice(0, 6)}</span>
                        <button onClick={() => removeMember(m.id)} className="opacity-50 hover:opacity-100">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <Tag className="h-3 w-3 text-muted-foreground" />
                        {tags.length === 0 && <span className="text-[11px] text-muted-foreground italic">No expertise tags</span>}
                        {tags.map((t: any) => (
                          <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/30 px-2 py-0.5 text-[11px] text-primary">
                            {t.tag}
                            <button onClick={() => removeTag(t.id)} className="opacity-60 hover:opacity-100"><X className="h-2.5 w-2.5" /></button>
                          </span>
                        ))}
                        <ExpertiseTagInput onAdd={(tag) => addTag(m.user_id, tag)} />
                      </div>
                    </div>
                  );
                })}
                {(r.multi || assigned.length === 0) && (
                  <PersonPicker
                    options={profiles.filter((p: any) => !assigned.find((m: any) => m.user_id === p.id))}
                    onSelect={(opt) => addMember(r.key, opt.id, opt.display_name ?? opt.email ?? "")}
                    placeholder="+ Add person…"
                    emptyText={profiles.length === 0 ? "No people available yet. Load people on the Users page." : "No matches."}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
function ExpertiseTagInput({ onAdd }: { onAdd: (tag: string) => void }) {
  const [v, setV] = useState("");
  return (
    <input
      placeholder="+ tag"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter" && v.trim()) { onAdd(v); setV(""); } }}
      className="w-20 rounded-full border border-dashed border-border bg-transparent px-2 py-0.5 text-[11px] focus:outline-none focus:border-primary"
    />
  );
}

/* ────────────────────────────────────────────────────────────
   03 — Inputs (upload zones) + IRIS Monitoring Watchlist
   ──────────────────────────────────────────────────────────── */
const INPUT_CATEGORIES = ["RFP", "Amendments", "Q&A", "Client Documents", "Research", "Prior Responses", "Supporting Materials"];
function SectionInputs({ missionId, mission, docs, monitoring, refetch }: any) {
  async function attachUrl(category: string, title: string, url: string) {
    const { data: auth } = await supabase.auth.getUser();
    const { data: prof } = await supabase.from("profiles").select("display_name,email").eq("id", auth.user!.id).maybeSingle();
    const { error } = await supabase.from("mission_vault_documents").insert({
      mission_id: missionId,
      doc_type: "other",
      title,
      external_url: url,
      category,
      uploaded_by: auth.user!.id,
      uploaded_by_name: prof?.display_name ?? prof?.email ?? null,
    });
    if (error) return toast.error(error.message);
    toast.success(`Attached to ${category}`);
    refetch();
  }

  async function attachFile(category: string, file: File) {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return toast.error("Not authenticated");
    if (file.size > 50 * 1024 * 1024) return toast.error("File too large (max 50MB)");
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${missionId}/${Date.now()}_${safe}`;
    const up = await supabase.storage.from("mission-documents").upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (up.error) return toast.error(`Upload failed: ${up.error.message}`);
    const { data: prof } = await supabase.from("profiles").select("display_name,email").eq("id", auth.user.id).maybeSingle();
    const { error } = await supabase.from("mission_vault_documents").insert({
      mission_id: missionId,
      doc_type: "other",
      title: file.name,
      file_path: path,
      file_size: file.size,
      mime_type: file.type || null,
      category,
      uploaded_by: auth.user.id,
      uploaded_by_name: prof?.display_name ?? prof?.email ?? null,
    });
    if (error) return toast.error(error.message);
    toast.success(`Uploaded to ${category}`);
    refetch();
  }

  return (
    <Section id="inputs" n="03" label="Monitoring Watchlist" sublabel="Live sources IRIS scans for amendments, Q&A drops, and signal changes. Documents live in The Vault — upload them there, not here.">
      <MonitoringWatchlist missionId={missionId} mission={mission} sources={monitoring} refetch={refetch} />
    </Section>
  );
}


function MonitoringWatchlist({ missionId, mission, sources, refetch }: any) {
  const seedFn = useServerFn(seedMonitoringWatchlist);
  const saveFn = useServerFn(saveMonitoringSource);
  const delFn = useServerFn(deleteMonitoringSource);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ source_type: "custom", label: "", url: "", frequency: "daily" as "daily" | "weekly" });
  const [seeding, setSeeding] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  async function seed() {
    setSeeding(true);
    try {
      const { seeded } = await seedFn({ data: { missionId } });
      toast.success(seeded > 0 ? `Seeded ${seeded} sources for ${mission?.state ?? "this mission"}` : "Watchlist already seeded");
      refetch();
    } finally { setSeeding(false); }
  }
  async function add() {
    if (!draft.label.trim()) return;
    await saveFn({ data: {
      missionId,
      source_type: draft.source_type,
      label: draft.label,
      url: draft.url || null,
      frequency: draft.frequency,
      enabled: true,
    }});
    setDraft({ source_type: "custom", label: "", url: "", frequency: "daily" });
    setAdding(false);
    refetch();
  }
  async function bulkAdd() {
    // Accept one URL or "Label, https://..." per line. Lines that are pure URLs derive a label from the hostname.
    const lines = bulkText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    const existingUrls = new Set(
      (sources ?? []).map((s: any) => String(s.url ?? "").trim().toLowerCase()).filter(Boolean)
    );
    type Entry = { label: string; url: string };
    const parsed: Entry[] = [];
    const seenInBatch = new Set<string>();
    for (const line of lines) {
      // Split on first comma or tab → "Label, URL" or "Label\tURL"
      const m = line.match(/^(.+?)[\t,]\s*(https?:\/\/\S+)$/i);
      let label = "";
      let url = "";
      if (m) {
        label = m[1].trim();
        url = m[2].trim();
      } else {
        // Bare URL
        const um = line.match(/(https?:\/\/\S+)/i);
        if (!um) continue; // skip non-URL lines silently
        url = um[1].trim();
        try { label = new URL(url).hostname.replace(/^www\./, ""); } catch { label = url; }
      }
      const key = url.toLowerCase();
      if (existingUrls.has(key) || seenInBatch.has(key)) continue;
      seenInBatch.add(key);
      parsed.push({ label: label.slice(0, 200), url });
    }
    if (parsed.length === 0) {
      toast.info("No new URLs to add.");
      return;
    }
    setBulkBusy(true);
    let saved = 0;
    try {
      for (const p of parsed) {
        try {
          await saveFn({ data: {
            missionId,
            source_type: "custom",
            label: p.label,
            url: p.url,
            frequency: "daily",
            enabled: true,
          }});
          saved++;
        } catch (e) {
          console.error("bulk add failed for", p.url, e);
        }
      }
      toast.success(`Added ${saved} source${saved === 1 ? "" : "s"}${saved < parsed.length ? ` (${parsed.length - saved} failed)` : ""}.`);
      setBulkText("");
      setBulkOpen(false);
      refetch();
    } finally {
      setBulkBusy(false);
    }
  }
  async function toggle(s: any, patch: Partial<{ enabled: boolean; frequency: "daily" | "weekly" }>) {
    await saveFn({ data: {
      missionId, id: s.id,
      source_type: s.source_type, label: s.label, url: s.url,
      frequency: patch.frequency ?? s.frequency,
      enabled: patch.enabled ?? s.enabled,
    }});
    refetch();
  }

  return (
    <div className="mt-8 rounded-md border border-border bg-surface/30 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-[#22d3ee]" />
          <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">IRIS Monitoring Watchlist</span>
        </div>
        <div className="flex items-center gap-2">
          {sources.length === 0 && (
            <button onClick={seed} disabled={seeding} className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-surface-hover disabled:opacity-50">
              {seeding ? "Seeding…" : `Seed ${mission?.state ?? ""} defaults`}
            </button>
          )}
          <button onClick={() => setBulkOpen(!bulkOpen)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <Plus className="h-3 w-3" /> Paste URLs
          </button>
          <button onClick={() => setAdding(!adding)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <Plus className="h-3 w-3" /> Add source
          </button>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Sources IRIS watches automatically on launch. Read-only for writers.
      </p>

      {bulkOpen && (
        <div className="mt-3 rounded border border-border bg-background p-3 space-y-2">
          <div className="text-[11px] text-muted-foreground">
            Paste one URL per line, or upload a CSV. Optionally prefix with a label and comma:
            <span className="font-mono"> Texas HHSC, https://hhs.texas.gov/news</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] cursor-pointer hover:bg-surface-hover">
              <Plus className="h-3 w-3" /> Upload CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const text = await file.text();
                    // Parse simple CSV: split lines, then split each on first comma.
                    // Treats first column as label, second as URL (or single col as URL).
                    const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
                    const out: string[] = [];
                    for (let i = 0; i < rows.length; i++) {
                      const raw = rows[i];
                      // Skip likely header row
                      if (i === 0 && /^(label|name|title)?[,\s]*url\b/i.test(raw)) continue;
                      // Strip surrounding quotes from CSV fields
                      const cells = raw.split(",").map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
                      const urlCell = cells.find((c) => /^https?:\/\//i.test(c));
                      if (!urlCell) continue;
                      const labelCell = cells.find((c) => c !== urlCell && c.length > 0);
                      out.push(labelCell ? `${labelCell}, ${urlCell}` : urlCell);
                    }
                    if (out.length === 0) {
                      toast.error("No URLs found in CSV.");
                    } else {
                      setBulkText((prev) => (prev.trim() ? prev.trim() + "\n" : "") + out.join("\n"));
                      toast.success(`Loaded ${out.length} row${out.length === 1 ? "" : "s"} from CSV.`);
                    }
                  } catch (err) {
                    console.error(err);
                    toast.error("Could not read CSV file.");
                  } finally {
                    e.target.value = "";
                  }
                }}
              />
            </label>
            <span className="text-[10px] text-muted-foreground">CSV with columns like <span className="font-mono">label,url</span> or just <span className="font-mono">url</span></span>
          </div>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={6}
            placeholder={"https://example.com/news\nDOJ Press, https://www.justice.gov/news"}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono"
          />
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => { setBulkOpen(false); setBulkText(""); }} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            <button onClick={bulkAdd} disabled={bulkBusy || !bulkText.trim()} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50">
              {bulkBusy ? "Adding…" : "Add all"}
            </button>
          </div>
        </div>
      )}

      {adding && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-6 gap-2 rounded border border-border p-3 bg-background">
          <TextInput placeholder="Label" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className="sm:col-span-2" />
          <TextInput placeholder="https://… (optional)" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} className="sm:col-span-2" />
          <select value={draft.frequency} onChange={(e) => setDraft({ ...draft, frequency: e.target.value as any })} className="rounded-md border border-border bg-background px-2 py-1.5 text-xs">
            <option value="daily">daily</option>
            <option value="weekly">weekly</option>
          </select>
          <button onClick={add} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">Add</button>
        </div>
      )}

      {sources.length === 0 ? (
        <div className="mt-4 text-xs text-muted-foreground italic">No sources configured yet.</div>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {sources.map((s: any) => (
            <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="inline-block w-16 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{s.source_type}</span>
              <div className="flex-1 min-w-0">
                <div className="truncate">{s.label}</div>
                {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="text-[11px] text-primary hover:underline truncate block">{s.url}</a>}
              </div>
              <select value={s.frequency} onChange={(e) => toggle(s, { frequency: e.target.value as any })} className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px]">
                <option value="daily">daily</option>
                <option value="weekly">weekly</option>
              </select>
              <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <input type="checkbox" checked={s.enabled} onChange={(e) => toggle(s, { enabled: e.target.checked })} />
                on
              </label>
              <button onClick={async () => { await delFn({ data: { id: s.id } }); refetch(); }} className="opacity-50 hover:opacity-100">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UploadZone({ category, items, onAttach, onUpload, onRemove }: any) {
  const [mode, setMode] = useState<null | "url" | "file">(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function doFileUpload() {
    if (!file) return;
    setBusy(true);
    try {
      await onUpload(category, file);
      setFile(null);
      setMode(null);
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-md border border-border bg-surface/30 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{category}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">{items.length} item{items.length !== 1 && "s"}</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { setMode(mode === "file" ? null : "file"); setFile(null); }} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <Upload className="h-3 w-3" /> Upload file
          </button>
          <button onClick={() => setMode(mode === "url" ? null : "url")} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <Plus className="h-3 w-3" /> Attach URL
          </button>
        </div>
      </div>
      {mode === "url" && (
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <TextInput placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <TextInput placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button onClick={() => { if (title && url) { onAttach(category, title, url); setTitle(""); setUrl(""); setMode(null); } }}
            className="rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground">Add</button>
        </div>
      )}
      {mode === "file" && (
        <div className="mt-3 flex flex-col sm:flex-row items-start sm:items-center gap-2">
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-xs file:mr-3 file:rounded file:border-0 file:bg-primary/15 file:px-3 file:py-1.5 file:text-xs file:text-primary"
          />
          <button
            onClick={doFileUpload}
            disabled={!file || busy}
            className="rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {busy ? <><Loader2 className="h-3 w-3 animate-spin" /> Uploading…</> : <>Upload</>}
          </button>
          <span className="text-[10px] text-muted-foreground">Max 50 MB · stored in mission-documents</span>
        </div>
      )}
      {items.length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {items.map((it: any) => (
            <li key={it.id} className="flex items-center justify-between py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate text-foreground">
                  {it.title}
                  {it.file_path && <span className="ml-2 text-[10px] text-muted-foreground">[file]</span>}
                  {it.external_url && <span className="ml-2 text-[10px] text-muted-foreground">[url]</span>}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {new Date(it.created_at).toLocaleDateString()} · {it.uploaded_by_name ?? "—"}
                </div>
              </div>
              <button onClick={() => onRemove(it.id)} className="opacity-50 hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   04 — Strategic Foundation
   ──────────────────────────────────────────────────────────── */
const STRATEGY_KINDS = [
  { key: "discriminator", label: "Discriminators" },
  { key: "proof_point", label: "Proof Points" },
  { key: "client_priority", label: "Client Priorities" },
  { key: "competitor", label: "Competitors", hasNotes: true },
  { key: "risk", label: "Risks", hasNotes: true },
];
function SectionStrategy({ missionId, mission, strategy, sensitivities, refetch }: any) {
  const [themes, setThemes] = useState<string[]>(mission?.win_themes ?? []);
  const [focusAreas, setFocusAreas] = useState<string[]>(mission?.focus_areas ?? []);
  const [textForm, setTextForm] = useState({ sensitivities: "", language: "", avoid: "", reinforce: "" });
  const [savingSens, setSavingSens] = useState(false);

  useEffect(() => {
    setThemes(mission?.win_themes ?? []);
    setFocusAreas(mission?.focus_areas ?? []);
  }, [mission]);

  useEffect(() => {
    const byCat: Record<string, string> = {};
    for (const row of (sensitivities ?? []) as Array<{ category: string; note: string | null }>) {
      if (!row.category) continue;
      byCat[row.category] = row.note ?? "";
    }
    setTextForm({
      sensitivities: byCat.sensitivity ?? "",
      language: byCat.language ?? "",
      avoid: byCat.avoid ?? "",
      reinforce: byCat.reinforce ?? "",
    });
  }, [sensitivities]);


  async function addItem(kind: string, label: string, notes?: string) {
    if (!label.trim()) return;
    const { error } = await supabase.from("mission_strategy").insert({ mission_id: missionId, kind, label, notes });
    if (error) return toast.error(error.message);
    refetch();
  }
  async function delItem(id: string) {
    await supabase.from("mission_strategy").delete().eq("id", id);
    refetch();
  }
  async function saveThemes() {
    await supabase.from("missions").update({ win_themes: themes }).eq("id", missionId);
    toast.success("Win themes saved");
    refetch();
  }
  async function saveFocusAreas() {
    await supabase.from("missions").update({ focus_areas: focusAreas }).eq("id", missionId);
    toast.success("Focus areas saved");
    refetch();
  }
  async function saveSensitivities() {
    setSavingSens(true);
    try {
      const cats = ["sensitivity", "language", "avoid", "reinforce"];
      const { error: delErr } = await supabase
        .from("mission_sensitivities")
        .delete()
        .eq("mission_id", missionId)
        .in("category", cats);
      if (delErr) return toast.error(delErr.message);
      const rows = [
        { category: "sensitivity", note: textForm.sensitivities },
        { category: "language", note: textForm.language },
        { category: "avoid", note: textForm.avoid },
        { category: "reinforce", note: textForm.reinforce },
      ]
        .filter((r) => r.note.trim().length > 0)
        .map((r) => ({ mission_id: missionId, category: r.category, note: r.note.trim() }));
      if (rows.length > 0) {
        const { error } = await supabase.from("mission_sensitivities").insert(rows);
        if (error) return toast.error(error.message);
      }
      toast.success("Sensitivities saved");
      refetch();
    } finally {
      setSavingSens(false);
    }
  }


  return (
    <Section id="strategy" n="04" label="Win Strategy" sublabel="The strategic inputs that make IRIS intelligent about this specific mission.">
      <div className="space-y-10">
        {/* ── Strategic Foundation: the five IRIS-grounding fields ── */}
        <StrategicFoundationBlock missionId={missionId} mission={mission} hasRfp={false} refetch={refetch} />

        <div className="pt-6 border-t border-border space-y-8">
          {/* Win themes — stored on missions.win_themes */}
          <RepeatingArray label="Win Themes" items={themes} onChange={setThemes} onSave={saveThemes} />
          <RepeatingArray label="Focus Areas" items={focusAreas} onChange={setFocusAreas} onSave={saveFocusAreas} />

          {STRATEGY_KINDS.map((k) => (
            <StrategyGroup
              key={k.key}
              label={k.label}
              hasNotes={k.hasNotes}
              items={strategy.filter((s: any) => s.kind === k.key)}
              onAdd={(label: string, notes: string) => addItem(k.key, label, notes)}
              onDelete={delItem}
            />
          ))}

          <div className="pt-4 border-t border-border space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Sensitivities"><TextArea rows={3} placeholder="Topics or terms IRIS should treat carefully…" value={textForm.sensitivities} onChange={(e) => setTextForm({ ...textForm, sensitivities: e.target.value })} /></Field>
              <Field label="Language Guidance"><TextArea rows={3} placeholder="Tone, voice, phrasing rules…" value={textForm.language} onChange={(e) => setTextForm({ ...textForm, language: e.target.value })} /></Field>
              <Field label="Things to Avoid"><TextArea rows={3} value={textForm.avoid} onChange={(e) => setTextForm({ ...textForm, avoid: e.target.value })} /></Field>
              <Field label="Things to Reinforce"><TextArea rows={3} value={textForm.reinforce} onChange={(e) => setTextForm({ ...textForm, reinforce: e.target.value })} /></Field>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={saveSensitivities}
                disabled={savingSens}
                className="rounded-md border border-border bg-foreground px-4 py-2 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
              >
                {savingSens ? "Saving…" : "Save sensitivities"}
              </button>
            </div>
          </div>

        </div>
      </div>
    </Section>
  );
}

/* ────────────────────────────────────────────────────────────
   Strategic Foundation — five IRIS-grounding fields
   (Highlights / Strengths / Win Strategy / Program Goals / Key Requirements)
   ──────────────────────────────────────────────────────────── */
type SFTextField = "mission_highlights" | "client_strengths" | "client_win_strategy" | "program_goals";

const SF_TEXT_FIELDS: Array<{ key: SFTextField; label: string; helper: string; placeholder: string }> = [
  {
    key: "mission_highlights",
    label: "Mission Highlights",
    helper: "What makes this opportunity significant. Appears at the top of Mission Brief and in the IRIS daily brief.",
    placeholder: "Describe what makes this mission significant — scope, visibility, strategic importance.",
  },
  {
    key: "client_strengths",
    label: "Client Strengths",
    helper: "What the client brings to the table. IRIS uses this to score win-theme alignment across every question.",
    placeholder: "What does the client do better than anyone else? What will evaluators already believe about them?",
  },
  {
    key: "client_win_strategy",
    label: "Client Win Strategy",
    helper: "The core argument we're making. IRIS uses this to score win-theme alignment across every question.",
    placeholder: "What is the central claim of our proposal? Why should the evaluator choose our client over all others?",
  },
  {
    key: "program_goals",
    label: "Program Goals / Future State",
    helper: "Where the client is taking this in 3–5 years. IRIS references this when generating question briefs and coaching.",
    placeholder: "What outcomes does this program aim to achieve? What does success look like for the people it serves?",
  },
];

function StrategicFoundationBlock({ missionId, mission, refetch }: { missionId: string; mission: any; hasRfp?: boolean; refetch: () => void }) {
  const generateFn = useServerFn(generateStrategicField);

  const [values, setValues] = useState({
    mission_highlights: mission?.mission_highlights ?? "",
    client_strengths: mission?.client_strengths ?? "",
    client_win_strategy: mission?.client_win_strategy ?? "",
    program_goals: mission?.program_goals ?? "",
  });
  const [requirements, setRequirements] = useState<string[]>(mission?.key_requirements ?? []);
  const [reqDraft, setReqDraft] = useState("");
  const [loading, setLoading] = useState<Record<StrategicFieldKey, boolean>>({
    mission_highlights: false, client_strengths: false, client_win_strategy: false,
    program_goals: false, key_contract_requirements: false,
  });
  const [generatingAll, setGeneratingAll] = useState(false);
  const [docCount, setDocCount] = useState<number>(0);

  useEffect(() => {
    setValues({
      mission_highlights: mission?.mission_highlights ?? "",
      client_strengths: mission?.client_strengths ?? "",
      client_win_strategy: mission?.client_win_strategy ?? "",
      program_goals: mission?.program_goals ?? "",
    });
    setRequirements(mission?.key_requirements ?? []);
  }, [
    mission?.mission_highlights,
    mission?.client_strengths,
    mission?.client_win_strategy,
    mission?.program_goals,
    mission?.key_requirements,
  ]);

  // Detect uploaded RFP docs (any vault doc counts as RFP context for IRIS)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("mission_vault_documents")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", missionId);
      if (!cancelled) setDocCount(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [missionId]);

  const allEmpty = useMemo(
    () =>
      !values.mission_highlights.trim() &&
      !values.client_strengths.trim() &&
      !values.client_win_strategy.trim() &&
      !values.program_goals.trim() &&
      requirements.length === 0,
    [values, requirements],
  );

  async function saveText(field: SFTextField, val: string) {
    setValues((v) => ({ ...v, [field]: val }));
    const patch =
      field === "mission_highlights" ? { mission_highlights: val }
      : field === "client_strengths" ? { client_strengths: val }
      : field === "client_win_strategy" ? { client_win_strategy: val }
      : { program_goals: val };
    const { error } = await supabase.from("missions").update(patch).eq("id", missionId);
    if (error) toast.error(error.message);
  }

  async function saveRequirements(next: string[]) {
    setRequirements(next);
    const { error } = await supabase.from("missions").update({ key_requirements: next }).eq("id", missionId);
    if (error) toast.error(error.message);
  }

  async function generateOne(field: StrategicFieldKey) {
    setLoading((l) => ({ ...l, [field]: true }));
    try {
      const res = await generateFn({ data: { missionId, field } });
      if (field === "key_contract_requirements") {
        const items = Array.isArray(res.value) ? res.value : [];
        setRequirements(items);
        await supabase.from("missions").update({ key_requirements: items }).eq("id", missionId);
      } else {
        const text = typeof res.value === "string" ? res.value : "";
        setValues((v) => ({ ...v, [field]: text }));
        const patch =
          field === "mission_highlights" ? { mission_highlights: text }
          : field === "client_strengths" ? { client_strengths: text }
          : field === "client_win_strategy" ? { client_win_strategy: text }
          : { program_goals: text };
        await supabase.from("missions").update(patch).eq("id", missionId);
      }
      toast.success("IRIS generated a draft — review and edit before launch.");
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "IRIS generation failed");
    } finally {
      setLoading((l) => ({ ...l, [field]: false }));
    }
  }

  async function generateAll() {
    setGeneratingAll(true);
    try {
      const fields: StrategicFieldKey[] = [
        "mission_highlights", "client_strengths", "client_win_strategy",
        "program_goals", "key_contract_requirements",
      ];
      for (const f of fields) {
        // sequential so IRIS can build on prior fields
        await generateOne(f);
      }
    } finally {
      setGeneratingAll(false);
    }
  }

  return (
    <div className="space-y-6">
      {allEmpty && docCount > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-md border border-[#C49A22]/40 bg-[#C49A22]/5 px-4 py-3">
          <div className="flex items-center gap-3 text-sm">
            <Zap className="h-4 w-4 text-[#C49A22] shrink-0" />
            <span className="text-foreground">
              IRIS can generate your Strategic Foundation from {docCount} uploaded RFP document{docCount === 1 ? "" : "s"}.
            </span>
          </div>
          <button
            onClick={generateAll}
            disabled={generatingAll}
            className="inline-flex items-center gap-2 rounded-md bg-[#C49A22] px-4 py-2 text-xs font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50 transition"
          >
            {generatingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Generate All Five Fields
          </button>
        </div>
      )}

      {SF_TEXT_FIELDS.map((f) => (
        <StrategicTextField
          key={f.key}
          label={f.label}
          helper={f.helper}
          placeholder={f.placeholder}
          value={values[f.key]}
          loading={loading[f.key]}
          onChange={(v) => setValues((vs) => ({ ...vs, [f.key]: v }))}
          onBlur={(v) => saveText(f.key, v)}
          onGenerate={() => generateOne(f.key)}
        />
      ))}

      <StrategicRequirementsField
        items={requirements}
        draft={reqDraft}
        loading={loading.key_contract_requirements}
        onDraftChange={setReqDraft}
        onAdd={() => {
          if (!reqDraft.trim()) return;
          saveRequirements([...requirements, reqDraft.trim()]);
          setReqDraft("");
        }}
        onRemove={(i) => saveRequirements(requirements.filter((_, j) => j !== i))}
        onGenerate={() => generateOne("key_contract_requirements")}
      />
    </div>
  );
}

function StrategicTextField({ label, helper, placeholder, value, loading, onChange, onBlur, onGenerate }: {
  label: string; helper: string; placeholder: string; value: string; loading: boolean;
  onChange: (v: string) => void; onBlur: (v: string) => void; onGenerate: () => void;
}) {
  const empty = !value.trim();
  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-1.5">
        <div>
          <span className="block text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
          <p className="mt-0.5 text-[11px] text-muted-foreground/80 max-w-xl">{helper}</p>
        </div>
        <button
          onClick={onGenerate}
          disabled={loading}
          className={
            empty
              ? "inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#C49A22] px-3 py-1.5 text-[11px] font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50 transition"
              : "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-surface-hover disabled:opacity-50 transition"
          }
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          {empty ? "Generate with IRIS" : "Regenerate"}
        </button>
      </div>
      <TextArea
        rows={5}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onBlur(e.target.value)}
      />
    </div>
  );
}

function StrategicRequirementsField({ items, draft, loading, onDraftChange, onAdd, onRemove, onGenerate }: {
  items: string[]; draft: string; loading: boolean;
  onDraftChange: (v: string) => void; onAdd: () => void; onRemove: (i: number) => void; onGenerate: () => void;
}) {
  const empty = items.length === 0;
  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-1.5">
        <div>
          <span className="block text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Key Contract Requirements</span>
          <p className="mt-0.5 text-[11px] text-muted-foreground/80 max-w-xl">
            The non-negotiables. Feeds the Compliance Panel in every question workspace.
          </p>
        </div>
        <button
          onClick={onGenerate}
          disabled={loading}
          className={
            empty
              ? "inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#C49A22] px-3 py-1.5 text-[11px] font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50 transition"
              : "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-surface-hover disabled:opacity-50 transition"
          }
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          {empty ? "Generate with IRIS" : "Regenerate"}
        </button>
      </div>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
            <span className="flex-1 leading-snug">{it}</span>
            <button onClick={() => onRemove(i)} className="opacity-50 hover:opacity-100 mt-0.5">
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <TextInput
          placeholder="Add a key requirement (e.g. 'Bidder must be NJ-registered entity')"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }}
        />
        <button onClick={onAdd} className="rounded-md border border-border bg-background px-3 text-sm hover:bg-surface-hover">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
function RepeatingArray({ label, items, onChange, onSave }: { label: string; items: string[]; onChange: (v: string[]) => void; onSave: () => void }) {
  const [draft, setDraft] = useState("");
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
        <button onClick={onSave} className="text-[11px] text-muted-foreground hover:text-foreground">Save</button>
      </div>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
            <span className="flex-1">{it}</span>
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="opacity-50 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <TextInput placeholder={`Add ${label.toLowerCase().replace(/s$/, "")}…`} value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { onChange([...items, draft.trim()]); setDraft(""); } }} />
        <button onClick={() => { if (draft.trim()) { onChange([...items, draft.trim()]); setDraft(""); } }}
          className="rounded-md border border-border bg-background px-3 text-sm hover:bg-surface-hover"><Plus className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}
function StrategyGroup({ label, items, hasNotes, onAdd, onDelete }: any) {
  const [label_, setLabel_] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-2">{label}</div>
      <ul className="space-y-1.5">
        {items.map((it: any) => (
          <li key={it.id} className="flex items-start gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
            <div className="flex-1">
              <div>{it.label}</div>
              {it.notes && <div className="text-xs text-muted-foreground mt-0.5">{it.notes}</div>}
            </div>
            <button onClick={() => onDelete(it.id)} className="opacity-50 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <TextInput placeholder="Name" value={label_} onChange={(e) => setLabel_(e.target.value)} />
        {hasNotes && <TextInput placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />}
        <button onClick={() => { onAdd(label_, notes); setLabel_(""); setNotes(""); }}
          className="rounded-md border border-border bg-background px-3 text-sm hover:bg-surface-hover"><Plus className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   05 — Client Intelligence
   ──────────────────────────────────────────────────────────── */
function SectionClientIntel({ missionId, intel, refetch }: any) {
  const [form, setForm] = useState({
    contacts: "", stakeholders: "", decision_makers: "", relationship_owners: "",
    political_considerations: "", meeting_cadence: "", notes: "",
  });
  useEffect(() => {
    if (intel) {
      setForm({
        contacts: (intel.contacts ?? []).join("\n"),
        stakeholders: (intel.stakeholders ?? []).join("\n"),
        decision_makers: (intel.decision_makers ?? []).join("\n"),
        relationship_owners: (intel.relationship_owners ?? []).join("\n"),
        political_considerations: intel.political_considerations ?? "",
        meeting_cadence: intel.meeting_cadence ?? "",
        notes: intel.notes ?? "",
      });
    }
  }, [intel]);

  async function save() {
    const payload = {
      mission_id: missionId,
      contacts: form.contacts.split("\n").filter(Boolean),
      stakeholders: form.stakeholders.split("\n").filter(Boolean),
      decision_makers: form.decision_makers.split("\n").filter(Boolean),
      relationship_owners: form.relationship_owners.split("\n").filter(Boolean),
      political_considerations: form.political_considerations,
      meeting_cadence: form.meeting_cadence,
      notes: form.notes,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("mission_client_intel").upsert(payload);
    if (error) return toast.error(error.message);
    toast.success("Client intel saved");
    refetch();
  }

  return (
    <Section
      id="client"
      n="05"
      label="Agency & Stakeholder Intelligence"
      sublabel="Who matters on the issuing agency side — AND every advocate, CBO, provider, research, university, and policy partner that touches this scope."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Agency Key Contacts (one per line)">
          <TextArea rows={3} value={form.contacts} onChange={(e) => setForm({ ...form, contacts: e.target.value })} />
        </Field>
        <Field label="Decision Makers — Full Authority Chain" span={2}>
          <p className="-mt-1 mb-2 text-[11px] text-muted-foreground">
            One per line. Don't stop at procurement. Capture the <strong className="text-foreground/80">entire chain of authority</strong>: evaluation committee → program office (e.g., CSOC) → <strong className="text-foreground/80">cross-agency oversight (DCF, DHS, DMAHS/Medicaid, DOE, JJC)</strong> → federal funder (CMS, ACF, SAMHSA) → executive (Commissioner, Governor's Office).
            Format: <span className="font-mono">Org/Person — role + why they have decision power</span>
          </p>
          <TextArea rows={6} value={form.decision_makers} onChange={(e) => setForm({ ...form, decision_makers: e.target.value })} />
        </Field>
        <Field
          label="Stakeholders & Advocacy Ecosystem"
          span={2}
        >
          <p className="-mt-1 mb-2 text-[11px] text-muted-foreground">
            One per line. Be exhaustive — community-based organizations (CBOs), advocacy groups, non-profits, current/prospective providers,
            university & research partners, policy partners, parent/family coalitions, professional associations, faith-based groups,
            philanthropic funders. <strong className="text-foreground/80">Advocates are decisive.</strong> Format: <span className="font-mono">Org Name — role/relationship — contact</span>
          </p>
          <TextArea
            rows={8}
            value={form.stakeholders}
            onChange={(e) => setForm({ ...form, stakeholders: e.target.value })}
            placeholder={"NJ Alliance for Children, Youth & Families — statewide CBO coalition — contact@njacyf.org\nRutgers Center for Behavioral Health Services & Criminal Justice Research — research partner — ...\nACNJ (Advocates for Children of NJ) — policy/advocacy — ..."}
          />
        </Field>
        <Field label="Political Considerations">
          <TextArea rows={3} value={form.political_considerations} onChange={(e) => setForm({ ...form, political_considerations: e.target.value })} />
        </Field>
        <Field label="Meeting Cadence">
          <TextArea rows={3} value={form.meeting_cadence} onChange={(e) => setForm({ ...form, meeting_cadence: e.target.value })} />
        </Field>
        <Field label="Notes" span={2}>
          <TextArea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </div>
      <div className="mt-5 flex justify-end">
        <button onClick={save} className="rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-surface-hover">Save Agency & Stakeholder Intel</button>
      </div>
    </Section>
  );
}

/* ────────────────────────────────────────────────────────────
   06 — Timeline & Gates
   ──────────────────────────────────────────────────────────── */
const TIMELINE_FIELDS = [
  { key: "question_deadline", label: "Question Deadline" },
  { key: "pink_team", label: "Pink Team" },
  { key: "red_team", label: "Red Team" },
  { key: "gold_team", label: "Gold Team" },
  { key: "exec_review", label: "Executive Review" },
  { key: "submission", label: "Submission" },
  { key: "orals", label: "Orals" },
  { key: "award", label: "Award" },
];
function SectionTimeline({ missionId, timeline, refetch }: any) {
  const [form, setForm] = useState<any>({});
  useEffect(() => {
    if (timeline) {
      const f: any = {};
      TIMELINE_FIELDS.forEach((tf) => { f[tf.key] = timeline[tf.key]?.slice(0, 10) ?? ""; });
      setForm(f);
    }
  }, [timeline]);

  async function save() {
    const payload: any = { mission_id: missionId, updated_at: new Date().toISOString() };
    TIMELINE_FIELDS.forEach((tf) => { payload[tf.key] = form[tf.key] || null; });
    const { error } = await supabase.from("mission_timeline").upsert(payload);
    if (error) return toast.error(error.message);
    toast.success("Timeline saved");
    refetch();
  }

  return (
    <Section id="timeline" n="06" label="Deadlines & Decision Gates" sublabel="Deadlines are dates; gates are decision checkpoints. Auto-populates the Mission Calendar.">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
        {TIMELINE_FIELDS.map((tf) => (
          <Field key={tf.key} label={tf.label}>
            <TextInput type="date" value={form[tf.key] ?? ""} onChange={(e) => setForm({ ...form, [tf.key]: e.target.value })} />
          </Field>
        ))}
      </div>
      <div className="mt-5 flex justify-end">
        <button onClick={save} className="rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-surface-hover">Save Timeline</button>
      </div>
    </Section>
  );
}

/* ────────────────────────────────────────────────────────────
   07 — Question Setup
   ──────────────────────────────────────────────────────────── */
function SectionQuestions({ missionId, questions, volumes, refetch }: any) {
  const [vName, setVName] = useState("");
  const [vDesc, setVDesc] = useState("");
  const [paste, setPaste] = useState("");
  const [matrixOpen, setMatrixOpen] = useState(false);

  async function addVolume() {
    if (!vName.trim()) return;
    await supabase.from("mission_volumes").insert({ mission_id: missionId, name: vName, description: vDesc, sort_order: volumes.length });
    setVName(""); setVDesc(""); refetch();
  }
  async function pasteQuestions() {
    const lines = paste.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    const rows = lines.map((line, i) => {
      const m = line.match(/^([\w.-]+)[\s:.-]+(.+)$/);
      return {
        mission_id: missionId,
        question_number: m ? m[1] : String(i + 1),
        title: m ? m[2] : line,
        question_text: line,
        sort_order: questions.length + i,
        status: "draft",
      };
    });
    const { error } = await supabase.from("question_records").insert(rows);
    if (error) return toast.error(error.message);
    setPaste(""); toast.success(`${rows.length} questions imported`); refetch();
  }

  return (
    <Section id="questions" n="07" label="Question Setup" sublabel={`${(questions?.length ?? 0)} questions configured · Evaluation mapping required. Pre-populates the Studio with questions, owners, and deadlines.`}>
      <div className="space-y-6">
        {/* IRIS Staffing Summary — generated after each matrix import */}
        <MissionStaffingBanner missionId={missionId} />

        {/* Upload Matrix — IRIS-reconciled */}
        <div className="rounded-md border border-primary/30 bg-primary/[0.04] p-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-primary mb-1">Source of Truth · Matrix</div>
            <div className="text-sm font-medium">Upload Assignment Matrix</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Upload the client's question + assignment matrix (Excel, CSV, PDF, Word). For spreadsheets you'll confirm a column mapping; PDFs/Word use IRIS auto-extraction. After commit, IRIS generates a staffing summary flagging unassigned questions, overloaded writers, and high-risk sections.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMatrixOpen(true)}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-[#C49A22] px-3 py-2 text-xs font-semibold text-black hover:bg-[#D4AA32]"
          >
            <Upload className="h-3 w-3" /> Upload Matrix
          </button>
        </div>

        {matrixOpen && (
          <UploadMatrixModal
            missionId={missionId}
            onClose={() => setMatrixOpen(false)}
            onCommitted={() => { setMatrixOpen(false); refetch(); }}
          />
        )}

        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-2">Volumes</div>
          <ul className="space-y-1.5">
            {volumes.map((v: any) => (
              <li key={v.id} className="rounded-md border border-border bg-background px-3 py-2 text-sm flex items-start justify-between">
                <div>
                  <div className="font-medium">{v.name}</div>
                  {v.description && <div className="text-xs text-muted-foreground">{v.description}</div>}
                </div>
                <button onClick={async () => { await supabase.from("mission_volumes").delete().eq("id", v.id); refetch(); }} className="opacity-50 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <TextInput placeholder="Volume name" value={vName} onChange={(e) => setVName(e.target.value)} />
            <TextInput placeholder="Description" value={vDesc} onChange={(e) => setVDesc(e.target.value)} className="sm:col-span-2" />
          </div>
          <div className="mt-2 flex justify-end">
            <button onClick={addVolume} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><Plus className="h-3 w-3" /> Add volume</button>
          </div>
        </div>

        {/* Paste import */}
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-2">Quick-paste questions</div>
          <div className="text-xs text-muted-foreground mb-2">
            Paste an RFP question list — one per line, numbered first (e.g. <span className="font-mono">1.1 Describe your staffing approach</span>). Each line becomes a question record you can assign. Use <span className="font-medium">Upload Matrix</span> above if you have a compliance spreadsheet instead.
          </div>
          <TextArea rows={4} placeholder="1.1 Describe your staffing approach&#10;1.2 Provide your implementation timeline" value={paste} onChange={(e) => setPaste(e.target.value)} />
          <div className="mt-2 flex justify-end">
            <button onClick={pasteQuestions} className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-surface-hover">Import {paste.split("\n").filter(Boolean).length || ""} questions</button>
          </div>
        </div>

        {/* Question list */}
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-2 flex items-center justify-between">
            <span>
              Questions <span className="tabular-nums">({questions.length})</span>
            </span>
            <span className="tabular-nums">
              {questions.filter((q: any) => q.assigned_writer_id).length}/{questions.length} assigned
            </span>
          </div>
          {questions.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">No questions yet.</div>
          ) : (
            <ul className="divide-y divide-border border border-border rounded-md">
              {questions.slice(0, 100).map((q: any) => (
                <QuestionAssignmentRow key={q.id} question={q} refetch={refetch} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
}

function QuestionAssignmentRow({ question, refetch }: { question: any; refetch: () => void }) {
  const [open, setOpen] = useState(false);
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-min"],
    queryFn: async () => (await supabase.from("profiles").select("id,display_name,email").limit(500)).data ?? [],
  });

  async function assign(field: "assigned_writer_id" | "assigned_sme_id" | "reviewer_id", userId: string | null) {
    const patch = { [field]: userId } as any;
    const { error } = await supabase
      .from("question_records")
      .update(patch)
      .eq("id", question.id);
    if (error) return toast.error(error.message);
    refetch();
  }

  const writer = profiles.find((p: any) => p.id === question.assigned_writer_id);
  const sme = profiles.find((p: any) => p.id === question.assigned_sme_id);
  const reviewer = profiles.find((p: any) => p.id === question.reviewer_id);
  const writerLabel = writer ? (writer.display_name ?? writer.email) : "—";

  return (
    <li className="text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 py-2 flex items-center gap-3 text-left hover:bg-surface-hover"
      >
        <span className="font-mono text-[11px] text-muted-foreground w-12 tabular-nums">{question.question_number}</span>
        <span className="flex-1 truncate">{question.title}</span>
        <span className="text-[11px] text-muted-foreground">{question.pens_down_date ?? "—"}</span>
        <span className={`text-[11px] w-32 truncate text-right ${writer ? "text-foreground" : "text-muted-foreground italic"}`}>
          {writerLabel}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3 py-3 bg-surface/30 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-1.5">Writer</div>
            <div className="flex items-center gap-2">
              <PersonPicker
                options={profiles}
                selectedId={question.assigned_writer_id}
                onSelect={(opt) => assign("assigned_writer_id", opt.id)}
              />
              {question.assigned_writer_id && (
                <button onClick={() => assign("assigned_writer_id", null)} className="opacity-50 hover:opacity-100" aria-label="Clear writer">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-1.5">SME</div>
            <div className="flex items-center gap-2">
              <PersonPicker
                options={profiles}
                selectedId={question.assigned_sme_id}
                onSelect={(opt) => assign("assigned_sme_id", opt.id)}
              />
              {question.assigned_sme_id && (
                <button onClick={() => assign("assigned_sme_id", null)} className="opacity-50 hover:opacity-100" aria-label="Clear SME">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">{sme?.display_name ?? sme?.email ?? ""}</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-1.5">Reviewer</div>
            <div className="flex items-center gap-2">
              <PersonPicker
                options={profiles}
                selectedId={question.reviewer_id}
                onSelect={(opt) => assign("reviewer_id", opt.id)}
              />
              {question.reviewer_id && (
                <button onClick={() => assign("reviewer_id", null)} className="opacity-50 hover:opacity-100" aria-label="Clear reviewer">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">{reviewer?.display_name ?? reviewer?.email ?? ""}</div>
          </div>
        </div>
      )}
    </li>
  );
}

/* ────────────────────────────────────────────────────────────
   08 — Governance
   ──────────────────────────────────────────────────────────── */
function SectionGovernance({ missionId, governance, refetch }: any) {
  const [steps, setSteps] = useState<string[]>([]);
  const [authority, setAuthority] = useState("");
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (governance) {
      setSteps((governance.approval_workflow ?? []).filter(Boolean));
      setAuthority(governance.submission_authority ?? "");
    }
  }, [governance]);

  function addStep() {
    const v = draft.trim();
    if (!v) return;
    setSteps([...steps, v]);
    setDraft("");
  }
  function removeStep(i: number) {
    setSteps(steps.filter((_, idx) => idx !== i));
  }
  function moveStep(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    setSteps(next);
  }
  function updateStep(i: number, v: string) {
    setSteps(steps.map((s, idx) => (idx === i ? v : s)));
  }

  async function save() {
    const cleaned = steps.map((s) => s.trim()).filter(Boolean);
    const { error } = await supabase.from("mission_governance").upsert({
      mission_id: missionId,
      approval_workflow: cleaned,
      submission_authority: authority,
      updated_at: new Date().toISOString(),
    });
    if (error) return toast.error(error.message);
    toast.success("Governance saved"); refetch();
  }

  return (
    <Section id="governance" n="08" label="Governance" sublabel="Who approves, and in what order.">
      <div className="grid grid-cols-1 gap-5">
        <Field label="Approval Steps">
          <div className="space-y-2">
            {steps.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No approval steps yet. Add one below.</p>
            )}
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums w-6 text-right">{i + 1}.</span>
                <input
                  value={step}
                  onChange={(e) => updateStep(i, e.target.value)}
                  className="flex-1 bg-transparent text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={() => moveStep(i, -1)}
                  disabled={i === 0}
                  className="rounded p-1 text-muted-foreground hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move up"
                  aria-label="Move up"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveStep(i, 1)}
                  disabled={i === steps.length - 1}
                  className="rounded p-1 text-muted-foreground hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move down"
                  aria-label="Move down"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => removeStep(i)}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="Remove step"
                  aria-label="Remove step"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addStep(); } }}
                placeholder="e.g. Capture Lead → Practice Lead → Partner"
                className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40"
              />
              <button
                type="button"
                onClick={addStep}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-surface-hover"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
          </div>
        </Field>
        <Field label="Final Submission Authority">
          <TextInput value={authority} onChange={(e) => setAuthority(e.target.value)} placeholder="Person or role with final sign-off" />
        </Field>
      </div>
      <div className="mt-5 flex justify-end">
        <button onClick={save} className="rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-surface-hover">Save Governance</button>
      </div>
    </Section>
  );
}




/* ────────────────────────────────────────────────────────────
   09 — Financial Setup (admin)
   ──────────────────────────────────────────────────────────── */
function SectionFinancials({ missionId, financials, refetch }: any) {
  const [form, setForm] = useState({ sow: "", budget: "", hours: "", consultants: "", tracking: "" });
  useEffect(() => {
    if (financials) setForm({
      sow: financials.sow ?? "",
      budget: financials.budget?.toString() ?? "",
      hours: financials.hours?.toString() ?? "",
      consultants: (financials.consultants ?? []).join("\n"),
      tracking: financials.tracking?.notes ?? "",
    });
  }, [financials]);

  async function save() {
    const { error } = await supabase.from("mission_financials").upsert({
      mission_id: missionId,
      sow: form.sow,
      budget: form.budget ? Number(form.budget) : null,
      hours: form.hours ? Number(form.hours) : null,
      consultants: form.consultants.split("\n").filter(Boolean),
      tracking: { notes: form.tracking },
      updated_at: new Date().toISOString(),
    });
    if (error) return toast.error(error.message);
    toast.success("Financials saved"); refetch();
  }

  return (
    <Section id="financials" n="09" label="Budget & Pricing Setup" sublabel="Admin only. Never visible to writers, SMEs, or reviewers." collapsible defaultOpen={false} locked>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="SOW Reference"><TextInput value={form.sow} onChange={(e) => setForm({ ...form, sow: e.target.value })} /></Field>
        <Field label="Budget (USD)"><TextInput type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></Field>
        <Field label="Hours"><TextInput type="number" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} /></Field>
        <Field label="Consultants (one per line)"><TextArea rows={3} value={form.consultants} onChange={(e) => setForm({ ...form, consultants: e.target.value })} /></Field>
        <Field label="Internal Financial Tracking" span={2}><TextArea rows={3} value={form.tracking} onChange={(e) => setForm({ ...form, tracking: e.target.value })} /></Field>
      </div>
      <div className="mt-5 flex justify-end">
        <button onClick={save} className="rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-surface-hover">Save Financials</button>
      </div>
    </Section>
  );
}

/* ────────────────────────────────────────────────────────────
   04B — Evaluation Criteria Map
   ──────────────────────────────────────────────────────────── */
type EvalRow = {
  id?: string;
  category: string;
  points: number;
  sections_covered: string[];
  competitive_risk: "low" | "medium" | "high";
  notes: string;
};
function SectionEvaluation({ missionId, criteria, questions, refetch }: any) {
  const saveFn = useServerFn(saveEvaluationCriteria);
  const [rows, setRows] = useState<EvalRow[]>([]);
  const [methodology, setMethodology] = useState("");
  const [methodologyLoaded, setMethodologyLoaded] = useState(false);
  const [savingMethodology, setSavingMethodology] = useState(false);

  useEffect(() => {
    setRows((criteria ?? []).map((c: any) => ({
      id: c.id,
      category: c.category,
      points: c.points,
      sections_covered: Array.isArray(c.sections_covered) ? c.sections_covered.map(String) : [],
      competitive_risk: (c.competitive_risk ?? "medium") as "low" | "medium" | "high",
      notes: c.notes ?? "",
    })));
  }, [criteria]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("missions").select("scoring_methodology").eq("id", missionId).maybeSingle();
      if (!cancelled) {
        setMethodology((data as any)?.scoring_methodology ?? "");
        setMethodologyLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [missionId]);

  const totalPts = rows.reduce((sum, r) => sum + (Number(r.points) || 0), 0);

  function update(i: number, patch: Partial<EvalRow>) {
    setRows((rs) => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function add() {
    setRows((rs) => [...rs, { category: "", points: 0, sections_covered: [], competitive_risk: "medium", notes: "" }]);
  }
  function remove(i: number) { setRows((rs) => rs.filter((_, idx) => idx !== i)); }
  async function save() {
    await saveFn({ data: { missionId, criteria: rows.filter((r) => r.category.trim()).map((r) => ({
      ...r,
      notes: r.notes?.trim() ? r.notes.trim() : null,
    })) } });
    toast.success("Evaluation map saved");
    refetch();
  }
  async function saveMethodology() {
    setSavingMethodology(true);
    try {
      const { error } = await supabase.from("missions").update({ scoring_methodology: methodology || null }).eq("id", missionId);
      if (error) throw error;
      toast.success("Scoring methodology saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally { setSavingMethodology(false); }
  }

  // Count questions covered by each row for the preview column
  function coveredCount(sections: string[]): number {
    if (sections.length === 0) return 0;
    return (questions ?? []).filter((q: any) =>
      sections.some((s) => String(s) === String(q.section_number) || String(q.question_number ?? "").startsWith(String(s))),
    ).length;
  }

  return (
    <Section id="evaluation" n="4B" label="How We'll Be Scored" sublabel="RFP scoring matrix. Drives competitive risk on every question and IRIS priority flags.">
      {/* Mission-wide scoring methodology */}
      <div className="mb-6 rounded-md border border-border bg-surface/30 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Scoring Methodology</span>
          <button
            onClick={saveMethodology}
            disabled={!methodologyLoaded || savingMethodology}
            className="text-xs rounded-md border border-border bg-background px-3 py-1 hover:bg-surface-hover disabled:opacity-50"
          >
            {savingMethodology ? "Saving…" : "Save"}
          </button>
        </div>
        <TextArea
          rows={4}
          placeholder="How will this RFP be scored overall? BAFO rules, pass/fail gates, oral presentations, price weighting, evaluator panel composition, scoring rubric notes…"
          value={methodology}
          onChange={(e) => setMethodology(e.target.value)}
          disabled={!methodologyLoaded}
        />
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground bg-surface/30">
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-right w-20">Points</th>
              <th className="px-3 py-2 text-left">Sections / Q Numbers</th>
              <th className="px-3 py-2 text-center w-24">Q Covered</th>
              <th className="px-3 py-2 text-left w-28">Risk</th>
              <th className="px-3 py-2 text-left">Notes / Detail</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-xs text-muted-foreground italic">No criteria yet. Add one below.</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} className="align-top">
                <td className="px-3 py-2">
                  <TextInput value={r.category} onChange={(e) => update(i, { category: e.target.value })} placeholder="e.g. Technical Approach" />
                </td>
                <td className="px-3 py-2 text-right">
                  <TextInput type="number" value={String(r.points)} onChange={(e) => update(i, { points: Number(e.target.value) || 0 })} className="text-right" />
                </td>
                <td className="px-3 py-2">
                  <TextInput
                    value={r.sections_covered.join(", ")}
                    onChange={(e) => update(i, { sections_covered: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                    placeholder="2, 3.1, 3.2"
                  />
                </td>
                <td className="px-3 py-2 text-center text-xs tabular-nums text-muted-foreground">{coveredCount(r.sections_covered)}</td>
                <td className="px-3 py-2">
                  <select value={r.competitive_risk} onChange={(e) => update(i, { competitive_risk: e.target.value as any })}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs">
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <TextArea
                    rows={2}
                    value={r.notes}
                    onChange={(e) => update(i, { notes: e.target.value })}
                    placeholder="Rubric, evaluator focus, weighting nuances, things to emphasize…"
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => remove(i)} className="opacity-50 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-surface/20 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <td className="px-3 py-2 text-right">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{totalPts}</td>
              <td colSpan={5}></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button onClick={add} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <Plus className="h-3 w-3" /> Add criterion
        </button>
        <button onClick={save} className="rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-surface-hover">Save Evaluation Map</button>
      </div>
    </Section>
  );
}



function SectionDocuments({ missionId }: { missionId: string }) {
  return (
    <section id="documents" className="scroll-mt-24">
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground font-mono">00</div>
        <h2 className="mt-1 text-xl font-light text-foreground">Documents (Vault)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload the RFP, amendments, Q&amp;A, and reference materials. Uploads here feed the auto-extractors that populate every section below.
        </p>
      </div>
      <div className="rounded-lg border border-border bg-surface/30 p-4">
        <IntelligenceVault missionId={missionId} />
      </div>
    </section>
  );
}
