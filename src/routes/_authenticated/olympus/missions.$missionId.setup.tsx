import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CheckCircle2, Circle, Plus, Trash2, Upload, Rocket, ChevronDown, ChevronRight,
  Lock, ArrowRight, X, Radar, Tag,
} from "lucide-react";
import { launchMission } from "@/lib/mission-setup.functions";
import { seedMonitoringWatchlist, saveMonitoringSource, deleteMonitoringSource } from "@/lib/mission-monitoring.functions";
import { saveEvaluationCriteria, saveExpertiseTag, removeExpertiseTag } from "@/lib/mission-evaluation.functions";
import { LaunchSequence } from "@/components/olympus/LaunchSequence";
import { useIsAdmin } from "@/hooks/useAccess";

export const Route = createFileRoute("/_authenticated/olympus/missions/$missionId/setup")({
  component: MissionSetupRecord,
});


/* ────────────────────────────────────────────────────────────
   Section spec — order matters; ids are anchor targets.
   ──────────────────────────────────────────────────────────── */
type SectionId = "identity" | "team" | "inputs" | "strategy" | "evaluation" | "client" | "timeline" | "questions" | "governance" | "financials";

const SECTIONS: Array<{ id: SectionId; n: string; label: string; admin?: boolean }> = [
  { id: "identity", n: "01", label: "Mission Identity" },
  { id: "team", n: "02", label: "Team Assignment" },
  { id: "inputs", n: "03", label: "Mission Inputs" },
  { id: "strategy", n: "04", label: "Strategic Foundation" },
  { id: "evaluation", n: "4B", label: "Evaluation Criteria Map" },
  { id: "client", n: "05", label: "Client Intelligence" },
  { id: "timeline", n: "06", label: "Timeline & Gates" },
  { id: "questions", n: "07", label: "Question Setup" },
  { id: "governance", n: "08", label: "Governance" },
  { id: "financials", n: "09", label: "Financial Setup", admin: true },
];

/* ────────────────────────────────────────────────────────────
   Page
   ──────────────────────────────────────────────────────────── */
function MissionSetupRecord() {
  const { missionId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin } = useIsAdmin();
  const launchFn = useServerFn(launchMission);
  const [confirm, setConfirm] = useState(false);
  const [preLaunchError, setPreLaunchError] = useState<string | null>(null);

  const setup = useSetupData(missionId);
  const completion = useCompletion(setup);

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
                Olympus / Setup Record
              </div>
              <div className="mt-2 text-sm font-medium text-foreground truncate">
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
                    className="group flex items-center gap-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground transition"
                  >
                    {done ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 shrink-0 opacity-40" />
                    )}
                    <span className="font-mono text-[10px] opacity-60">{s.n}</span>
                    <span className="truncate">{s.label}</span>
                  </a>
                );
              })}
            </nav>

            <div className="mt-8 pt-6 border-t border-border">
              <CompletionMeter completion={completion} isAdmin={isAdmin} />
              <button
                onClick={handleLaunch}
                disabled={confirm}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#C49A22] px-4 py-2.5 text-sm font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50 transition"
              >
                <Rocket className="h-4 w-4" />
                Launch Mission
              </button>
              {preLaunchError && <p className="mt-2 text-[11px] text-destructive">{preLaunchError}</p>}
            </div>
          </div>
        </aside>

        {/* ── Main column ── */}
        <main className="flex-1 min-w-0 space-y-16 pb-32">
          <header>
            <div className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground font-mono">
              Mission Setup Record
            </div>
            <h1 className="mt-2 text-3xl font-light tracking-tight text-foreground">
              {setup.mission?.name ?? "Untitled mission"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Complete the sections below. When the mission launches, this record generates
              the Vault, Oracle, Studio, Calendar, team permissions, and the first IRIS briefing.
            </p>
          </header>

          <SectionIdentity missionId={missionId} mission={setup.mission} refetch={setup.refetch} />
          <SectionTeam missionId={missionId} members={setup.members} expertise={setup.expertise} refetch={setup.refetch} />
          <SectionInputs missionId={missionId} mission={setup.mission} docs={setup.docs} monitoring={setup.monitoring} refetch={setup.refetch} />
          <SectionStrategy missionId={missionId} mission={setup.mission} strategy={setup.strategy} sensitivities={setup.sensitivities} refetch={setup.refetch} />
          <SectionEvaluation missionId={missionId} criteria={setup.evaluation} questions={setup.questions} refetch={setup.refetch} />
          <SectionClientIntel missionId={missionId} intel={setup.clientIntel} refetch={setup.refetch} />
          <SectionTimeline missionId={missionId} timeline={setup.timeline} refetch={setup.refetch} />
          <SectionQuestions missionId={missionId} questions={setup.questions} volumes={setup.volumes} refetch={setup.refetch} />
          <SectionGovernance missionId={missionId} governance={setup.governance} refetch={setup.refetch} />
          {isAdmin && (
            <SectionFinancials missionId={missionId} financials={setup.financials} refetch={setup.refetch} />
          )}

          <div className="pt-12 border-t border-border">
            <div className="flex items-center justify-between gap-6">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground font-mono">
                  Final step
                </div>
                <h2 className="mt-2 text-xl font-light text-foreground">Launch Mission</h2>
                <p className="mt-1 text-sm text-muted-foreground max-w-lg">
                  Generates Mission Home, Vault, Oracle, Studio, Calendar, team permissions, and the initial IRIS briefing.
                </p>
              </div>
              <button
                onClick={handleLaunch}
                disabled={confirm}
                className="inline-flex items-center gap-2 rounded-md bg-[#C49A22] px-6 py-3 text-sm font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50 transition"
              >
                <Rocket className="h-4 w-4" />
                Launch Mission
              </button>
            </div>
          </div>
        </main>
      </div>

      {confirm && (
        <LaunchSequence
          missionId={missionId}
          onClose={() => setConfirm(false)}
          onView={() => navigate({ to: "/missions/$missionId/overview", params: { missionId } })}
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
        mission, members, docs, strategy, sensitivities, clientIntel, timeline,
        questions, volumes, governance, financials, monitoring, evaluation, expertise,
      ] = await Promise.all([
        supabase.from("missions").select("*").eq("id", missionId).maybeSingle(),
        supabase.from("mission_members").select("*").eq("mission_id", missionId),
        supabase.from("mission_vault_documents").select("id,title,category,uploaded_by_name,created_at,file_path").eq("mission_id", missionId).order("created_at", { ascending: false }),
        supabase.from("mission_strategy").select("*").eq("mission_id", missionId).order("sort_order"),
        supabase.from("mission_sensitivities").select("*").eq("mission_id", missionId),
        supabase.from("mission_client_intel").select("*").eq("mission_id", missionId).maybeSingle(),
        supabase.from("mission_timeline").select("*").eq("mission_id", missionId).maybeSingle(),
        supabase.from("question_records").select("id,question_number,title,section_number,assigned_writer_id,reviewer_id,pens_down_date,review_path,volume_id,point_value,competitive_risk").eq("mission_id", missionId).order("sort_order"),
        supabase.from("mission_volumes").select("*").eq("mission_id", missionId).order("sort_order"),
        supabase.from("mission_governance").select("*").eq("mission_id", missionId).maybeSingle(),
        supabase.from("mission_financials").select("*").eq("mission_id", missionId).maybeSingle(),
        supabase.from("mission_monitoring_sources").select("*").eq("mission_id", missionId).order("source_type"),
        supabase.from("mission_evaluation_criteria").select("*").eq("mission_id", missionId).order("display_order"),
        supabase.from("mission_member_expertise").select("*").eq("mission_id", missionId),
      ]);
      return {
        mission: mission.data,
        members: members.data ?? [],
        docs: docs.data ?? [],
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
      };
    },
  });
  return {
    ...(q.data ?? {
      mission: null, members: [], docs: [], strategy: [], sensitivities: [],
      clientIntel: null, timeline: null, questions: [], volumes: [], governance: null, financials: null,
      monitoring: [], evaluation: [], expertise: [],
    }),
    refetch: q.refetch,
    isLoading: q.isLoading,
  } as any;
}

function useCompletion(setup: any): Record<SectionId, boolean> {
  return useMemo(() => ({
    identity: !!(setup.mission?.name && setup.mission?.client && setup.mission?.status),
    team: (setup.members?.length ?? 0) > 0,
    inputs: (setup.docs?.length ?? 0) > 0 || (setup.monitoring?.length ?? 0) > 0,
    strategy: (setup.strategy?.length ?? 0) > 0 || (setup.mission?.win_themes?.length ?? 0) > 0,
    evaluation: (setup.evaluation?.length ?? 0) > 0,
    client: !!setup.clientIntel,
    timeline: !!(setup.timeline?.submission),
    questions: (setup.questions?.length ?? 0) > 0,
    governance: !!(setup.governance?.submission_authority),
    financials: !!setup.financials,
  }), [setup]);
}

function CompletionMeter({ completion, isAdmin }: { completion: Record<SectionId, boolean>; isAdmin: boolean }) {
  const list = SECTIONS.filter((s) => !s.admin || isAdmin);
  const done = list.filter((s) => completion[s.id]).length;
  const pct = Math.round((done / list.length) * 100);
  return (
    <div>
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
      state: form.state, incumbent_name: form.incumbent_name,
      submission_date: form.submission_date || null, status: form.status,
    }).eq("id", missionId);
    if (error) return toast.error(error.message);
    toast.success("Identity saved");
    refetch();
  }

  return (
    <Section id="identity" n="01" label="Mission Identity" sublabel="Core mission record. Required to launch.">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Field label="Mission Name" span={2}>
          <TextInput value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Status">
          <Select value={form.status ?? "Setup"} onChange={(v) => setForm({ ...form, status: v })}
            options={["Setup", "Active", "Review", "Submitted", "Won", "Lost"]} />
        </Field>
        <Field label="Client"><TextInput value={form.client ?? ""} onChange={(e) => setForm({ ...form, client: e.target.value })} /></Field>
        <Field label="Opportunity Type"><TextInput value={form.program_type ?? ""} onChange={(e) => setForm({ ...form, program_type: e.target.value })} placeholder="RFP, IDIQ, Sole Source…" /></Field>
        <Field label="State"><TextInput value={form.state ?? ""} onChange={(e) => setForm({ ...form, state: e.target.value })} /></Field>
        <Field label="Prime Contractor"><TextInput value={form.incumbent_name ?? ""} onChange={(e) => setForm({ ...form, incumbent_name: e.target.value })} /></Field>
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
    <Section id="team" n="02" label="Team Assignment" sublabel="Drives mission permissions and IRIS expert routing when launched.">
      <div className="space-y-5">
        {TEAM_ROLES.map((r) => {
          const assigned = members.filter((m: any) => m.role === r.key);
          return (
            <div key={r.key} className="grid grid-cols-12 gap-4 items-start">
              <div className="col-span-3 pt-2">
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{r.label}</div>
              </div>
              <div className="col-span-9 space-y-2">
                {assigned.length === 0 && <span className="text-xs text-muted-foreground italic">None assigned</span>}
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
                  <select
                    value=""
                    onChange={(e) => {
                      const p = profiles.find((x: any) => x.id === e.target.value);
                      if (p) addMember(r.key, p.id, p.display_name ?? p.email ?? "");
                    }}
                    className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
                  >
                    <option value="">+ Add person…</option>
                    {profiles.filter((p: any) => !assigned.find((m: any) => m.user_id === p.id)).map((p: any) => (
                      <option key={p.id} value={p.id}>{p.display_name ?? p.email}</option>
                    ))}
                  </select>
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

  return (
    <Section id="inputs" n="03" label="Mission Inputs" sublabel="Anything attached here lands in The Vault automatically.">
      <div className="space-y-3">
        {INPUT_CATEGORIES.map((cat) => {
          const items = docs.filter((d: any) => d.category === cat);
          return <UploadZone key={cat} category={cat} items={items} onAttach={attachUrl} onRemove={async (id: string) => {
            await supabase.from("mission_vault_documents").delete().eq("id", id);
            refetch();
          }} />;
        })}
      </div>
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
          <button onClick={() => setAdding(!adding)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <Plus className="h-3 w-3" /> Add source
          </button>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Sources IRIS watches automatically on launch. Read-only for writers.
      </p>

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

function UploadZone({ category, items, onAttach, onRemove }: any) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  return (
    <div className="rounded-md border border-border bg-surface/30 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{category}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">{items.length} item{items.length !== 1 && "s"}</span>
        </div>
        <button onClick={() => setAdding(!adding)} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <Upload className="h-3 w-3" /> Attach
        </button>
      </div>
      {adding && (
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <TextInput placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <TextInput placeholder="https://… or file URL" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button onClick={() => { if (title && url) { onAttach(category, title, url); setTitle(""); setUrl(""); setAdding(false); } }}
            className="rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground">Add</button>
        </div>
      )}
      {items.length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {items.map((it: any) => (
            <li key={it.id} className="flex items-center justify-between py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate text-foreground">{it.title}</div>
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
function SectionStrategy({ missionId, mission, strategy, refetch }: any) {
  const [themes, setThemes] = useState<string[]>(mission?.win_themes ?? []);
  const [textForm, setTextForm] = useState({ sensitivities: "", language: "", avoid: "", reinforce: "" });

  useEffect(() => { setThemes(mission?.win_themes ?? []); }, [mission]);

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

  return (
    <Section id="strategy" n="04" label="Strategic Foundation" sublabel="Populates The Oracle for this mission.">
      <div className="space-y-8">
        {/* Win themes — stored on missions.win_themes */}
        <RepeatingArray label="Win Themes" items={themes} onChange={setThemes} onSave={saveThemes} />

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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-4 border-t border-border">
          <Field label="Sensitivities"><TextArea rows={3} placeholder="Topics or terms IRIS should treat carefully…" value={textForm.sensitivities} onChange={(e) => setTextForm({ ...textForm, sensitivities: e.target.value })} /></Field>
          <Field label="Language Guidance"><TextArea rows={3} placeholder="Tone, voice, phrasing rules…" value={textForm.language} onChange={(e) => setTextForm({ ...textForm, language: e.target.value })} /></Field>
          <Field label="Things to Avoid"><TextArea rows={3} value={textForm.avoid} onChange={(e) => setTextForm({ ...textForm, avoid: e.target.value })} /></Field>
          <Field label="Things to Reinforce"><TextArea rows={3} value={textForm.reinforce} onChange={(e) => setTextForm({ ...textForm, reinforce: e.target.value })} /></Field>
        </div>
      </div>
    </Section>
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
    <Section id="client" n="05" label="Client Intelligence" sublabel="Who matters on the client side.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Key Contacts (one per line)"><TextArea rows={3} value={form.contacts} onChange={(e) => setForm({ ...form, contacts: e.target.value })} /></Field>
        <Field label="Stakeholders"><TextArea rows={3} value={form.stakeholders} onChange={(e) => setForm({ ...form, stakeholders: e.target.value })} /></Field>
        <Field label="Decision Makers"><TextArea rows={3} value={form.decision_makers} onChange={(e) => setForm({ ...form, decision_makers: e.target.value })} /></Field>
        <Field label="Relationship Owners"><TextArea rows={3} value={form.relationship_owners} onChange={(e) => setForm({ ...form, relationship_owners: e.target.value })} /></Field>
        <Field label="Political Considerations"><TextArea rows={3} value={form.political_considerations} onChange={(e) => setForm({ ...form, political_considerations: e.target.value })} /></Field>
        <Field label="Meeting Cadence"><TextArea rows={3} value={form.meeting_cadence} onChange={(e) => setForm({ ...form, meeting_cadence: e.target.value })} /></Field>
        <Field label="Client Notes" span={2}><TextArea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      </div>
      <div className="mt-5 flex justify-end">
        <button onClick={save} className="rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-surface-hover">Save Client Intel</button>
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
    <Section id="timeline" n="06" label="Timeline & Gates" sublabel="Auto-populates the Mission Calendar.">
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
    <Section id="questions" n="07" label="Question Setup" sublabel="Pre-populates the Studio with questions, owners, and deadlines.">
      <div className="space-y-6">
        {/* Volumes */}
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
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-2">Import Questions</div>
          <TextArea rows={4} placeholder="Paste one question per line. Format: '1.1 Question text here'" value={paste} onChange={(e) => setPaste(e.target.value)} />
          <div className="mt-2 flex justify-end">
            <button onClick={pasteQuestions} className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-surface-hover">Import {paste.split("\n").filter(Boolean).length || ""} questions</button>
          </div>
        </div>

        {/* Question list */}
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-2">
            Questions <span className="tabular-nums">({questions.length})</span>
          </div>
          {questions.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">No questions yet.</div>
          ) : (
            <ul className="divide-y divide-border border border-border rounded-md">
              {questions.slice(0, 50).map((q: any) => (
                <li key={q.id} className="px-3 py-2 text-sm flex items-center gap-3">
                  <span className="font-mono text-[11px] text-muted-foreground w-12 tabular-nums">{q.question_number}</span>
                  <span className="flex-1 truncate">{q.title}</span>
                  <span className="text-[11px] text-muted-foreground">{q.pens_down_date ?? "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
}

/* ────────────────────────────────────────────────────────────
   08 — Governance
   ──────────────────────────────────────────────────────────── */
function SectionGovernance({ missionId, governance, refetch }: any) {
  const [form, setForm] = useState({ approval: "", escalation: "", leadership: "", quality: "", authority: "" });
  useEffect(() => {
    if (governance) setForm({
      approval: (governance.approval_workflow ?? []).join("\n"),
      escalation: (governance.escalation_path ?? []).join("\n"),
      leadership: (governance.leadership_gates ?? []).join("\n"),
      quality: (governance.quality_gates ?? []).join("\n"),
      authority: governance.submission_authority ?? "",
    });
  }, [governance]);

  async function save() {
    const { error } = await supabase.from("mission_governance").upsert({
      mission_id: missionId,
      approval_workflow: form.approval.split("\n").filter(Boolean),
      escalation_path: form.escalation.split("\n").filter(Boolean),
      leadership_gates: form.leadership.split("\n").filter(Boolean),
      quality_gates: form.quality.split("\n").filter(Boolean),
      submission_authority: form.authority,
      updated_at: new Date().toISOString(),
    });
    if (error) return toast.error(error.message);
    toast.success("Governance saved"); refetch();
  }

  return (
    <Section id="governance" n="08" label="Governance">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Approval Workflow (one step per line)"><TextArea rows={4} value={form.approval} onChange={(e) => setForm({ ...form, approval: e.target.value })} /></Field>
        <Field label="Escalation Path"><TextArea rows={4} value={form.escalation} onChange={(e) => setForm({ ...form, escalation: e.target.value })} /></Field>
        <Field label="Leadership Gates"><TextArea rows={4} value={form.leadership} onChange={(e) => setForm({ ...form, leadership: e.target.value })} /></Field>
        <Field label="Quality Gates"><TextArea rows={4} value={form.quality} onChange={(e) => setForm({ ...form, quality: e.target.value })} /></Field>
        <Field label="Submission Authority" span={2}><TextInput value={form.authority} onChange={(e) => setForm({ ...form, authority: e.target.value })} /></Field>
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
    <Section id="financials" n="09" label="Financial Setup" sublabel="Admin only. Never visible to writers, SMEs, or reviewers." collapsible defaultOpen={false} locked>
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
};
function SectionEvaluation({ missionId, criteria, questions, refetch }: any) {
  const saveFn = useServerFn(saveEvaluationCriteria);
  const [rows, setRows] = useState<EvalRow[]>([]);
  useEffect(() => {
    setRows((criteria ?? []).map((c: any) => ({
      id: c.id,
      category: c.category,
      points: c.points,
      sections_covered: Array.isArray(c.sections_covered) ? c.sections_covered.map(String) : [],
      competitive_risk: (c.competitive_risk ?? "medium") as "low" | "medium" | "high",
    })));
  }, [criteria]);

  const totalPts = rows.reduce((sum, r) => sum + (Number(r.points) || 0), 0);

  function update(i: number, patch: Partial<EvalRow>) {
    setRows((rs) => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function add() {
    setRows((rs) => [...rs, { category: "", points: 0, sections_covered: [], competitive_risk: "medium" }]);
  }
  function remove(i: number) { setRows((rs) => rs.filter((_, idx) => idx !== i)); }
  async function save() {
    await saveFn({ data: { missionId, criteria: rows.filter((r) => r.category.trim()) } });
    toast.success("Evaluation map saved");
    refetch();
  }

  // Count questions covered by each row for the preview column
  function coveredCount(sections: string[]): number {
    if (sections.length === 0) return 0;
    return (questions ?? []).filter((q: any) =>
      sections.some((s) => String(s) === String(q.section_number) || String(q.question_number ?? "").startsWith(String(s))),
    ).length;
  }

  return (
    <Section id="evaluation" n="4B" label="Evaluation Criteria Map" sublabel="RFP scoring matrix. Drives competitive risk on every question and IRIS priority flags.">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground bg-surface/30">
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-right w-20">Points</th>
              <th className="px-3 py-2 text-left">Sections / Q Numbers</th>
              <th className="px-3 py-2 text-center w-32">Questions Covered</th>
              <th className="px-3 py-2 text-left w-32">Competitive Risk</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground italic">No criteria yet. Add one below.</td></tr>
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
              <td colSpan={4}></td>
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

