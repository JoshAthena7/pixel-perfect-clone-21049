import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Save, Search, Plus, X, AlertCircle, GripVertical, Trash2, FileText, Shield, BookOpen, HeartPulse, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/missions/$missionId")({
  component: AdminMissionDetail,
});

type Tab = "overview" | "team" | "journey" | "compliance" | "reports";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "team", label: "Team" },
  { id: "journey", label: "Journey" },
  { id: "compliance", label: "Compliance" },
  { id: "reports", label: "Reports" },
];

type Mission = {
  id: string;
  name: string;
  client_name: string | null;
  status: string | null;
  submission_deadline: string | null;
  contract_value: number | null;
  agency_name: string | null;
  state: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  procurement_type: string | null;
  program_type: string | null;
  blast_off_at: string | null;
  iris_disclaimer: string | null;
};

function AdminMissionDetail() {
  const { missionId } = useParams({ from: "/_authenticated/admin/missions/$missionId" });
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [form, setForm] = useState<Partial<Mission>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cascaded, setCascaded] = useState(false);
  const journeySaverRef = useRef<null | (() => Promise<void>)>(null);

  const { data: mission } = useQuery({
    queryKey: ["admin-mission", missionId],
    queryFn: async (): Promise<Mission | null> => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client_name,status,submission_deadline,contract_value,agency_name,state,primary_contact_name,primary_contact_email,procurement_type,program_type,blast_off_at,iris_disclaimer")
        .eq("id", missionId)
        .maybeSingle();
      return data as Mission | null;
    },
  });

  useEffect(() => {
    if (mission) {
      setForm(mission);
      setDirty(false);
    }
  }, [mission]);

  useEffect(() => {
    if (!cascaded) return;
    const t = setTimeout(() => setCascaded(false), 3000);
    return () => clearTimeout(t);
  }, [cascaded]);

  function update<K extends keyof Mission>(key: K, value: Mission[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    const payload = {
      name: form.name ?? null,
      client_name: form.client_name ?? null,
      status: form.status ?? null,
      submission_deadline: form.submission_deadline ?? null,
      contract_value: form.contract_value ?? null,
      agency_name: form.agency_name ?? null,
      state: form.state ?? null,
      primary_contact_name: form.primary_contact_name ?? null,
      primary_contact_email: form.primary_contact_email ?? null,
      procurement_type: form.procurement_type ?? null,
      program_type: form.program_type ?? null,
      blast_off_at: form.blast_off_at ?? null,
      iris_disclaimer: form.iris_disclaimer ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await (supabase.from("missions").update(payload as any) as any).eq("id", missionId);
    if (error) {
      setSaving(false);
      toast.error(`Save failed: ${error.message}`);
      return;
    }
    try {
      await journeySaverRef.current?.();
    } catch (e: any) {
      setSaving(false);
      toast.error(`Journey save failed: ${e?.message ?? "unknown"}`);
      return;
    }
    setSaving(false);
    toast.success("Saved & cascaded to all linked records");
    setDirty(false);
    setCascaded(true);
    qc.invalidateQueries({ queryKey: ["admin-mission", missionId] });
    qc.invalidateQueries({ queryKey: ["admin-missions-list"] });
    qc.invalidateQueries({ queryKey: ["admin-mission-journey", missionId] });
  }

  return (
    <div className="min-h-[calc(100vh-48px)]" style={{ background: "#080c14" }}>
      {/* Top bar */}
      <div
        className="sticky top-12 z-10 px-6 py-3 flex items-center gap-4"
        style={{ background: "#0a121f", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 text-xs hover:text-white transition-colors"
          style={{ color: "rgba(255,255,255,0.5)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Missions
        </Link>
        <div className="h-4 w-px" style={{ background: "rgba(255,255,255,0.1)" }} />
        <div className="text-white font-medium text-sm truncate flex-1">
          {form.name ?? "Mission"}
        </div>
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50"
            style={{ background: "#c9a84c", color: "#080c14" }}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save & cascade"}
          </button>
        )}
        {cascaded && (
          <span
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-opacity duration-700"
            style={{
              background: "rgba(34,197,94,0.15)",
              border: "1px solid rgba(34,197,94,0.4)",
              color: "#4ade80",
            }}
          >
            ✓ Changes cascaded
          </span>
        )}
      </div>

      {/* Tab strip */}
      <div className="px-6" style={{ background: "#080c14", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-1">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className="px-4 py-2.5 text-xs font-medium transition-colors relative"
                style={{
                  color: active ? "#c9a84c" : "rgba(255,255,255,0.5)",
                  borderBottom: active ? "2px solid #c9a84c" : "2px solid transparent",
                  marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-6 py-8">
        {tab === "overview" && dirty && (
          <div
            className="mb-5 rounded-md px-4 py-3 text-xs flex items-start gap-2"
            style={{
              background: "rgba(59,130,246,0.08)",
              border: "1px solid rgba(59,130,246,0.3)",
              color: "#93c5fd",
            }}
          >
            <span className="mt-px">ⓘ</span>
            <span>Saving will cascade name and status changes to all staff notifications and journey milestones.</span>
          </div>
        )}
        {tab === "overview" && (
          <OverviewTab form={form} update={update} />
        )}
        {tab === "team" && <TeamTab missionId={missionId} />}
        {tab === "journey" && (
          <JourneyTab
            missionId={missionId}
            setDirty={setDirty}
            registerSaver={(fn) => {
              journeySaverRef.current = fn;
            }}
          />
        )}
        {tab === "compliance" && <ComplianceTab missionId={missionId} />}
        {tab === "reports" && <ReportsTab missionId={missionId} />}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-[11px] font-medium uppercase tracking-wider mb-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>
        {label}
      </div>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "white",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 13,
  width: "100%",
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "setup", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "pens_down", label: "Planned" },
  { value: "archived", label: "Closed" },
];

function OverviewTab({
  form,
  update,
}: {
  form: Partial<Mission>;
  update: <K extends keyof Mission>(k: K, v: Mission[K]) => void;
}) {
  const currentStatus = form.status ?? "setup";
  return (
    <div className="space-y-5">
      <SectionCard title="Mission Snapshot">
        <div className="space-y-4">
          <Field label="Mission name">
            <input
              style={inputStyle}
              value={form.name ?? ""}
              onChange={(e) => update("name", e.target.value)}
            />
          </Field>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Mission type">
              <input
                style={inputStyle}
                placeholder="e.g. RFP, IDIQ, Task Order"
                value={form.procurement_type ?? ""}
                onChange={(e) => update("procurement_type", e.target.value)}
              />
            </Field>
            <Field label="Classification">
              <input
                style={inputStyle}
                placeholder="e.g. Confidential, Public"
                value={form.program_type ?? ""}
                onChange={(e) => update("program_type", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Start date">
              <input
                type="date"
                style={inputStyle}
                value={form.blast_off_at ? form.blast_off_at.slice(0, 10) : ""}
                onChange={(e) =>
                  update("blast_off_at", e.target.value ? new Date(e.target.value).toISOString() : null)
                }
              />
            </Field>
            <Field label="End date">
              <input
                type="date"
                style={inputStyle}
                value={form.submission_deadline ? form.submission_deadline.slice(0, 10) : ""}
                onChange={(e) =>
                  update("submission_deadline", e.target.value ? new Date(e.target.value).toISOString() : null)
                }
              />
            </Field>
          </div>

          <Field label="Location / region">
            <input
              style={inputStyle}
              placeholder="State, region, or geography"
              value={form.state ?? ""}
              onChange={(e) => update("state", e.target.value)}
            />
          </Field>

          <Field label="Status">
            <div className="flex flex-wrap gap-2 mt-1">
              {STATUS_OPTIONS.map((opt) => {
                const active = currentStatus === opt.value;
                return (
                  <label
                    key={opt.value}
                    className="inline-flex items-center gap-2 cursor-pointer rounded-md px-3 py-1.5 text-xs transition-colors"
                    style={{
                      background: active ? "rgba(201,168,76,0.12)" : "rgba(255,255,255,0.03)",
                      border: active
                        ? "1px solid rgba(201,168,76,0.5)"
                        : "1px solid rgba(255,255,255,0.08)",
                      color: active ? "#c9a84c" : "rgba(255,255,255,0.7)",
                    }}
                  >
                    <input
                      type="radio"
                      name="mission-status"
                      checked={active}
                      onChange={() => update("status", opt.value)}
                      className="sr-only"
                    />
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: active ? "#c9a84c" : "rgba(255,255,255,0.25)" }}
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </Field>

          <Field label="Mission brief">
            <textarea
              style={{ ...inputStyle, minHeight: 140, resize: "vertical", lineHeight: 1.5 }}
              placeholder="Summarize the mission objective, scope, and context…"
              value={form.iris_disclaimer ?? ""}
              onChange={(e) => update("iris_disclaimer", e.target.value)}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Primary Contact">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Name">
            <input style={inputStyle} value={form.primary_contact_name ?? ""} onChange={(e) => update("primary_contact_name", e.target.value)} />
          </Field>
          <Field label="Email">
            <input style={inputStyle} type="email" value={form.primary_contact_email ?? ""} onChange={(e) => update("primary_contact_email", e.target.value)} />
          </Field>
        </div>
      </SectionCard>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg p-5"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#c9a84c" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

const MISSION_ROLES = [
  "Mission Lead",
  "Analyst",
  "Advisor",
  "Reviewer",
  "Copy Editor",
] as const;

const AVATAR_COLORS = [
  "#7c5cff", "#c9a84c", "#3b82f6", "#10b981", "#ef4444",
  "#f59e0b", "#ec4899", "#06b6d4", "#8b5cf6", "#84cc16",
];

function initialsOf(first?: string | null, last?: string | null, email?: string | null) {
  const a = (first ?? "").trim()[0];
  const b = (last ?? "").trim()[0];
  if (a || b) return `${a ?? ""}${b ?? ""}`.toUpperCase();
  return (email ?? "?").slice(0, 2).toUpperCase();
}
function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

type TeamMemberRow = {
  id: string;
  member_id: string;
  mission_role: string | null;
};
type StaffRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  job_title: string | null;
};

function TeamTab({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: assigned = [] } = useQuery({
    queryKey: ["admin-mission-team", missionId],
    queryFn: async (): Promise<TeamMemberRow[]> => {
      const { data } = await supabase
        .from("mission_team_members")
        .select("id,member_id,mission_role")
        .eq("mission_id", missionId);
      return (data as TeamMemberRow[]) ?? [];
    },
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["admin-mission-team-staff"],
    queryFn: async (): Promise<StaffRow[]> => {
      const { data } = await supabase
        .from("atlas_team_members")
        .select("id,first_name,last_name,email,job_title")
        .eq("is_removed", false)
        .order("first_name", { ascending: true });
      return (data as StaffRow[]) ?? [];
    },
  });

  const { data: qStats } = useQuery({
    queryKey: ["admin-mission-team-stats", missionId],
    queryFn: async () => {
      const [{ count: totalQ }, { data: qaRows }] = await Promise.all([
        supabase.from("questions").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        supabase.from("question_assignments").select("workstream_lead,athena_sme_name").eq("mission_id", missionId),
      ]);
      const assignedCount = (qaRows ?? []).filter((r: any) => r.workstream_lead).length;
      const missingSme = (qaRows ?? []).filter((r: any) => !r.athena_sme_name).length;
      const total = totalQ ?? 0;
      const unassigned = Math.max(0, total - assignedCount);
      return { total, assignedCount, missingSme, unassigned };
    },
  });

  const staffById = new Map(staff.map((s) => [s.id, s]));
  const assignedIds = new Set(assigned.map((a) => a.member_id));
  const q = search.trim().toLowerCase();
  const matches = (s: StaffRow) =>
    !q ||
    `${s.first_name ?? ""} ${s.last_name ?? ""}`.toLowerCase().includes(q) ||
    (s.email ?? "").toLowerCase().includes(q) ||
    (s.job_title ?? "").toLowerCase().includes(q);

  const assignedFiltered = assigned.filter((a) => {
    const s = staffById.get(a.member_id);
    return s ? matches(s) : true;
  });
  const available = staff.filter((s) => !assignedIds.has(s.id) && matches(s));

  async function updateRole(rowId: string, role: string) {
    const { error } = await (supabase.from("mission_team_members").update({ mission_role: role }) as any).eq("id", rowId);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-mission-team", missionId] });
  }
  async function removeMember(rowId: string) {
    const { error } = await (supabase.from("mission_team_members").delete() as any).eq("id", rowId);
    if (error) return toast.error(error.message);
    toast.success("Removed from mission");
    qc.invalidateQueries({ queryKey: ["admin-mission-team", missionId] });
  }
  async function addMember(memberId: string) {
    const { error } = await supabase
      .from("mission_team_members")
      .insert({ mission_id: missionId, member_id: memberId, mission_role: "Analyst" } as any);
    if (error) return toast.error(error.message);
    toast.success("Added to mission");
    qc.invalidateQueries({ queryKey: ["admin-mission-team", missionId] });
  }

  const totalQ = qStats?.total ?? 24;

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
          Assign and manage staff for this mission
        </div>
        <button
          type="button"
          onClick={() => {
            const first = available[0];
            if (first) addMember(first.id);
            else toast.info("No available staff to add");
          }}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold"
          style={{ background: "#c9a84c", color: "#080c14" }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add member
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
          style={{ color: "rgba(255,255,255,0.35)" }}
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search staff by name or role…"
          style={{
            ...inputStyle,
            paddingLeft: 36,
            paddingTop: 10,
            paddingBottom: 10,
          }}
        />
      </div>

      {/* Assigned list */}
      <SectionCard title={`Assigned (${assignedFiltered.length})`}>
        {assignedFiltered.length === 0 ? (
          <div className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
            No staff assigned yet — add members from the list below.
          </div>
        ) : (
          <ul className="space-y-2">
            {assignedFiltered.map((row) => {
              const s = staffById.get(row.member_id);
              const name = s ? `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || s.email : row.member_id.slice(0, 8);
              return (
                <li
                  key={row.id}
                  className="flex items-center gap-3 rounded-md px-3 py-2.5"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
                    style={{ background: colorFor(row.member_id) }}
                  >
                    {initialsOf(s?.first_name, s?.last_name, s?.email)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white/90 truncate">{name}</div>
                    {s?.job_title && (
                      <div className="text-xs truncate" style={{ color: "rgba(255,255,255,0.45)" }}>
                        {s.job_title}
                      </div>
                    )}
                  </div>
                  <select
                    value={MISSION_ROLES.includes(row.mission_role as any) ? (row.mission_role as string) : "Analyst"}
                    onChange={(e) => updateRole(row.id, e.target.value)}
                    style={{
                      background: "rgba(201,168,76,0.08)",
                      border: "1px solid rgba(201,168,76,0.3)",
                      color: "#c9a84c",
                      borderRadius: 6,
                      padding: "5px 8px",
                      fontSize: 12,
                    }}
                  >
                    {MISSION_ROLES.map((r) => (
                      <option key={r} value={r} style={{ background: "#0a121f" }}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeMember(row.id)}
                    className="p-1.5 rounded hover:bg-white/5 transition-colors"
                    style={{ color: "rgba(255,255,255,0.4)" }}
                    aria-label="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {/* Available */}
      <SectionCard title={`Available staff (${available.length})`}>
        {available.length === 0 ? (
          <div className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
            All matching staff are already assigned.
          </div>
        ) : (
          <ul className="space-y-2">
            {available.slice(0, 8).map((s) => {
              const name = `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || s.email || "Staff";
              return (
                <li
                  key={s.id}
                  className="flex items-center gap-3 rounded-md px-3 py-2.5 opacity-70 hover:opacity-100 transition-opacity"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.08)" }}
                >
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
                    style={{ background: colorFor(s.id) }}
                  >
                    {initialsOf(s.first_name, s.last_name, s.email)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white/80 truncate">{name}</div>
                    {s.job_title && (
                      <div className="text-xs truncate" style={{ color: "rgba(255,255,255,0.4)" }}>
                        {s.job_title}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => addMember(s.id)}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium"
                    style={{
                      background: "rgba(201,168,76,0.1)",
                      border: "1px solid rgba(201,168,76,0.3)",
                      color: "#c9a84c",
                    }}
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {/* IRIS coverage banner */}
      <div
        className="rounded-lg p-4 flex items-start gap-3"
        style={{
          background: "rgba(201,168,76,0.06)",
          border: "1px solid rgba(201,168,76,0.4)",
        }}
      >
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#c9a84c" }} />
        <div className="flex-1 text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.8)" }}>
          <div className="font-semibold mb-0.5" style={{ color: "#c9a84c" }}>
            IRIS coverage
          </div>
          <span className="text-white/90">{qStats?.assignedCount ?? 0}</span> of {totalQ} questions assigned ·{" "}
          <span className="text-white/90">{qStats?.missingSme ?? 0}</span> sections missing SMEs ·{" "}
          <span className="text-white/90">{qStats?.unassigned ?? totalQ}</span> unassigned questions
        </div>
        <button
          type="button"
          className="text-xs font-medium underline-offset-2 hover:underline shrink-0"
          style={{ color: "#c9a84c" }}
          onClick={() => toast.info("Coverage gaps view coming soon")}
        >
          View gaps →
        </button>
      </div>
    </div>
  );
}

type JourneyStatus = "complete" | "in_progress" | "pending";
type Milestone = {
  id: string;
  name: string;
  kind: "Required" | "Optional";
  status: JourneyStatus;
  target_date: string | null; // ISO yyyy-mm-dd
  order_index: number;
  _new?: boolean;
};

const STATUS_DOT: Record<JourneyStatus, { color: string; label: string }> = {
  complete: { color: "#22c55e", label: "Complete" },
  in_progress: { color: "#c9a84c", label: "In progress" },
  pending: { color: "rgba(255,255,255,0.25)", label: "Pending" },
};

const DEFAULT_MILESTONES: Omit<Milestone, "id">[] = [
  { name: "Onboarding", kind: "Required", status: "complete", target_date: null, order_index: 0 },
  { name: "Field Operations", kind: "Required", status: "in_progress", target_date: null, order_index: 1 },
  { name: "Debrief & Close", kind: "Required", status: "pending", target_date: null, order_index: 2 },
];

function JourneyTab({
  missionId,
  setDirty,
  registerSaver,
}: {
  missionId: string;
  setDirty: (v: boolean) => void;
  registerSaver: (fn: (() => Promise<void>) | null) => void;
}) {
  const { data: phases, isLoading } = useQuery({
    queryKey: ["admin-mission-journey", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_journey_phases")
        .select("id,name,kind,color,end_date,order_index")
        .eq("mission_id", missionId)
        .order("order_index", { ascending: true });
      return data ?? [];
    },
  });

  const [items, setItems] = useState<Milestone[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const dragIndex = useRef<number | null>(null);

  // Load from DB; if empty, seed defaults locally (persisted on Save & cascade)
  useEffect(() => {
    if (isLoading || !phases) return;
    if (phases.length === 0) {
      setItems(
        DEFAULT_MILESTONES.map((d, i) => ({
          ...d,
          id: `new-${i}-${Math.random().toString(36).slice(2, 8)}`,
          _new: true,
          order_index: i,
        })),
      );
      setDirty(true);
    } else {
      setItems(
        phases.map((p: any, i: number) => ({
          id: p.id,
          name: p.name ?? "",
          kind: p.kind === "Optional" ? "Optional" : "Required",
          status:
            p.color === "complete" || p.color === "in_progress" || p.color === "pending"
              ? (p.color as JourneyStatus)
              : "pending",
          target_date: p.end_date ? String(p.end_date).slice(0, 10) : null,
          order_index: typeof p.order_index === "number" ? p.order_index : i,
        })),
      );
    }
    setRemovedIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phases, isLoading]);

  const itemsRef = useRef(items);
  const removedRef = useRef(removedIds);
  itemsRef.current = items;
  removedRef.current = removedIds;

  useEffect(() => {
    registerSaver(async () => {
      const list = itemsRef.current;
      const removed = removedRef.current;
      // Deletes
      if (removed.length > 0) {
        await (supabase.from("mission_journey_phases").delete() as any).in("id", removed);
      }
      // Upserts
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        const payload = {
          mission_id: missionId,
          name: m.name,
          kind: m.kind,
          color: m.status,
          end_date: m.target_date ? new Date(m.target_date).toISOString() : null,
          order_index: i,
        };
        if (m._new) {
          await supabase.from("mission_journey_phases").insert(payload as any);
        } else {
          await (supabase.from("mission_journey_phases").update(payload as any) as any).eq("id", m.id);
        }
      }
    });
    return () => registerSaver(null);
  }, [registerSaver, missionId]);

  function patch(id: string, p: Partial<Milestone>) {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
    setDirty(true);
  }
  function remove(id: string) {
    setItems((xs) => xs.filter((x) => x.id !== id));
    setRemovedIds((r) => (id.startsWith("new-") ? r : [...r, id]));
    setDirty(true);
  }
  function add() {
    setItems((xs) => [
      ...xs,
      {
        id: `new-${xs.length}-${Math.random().toString(36).slice(2, 8)}`,
        name: "New milestone",
        kind: "Required",
        status: "pending",
        target_date: null,
        order_index: xs.length,
        _new: true,
      },
    ]);
    setDirty(true);
  }
  function reorder(from: number, to: number) {
    if (from === to) return;
    setItems((xs) => {
      const next = xs.slice();
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next.map((x, i) => ({ ...x, order_index: i }));
    });
    setDirty(true);
  }

  function cycleStatus(s: JourneyStatus): JourneyStatus {
    return s === "pending" ? "in_progress" : s === "in_progress" ? "complete" : "pending";
  }

  return (
    <div className="space-y-4">
      <div className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
        Mission journey milestones — drag to reorder, click the dot to cycle status.
      </div>

      <ol className="relative space-y-2">
        {/* vertical guide line */}
        <div
          className="absolute top-3 bottom-3 left-[34px] w-px"
          style={{ background: "rgba(255,255,255,0.06)" }}
        />
        {items.map((m, i) => {
          const dot = STATUS_DOT[m.status];
          return (
            <li
              key={m.id}
              draggable
              onDragStart={() => (dragIndex.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex.current !== null) reorder(dragIndex.current, i);
                dragIndex.current = null;
              }}
              className="relative flex items-center gap-3 rounded-md px-3 py-2.5"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <button
                type="button"
                aria-label="Drag to reorder"
                className="cursor-grab active:cursor-grabbing p-1 -ml-1"
                style={{ color: "rgba(255,255,255,0.3)" }}
              >
                <GripVertical className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => patch(m.id, { status: cycleStatus(m.status) })}
                title={dot.label}
                className="h-3 w-3 rounded-full shrink-0 ring-offset-2"
                style={{ background: dot.color, boxShadow: `0 0 0 2px ${dot.color}22` }}
              />

              <input
                value={m.name}
                onChange={(e) => patch(m.id, { name: e.target.value })}
                placeholder="Milestone name"
                style={{
                  ...inputStyle,
                  background: "transparent",
                  border: "1px solid transparent",
                  padding: "6px 8px",
                  flex: 1,
                  minWidth: 0,
                }}
                className="hover:bg-white/[0.03] focus:bg-white/[0.04] rounded"
              />

              <select
                value={m.kind}
                onChange={(e) => patch(m.id, { kind: e.target.value as "Required" | "Optional" })}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.75)",
                  borderRadius: 6,
                  padding: "5px 8px",
                  fontSize: 12,
                }}
              >
                <option value="Required" style={{ background: "#0a121f" }}>Required</option>
                <option value="Optional" style={{ background: "#0a121f" }}>Optional</option>
              </select>

              <input
                type="date"
                value={m.target_date ?? ""}
                onChange={(e) => patch(m.id, { target_date: e.target.value || null })}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.75)",
                  borderRadius: 6,
                  padding: "5px 8px",
                  fontSize: 12,
                  width: 140,
                }}
              />

              <button
                type="button"
                onClick={() => remove(m.id)}
                aria-label="Delete milestone"
                className="p-1.5 rounded hover:bg-white/5 transition-colors"
                style={{ color: "rgba(255,255,255,0.35)" }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ol>

      <button
        type="button"
        onClick={add}
        className="w-full rounded-md py-3 text-xs font-medium transition-colors hover:bg-white/[0.03]"
        style={{
          border: "1px dashed rgba(201,168,76,0.4)",
          color: "#c9a84c",
          background: "transparent",
        }}
      >
        + Add milestone
      </button>
    </div>
  );
}

function ComplianceTab({ missionId }: { missionId: string }) {
  const { data: reqs = [] } = useQuery({
    queryKey: ["admin-mission-compliance", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("compliance_requirements")
        .select("id,title,status")
        .eq("mission_id", missionId);
      return data ?? [];
    },
  });
  return (
    <SectionCard title={`Compliance (${reqs.length})`}>
      {reqs.length === 0 ? (
        <div className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
          No compliance requirements yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {reqs.map((r: any) => (
            <li key={r.id} className="flex items-center gap-3 rounded-md px-3 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
              <span className="text-sm text-white/80 flex-1 truncate">{r.title}</span>
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{r.status ?? "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function ReportsTab({ missionId }: { missionId: string }) {
  const { data: outcomes = [] } = useQuery({
    queryKey: ["admin-mission-reports", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_outcomes")
        .select("id,outcome_type,description,created_at")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  return (
    <SectionCard title="Mission Reports">
      {outcomes.length === 0 ? (
        <div className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
          No reports generated yet for this mission.
        </div>
      ) : (
        <ul className="space-y-2">
          {outcomes.map((o: any) => (
            <li key={o.id} className="rounded-md px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="text-xs font-semibold" style={{ color: "#c9a84c" }}>{o.outcome_type}</div>
              <div className="text-sm text-white/80 mt-0.5">{o.description}</div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
