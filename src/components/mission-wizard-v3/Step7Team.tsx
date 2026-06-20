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
import { ArrowLeft, ArrowRight, Loader2, Sparkles, Users, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { runIrisRfpExtraction } from "@/lib/run-iris-rfp.browser";
import { WizardStepHeading } from "./WizardShellV3";

const MISSION_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "engagement_lead", label: "Engagement Lead" },
  { value: "project_manager", label: "Project Manager" },
  { value: "lead_writer", label: "Lead Writer" },
  { value: "writer", label: "Writer" },
  { value: "lead_graphics", label: "Lead Graphics" },
  { value: "graphics", label: "Graphics" },
  { value: "sme", label: "SME" },
  { value: "reviewer", label: "Reviewer" },
];

type RosterMember = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  skills: string[] | null;
  email: string | null;
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

type AssignmentRow = {
  id: string;
  question_id: string;
  assigned_writer_id: string | null;
  due_date: string | null;
  acceptance_status: string | null;
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
      // Master Athena roster — anyone not removed can be assigned to a mission,
      // regardless of whether they've accepted their Atlas login invite yet.
      const { data, error } = await supabase
        .from("atlas_team_members")
        .select("id, first_name, last_name, job_title, skills")
        .eq("is_removed", false)
        .order("first_name", { ascending: true });
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
        Step 7 of 9 — Team &amp; Assignments
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
        {(() => {
          const role = row.member?.job_title ?? row.member?.skills?.[0];
          return role
            ? <p className="text-[11.5px] text-white/45 truncate">{role}</p>
            : <p className="text-[9px] italic text-white/35 truncate">No role assigned</p>;
        })()}
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
  const [extracting, setExtracting] = useState(false);

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
    queryFn: async (): Promise<AssignmentRow[]> => {
      const { data, error } = await supabase
        .from("mission_assignments")
        .select("id, question_id, assigned_writer_id, due_date, acceptance_status")
        .eq("mission_id", missionId);
      if (error) throw error;
      return (data ?? []) as AssignmentRow[];
    },
  });

  const { data: team = [] } = useQuery({
    queryKey: teamKey,
    queryFn: async (): Promise<MissionTeamRow[]> => {
      const { data, error } = await supabase
        .from("mission_team_members")
        .select(
          "id, member_id, mission_role, member:atlas_team_members!mission_team_members_member_id_fkey(id, first_name, last_name, job_title, skills, email)",
        )
        .eq("mission_id", missionId)
        .in("mission_role", ["writer", "lead_writer", "engagement_lead", "project_manager"]);
      if (error) throw error;
      return (data ?? []) as unknown as MissionTeamRow[];
    },
  });

  // Resolve atlas_team_members -> auth.users id for legacy question_progress rows.
  const teamEmails = useMemo(
    () =>
      Array.from(
        new Set(
          team
            .map((t) => t.member?.email?.toLowerCase())
            .filter((e): e is string => !!e),
        ),
      ),
    [team],
  );
  const { data: profilesByEmail } = useQuery({
    queryKey: ["wizard-assign-profiles-by-email", teamEmails.slice().sort().join("|")],
    enabled: teamEmails.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email")
        .in("email", teamEmails);
      if (error) throw error;
      const m = new Map<string, string>();
      (data ?? []).forEach((p: any) => {
        if (p.email) m.set(String(p.email).toLowerCase(), p.id as string);
      });
      return m;
    },
  });

  const authIdByMemberId = useMemo(() => {
    const m = new Map<string, string>();
    if (!profilesByEmail) return m;
    team.forEach((t) => {
      const email = t.member?.email?.toLowerCase();
      const authId = email ? profilesByEmail.get(email) : undefined;
      if (authId) m.set(t.member_id, authId);
    });
    return m;
  }, [team, profilesByEmail]);

  const sectionById = useMemo(() => {
    const m = new Map<string, SectionLite>();
    sections.forEach((s) => m.set(s.id, s));
    return m;
  }, [sections]);

  const progressByQuestion = useMemo(() => {
    const m = new Map<string, AssignmentRow>();
    progress.forEach((p) => m.set(p.question_id, p));
    return m;
  }, [progress]);

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
      if (filterMode === "assigned" && !p?.assigned_writer_id) return false;
      if (filterMode === "unassigned" && p?.assigned_writer_id) return false;
      if (filterWriter && p?.assigned_writer_id !== filterWriter) return false;
      return true;
    });
  }, [sortedQuestions, progressByQuestion, filterMode, filterWriter]);

  const assignedCount = sortedQuestions.filter((q) => !!progressByQuestion.get(q.id)?.assigned_writer_id).length;
  const totalCount = questions.length;
  const allAssigned = totalCount > 0 && assignedCount >= totalCount;
  const pct = totalCount > 0 ? Math.round((assignedCount / totalCount) * 100) : 0;

  // Idempotent assign: wipe any existing lead_writer rows for the question
  // into both systems: mission_assignments powers Flight Deck; question_progress
  // powers legacy writer cockpit/readiness checks.
  async function assignWriter(questionId: string, memberId: string) {
    const authId = memberId ? authIdByMemberId.get(memberId) : null;
    const now = new Date().toISOString();

    const { error: assignmentError } = memberId
      ? await supabase.from("mission_assignments").upsert(
          {
            mission_id: missionId,
            question_id: questionId,
            assigned_writer_id: memberId,
            acceptance_status: "pending",
            acceptance_responded_at: null,
            writer_confidence: "not_set",
            assigned_at: now,
          },
          { onConflict: "mission_id,question_id" },
        )
      : await supabase.from("mission_assignments").delete().eq("mission_id", missionId).eq("question_id", questionId);
    if (assignmentError) {
      toast.error(`Could not assign: ${assignmentError.message}`);
      return;
    }

    const { error: delErr } = await supabase
      .from("question_progress")
      .delete()
      .eq("mission_id", missionId)
      .eq("question_id", questionId)
      .eq("role", "lead_writer");
    if (delErr) {
      toast.error(`Could not update writer progress: ${delErr.message}`);
      return;
    }

    if (authId) {
      const { error: progressError } = await supabase.from("question_progress").insert({
        mission_id: missionId,
        question_id: questionId,
        assignee_id: authId,
        role: "lead_writer",
        status: "not_started",
        acceptance_status: "pending",
        assigned_at: now,
      });
      if (progressError) {
        toast.error(`Could not update writer progress: ${progressError.message}`);
        return;
      }
    }
    await qc.refetchQueries({ queryKey: progressKey });
  }

  async function bulkAssignAllUnassigned() {
    if (!bulkWriter) return;
    const unassigned = sortedQuestions.filter((q) => !progressByQuestion.get(q.id)?.assigned_writer_id);
    if (unassigned.length === 0) {
      toast.info("No unassigned questions.");
      return;
    }
    const authId = authIdByMemberId.get(bulkWriter);
    const now = new Date().toISOString();
    const BATCH = 10;
    const total = unassigned.length;
    let done = 0;
    let failed = 0;

    const progressToast = toast.loading(`Assigning… 0 of ${total}`);

    for (let i = 0; i < unassigned.length; i += BATCH) {
      const batch = unassigned.slice(i, i + BATCH);
      const ids = batch.map((q) => q.id);

      const { error: assignmentError } = await supabase.from("mission_assignments").upsert(
        batch.map((q) => ({
          mission_id: missionId,
          question_id: q.id,
          assigned_writer_id: bulkWriter,
          acceptance_status: "pending",
          acceptance_responded_at: null,
          writer_confidence: "not_set",
          assigned_at: now,
        })),
        { onConflict: "mission_id,question_id" },
      );
      if (assignmentError) {
        failed += batch.length;
        console.error("[bulk-assign] mission_assignments batch failed", assignmentError);
      } else {
        // Mirror to question_progress (best-effort; non-blocking).
        const { error: delErr } = await supabase
          .from("question_progress")
          .delete()
          .eq("mission_id", missionId)
          .eq("role", "lead_writer")
          .in("question_id", ids);
        if (delErr) console.warn("[bulk-assign] question_progress delete failed", delErr);
        if (authId) {
          const { error: insErr } = await supabase.from("question_progress").insert(
            batch.map((q) => ({
              mission_id: missionId,
              question_id: q.id,
              assignee_id: authId,
              role: "lead_writer",
              status: "not_started",
              acceptance_status: "pending",
              assigned_at: now,
            })),
          );
          if (insErr) console.warn("[bulk-assign] question_progress insert failed", insErr);
        }
        done += batch.length;
      }

      toast.loading(`Assigning… ${done + failed} of ${total}`, { id: progressToast });
      // Refresh UI between batches so the counter ticks up live.
      await qc.refetchQueries({ queryKey: progressKey });
    }

    if (failed === 0) {
      toast.success(`Assigned ${done} question${done === 1 ? "" : "s"}.`, { id: progressToast });
    } else {
      toast.error(`Assigned ${done} of ${total}. ${failed} failed — check console.`, { id: progressToast });
    }
    setBulkWriter("");
    await qc.refetchQueries({ queryKey: progressKey });
  }

  async function clearAllAssignments() {
    const { error } = await supabase
      .from("mission_assignments")
      .delete()
      .eq("mission_id", missionId);
    if (error) {
      toast.error(`Clear failed: ${error.message}`);
      return;
    }
    toast.success("Cleared all assignments.");
    setConfirmClear(false);
    await supabase.from("question_progress").delete().eq("mission_id", missionId).eq("role", "lead_writer");
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
        Step 7 of 9 — Team &amp; Assignments
      </p>
      <WizardStepHeading
        title="Step 4B — Assign Questions"
        subtitle="Assign every question to a lead writer. Every question must have an owner before launch."
      />

      {totalCount === 0 && (
        <div
          className="mb-5 rounded-lg p-4 flex items-center justify-between gap-4"
          style={{ background: "#C9972B", color: "#0B4F8A" }}
        >
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 mt-0.5 shrink-0" />
            <div>
              <p className="text-[14px] font-semibold">No questions extracted from your RFP yet</p>
              <p className="text-[12.5px] opacity-80 mt-0.5">
                IRIS hasn't read the uploaded documents for this mission. Run extraction now to
                pull every numbered question out of the RFP so you can assign writers.
              </p>
            </div>
          </div>
          <button
            disabled={extracting}
            onClick={async () => {
              setExtracting(true);
              const t = toast.loading("IRIS is reading your RFP documents…");
              try {
                await runIrisRfpExtraction(missionId);
                toast.success("Questions extracted.", { id: t });
                await qc.invalidateQueries({ queryKey: questionsKey });
                await qc.invalidateQueries({ queryKey: sectionsKey });
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                toast.error(`Extraction failed: ${msg}`, { id: t });
              } finally {
                setExtracting(false);
              }
            }}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-semibold border-2 disabled:opacity-60"
            style={{ background: "#0B4F8A", color: "#C9972B", borderColor: "#0B4F8A" }}
          >
            {extracting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Extracting…
              </>
            ) : (
              <>⚡ Extract Questions from RFP</>
            )}
          </button>
        </div>
      )}

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
            {team.map((t) => {
              const authId = authIdByMemberId.get(t.member_id);
              return (
                <option
                  key={t.member_id}
                  value={t.member_id}
                  className="bg-[#0D1B3E]"
                >
                  {fullName(t.member)}{!authId ? " (no login)" : ""}
                </option>
              );
            })}
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
            {team.map((t) => {
              const authId = authIdByMemberId.get(t.member_id);
              if (!authId) return null;
              return (
                <option key={t.member_id} value={t.member_id} className="bg-[#0D1B3E]">
                  {fullName(t.member)}
                </option>
              );
            })}
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
                        value={p?.assigned_writer_id ?? ""}
                        onChange={(e) => assignWriter(q.id, e.target.value)}
                        className={`w-full bg-white/5 border rounded-md px-2 py-1.5 text-[12px] focus:outline-none focus:border-amber-400/60 ${
                          !p?.assigned_writer_id ? "border-red-500/40 text-red-300" : "border-white/15 text-white"
                        }`}
                      >
                        <option value="" className="bg-[#0D1B3E]">— Unassigned —</option>
                        {team.map((t) => {
                          const authId = authIdByMemberId.get(t.member_id);
                          return (
                            <option
                              key={t.member_id}
                              value={t.member_id}
                              className="bg-[#0D1B3E]"
                            >
                              {fullName(t.member)}{!authId ? " (no login)" : ""}
                            </option>
                          );
                        })}
                      </select>
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
function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (_m, c) => c.toUpperCase());
}

function fullName(m: { first_name?: string | null; last_name?: string | null } | null | undefined): string {
  if (!m) return "Unknown";
  const f = (m.first_name ?? "").trim();
  const l = (m.last_name ?? "").trim();
  const combined = `${f} ${l}`.trim();
  return combined ? titleCase(combined) : "Unknown";
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

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
