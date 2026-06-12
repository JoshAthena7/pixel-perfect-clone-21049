import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, MoreHorizontal, X, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { addAtlasTeamMember } from "@/lib/atlas-team-admin.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/_authenticated/admin/team")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const [{ data: prof }, { data: role }] = await Promise.all([
      supabase.from("profiles").select("is_platform_admin").eq("id", u.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle(),
    ]);
    if (!prof?.is_platform_admin && !role) throw redirect({ to: "/my-work" });
  },
  component: StaffPage,
});

type Staff = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  job_title: string | null;
  atlas_role: string | null;
  atlas_hipaa_acknowledged: boolean | null;
  atlas_invite_status: string | null;
};

type Clearance = "Cleared" | "Pending" | "Not cleared";

function clearanceFor(s: Staff): Clearance {
  if (s.atlas_hipaa_acknowledged) return "Cleared";
  if (s.atlas_invite_status === "invite_sent") return "Pending";
  return "Not cleared";
}

function fullName(s: Staff) {
  const n = [s.first_name, s.last_name].filter(Boolean).join(" ").trim();
  return n || s.email;
}

function initialsOf(s: Staff) {
  const f = (s.first_name ?? "").trim()[0] ?? "";
  const l = (s.last_name ?? "").trim()[0] ?? "";
  const out = (f + l).toUpperCase();
  return out || s.email.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  "#7c5cff", "#22c55e", "#c9a84c", "#3b82f6", "#ef4444",
  "#14b8a6", "#f97316", "#a855f7", "#06b6d4", "#eab308",
];

function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function roleLabel(r: string | null | undefined) {
  if (!r) return "Unassigned";
  return r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function StaffPage() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["admin-staff-list"],
    queryFn: async (): Promise<Staff[]> => {
      const { data } = await supabase
        .from("atlas_team_members")
        .select("id,first_name,last_name,email,job_title,atlas_role,atlas_hipaa_acknowledged,atlas_invite_status")
        .eq("is_removed", false)
        .order("first_name", { ascending: true });
      return (data ?? []) as Staff[];
    },
  });

  // Map mission counts by email → user_id → mission_team_members
  const { data: missionCounts = {} } = useQuery({
    queryKey: ["admin-staff-mission-counts"],
    queryFn: async (): Promise<Record<string, number>> => {
      const ids = staff.map((s) => s.id);
      if (ids.length === 0) return {};
      const { data: mems } = await supabase
        .from("mission_team_members")
        .select("member_id")
        .in("member_id", ids);
      const byId: Record<string, number> = {};
      (mems ?? []).forEach((m: any) => {
        byId[m.member_id] = (byId[m.member_id] ?? 0) + 1;
      });
      return byId;
    },
    enabled: staff.length > 0,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((s) => {
      const name = fullName(s).toLowerCase();
      const role = (s.atlas_role ?? "").toLowerCase();
      const title = (s.job_title ?? "").toLowerCase();
      const clearance = clearanceFor(s).toLowerCase();
      return name.includes(q) || role.includes(q) || title.includes(q) || clearance.includes(q) || s.email.toLowerCase().includes(q);
    });
  }, [query, staff]);

  const selected = selectedId ? staff.find((s) => s.id === selectedId) ?? null : null;

  return (
    <div className="min-h-[calc(100vh-48px)]" style={{ background: "#080c14" }}>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-white">Staff</h1>
            <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
              {staff.length} member{staff.length === 1 ? "" : "s"} across ATLAS.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: "#c9a84c", color: "#080c14" }}
          >
            <Plus className="h-4 w-4" />
            Add staff member
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search
            className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "rgba(255,255,255,0.35)" }}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, role, or clearance level…"
            className="w-full rounded-md pl-9 pr-3 py-2.5 text-sm outline-none focus:border-[#c9a84c]/60 transition-colors"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "white",
            }}
          />
        </div>

        {/* Cards */}
        <div className="space-y-2">
          {isLoading && (
            <div className="rounded-lg p-6 text-sm" style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
              Loading staff…
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="rounded-lg p-6 text-sm text-center" style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}>
              No staff match “{query}”.
            </div>
          )}
          {filtered.map((s) => (
            <StaffCard
              key={s.id}
              staff={s}
              missionCount={missionCounts[s.email] ?? 0}
              onClick={() => setSelectedId(s.id)}
            />
          ))}
        </div>
      </div>

      {/* Side panel */}
      {selected && (
        <StaffDetailPanel
          staff={selected}
          missionCount={missionCounts[selected.email] ?? 0}
          onClose={() => setSelectedId(null)}
        />
      )}

      {addOpen && <AddStaffDialog onClose={() => setAddOpen(false)} />}
    </div>
  );
}

function StaffCard({
  staff,
  missionCount,
  onClick,
}: {
  staff: Staff;
  missionCount: number;
  onClick: () => void;
}) {
  const c = clearanceFor(staff);
  const clearanceColors: Record<Clearance, { bg: string; fg: string; bd: string }> = {
    "Cleared": { bg: "rgba(34,197,94,0.12)", fg: "#22c55e", bd: "rgba(34,197,94,0.3)" },
    "Pending": { bg: "rgba(201,168,76,0.12)", fg: "#c9a84c", bd: "rgba(201,168,76,0.3)" },
    "Not cleared": { bg: "rgba(239,68,68,0.12)", fg: "#ef4444", bd: "rgba(239,68,68,0.3)" },
  };
  const cc = clearanceColors[c];
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-lg px-4 py-3.5 flex items-center gap-4 transition-colors"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(201,168,76,0.5)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}
    >
      <div
        className="h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold text-white"
        style={{ background: colorFor(staff.id) }}
      >
        {initialsOf(staff)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white font-medium text-sm truncate">{fullName(staff)}</div>
        <div className="text-xs mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.45)" }}>
          {staff.job_title ?? roleLabel(staff.atlas_role)}
        </div>
      </div>
      <span
        className="rounded-full text-[10px] font-semibold uppercase tracking-wider shrink-0"
        style={{
          padding: "3px 9px",
          background: cc.bg,
          color: cc.fg,
          border: `1px solid ${cc.bd}`,
        }}
      >
        {c}
      </span>
      <div className="hidden sm:flex items-center text-xs shrink-0 tabular-nums" style={{ color: "rgba(255,255,255,0.5)" }}>
        {missionCount} {missionCount === 1 ? "mission" : "missions"}
      </div>
      <span
        onClick={(e) => { e.stopPropagation(); }}
        className="rounded-md p-1.5 hover:bg-white/[0.05] shrink-0"
        style={{ color: "rgba(255,255,255,0.4)" }}
      >
        <MoreHorizontal className="h-4 w-4" />
      </span>
    </button>
  );
}

function StaffDetailPanel({
  staff,
  missionCount,
  onClose,
}: {
  staff: Staff;
  missionCount: number;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const c = clearanceFor(staff);

  const { data: missions = [] } = useQuery({
    queryKey: ["staff-missions", staff.id, staff.email],
    queryFn: async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", staff.email)
        .maybeSingle();
      if (!prof) return [];
      const { data: mems } = await supabase
        .from("mission_team_members")
        .select("role,mission_id,missions:mission_id(name,status)")
        .eq("user_id", prof.id);
      return (mems ?? []).map((m: any) => ({
        mission_id: m.mission_id,
        role: m.role,
        name: m.missions?.name ?? "Mission",
        status: m.missions?.status,
      }));
    },
  });

  return (
    <>
      <div
        className="fixed inset-0 z-[70] bg-black/40 animate-in fade-in"
        onClick={onClose}
      />
      <aside
        className="fixed top-0 right-0 bottom-0 z-[71] w-full sm:w-[420px] flex flex-col animate-in slide-in-from-right"
        style={{
          background: "#0a121f",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#c9a84c" }}>
            Staff profile
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-white/[0.05]"
            style={{ color: "rgba(255,255,255,0.5)" }}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="flex items-center gap-4">
            <div
              className="h-14 w-14 rounded-full flex items-center justify-center text-base font-semibold text-white"
              style={{ background: colorFor(staff.id) }}
            >
              {initialsOf(staff)}
            </div>
            <div className="min-w-0">
              <div className="text-white font-semibold">{fullName(staff)}</div>
              <div className="text-xs mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.5)" }}>
                {staff.email}
              </div>
            </div>
          </div>

          <DetailRow label="Role">{roleLabel(staff.atlas_role)}</DetailRow>
          {staff.job_title && <DetailRow label="Title">{staff.job_title}</DetailRow>}
          <DetailRow label="Clearance">
            <span style={{ color: c === "Cleared" ? "#22c55e" : c === "Pending" ? "#c9a84c" : "#ef4444" }}>
              {c}
            </span>
          </DetailRow>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>
              Missions assigned ({missions.length || missionCount})
            </div>
            {missions.length === 0 ? (
              <div className="text-sm rounded-md px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.45)" }}>
                Not assigned to any missions yet.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {missions.map((m) => (
                  <li
                    key={m.mission_id}
                    className="flex items-center justify-between rounded-md px-3 py-2.5"
                    style={{ background: "rgba(255,255,255,0.03)" }}
                  >
                    <div className="min-w-0">
                      <div className="text-sm text-white truncate">{m.name}</div>
                      <div className="text-[10px] mt-0.5 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>
                        {m.status ?? "—"}
                      </div>
                    </div>
                    <span
                      className="text-xs rounded shrink-0 ml-3"
                      style={{
                        background: "rgba(201,168,76,0.12)",
                        color: "#c9a84c",
                        padding: "2px 8px",
                      }}
                    >
                      {roleLabel(m.role)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div
          className="px-5 py-4 flex items-center justify-end gap-2"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-md hover:bg-white/[0.05]"
            style={{ color: "rgba(255,255,255,0.6)" }}
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: "/admin/team/$memberId", params: { memberId: staff.id } })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold"
            style={{ background: "#c9a84c", color: "#080c14" }}
          >
            Edit
          </button>
        </div>
      </aside>
    </>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>
        {label}
      </div>
      <div className="text-sm text-white">{children}</div>
    </div>
  );
}

function AddStaffDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const addFn = useServerFn(addAtlasTeamMember);
  const m = useMutation({
    mutationFn: async () => addFn({
      data: {
        first_name: first.trim() || null,
        last_name: last.trim() || null,
        email: email.trim().toLowerCase(),
        job_title: title.trim() || null,
        atlas_role: "unassigned",
      },
    }),
    onSuccess: () => {
      toast.success("Staff member added");
      qc.invalidateQueries({ queryKey: ["admin-staff-list"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/50" onClick={onClose} />
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[81] w-full max-w-md rounded-lg p-5"
        style={{ background: "#0a121f", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold text-white">Add staff member</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/[0.05]" style={{ color: "rgba(255,255,255,0.5)" }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="First name" value={first} onChange={setFirst} />
            <Input label="Last name" value={last} onChange={setLast} />
          </div>
          <Input label="Email" value={email} onChange={setEmail} type="email" icon={<Mail className="h-3.5 w-3.5" />} />
          <Input label="Job title" value={title} onChange={setTitle} />
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-md hover:bg-white/[0.05]" style={{ color: "rgba(255,255,255,0.6)" }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => m.mutate()}
            disabled={!email.trim() || m.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-50"
            style={{ background: "#c9a84c", color: "#080c14" }}
          >
            {m.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add member
          </button>
        </div>
      </div>
    </>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  icon?: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>
        {label}
      </div>
      <div className="relative">
        {icon && (
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.35)" }}>
            {icon}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md py-2 text-sm outline-none focus:border-[#c9a84c]/60"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "white",
            paddingLeft: icon ? 30 : 10,
            paddingRight: 10,
          }}
        />
      </div>
    </label>
  );
}
