/**
 * Phase 4 — Team & Assignments (wizard step 6 of 7).
 *
 * Sub-step 4A — Mission Team: pick people from the Athena roster and assign
 *   their role on this mission (engagement_lead / writer / sme / reviewer).
 * Sub-step 4B — Question Assignments: assign every extracted mission_question
 *   to a lead writer drawn from the mission team.
 *
 * Gates:
 *  - Cannot advance from 4A → 4B until at least one engagement_lead exists.
 *  - Cannot advance from 4B → Review until every non-withdrawn question has
 *    a lead_writer in question_progress.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Loader2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { WizardStepHeading } from "./WizardShellV3";

const MISSION_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "engagement_lead", label: "Engagement Lead" },
  { value: "writer", label: "Writer" },
  { value: "sme", label: "SME" },
  { value: "reviewer", label: "Reviewer" },
];

type RosterMember = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  skills: string[] | null;
};

type MissionTeamRow = {
  id: string;
  member_id: string;
  mission_role: string | null;
  member: RosterMember | null;
};

type SectionLite = { id: string; name: string | null; order_index: number | null };

type MissionQuestionRow = {
  id: string;
  question_number: string | null;
  question_text: string | null;
  section_id: string | null;
};

type ProgressRow = {
  id: string;
  question_id: string;
  assignee_id: string;
  internal_due_date: string | null;
};

export function Step7Team({
  missionId,
  onBack,
  onAdvance,
}: {
  missionId: string;
  onBack: () => void;
  onAdvance: () => void;
}) {
  const [sub, setSub] = useState<"A" | "B">("A");
  return sub === "A" ? (
    <TeamSubStep missionId={missionId} onBack={onBack} onAdvance={() => setSub("B")} />
  ) : (
    <AssignmentsSubStep
      missionId={missionId}
      onBack={() => setSub("A")}
      onAdvance={onAdvance}
    />
  );
}

/* ============================================================
 * 4A — Mission Team
 * ============================================================ */
function TeamSubStep({
  missionId,
  onBack,
  onAdvance,
}: {
  missionId: string;
  onBack: () => void;
  onAdvance: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const teamKey = ["wizard-mission-team", missionId] as const;
  const rosterKey = ["wizard-atlas-roster"] as const;
  const loadKey = ["wizard-team-mission-load"] as const;

  const { data: roster = [], isLoading: rosterLoading } = useQuery({
    queryKey: rosterKey,
    queryFn: async (): Promise<RosterMember[]> => {
      const { data, error } = await supabase
        .from("atlas_team_members")
        .select("id, first_name, last_name, job_title, skills")
        .eq("atlas_invite_status", "active")
        .eq("is_removed", false);
      if (error) throw error;
      return (data ?? []) as RosterMember[];
    },
  });

  const { data: team = [], isLoading: teamLoading } = useQuery({
    queryKey: teamKey,
    queryFn: async (): Promise<MissionTeamRow[]> => {
      const { data, error } = await supabase
        .from("mission_team_members")
        .select(
          "id, member_id, mission_role, member:atlas_team_members!mission_team_members_member_id_fkey(id, first_name, last_name, job_title, skills)",
        )
        .eq("mission_id", missionId);
      if (error) throw error;
      return (data ?? []) as unknown as MissionTeamRow[];
    },
  });

  const { data: loadByMember = {} } = useQuery({
    queryKey: loadKey,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from("mission_team_members")
        .select("member_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r: { member_id: string }) => {
        counts[r.member_id] = (counts[r.member_id] ?? 0) + 1;
      });
      return counts;
    },
  });

  const assignedIds = useMemo(() => new Set(team.map((t) => t.member_id)), [team]);

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return roster
      .filter((m) => !assignedIds.has(m.id))
      .filter((m) => {
        if (!q) return true;
        const name = `${m.first_name ?? ""} ${m.last_name ?? ""}`.toLowerCase();
        return name.includes(q);
      })
      .sort((a, b) => fullName(a).localeCompare(fullName(b)));
  }, [roster, assignedIds, search]);

  async function addPerson(memberId: string) {
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("mission_team_members").insert({
      mission_id: missionId,
      member_id: memberId,
      mission_role: "writer",
      added_by: userData.user?.id ?? null,
    });
    if (error) {
      toast.error(`Could not add: ${error.message}`);
      return;
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: teamKey }),
      qc.invalidateQueries({ queryKey: loadKey }),
    ]);
  }

  async function removePerson(memberId: string) {
    const { error } = await supabase
      .from("mission_team_members")
      .delete()
      .eq("mission_id", missionId)
      .eq("member_id", memberId);
    if (error) {
      toast.error(`Could not remove: ${error.message}`);
      return;
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: teamKey }),
      qc.invalidateQueries({ queryKey: loadKey }),
    ]);
  }

  async function changeRole(memberId: string, newRole: string) {
    const { error } = await supabase
      .from("mission_team_members")
      .update({ mission_role: newRole })
      .eq("mission_id", missionId)
      .eq("member_id", memberId);
    if (error) {
      toast.error(`Could not update role: ${error.message}`);
      return;
    }
    qc.invalidateQueries({ queryKey: teamKey });
  }

  const hasEngagementLead = team.some((t) => t.mission_role === "engagement_lead");

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.18em] text-amber-300/80 mb-1">
        Phase 4 of 7 — Team &amp; Assignments
      </p>
      <WizardStepHeading
        title="Step 4A — Assemble Your Mission Team"
        subtitle="Add people from your Athena roster and assign their role on this mission."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT — Available */}
        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13.5px] font-semibold text-white inline-flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-white/55" /> Available Members
            </h3>
            <span className="text-[11.5px] text-white/45">{available.length} available</span>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[13px] text-white placeholder:text-white/35 focus:outline-none focus:border-amber-400/50 mb-3"
          />
          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {rosterLoading ? (
              <RowLoading />
            ) : available.length === 0 ? (
              <EmptyHint>
                {roster.length > 0 && assignedIds.size === roster.length
                  ? "Everyone on your Athena roster is already on this mission."
                  : search
                    ? "No roster members match that name."
                    : "No active members in your Athena roster yet."}
              </EmptyHint>
            ) : (
              available.map((m) => (
                <RosterCard
                  key={m.id}
                  member={m}
                  loadCount={loadByMember[m.id] ?? 0}
                  onAdd={() => addPerson(m.id)}
                />
              ))
            )}
          </div>
        </section>

        {/* RIGHT — Mission team */}
        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13.5px] font-semibold text-white">Mission Team</h3>
            <span className="text-[11.5px] text-white/45">{team.length} assigned</span>
          </div>
          <div className="space-y-2 flex-1 max-h-[480px] overflow-y-auto pr-1">
            {teamLoading ? (
              <RowLoading />
            ) : team.length === 0 ? (
              <EmptyHint>No team members yet. Add people from the roster on the left.</EmptyHint>
            ) : (
              team.map((row) => (
                <AssignedCard
                  key={row.id}
                  row={row}
                  onChangeRole={(r) => changeRole(row.member_id, r)}
                  onRemove={() => removePerson(row.member_id)}
                />
              ))
            )}
          </div>

          {!hasEngagementLead && team.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-[12.5px] text-amber-100">
              ⚠ You must assign at least one Engagement Lead before you can assign
              questions. Writers and SMEs can be added at any time.
            </div>
          )}
        </section>
      </div>

      <div
        className="mt-8 pt-6 flex items-center justify-between gap-4"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button onClick={onBack} className="text-[13px] text-white/55 hover:text-white">
          ← Back
        </button>
        <div className="flex items-center gap-3">
          {!hasEngagementLead && (
            <span className="text-[11.5px] text-white/45">
              Assign an Engagement Lead to continue
            </span>
          )}
          <button
            onClick={onAdvance}
            disabled={!hasEngagementLead}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-md text-[13.5px] font-medium disabled:opacity-40"
            style={{ background: "#C49A2B", color: "#0D1B3E" }}
          >
            Next: Assign Questions <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function RosterCard({
  member,
  loadCount,
  onAdd,
}: {
  member: RosterMember;
  loadCount: number;
  onAdd: () => void;
}) {
  const name = fullName(member);
  const skill = member.job_title ?? member.skills?.[0] ?? "—";
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
      <Avatar name={name} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-white font-medium truncate">{name}</p>
        <p className="text-[11.5px] text-white/55 truncate">{skill}</p>
        <p className="text-[11px] text-white/40 mt-0.5">
          {loadCount} active mission{loadCount === 1 ? "" : "s"}
        </p>
      </div>
      <button
        onClick={onAdd}
        className="text-[11.5px] px-2.5 py-1.5 rounded-md font-medium"
        style={{ background: "rgba(196,154,43,0.18)", color: "#E9C268", border: "1px solid rgba(196,154,43,0.4)" }}
      >
        Add to Mission
      </button>
    </div>
  );
}

function AssignedCard({
  row,
  onChangeRole,
  onRemove,
}: {
  row: MissionTeamRow;
  onChangeRole: (newRole: string) => void;
  onRemove: () => void;
}) {
  const name = fullName(row.member);
  const currentRole = row.mission_role && MISSION_ROLE_OPTIONS.some((o) => o.value === row.mission_role)
    ? row.mission_role
    : "writer";
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
      <Avatar name={name} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-white font-medium truncate">{name}</p>
        <p className="text-[11.5px] text-white/45 truncate">
          {row.member?.job_title ?? row.member?.skills?.[0] ?? "—"}
        </p>
      </div>
      <select
        value={currentRole}
        onChange={(e) => onChangeRole(e.target.value)}
        className="bg-white/5 border border-white/15 rounded-md px-2 py-1.5 text-[12px] text-white focus:outline-none focus:border-amber-400/60"
      >
        {MISSION_ROLE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#0D1B3E]">
            {o.label}
          </option>
        ))}
      </select>
      <button
        onClick={onRemove}
        title="Remove from mission"
        className="text-white/40 hover:text-red-400 p-1"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ============================================================
 * 4B — Question Assignments
 * ============================================================ */
function AssignmentsSubStep({
  missionId,
  onBack,
  onAdvance,
}: {
  missionId: string;
  onBack: () => void;
  onAdvance: () => void;
}) {
  const qc = useQueryClient();
  const [filterMode, setFilterMode] = useState<"all" | "assigned" | "unassigned">("all");
  const [filterWriter, setFilterWriter] = useState<string>("");
  const [bulkWriter, setBulkWriter] = useState<string>("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmClear, setConfirmClear] = useState(false);

  const questionsKey = ["wizard-assign-questions", missionId] as const;
  const sectionsKey = ["wizard-assign-sections", missionId] as const;
  const progressKey = ["wizard-assign-progress", missionId] as const;
  const teamKey = ["wizard-assign-team", missionId] as const;

  const { data: questions = [] } = useQuery({
    queryKey: questionsKey,
    queryFn: async (): Promise<MissionQuestionRow[]> => {
      const { data, error } = await supabase
        .from("mission_questions")
        .select("id, question_number, question_text, section_id")
        .eq("mission_id", missionId)
        .eq("is_withdrawn", false);
      if (error) throw error;
      return (data ?? []) as MissionQuestionRow[];
    },
  });

  const { data: sections = [] } = useQuery({
    queryKey: sectionsKey,
    queryFn: async (): Promise<SectionLite[]> => {
      const { data, error } = await supabase
        .from("mission_sections")
        .select("id, name, order_index")
        .eq("mission_id", missionId);
      if (error) throw error;
      return (data ?? []) as SectionLite[];
    },
  });

  const { data: progress = [] } = useQuery({
    queryKey: progressKey,
    queryFn: async (): Promise<ProgressRow[]> => {
      const { data, error } = await supabase
        .from("question_progress")
        .select("id, question_id, assignee_id, internal_due_date")
        .eq("mission_id", missionId)
        .eq("role", "lead_writer");
      if (error) throw error;
      return (data ?? []) as ProgressRow[];
    },
  });

  const { data: team = [] } = useQuery({
    queryKey: teamKey,
    queryFn: async (): Promise<MissionTeamRow[]> => {
      const { data, error } = await supabase
        .from("mission_team_members")
        .select(
          "id, member_id, mission_role, member:atlas_team_members!mission_team_members_member_id_fkey(id, first_name, last_name, job_title, skills)",
        )
        .eq("mission_id", missionId)
        .in("mission_role", ["writer", "engagement_lead"]);
      if (error) throw error;
      return (data ?? []) as unknown as MissionTeamRow[];
    },
  });

  const sectionById = useMemo(() => {
    const m = new Map<string, SectionLite>();
    sections.forEach((s) => m.set(s.id, s));
    return m;
  }, [sections]);

  const progressByQuestion = useMemo(() => {
    const m = new Map<string, ProgressRow>();
    progress.forEach((p) => m.set(p.question_id, p));
    return m;
  }, [progress]);

  const memberName = useMemo(() => {
    const m = new Map<string, string>();
    team.forEach((t) => m.set(t.member_id, fullName(t.member)));
    return m;
  }, [team]);

  const sortedQuestions = useMemo(() => {
    return [...questions].sort((a, b) => {
      const sa = a.section_id ? sectionById.get(a.section_id)?.order_index ?? 999 : 999;
      const sb = b.section_id ? sectionById.get(b.section_id)?.order_index ?? 999 : 999;
      if (sa !== sb) return sa - sb;
      return naturalCompare(a.question_number ?? "", b.question_number ?? "");
    });
  }, [questions, sectionById]);

  const visibleQuestions = useMemo(() => {
    return sortedQuestions.filter((q) => {
      const p = progressByQuestion.get(q.id);
      if (filterMode === "assigned" && !p) return false;
      if (filterMode === "unassigned" && p) return false;
      if (filterWriter && p?.assignee_id !== filterWriter) return false;
      return true;
    });
  }, [sortedQuestions, progressByQuestion, filterMode, filterWriter]);

  const assignedCount = progress.length;
  const totalCount = questions.length;
  const allAssigned = totalCount > 0 && assignedCount >= totalCount;
  const pct = totalCount > 0 ? Math.round((assignedCount / totalCount) * 100) : 0;

  async function assignWriter(questionId: string, newAssigneeId: string) {
    const existing = progressByQuestion.get(questionId);
    if (!newAssigneeId) {
      if (!existing) return;
      const { error } = await supabase
        .from("question_progress")
        .delete()
        .eq("mission_id", missionId)
        .eq("question_id", questionId)
        .eq("role", "lead_writer");
      if (error) {
        toast.error(`Could not unassign: ${error.message}`);
        return;
      }
    } else if (existing) {
      const { error } = await supabase
        .from("question_progress")
        .update({
          assignee_id: newAssigneeId,
          assigned_at: new Date().toISOString(),
          acceptance_status: "pending",
        })
        .eq("id", existing.id);
      if (error) {
        toast.error(`Could not reassign: ${error.message}`);
        return;
      }
    } else {
      const { error } = await supabase.from("question_progress").insert({
        mission_id: missionId,
        question_id: questionId,
        assignee_id: newAssigneeId,
        role: "lead_writer",
        status: "not_started",
        acceptance_status: "pending",
        assigned_at: new Date().toISOString(),
      });
      if (error) {
        toast.error(`Could not assign: ${error.message}`);
        return;
      }
    }
    qc.invalidateQueries({ queryKey: progressKey });
  }

  async function setInternalDue(questionId: string, value: string) {
    const existing = progressByQuestion.get(questionId);
    if (!existing) {
      toast.error("Assign a writer before setting an internal due date.");
      return;
    }
    const { error } = await supabase
      .from("question_progress")
      .update({ internal_due_date: value || null })
      .eq("id", existing.id);
    if (error) {
      toast.error(`Could not save due date: ${error.message}`);
      return;
    }
    qc.invalidateQueries({ queryKey: progressKey });
  }

  async function bulkAssignAllUnassigned() {
    if (!bulkWriter) return;
    const unassigned = sortedQuestions.filter((q) => !progressByQuestion.has(q.id));
    if (unassigned.length === 0) {
      toast.info("No unassigned questions.");
      return;
    }
    const rows = unassigned.map((q) => ({
      mission_id: missionId,
      question_id: q.id,
      assignee_id: bulkWriter,
      role: "lead_writer",
      status: "not_started",
      acceptance_status: "pending",
      assigned_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("question_progress").insert(rows);
    if (error) {
      toast.error(`Bulk assign failed: ${error.message}`);
      return;
    }
    toast.success(`Assigned ${unassigned.length} question${unassigned.length === 1 ? "" : "s"}.`);
    setBulkWriter("");
    qc.invalidateQueries({ queryKey: progressKey });
  }

  async function clearAllAssignments() {
    const { error } = await supabase
      .from("question_progress")
      .delete()
      .eq("mission_id", missionId)
      .eq("role", "lead_writer");
    if (error) {
      toast.error(`Clear failed: ${error.message}`);
      return;
    }
    toast.success("Cleared all assignments.");
    setConfirmClear(false);
    qc.invalidateQueries({ queryKey: progressKey });
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="text-[12px] text-white/55 hover:text-white inline-flex items-center gap-1 mb-3"
      >
        <ArrowLeft className="h-3 w-3" /> Back to Team
      </button>
      <p className="text-[11px] uppercase tracking-[0.18em] text-amber-300/80 mb-1">
        Phase 4 of 7 — Team &amp; Assignments
      </p>
      <WizardStepHeading
        title="Step 4B — Assign Questions"
        subtitle="Assign every question to a lead writer. Every question must have an owner before BLAST OFF."
      />

      {/* Progress */}
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12.5px] text-white/70">
            {assignedCount} of {totalCount} questions assigned
          </span>
          <span className="text-[12px] text-white/45 tabular-nums">{pct}%</span>
        </div>
        <div className="h-[6px] rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full transition-all"
            style={{
              width: `${pct}%`,
              background: allAssigned ? "#22c55e" : "#C49A2B",
            }}
          />
        </div>
      </div>

      {/* Bulk + filters */}
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11.5px] text-white/55">Assign all unassigned to</span>
          <select
            value={bulkWriter}
            onChange={(e) => setBulkWriter(e.target.value)}
            className="bg-white/5 border border-white/15 rounded-md px-2 py-1.5 text-[12px] text-white focus:outline-none focus:border-amber-400/60"
          >
            <option value="" className="bg-[#0D1B3E]">— Select writer —</option>
            {team.map((t) => (
              <option key={t.member_id} value={t.member_id} className="bg-[#0D1B3E]">
                {fullName(t.member)}
              </option>
            ))}
          </select>
          <button
            disabled={!bulkWriter}
            onClick={bulkAssignAllUnassigned}
            className="text-[11.5px] px-2.5 py-1.5 rounded-md font-medium disabled:opacity-40"
            style={{ background: "rgba(196,154,43,0.18)", color: "#E9C268", border: "1px solid rgba(196,154,43,0.4)" }}
          >
            Apply
          </button>
        </div>

        <div className="flex items-center gap-1 ml-auto">
          {(["all", "assigned", "unassigned"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setFilterMode(m)}
              className={`text-[11.5px] px-2 py-1 rounded ${
                filterMode === m ? "bg-white/10 text-white" : "text-white/55 hover:text-white"
              }`}
            >
              {m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
          <select
            value={filterWriter}
            onChange={(e) => setFilterWriter(e.target.value)}
            className="bg-white/5 border border-white/15 rounded-md px-2 py-1 text-[11.5px] text-white focus:outline-none focus:border-amber-400/60 ml-2"
          >
            <option value="" className="bg-[#0D1B3E]">All writers</option>
            {team.map((t) => (
              <option key={t.member_id} value={t.member_id} className="bg-[#0D1B3E]">
                {fullName(t.member)}
              </option>
            ))}
          </select>
          <button
            onClick={() => setConfirmClear(true)}
            className="text-[11.5px] text-white/45 hover:text-red-400 ml-2"
          >
            Clear all
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-white/10 overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead className="bg-white/[0.04] text-white/55">
            <tr>
              <th className="px-3 py-2 text-left font-medium w-12">#</th>
              <th className="px-3 py-2 text-left font-medium">Question</th>
              <th className="px-3 py-2 text-left font-medium w-40">Section</th>
              <th className="px-3 py-2 text-left font-medium w-56">Assigned To</th>
              <th className="px-3 py-2 text-left font-medium w-40">Internal Due</th>
            </tr>
          </thead>
          <tbody>
            {visibleQuestions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-white/45">
                  {totalCount === 0 ? "No questions extracted yet." : "No questions match the current filter."}
                </td>
              </tr>
            ) : (
              visibleQuestions.map((q) => {
                const p = progressByQuestion.get(q.id);
                const isLong = (q.question_text ?? "").length > 60;
                const isExpanded = expanded.has(q.id);
                const display = isExpanded || !isLong
                  ? q.question_text ?? ""
                  : `${(q.question_text ?? "").slice(0, 60)}…`;
                return (
                  <tr key={q.id} className="border-t border-white/5 align-top">
                    <td className="px-3 py-2 font-mono text-[12px]" style={{ color: "#C49A2B" }}>
                      {q.question_number ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-white">
                      {display}
                      {isLong && (
                        <button
                          onClick={() => {
                            setExpanded((cur) => {
                              const next = new Set(cur);
                              if (next.has(q.id)) next.delete(q.id);
                              else next.add(q.id);
                              return next;
                            });
                          }}
                          className="ml-2 text-[11px] text-white/45 hover:text-white"
                        >
                          {isExpanded ? "Show less" : "Show more"}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-white/65">
                      {q.section_id ? sectionById.get(q.section_id)?.name ?? "—" : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={p?.assignee_id ?? ""}
                        onChange={(e) => assignWriter(q.id, e.target.value)}
                        className={`w-full bg-white/5 border rounded-md px-2 py-1.5 text-[12px] focus:outline-none focus:border-amber-400/60 ${
                          !p ? "border-red-500/40 text-red-300" : "border-white/15 text-white"
                        }`}
                      >
                        <option value="" className="bg-[#0D1B3E]">— Unassigned —</option>
                        {team.map((t) => (
                          <option key={t.member_id} value={t.member_id} className="bg-[#0D1B3E]">
                            {memberName.get(t.member_id) ?? "Unknown"}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        value={p?.internal_due_date ?? ""}
                        onChange={(e) => setInternalDue(q.id, e.target.value)}
                        disabled={!p}
                        className="bg-white/5 border border-white/15 rounded-md px-2 py-1.5 text-[12px] text-white focus:outline-none focus:border-amber-400/60 disabled:opacity-40"
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom validation */}
      <div className="mt-5">
        {allAssigned ? (
          <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3 text-[13px] text-green-200">
            ✅ All {totalCount} questions have an owner. Ready for BLAST OFF.
          </div>
        ) : (
          <div className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-[13px] text-amber-100">
            ⚠ {totalCount - assignedCount} question{totalCount - assignedCount === 1 ? "" : "s"} still
            need a writer. BLAST OFF requires every question to have an owner.
          </div>
        )}
      </div>

      <div
        className="mt-8 pt-6 flex items-center justify-between gap-4"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button onClick={onBack} className="text-[13px] text-white/55 hover:text-white">
          ← Back to Team
        </button>
        <button
          onClick={onAdvance}
          disabled={!allAssigned}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-md text-[13.5px] font-medium disabled:opacity-40"
          style={{ background: "#C49A2B", color: "#0D1B3E" }}
        >
          Continue to Review <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {confirmClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setConfirmClear(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-white/15 bg-[#0a1428] p-6">
            <h3 className="text-[15px] font-semibold text-white mb-2">Clear all assignments?</h3>
            <p className="text-[13px] text-white/65">
              This will remove all question assignments. Writers will need to be reassigned before
              BLAST OFF. Continue?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmClear(false)}
                className="px-3 py-1.5 rounded-md text-[12.5px] text-white/65 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={clearAllAssignments}
                className="px-3 py-1.5 rounded-md text-[12.5px] font-medium bg-red-500/80 text-white hover:bg-red-500"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * helpers
 * ============================================================ */
function fullName(m: { first_name?: string | null; last_name?: string | null } | null | undefined): string {
  if (!m) return "Unknown";
  const f = (m.first_name ?? "").trim();
  const l = (m.last_name ?? "").trim();
  return `${f} ${l}`.trim() || "Unknown";
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Avatar({ name }: { name: string }) {
  return (
    <div
      className="h-9 w-9 rounded-full flex items-center justify-center text-[11.5px] font-semibold shrink-0"
      style={{ background: "#0D1B3E", color: "#C49A2B", border: "1px solid rgba(196,154,43,0.35)" }}
    >
      {initials(name)}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[12.5px] text-white/45 italic px-2 py-6 text-center">{children}</div>
  );
}

function RowLoading() {
  return (
    <div className="flex items-center gap-2 text-[12.5px] text-white/55 px-2 py-4">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
    </div>
  );
}

function naturalCompare(a: string, b: string): string extends never ? never : number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }) as never;
}
