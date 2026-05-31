/**
 * MISSION ADMINISTRATION — /mission-admin
 *
 * ENVIRONMENT: Admin Manage (admin only, route guarded)
 * PURPOSE: Governance, configuration, permissions, and structural setup
 *
 * Admin sets the rules.
 * Studio does the work.
 * Mission Control monitors the mission.
 * IRIS watches everything.
 */

import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useIsAdmin } from "@/hooks/use-admin";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/mission-control")({
  head: () => ({ meta: [{ title: "Mission Administration — Athena Command" }] }),
  component: MissionControlGate,
});

function MissionControlGate() {
  const { member, loading } = useEngagement();
  if (loading) return null;
  const allowed = ["lead","founder","engagement_lead","pm","exec"];
  if (member && !allowed.includes(member.role ?? "")) return <Navigate to="/command" replace />;
  return <MissionAdmin_MC />;
}

// ── Constants ─────────────────────────────────────────────────────
const MISSION_TYPES = ["RFP","Pre-Procurement","Growth Strategy","Product Design","Market Assessment","Due Diligence"];
const PHASES = ["Planning","Active","On Hold","Complete","Archived"];
const RISK_THRESHOLDS = ["Green","Yellow","Red"];
const ROLES_ASSIGNABLE = ["Engagement Lead","Project Manager","Writer","SME","Graphic Design","QA Reviewer","Executive Oversight"];

const DEFAULT_WORKFLOWS: Record<string, string[]> = {
  "RFP": ["Question Assignment","Writer Drafting","SME Review","QA Review","Red Team","Gold Team","Final Submission"],
  "Pre-Procurement": ["Intelligence Gathering","Strategy Development","Positioning","Go/No-Go Review"],
  "Growth Strategy": ["Market Analysis","Strategy Development","Leadership Review","Presentation"],
  "Product Design": ["Discovery","Design","Prototype","Review","Delivery"],
  "Market Assessment": ["Research","Analysis","Report","Presentation"],
  "Due Diligence": ["Data Gathering","Analysis","Risk Assessment","Findings Report"],
};

const LABEL = "text-[10px] font-bold uppercase tracking-widest text-muted-foreground";
const SECTION = "space-y-5 max-w-2xl";

// ── Sidebar nav sections ──────────────────────────────────────────
const SECTIONS = [
  { id: "activation",  num: "01", label: "Mission Activation",         icon: "🚀" },
  { id: "team",        num: "02", label: "Team Assignment",             icon: "👥" },
  { id: "library",     num: "03", label: "Mission Library",             icon: "📁" },
  { id: "parameters",  num: "04", label: "Mission Parameters",          icon: "⚙️" },
  { id: "stakeholders",num: "05", label: "Stakeholder Map",             icon: "🤝" },
  { id: "assumptions", num: "06", label: "Assumptions Registry",        icon: "📋" },
  { id: "broadcasts",  num: "07", label: "Broadcast Settings",          icon: "📣" },
  { id: "workflow",    num: "08", label: "Workflow Configuration",       icon: "🔄" },
  { id: "permissions", num: "09", label: "Permissions",                  icon: "🔐" },
  { id: "closeout",    num: "10", label: "Archive & Closeout",          icon: "🏁" },
];

// ── Main Component ────────────────────────────────────────────────
function MissionAdmin_MC() {
  const { engagement, refresh } = useEngagement();
  const { user } = useSession();
  const [activeSection, setActiveSection] = useState("activation");
  const [eng, setEng] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [workflow, setWorkflow] = useState<any[]>([]);
  const [closeout, setCloseout] = useState<any>(null);

  async function load() {
    if (!engagement) return;
    const [engRes, memRes, wfRes, coRes] = await Promise.all([
      supabase.from("engagements").select("*").eq("id", engagement.id).single(),
      supabase.from("engagement_members").select("*").eq("engagement_id", engagement.id).order("role"),
      supabase.from("mission_workflow_steps").select("*").eq("engagement_id", engagement.id).order("step_order"),
      supabase.from("mission_closeout").select("*").eq("engagement_id", engagement.id).maybeSingle(),
    ]);
    setEng(engRes.data);
    setMembers(memRes.data ?? []);
    setWorkflow(wfRes.data ?? []);
    setCloseout(coRes.data);
  }

  useEffect(() => { load(); }, [engagement?.id]);
  if (!engagement) return null;

  const sectionProps = { eng, setEng, members, setMembers, workflow, setWorkflow, closeout, setCloseout, engagementId: engagement.id, userId: user?.id, onSaved: async () => { await load(); refresh?.(); } };

  return (
    <div className="flex min-h-screen" style={{ background: "var(--background)" }}>
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 border-r border-border/40 py-6">
        <div className="px-5 mb-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground opacity-50 mb-1">Mission Administration</div>
          <div className="text-sm font-bold truncate">{engagement.name}</div>
          <div className="text-xs text-muted-foreground">{engagement.client}</div>
        </div>
        <nav className="space-y-0.5 px-3">
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors text-sm ${activeSection === s.id ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"}`}>
              <span className="text-base flex-shrink-0">{s.icon}</span>
              <div className="min-w-0">
                <div className="text-[10px] font-mono text-muted-foreground/40">{s.num}</div>
                <div className="text-xs font-medium leading-tight">{s.label}</div>
              </div>
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-8 py-8">
          {activeSection === "activation"  && <SectionActivation {...sectionProps} />}
          {activeSection === "team"        && <SectionTeam {...sectionProps} />}
          {activeSection === "library"     && <SectionLibrary {...sectionProps} />}
          {activeSection === "parameters"  && <SectionParameters {...sectionProps} />}
          {activeSection === "stakeholders"&& <SectionStakeholders {...sectionProps} />}
          {activeSection === "assumptions" && <SectionAssumptions {...sectionProps} />}
          {activeSection === "broadcasts"  && <SectionBroadcasts {...sectionProps} />}
          {activeSection === "workflow"    && <SectionWorkflow {...sectionProps} />}
          {activeSection === "permissions" && <SectionPermissions {...sectionProps} />}
          {activeSection === "closeout"    && <SectionCloseout {...sectionProps} />}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ num, title, sub }: { num: string; title: string; sub: string }) {
  return (
    <div className="mb-8 pb-6 border-b border-border/40">
      <div className="text-[10px] font-mono text-muted-foreground/40 mb-1">{num}</div>
      <h1 className="text-2xl font-bold mb-2">{title}</h1>
      <p className="text-sm text-muted-foreground">{sub}</p>
    </div>
  );
}

// ── 01. Mission Activation ────────────────────────────────────────
function SectionActivation({ eng, engagementId, onSaved }: any) {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (eng) setForm(eng); }, [eng]);

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("engagements").update({
      name: form.name, client: form.client, state: form.state, market: form.market,
      mission_type: form.mission_type, program: form.program,
      engagement_lead: form.engagement_lead, project_manager: form.project_manager,
      executive_sponsor: form.executive_sponsor, phase: form.phase,
      submission_date: form.submission_date,
    }).eq("id", engagementId);
    setSaving(false);
    if (error) { toast.error("Failed to save"); return; }
    toast.success("Mission updated");
    onSaved();
  }

  return (
    <div className={SECTION}>
      <SectionHeader num="01" title="Mission Activation" sub="Define the mission identity, team leadership, and key parameters before launch." />
      <div className="grid grid-cols-2 gap-4">
        <div><Label className={LABEL}>Mission Name</Label><Input value={form.name ?? ""} onChange={e => set("name", e.target.value)} className="mt-1" /></div>
        <div><Label className={LABEL}>Client / Agency</Label><Input value={form.client ?? ""} onChange={e => set("client", e.target.value)} className="mt-1" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label className={LABEL}>State</Label><Input value={form.state ?? ""} onChange={e => set("state", e.target.value)} className="mt-1" placeholder="e.g. IN, OH, KY" /></div>
        <div><Label className={LABEL}>Program / Market</Label><Input value={form.market ?? ""} onChange={e => set("market", e.target.value)} className="mt-1" placeholder="e.g. Medicaid Managed Care" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className={LABEL}>Mission Type</Label>
          <select className="w-full mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm" value={form.mission_type ?? "RFP"} onChange={e => set("mission_type", e.target.value)}>
            {MISSION_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <Label className={LABEL}>Mission Status</Label>
          <select className="w-full mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm" value={form.phase ?? "Planning"} onChange={e => set("phase", e.target.value)}>
            {PHASES.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label className={LABEL}>Submission Date</Label><Input type="date" value={form.submission_date ?? ""} onChange={e => set("submission_date", e.target.value)} className="mt-1" /></div>
        <div><Label className={LABEL}>Program</Label><Input value={form.program ?? ""} onChange={e => set("program", e.target.value)} className="mt-1" /></div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div><Label className={LABEL}>Engagement Lead</Label><Input value={form.engagement_lead ?? ""} onChange={e => set("engagement_lead", e.target.value)} className="mt-1" /></div>
        <div><Label className={LABEL}>Project Manager</Label><Input value={form.project_manager ?? ""} onChange={e => set("project_manager", e.target.value)} className="mt-1" /></div>
        <div><Label className={LABEL}>Executive Sponsor</Label><Input value={form.executive_sponsor ?? ""} onChange={e => set("executive_sponsor", e.target.value)} className="mt-1" /></div>
      </div>
      <div className="pt-2">
        <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground px-8">
          {saving ? "Saving…" : "💾  Save Mission Configuration"}
        </Button>
      </div>
    </div>
  );
}

// ── 02. Team Assignment ───────────────────────────────────────────
function SectionTeam({ members, engagementId, onSaved }: any) {
  const [email, setEmail] = useState(""); const [role, setRole] = useState("writer"); const [saving, setSaving] = useState(false);

  async function addUser() {
    if (!email.trim()) return;
    setSaving(true);
    const { data: user } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle() as any;
    if (!user) { toast.error("User not found. They must have an account."); setSaving(false); return; }
    await supabase.from("engagement_members").upsert({ engagement_id: engagementId, user_id: user.id, role, display_name: email.split("@")[0] }, { onConflict: "engagement_id,user_id" });
    setSaving(false); setEmail(""); toast.success("Team member added"); onSaved();
  }

  async function removeUser(id: string) {
    await supabase.from("engagement_members").delete().eq("id", id);
    onSaved();
  }

  const ROLE_LABELS: Record<string,string> = { lead:"Engagement Lead", pm:"Project Manager", writer:"Writer", sme:"SME", exec:"Executive", partner:"External Partner" };
  const ROLE_GROUPS = [
    { label: "Leadership", roles: ["lead","pm","exec"] },
    { label: "Proposal Team", roles: ["writer","sme"] },
    { label: "External", roles: ["partner"] },
  ];

  return (
    <div className={SECTION}>
      <SectionHeader num="02" title="Team Assignment" sub="Manage the mission roster. Each role determines what team members can see and do in Mission Studio." />

      {/* Add user */}
      <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
        <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Add Team Member</div>
        <div className="grid grid-cols-2 gap-3">
          <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" />
          <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={role} onChange={e => setRole(e.target.value)}>
            {Object.entries(ROLE_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <Button size="sm" onClick={addUser} disabled={saving || !email.trim()}>{saving ? "Adding…" : "Add Team Member"}</Button>
      </div>

      {/* Current roster */}
      {ROLE_GROUPS.map(g => {
        const groupMembers = members.filter((m: any) => g.roles.includes(m.role));
        if (!groupMembers.length) return null;
        return (
          <div key={g.label}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{g.label}</div>
            {groupMembers.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-card mb-2">
                <div>
                  <div className="text-sm font-medium">{m.display_name ?? "Unnamed"}</div>
                  <div className="text-xs text-muted-foreground">{ROLE_LABELS[m.role] ?? m.role}</div>
                </div>
                <div className="flex gap-2">
                  <select className="text-xs rounded border border-border bg-background px-2 py-1" value={m.role}
                    onChange={async e => { await supabase.from("engagement_members").update({ role: e.target.value }).eq("id", m.id); onSaved(); }}>
                    {Object.entries(ROLE_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <Button size="sm" variant="ghost" onClick={() => removeUser(m.id)} className="text-red-400 hover:text-red-300">Remove</Button>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── 03. Mission Library ───────────────────────────────────────────
function SectionLibrary({ engagementId }: any) {
  return (
    <div className={SECTION}>
      <SectionHeader num="03" title="Mission Library" sub="All source documents for this mission. Upload here — IRIS processes them automatically." />
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
        Mission Library is managed in <strong className="text-foreground">Mission Control → Documents</strong>.
        All documents uploaded there are the source of truth for this mission.
      </div>
      <a href="/library" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold no-underline">
        Open Mission Library →
      </a>
    </div>
  );
}

// ── 04. Mission Parameters ────────────────────────────────────────
function SectionParameters({ eng, engagementId, onSaved }: any) {
  const [params, setParams] = useState({ daily_huddle_required: true, sos_enabled: true, iris_monitoring: true, executive_visibility: true, risk_threshold: "Yellow" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (eng) setParams({ daily_huddle_required: eng.daily_huddle_required ?? true, sos_enabled: eng.sos_enabled ?? true, iris_monitoring: eng.iris_monitoring ?? true, executive_visibility: eng.executive_visibility ?? true, risk_threshold: eng.risk_threshold ?? "Yellow" }); }, [eng]);

  async function save() {
    setSaving(true);
    await supabase.from("engagements").update(params).eq("id", engagementId);
    setSaving(false); toast.success("Parameters saved"); onSaved();
  }

  const Toggle = ({ label, sub, field }: { label: string; sub: string; field: keyof typeof params }) => (
    <div className="flex items-center justify-between p-4 rounded-lg border border-border/60 bg-card">
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
      </div>
      <button onClick={() => setParams(p => ({ ...p, [field]: !p[field as keyof typeof params] }))}
        className={`relative w-11 h-6 rounded-full transition-colors ${params[field as keyof typeof params] ? "bg-primary" : "bg-muted/40"}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${params[field as keyof typeof params] ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </div>
  );

  return (
    <div className={SECTION}>
      <SectionHeader num="04" title="Mission Parameters" sub="Configure what runs automatically on this mission. Changes take effect immediately." />
      <Toggle label="Daily Huddle Required" sub="Team members are prompted to submit daily signals" field="daily_huddle_required" />
      <Toggle label="Escalations Enabled" sub="Team members can raise escalations" field="sos_enabled" />
      <Toggle label="IRIS Monitoring" sub="IRIS actively monitors and generates intelligence for this mission" field="iris_monitoring" />
      <Toggle label="Executive Visibility" sub="Mission appears in executive briefings and Command Center" field="executive_visibility" />
      <div className="p-4 rounded-lg border border-border/60 bg-card">
        <div className="text-sm font-semibold mb-1">Risk Threshold</div>
        <div className="text-xs text-muted-foreground mb-3">At what level should risks escalate to leadership?</div>
        <div className="flex gap-2">
          {RISK_THRESHOLDS.map(t => {
            const colors: Record<string,string> = { Green:"border-emerald-500 text-emerald-400 bg-emerald-500/10", Yellow:"border-amber-500 text-amber-400 bg-amber-500/10", Red:"border-red-500 text-red-400 bg-red-500/10" };
            return <button key={t} onClick={() => setParams(p => ({ ...p, risk_threshold: t }))}
              className={`flex-1 py-2 rounded-md text-xs font-semibold border transition-colors ${params.risk_threshold === t ? colors[t] : "border-border/40 text-muted-foreground"}`}>{t}</button>;
          })}
        </div>
      </div>
      <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Parameters"}</Button>
    </div>
  );
}

// ── 05. Stakeholder Map ───────────────────────────────────────────
function SectionStakeholders({ engagementId }: any) {
  return (
    <div className={SECTION}>
      <SectionHeader num="05" title="Stakeholder Map" sub="Track client leaders, state contacts, partners, and influencers." />
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
        Stakeholder Map is managed in <strong className="text-foreground">Mission Control → Strategy → People</strong>. IRIS monitors stakeholder changes and surfaces relevant alerts.
      </div>
      <a href="/pulse" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold no-underline">Open Stakeholder Map →</a>
    </div>
  );
}

// ── 06. Assumptions Registry ──────────────────────────────────────
function SectionAssumptions({ engagementId }: any) {
  return (
    <div className={SECTION}>
      <SectionHeader num="06" title="Assumptions Registry" sub="All mission assumptions with ownership and validation status. IRIS monitors for drift." />
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
        Assumptions are managed in <strong className="text-foreground">Mission Control → Strategy → Assumptions</strong>. IRIS tracks confidence levels and alerts when assumptions become outdated.
      </div>
      <a href="/pulse" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold no-underline">Open Assumptions Registry →</a>
    </div>
  );
}

// ── 07. Broadcast Settings ────────────────────────────────────────
function SectionBroadcasts({ members, engagementId }: any) {
  return (
    <div className={SECTION}>
      <SectionHeader num="07" title="Leadership Broadcast Settings" sub="Configure who receives broadcasts, alerts, SOS escalations, and mission updates." />
      <div className="space-y-2">
        {["Broadcasts","Alerts","SOS Escalations","Mission Updates"].map(type => (
          <div key={type} className="p-4 rounded-lg border border-border/60 bg-card">
            <div className="text-sm font-semibold mb-3">{type}</div>
            <div className="flex gap-2 flex-wrap">
              {["lead","pm","exec"].map(role => (
                <label key={role} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded" />
                  <span className="capitalize">{role === "exec" ? "Executive" : role === "pm" ? "Project Manager" : "Engagement Lead"}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Note: Broadcast recipient configuration will be saved in a future update. Currently all leadership roles receive all notification types.</p>
    </div>
  );
}

// ── 08. Workflow Configuration ────────────────────────────────────
function SectionWorkflow({ eng, workflow, engagementId, onSaved }: any) {
  const [newStep, setNewStep] = useState(""); const [saving, setSaving] = useState(false);
  const mType = eng?.mission_type ?? "RFP";

  async function seedDefaults() {
    setSaving(true);
    const steps = DEFAULT_WORKFLOWS[mType] ?? DEFAULT_WORKFLOWS["RFP"];
    for (let i = 0; i < steps.length; i++) {
      await supabase.from("mission_workflow_steps").insert({ engagement_id: engagementId, step_order: i + 1, step_name: steps[i], step_type: "draft" });
    }
    setSaving(false); toast.success("Default workflow loaded"); onSaved();
  }

  async function addStep() {
    if (!newStep.trim()) return;
    await supabase.from("mission_workflow_steps").insert({ engagement_id: engagementId, step_order: workflow.length + 1, step_name: newStep, step_type: "draft" });
    setNewStep(""); onSaved();
  }

  async function toggleComplete(id: string, current: boolean) {
    await supabase.from("mission_workflow_steps").update({ is_complete: !current, completed_at: !current ? new Date().toISOString() : null }).eq("id", id);
    onSaved();
  }

  async function removeStep(id: string) {
    await supabase.from("mission_workflow_steps").delete().eq("id", id);
    onSaved();
  }

  return (
    <div className={SECTION}>
      <SectionHeader num="08" title="Workflow Configuration" sub={`Configure the ${mType} workflow stages for this mission.`} />
      {workflow.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/40 p-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">No workflow steps configured yet.</p>
          <Button size="sm" onClick={seedDefaults} disabled={saving}>{saving ? "Loading…" : `Load Default ${mType} Workflow`}</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {workflow.map((step: any, i: number) => (
            <div key={step.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${step.is_complete ? "border-emerald-500/20 bg-emerald-500/5 opacity-70" : "border-border/60 bg-card"}`}>
              <div className="w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center text-[10px] font-bold cursor-pointer"
                style={{ borderColor: step.is_complete ? "#22c55e" : "rgba(255,255,255,0.2)", background: step.is_complete ? "rgba(34,197,94,0.15)" : "transparent", color: step.is_complete ? "#22c55e" : "rgba(255,255,255,0.4)" }}
                onClick={() => toggleComplete(step.id, step.is_complete)}>
                {step.is_complete ? "✓" : i + 1}
              </div>
              <span className={`flex-1 text-sm ${step.is_complete ? "line-through text-muted-foreground" : ""}`}>{step.step_name}</span>
              <button onClick={() => removeStep(step.id)} className="text-muted-foreground hover:text-red-400 text-xs px-2">×</button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input value={newStep} onChange={e => setNewStep(e.target.value)} placeholder="Add workflow step…" onKeyDown={e => e.key === "Enter" && addStep()} />
        <Button onClick={addStep} variant="ghost">Add</Button>
      </div>
    </div>
  );
}

// ── 09. Permissions ───────────────────────────────────────────────
function SectionPermissions({ engagementId }: any) {
  const features = [
    { label: "Mission Control (Intelligence)", roles: ["Admin","Engagement Lead","PM"] },
    { label: "IRIS Intelligence", roles: ["Admin","Engagement Lead","PM","Exec"] },
    { label: "Financial Data", roles: ["Admin","Engagement Lead"] },
    { label: "Documents & Library", roles: ["Admin","Engagement Lead","PM","Writer","SME"] },
    { label: "Stakeholder Map", roles: ["Admin","Engagement Lead","PM"] },
    { label: "Executive Briefings", roles: ["Admin","Engagement Lead","Exec"] },
    { label: "Mission Studio (Signals)", roles: ["All roles"] },
    { label: "Admin Manage", roles: ["Admin only"] },
  ];

  return (
    <div className={SECTION}>
      <SectionHeader num="09" title="Permissions" sub="Access control by role. Admin-only section — changes here affect what team members can see." />
      <div className="space-y-2">
        {features.map(f => (
          <div key={f.label} className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-card">
            <span className="text-sm font-medium">{f.label}</span>
            <div className="flex gap-1 flex-wrap justify-end">
              {f.roles.map(r => (
                <span key={r} className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-primary/20 text-primary bg-primary/8">{r}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Fine-grained permission configuration is enforced via Supabase Row Level Security. Role assignments in Team Assignment (section 02) control access.</p>
    </div>
  );
}

// ── 10. Archive & Closeout ────────────────────────────────────────
function SectionCloseout({ eng, closeout, engagementId, userId, onSaved }: any) {
  const [form, setForm] = useState<any>({ win_loss: "Pending", outcome: "", lessons_learned: "", key_decisions: "", strengths: "", improvements: "", institutional_notes: "" });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  useEffect(() => { if (closeout) setForm(closeout); }, [closeout]);

  async function save() {
    setSaving(true);
    if (closeout) {
      await supabase.from("mission_closeout").update({ ...form, updated_at: new Date().toISOString() }).eq("id", closeout.id);
    } else {
      await supabase.from("mission_closeout").insert({ engagement_id: engagementId, ...form, created_by: userId });
    }
    setSaving(false); toast.success("Closeout report saved"); onSaved();
  }

  async function archiveMission() {
    await supabase.from("engagements").update({ status: "Archived", phase: "Archived", closed_at: new Date().toISOString() }).eq("id", engagementId);
    toast.success("Mission archived");
    onSaved();
  }

  const isArchived = eng?.status === "Archived";

  return (
    <div className={SECTION}>
      <SectionHeader num="10" title="Archive & Closeout" sub="Complete the mission record. This feeds directly into IRIS institutional memory and benefits future missions." />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className={LABEL}>Outcome</Label>
          <select className="w-full mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm" value={form.win_loss} onChange={e => set("win_loss", e.target.value)}>
            {["Pending","Win","Loss","No Bid","Cancelled"].map(v => <option key={v}>{v}</option>)}
          </select>
        </div>
        <div><Label className={LABEL}>Final Score (if known)</Label><Input type="number" value={form.final_score ?? ""} onChange={e => set("final_score", e.target.value)} className="mt-1" placeholder="e.g. 87.5" /></div>
      </div>

      <div><Label className={LABEL}>Outcome Summary</Label><Textarea value={form.outcome ?? ""} onChange={e => set("outcome", e.target.value)} className="mt-1" rows={3} placeholder="Brief summary of the engagement outcome…" /></div>
      <div><Label className={LABEL}>Lessons Learned</Label><Textarea value={form.lessons_learned ?? ""} onChange={e => set("lessons_learned", e.target.value)} className="mt-1" rows={3} placeholder="What would you do differently?" /></div>
      <div><Label className={LABEL}>Key Decisions</Label><Textarea value={form.key_decisions ?? ""} onChange={e => set("key_decisions", e.target.value)} className="mt-1" rows={3} placeholder="Critical decisions made during this mission…" /></div>
      <div><Label className={LABEL}>Strengths</Label><Textarea value={form.strengths ?? ""} onChange={e => set("strengths", e.target.value)} className="mt-1" rows={2} placeholder="What worked well?" /></div>
      <div><Label className={LABEL}>Areas for Improvement</Label><Textarea value={form.improvements ?? ""} onChange={e => set("improvements", e.target.value)} className="mt-1" rows={2} placeholder="What should be improved next time?" /></div>
      <div>
        <Label className={LABEL}>Institutional Intelligence Notes</Label>
        <p className="text-xs text-muted-foreground mb-1">This content is ingested by IRIS and becomes available to future missions in similar states and markets.</p>
        <Textarea value={form.institutional_notes ?? ""} onChange={e => set("institutional_notes", e.target.value)} className="mt-1" rows={4} placeholder="Market insights, relationship notes, competitive intelligence, and strategic lessons for future use…" />
      </div>

      <div className="flex gap-3 pt-2">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Closeout Report"}</Button>
        {!isArchived && (
          <Button variant="ghost" onClick={archiveMission} className="text-muted-foreground">Archive Mission</Button>
        )}
      </div>

      {isArchived && (
        <div className="rounded-lg border border-muted/20 bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
          This mission is archived. It remains in IRIS institutional memory and is searchable for future missions.
        </div>
      )}
    </div>
  );
}
