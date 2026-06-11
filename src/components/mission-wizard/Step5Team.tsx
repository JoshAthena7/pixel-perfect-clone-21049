import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Mail, Plus, Search, Send, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { HumanOnlyInfoBar, StepMetaIndicator } from "@/components/InputSourceBadge";

// ---------- types ----------
type AtlasMember = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  job_title: string | null;
  skills: string[] | null;
  atlas_role: string;
  atlas_invite_status: string;
};
type TeamRow = {
  id: string;
  member_id: string;
  mission_role: string | null;
  member: AtlasMember | null;
};
type Section = { id: string; section_number: string | null; name: string };
type Question = {
  id: string;
  section_id: string | null;
  question_number: string | null;
  question_text: string | null;
};
type Assignment = {
  id: string;
  question_id: string;
  assigned_writer_id: string | null;
  due_date: string | null;
};
type SMELink = { assignment_id: string; sme_member_id: string };

export type SubView = "team" | "questions" | "invites";

// ---------- helpers ----------
const fullName = (m: { first_name: string | null; last_name: string | null; email: string } | null) =>
  m ? [m.first_name, m.last_name].filter(Boolean).join(" ").trim() || m.email : "Unknown";
const initials = (m: { first_name: string | null; last_name: string | null; email: string } | null) => {
  if (!m) return "?";
  const a = (m.first_name?.[0] ?? "").toUpperCase();
  const b = (m.last_name?.[0] ?? "").toUpperCase();
  return (a + b) || m.email.slice(0, 2).toUpperCase();
};
const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
const toISO = (d: string) => (d ? new Date(d + "T12:00:00").toISOString() : "");
const toDateInput = (iso: string | null | undefined) =>
  iso ? new Date(iso).toISOString().slice(0, 10) : "";

// ---------- data ----------
async function fetchAll(missionId: string) {
  const [available, team, sections, questions, assignments, smes, phases] = await Promise.all([
    supabase
      .from("atlas_team_members")
      .select("id, first_name, last_name, email, job_title, skills, atlas_role, atlas_invite_status")
      .eq("is_removed", false),
    supabase
      .from("mission_team_members")
      .select(
        "id, member_id, mission_role, member:atlas_team_members!member_id(id, first_name, last_name, email, job_title, skills, atlas_role, atlas_invite_status)",
      )
      .eq("mission_id", missionId),
    supabase
      .from("mission_sections")
      .select("id, section_number, name")
      .eq("mission_id", missionId)
      .order("section_number", { ascending: true }),
    supabase
      .from("mission_questions")
      .select("id, section_id, question_number, question_text")
      .eq("mission_id", missionId),
    supabase
      .from("mission_assignments")
      .select("id, question_id, assigned_writer_id, due_date")
      .eq("mission_id", missionId),
    supabase
      .from("mission_assignment_smes")
      .select("assignment_id, sme_member_id"),
    supabase
      .from("mission_journey_phases")
      .select("id, kind, end_date")
      .eq("mission_id", missionId),
  ]);

  const assignmentIds = new Set((assignments.data ?? []).map((a) => a.id));
  const smeRows = ((smes.data ?? []) as SMELink[]).filter((s) => assignmentIds.has(s.assignment_id));

  const draftEnds = (phases.data ?? [])
    .filter((p) => p.kind === "drafting" && p.end_date)
    .map((p) => new Date(p.end_date as string).getTime())
    .sort((a, b) => a - b);
  const defaultDue = draftEnds[0] ? new Date(draftEnds[0]).toISOString() : null;

  // load member counts for available — count missions where each member is assigned to an active mission
  const memberIds = (available.data ?? []).map((m) => m.id);
  let loadMap: Record<string, number> = {};
  if (memberIds.length > 0) {
    const { data: loadRows } = await supabase
      .from("mission_team_members")
      .select("member_id, missions!mission_team_members_mission_id_fkey(status)")
      .in("member_id", memberIds);
    for (const row of (loadRows ?? []) as Array<{
      member_id: string;
      missions: { status: string } | null;
    }>) {
      if (row.missions?.status === "active") {
        loadMap[row.member_id] = (loadMap[row.member_id] ?? 0) + 1;
      }
    }
  }

  return {
    available: (available.data ?? []) as AtlasMember[],
    team: (team.data ?? []) as unknown as TeamRow[],
    sections: (sections.data ?? []) as Section[],
    questions: (questions.data ?? []) as Question[],
    assignments: (assignments.data ?? []) as Assignment[],
    smes: smeRows,
    defaultDue,
    loadMap,
  };
}

// ---------- main ----------
export function Step5Team({
  missionId,
  view,
  setView,
  onAdvanceToBlastOff,
}: {
  missionId: string;
  view: SubView;
  setView: (v: SubView) => void;
  onAdvanceToBlastOff: () => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["mission-team", missionId],
    queryFn: () => fetchAll(missionId),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["mission-team", missionId] });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const onTeamIds = new Set(data.team.map((t) => t.member_id));
  const availableFiltered = data.available.filter((m) => !onTeamIds.has(m.id));

  if (view === "team") {
    return (
      <TeamAssign
        missionId={missionId}
        available={availableFiltered}
        team={data.team}
        loadMap={data.loadMap}
        onChange={refresh}
        onAdvance={() => setView("questions")}
      />
    );
  }
  if (view === "questions") {
    return (
      <QuestionAssign
        missionId={missionId}
        team={data.team}
        sections={data.sections}
        questions={data.questions}
        assignments={data.assignments}
        smes={data.smes}
        defaultDue={data.defaultDue}
        onBack={() => setView("team")}
        onAdvance={() => setView("invites")}
        onChange={refresh}
      />
    );
  }
  return (
    <InviteReview
      team={data.team}
      onBack={() => setView("questions")}
      onAdvance={onAdvanceToBlastOff}
      onChange={refresh}
    />
  );
}

// ---------- Team Assignment ----------
function TeamAssign({
  missionId,
  available,
  team,
  loadMap,
  onChange,
  onAdvance,
}: {
  missionId: string;
  available: AtlasMember[];
  team: TeamRow[];
  loadMap: Record<string, number>;
  onChange: () => void;
  onAdvance: () => void;
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filteredAvailable = useMemo(() => {
    return available.filter((m) => {
      if (roleFilter !== "all" && m.atlas_role !== roleFilter) return false;
      if (!debounced) return true;
      const hay = [
        fullName(m),
        m.job_title ?? "",
        (m.skills ?? []).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(debounced);
    });
  }, [available, roleFilter, debounced]);

  const hasLead = team.some((t) => t.mission_role === "engagement_lead");

  const addMember = async (member: AtlasMember) => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("mission_team_members").insert({
      mission_id: missionId,
      member_id: member.id,
      mission_role: "writer",
      added_by: u.user?.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    onChange();
  };

  const removeMember = async (row: TeamRow) => {
    const { error } = await supabase.from("mission_team_members").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    onChange();
  };

  const updateRole = async (row: TeamRow, role: string) => {
    const { error } = await supabase
      .from("mission_team_members")
      .update({ mission_role: role })
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    onChange();
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-4xl font-semibold text-[var(--athena-navy)] tracking-tight">
          Build your mission team.
        </h1>
        <p className="mt-2 text-muted-foreground">
          Assign the people who will execute this mission. At least one Engagement Lead is required.
        </p>
        <div className="mt-2">
          <StepMetaIndicator irisCount={0} youCount={0} allYou />
        </div>
      </header>

      <HumanOnlyInfoBar>
        This step is all you — IRIS cannot assign your team. Take your time.
      </HumanOnlyInfoBar>


      <div className="grid md:grid-cols-2 gap-6">
        {/* Left: Available */}
        <section className="rounded-lg border bg-card flex flex-col min-h-[400px]">
          <header className="p-4 border-b">
            <p className="text-[10px] uppercase tracking-wider text-[var(--athena-gold)] font-semibold">
              Athena Collective
            </p>
            <p className="text-xs text-muted-foreground">
              {available.length} active members available
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-7 h-8 text-sm"
                  placeholder="Search name, title, skills"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                className="h-8 text-sm border rounded px-2 bg-background"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="all">All ATLAS roles</option>
                <option value="engagement_lead">Engagement Lead</option>
                <option value="writer">Writer</option>
                <option value="sme">SME</option>
                <option value="reviewer">Reviewer</option>
              </select>
            </div>
          </header>
          <div className="p-3 space-y-2 flex-1 overflow-y-auto max-h-[600px]">
            {filteredAvailable.length === 0 && (
              <p className="text-sm text-muted-foreground p-4 text-center">
                {available.length === 0
                  ? "No active members available."
                  : "No members match your filters."}
              </p>
            )}
            {filteredAvailable.map((m) => (
              <MemberCard
                key={m.id}
                member={m}
                load={loadMap[m.id] ?? 0}
                rightSlot={
                  <Button size="sm" variant="outline" onClick={() => addMember(m)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add to Mission
                  </Button>
                }
              />
            ))}
          </div>
        </section>

        {/* Right: Mission Team */}
        <section className="rounded-lg border bg-card flex flex-col min-h-[400px]">
          <header className="p-4 border-b">
            <p className="text-[10px] uppercase tracking-wider text-[var(--athena-gold)] font-semibold">
              Mission Team
            </p>
            <p className="text-xs text-muted-foreground">{team.length} members assigned</p>
            {!hasLead && team.length > 0 && (
              <p className="mt-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                At least one Engagement Lead is required before continuing.
              </p>
            )}
          </header>
          <div className="p-3 space-y-2 flex-1 overflow-y-auto max-h-[600px]">
            {team.length === 0 && (
              <div className="text-center py-12 text-sm text-muted-foreground">
                <ArrowLeft className="mx-auto h-6 w-6 text-[var(--athena-gold)] mb-2" />
                No team members assigned yet.
                <br />
                Add from the collective on the left.
              </div>
            )}
            {team.map((row) => (
              <MemberCard
                key={row.id}
                member={row.member}
                load={null}
                roleField={
                  <select
                    className={cn(
                      "h-8 text-sm border rounded px-2 bg-background w-full",
                      !row.mission_role && "border-amber-500 ring-2 ring-amber-300/40",
                    )}
                    value={row.mission_role ?? ""}
                    onChange={(e) => updateRole(row, e.target.value)}
                  >
                    <option value="">Choose role…</option>
                    <option value="engagement_lead">Engagement Lead</option>
                    <option value="writer">Writer</option>
                    <option value="sme">SME</option>
                    <option value="reviewer">Reviewer</option>
                  </select>
                }
                rightSlot={
                  <button
                    type="button"
                    onClick={() => removeMember(row)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove"
                  >
                    <X className="h-4 w-4" />
                  </button>
                }
              />
            ))}
          </div>
        </section>
      </div>

      <div className="flex justify-end pt-4 border-t">
        <Button
          onClick={onAdvance}
          disabled={!hasLead}
          className={cn(
            "bg-[var(--athena-gold)] text-[var(--athena-navy)] hover:bg-[var(--athena-gold-light)] font-semibold",
            !hasLead && "opacity-40",
          )}
          title={!hasLead ? "Assign an Engagement Lead first" : undefined}
        >
          Assign Questions <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function MemberCard({
  member,
  load,
  roleField,
  rightSlot,
}: {
  member: AtlasMember | null;
  load: number | null;
  roleField?: React.ReactNode;
  rightSlot?: React.ReactNode;
}) {
  if (!member) return null;
  const skills = (member.skills ?? []).filter(Boolean);
  return (
    <div className="rounded border bg-background p-3 flex gap-3 items-start">
      <div className="h-10 w-10 rounded-full bg-[var(--athena-navy)] text-[var(--athena-gold)] flex items-center justify-center text-xs font-bold shrink-0">
        {initials(member)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">{fullName(member)}</p>
        {member.job_title && (
          <p className="text-xs text-muted-foreground truncate">{member.job_title}</p>
        )}
        {load !== null && (
          <p className="text-[10px] text-muted-foreground mt-0.5">{load} active missions</p>
        )}
        {roleField && <div className="mt-2">{roleField}</div>}
        {skills.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {skills.slice(0, 3).map((s) => (
              <span
                key={s}
                className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
              >
                {s}
              </span>
            ))}
            {skills.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{skills.length - 3} more</span>
            )}
          </div>
        )}
      </div>
      <div className="shrink-0">{rightSlot}</div>
    </div>
  );
}

// ---------- Question Assignment ----------
function QuestionAssign({
  missionId,
  team,
  sections,
  questions,
  assignments,
  smes,
  defaultDue,
  onBack,
  onAdvance,
  onChange,
}: {
  missionId: string;
  team: TeamRow[];
  sections: Section[];
  questions: Question[];
  assignments: Assignment[];
  smes: SMELink[];
  defaultDue: string | null;
  onBack: () => void;
  onAdvance: () => void;
  onChange: () => void;
}) {
  const writers = team.filter(
    (t) => t.mission_role === "writer" || t.mission_role === "engagement_lead",
  );
  const smeMembers = team.filter((t) => t.mission_role === "sme");

  const [sectionFilter, setSectionFilter] = useState("all");
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(false);
  const [bulkWriter, setBulkWriter] = useState("");
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const assignmentByQ: Record<string, Assignment> = useMemo(
    () => Object.fromEntries(assignments.map((a) => [a.question_id, a])),
    [assignments],
  );
  const smesByAssignment: Record<string, string[]> = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const s of smes) {
      if (!map[s.assignment_id]) map[s.assignment_id] = [];
      map[s.assignment_id].push(s.sme_member_id);
    }
    return map;
  }, [smes]);

  const assignedCount = questions.filter(
    (q) => assignmentByQ[q.id]?.assigned_writer_id,
  ).length;
  const allAssigned = questions.length > 0 && assignedCount === questions.length;
  const noQuestions = questions.length === 0;

  const upsertAssignment = async (
    questionId: string,
    patch: Partial<{ assigned_writer_id: string | null; due_date: string | null }>,
  ) => {
    const existing = assignmentByQ[questionId];
    const { data: u } = await supabase.auth.getUser();
    if (existing) {
      const { error } = await supabase
        .from("mission_assignments")
        .update({ ...patch })
        .eq("id", existing.id);
      if (error) toast.error(error.message);
    } else {
      const { error } = await supabase.from("mission_assignments").insert({
        mission_id: missionId,
        question_id: questionId,
        assigned_writer_id: patch.assigned_writer_id ?? null,
        due_date: patch.due_date ?? defaultDue,
        assigned_by: u.user?.id,
      });
      if (error) toast.error(error.message);
    }
    onChange();
  };

  const setSMEs = async (questionId: string, selectedIds: string[]) => {
    const existing = assignmentByQ[questionId];
    if (!existing) {
      toast.error("Assign a writer before adding SMEs.");
      return;
    }
    await supabase.from("mission_assignment_smes").delete().eq("assignment_id", existing.id);
    if (selectedIds.length > 0) {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("mission_assignment_smes").insert(
        selectedIds.map((sme_member_id) => ({
          assignment_id: existing.id,
          sme_member_id,
          added_by: u.user?.id,
        })),
      );
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    onChange();
  };

  const assignAllUnassigned = async () => {
    if (!bulkWriter) return;
    const unassigned = questions.filter((q) => !assignmentByQ[q.id]?.assigned_writer_id);
    const { data: u } = await supabase.auth.getUser();
    // Update existing rows
    const updates = unassigned
      .map((q) => assignmentByQ[q.id])
      .filter((a) => !!a);
    if (updates.length > 0) {
      await Promise.all(
        updates.map((a) =>
          supabase
            .from("mission_assignments")
            .update({ assigned_writer_id: bulkWriter })
            .eq("id", a.id),
        ),
      );
    }
    // Insert new for those without
    const inserts = unassigned
      .filter((q) => !assignmentByQ[q.id])
      .map((q) => ({
        mission_id: missionId,
        question_id: q.id,
        assigned_writer_id: bulkWriter,
        due_date: defaultDue,
        assigned_by: u.user?.id,
      }));
    if (inserts.length > 0) {
      const { error } = await supabase.from("mission_assignments").insert(inserts);
      if (error) toast.error(error.message);
    }
    toast.success(`Assigned ${unassigned.length} questions`);
    setConfirmBulk(false);
    setBulkWriter("");
    onChange();
  };

  const renderSection = (sec: Section | null) => {
    const secQuestions = questions.filter((q) =>
      sec ? q.section_id === sec.id : !q.section_id,
    );
    if (secQuestions.length === 0) return null;
    if (sectionFilter !== "all" && sec && sec.id !== sectionFilter) return null;
    if (sectionFilter !== "all" && !sec) return null;
    const filtered = showOnlyUnassigned
      ? secQuestions.filter((q) => !assignmentByQ[q.id]?.assigned_writer_id)
      : secQuestions;
    if (filtered.length === 0) return null;
    const sectionAssigned = secQuestions.filter(
      (q) => assignmentByQ[q.id]?.assigned_writer_id,
    ).length;
    // sort: unassigned first
    const sorted = [...filtered].sort((a, b) => {
      const aDone = !!assignmentByQ[a.id]?.assigned_writer_id;
      const bDone = !!assignmentByQ[b.id]?.assigned_writer_id;
      if (aDone === bDone) return 0;
      return aDone ? 1 : -1;
    });
    return (
      <div key={sec?.id ?? "unsec"} className="border rounded-lg overflow-hidden">
        <div className="bg-[var(--athena-navy)]/5 px-4 py-2 border-b flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm text-[var(--athena-navy)]">
              {sec ? `${sec.section_number ?? ""} ${sec.name}`.trim() : "Unsectioned"}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {sectionAssigned} of {secQuestions.length} assigned
            </p>
          </div>
        </div>
        <div className="divide-y">
          {sorted.map((q) => (
            <QuestionRow
              key={q.id}
              question={q}
              assignment={assignmentByQ[q.id]}
              smesSelected={
                assignmentByQ[q.id] ? smesByAssignment[assignmentByQ[q.id].id] ?? [] : []
              }
              writers={writers}
              smeMembers={smeMembers}
              defaultDue={defaultDue}
              expanded={expanded[q.id] ?? false}
              onToggleExpand={() => setExpanded((p) => ({ ...p, [q.id]: !p[q.id] }))}
              onWriter={(id) => upsertAssignment(q.id, { assigned_writer_id: id || null })}
              onDue={(d) => upsertAssignment(q.id, { due_date: d ? toISO(d) : null })}
              onSMEs={(ids) => setSMEs(q.id, ids)}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-4xl font-semibold text-[var(--athena-navy)] tracking-tight">
          Assign every question.
        </h1>
        <p className="mt-2 text-muted-foreground">
          Every question needs a writer before BLAST OFF.
        </p>
        <p className="mt-1 text-sm">
          <span className="font-semibold text-[var(--athena-navy)]">{assignedCount}</span>{" "}
          <span className="text-muted-foreground">of {questions.length} questions assigned</span>
        </p>
      </header>

      {noQuestions ? (
        <div className="rounded-lg border-2 border-dashed p-8 text-center bg-card">
          <p className="text-sm text-muted-foreground">
            No questions were extracted for this mission. You can add questions in the Sections
            review step, or continue to BLAST OFF and add them later.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <select
                className="h-9 text-sm border rounded px-2 bg-background"
                value={sectionFilter}
                onChange={(e) => setSectionFilter(e.target.value)}
              >
                <option value="all">All sections</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {[s.section_number, s.name].filter(Boolean).join(" ")}
                  </option>
                ))}
              </select>
              <label className="text-xs flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showOnlyUnassigned}
                  onChange={(e) => setShowOnlyUnassigned(e.target.checked)}
                />
                Show only unassigned
              </label>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="h-9 text-sm border rounded px-2 bg-background"
                value={bulkWriter}
                onChange={(e) => setBulkWriter(e.target.value)}
              >
                <option value="">Assign all unassigned to…</option>
                {writers.map((w) => (
                  <option key={w.member_id} value={w.member_id}>
                    {fullName(w.member)}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                disabled={!bulkWriter}
                onClick={() => setConfirmBulk(true)}
              >
                Go
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {sections.map((sec) => renderSection(sec))}
            {renderSection(null)}
          </div>
        </>
      )}

      <div className="flex items-center justify-between pt-4 border-t">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button
          onClick={onAdvance}
          disabled={!allAssigned && !noQuestions}
          className={cn(
            "bg-[var(--athena-gold)] text-[var(--athena-navy)] hover:bg-[var(--athena-gold-light)] font-semibold",
            !allAssigned && !noQuestions && "opacity-40",
          )}
        >
          Review Invites <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      <AlertDialog open={confirmBulk} onOpenChange={setConfirmBulk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk assign?</AlertDialogTitle>
            <AlertDialogDescription>
              Assign all{" "}
              {questions.filter((q) => !assignmentByQ[q.id]?.assigned_writer_id).length}{" "}
              unassigned questions to{" "}
              {fullName(writers.find((w) => w.member_id === bulkWriter)?.member ?? null)}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={assignAllUnassigned}>Assign</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function QuestionRow({
  question,
  assignment,
  smesSelected,
  writers,
  smeMembers,
  defaultDue,
  expanded,
  onToggleExpand,
  onWriter,
  onDue,
  onSMEs,
}: {
  question: Question;
  assignment: Assignment | undefined;
  smesSelected: string[];
  writers: TeamRow[];
  smeMembers: TeamRow[];
  defaultDue: string | null;
  expanded: boolean;
  onToggleExpand: () => void;
  onWriter: (id: string) => void;
  onDue: (d: string) => void;
  onSMEs: (ids: string[]) => void;
}) {
  const writerId = assignment?.assigned_writer_id ?? "";
  const due = toDateInput(assignment?.due_date ?? defaultDue ?? undefined);
  const text = question.question_text ?? "";
  const truncated = text.length > 120 && !expanded ? text.slice(0, 120) + "…" : text;

  return (
    <div className="p-3 grid md:grid-cols-12 gap-3 items-start">
      <div className="md:col-span-5">
        <p className="text-xs text-[var(--athena-gold)] font-semibold">
          {question.question_number ?? "Q"}
        </p>
        <p className="text-sm">{truncated}</p>
        {text.length > 120 && (
          <button
            onClick={onToggleExpand}
            className="text-xs text-[var(--athena-navy)] underline mt-0.5"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>
      <div className="md:col-span-3">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Writer
        </label>
        <select
          className={cn(
            "h-9 w-full text-sm border rounded px-2 bg-background",
            !writerId && "border-red-400 text-red-600",
          )}
          value={writerId}
          onChange={(e) => onWriter(e.target.value)}
        >
          <option value="">Unassigned</option>
          {writers.map((w) => (
            <option key={w.member_id} value={w.member_id}>
              {fullName(w.member)}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-2">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          SMEs
        </label>
        <select
          multiple
          className="h-9 w-full text-xs border rounded px-1 bg-background"
          value={smesSelected}
          onChange={(e) =>
            onSMEs(Array.from(e.target.selectedOptions).map((o) => o.value))
          }
          disabled={!assignment}
        >
          {smeMembers.length === 0 && <option disabled>No SMEs on team</option>}
          {smeMembers.map((m) => (
            <option key={m.member_id} value={m.member_id}>
              {fullName(m.member)}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-2">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Due
        </label>
        <Input
          type="date"
          className="h-9"
          value={due}
          onChange={(e) => onDue(e.target.value)}
        />
      </div>
    </div>
  );
}

// ---------- Invite Review ----------
function InviteReview({
  team,
  onBack,
  onAdvance,
  onChange,
}: {
  team: TeamRow[];
  onBack: () => void;
  onAdvance: () => void;
  onChange: () => void;
}) {
  const sendInvite = async (memberId: string) => {
    const { error } = await supabase
      .from("atlas_team_members")
      .update({
        atlas_invite_status: "invited",
        atlas_invite_sent_at: new Date().toISOString(),
      })
      .eq("id", memberId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Invite sent");
    onChange();
  };
  const sendAll = async () => {
    const notInvited = team.filter(
      (t) => t.member?.atlas_invite_status === "not_invited",
    );
    await Promise.all(notInvited.map((t) => sendInvite(t.member_id)));
  };

  const counts = team.reduce(
    (acc, t) => {
      const s = t.member?.atlas_invite_status;
      if (s === "active") acc.ready++;
      else if (s === "invited") acc.pending++;
      else acc.notInvited++;
      return acc;
    },
    { ready: 0, pending: 0, notInvited: 0 },
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-4xl font-semibold text-[var(--athena-navy)] tracking-tight">
          Your team is almost ready.
        </h1>
        <p className="mt-2 text-muted-foreground">
          Make sure your team can access ATLAS when the mission launches.
        </p>
      </header>

      <div className="flex justify-end">
        {counts.notInvited > 0 && (
          <Button onClick={sendAll} variant="outline">
            <Send className="h-4 w-4 mr-1" /> Send invites to {counts.notInvited} members
          </Button>
        )}
      </div>

      <div className="rounded-lg border bg-card divide-y">
        {team.map((row) => {
          const status = row.member?.atlas_invite_status ?? "not_invited";
          return (
            <div key={row.id} className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-[var(--athena-navy)] text-[var(--athena-gold)] flex items-center justify-center text-xs font-bold">
                {initials(row.member)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{fullName(row.member)}</p>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {(row.mission_role ?? "no role").replaceAll("_", " ")}
                </span>
              </div>
              <StatusBadge status={status} />
              {status === "active" ? null : status === "invited" ? (
                <Button size="sm" variant="outline" onClick={() => sendInvite(row.member_id)}>
                  <Mail className="h-3.5 w-3.5 mr-1" /> Resend
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => sendInvite(row.member_id)}>
                  <UserPlus className="h-3.5 w-3.5 mr-1" /> Send Invite
                </Button>
              )}
            </div>
          );
        })}
        {team.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground text-center">No team members.</p>
        )}
      </div>

      <p className="text-xs text-muted-foreground bg-muted/40 rounded p-3">
        Team members do not need to accept their invite before you BLAST OFF. They will receive
        their assignments and mission access the moment the mission launches.
      </p>

      <div className="flex gap-6 text-sm">
        <span className="text-green-600 font-semibold">{counts.ready} ready</span>
        <span className="text-amber-600 font-semibold">{counts.pending} pending</span>
        <span className="text-red-600 font-semibold">{counts.notInvited} not invited</span>
      </div>

      <div className="flex items-center justify-between pt-4 border-t">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button
          onClick={onAdvance}
          className="bg-[var(--athena-gold)] text-[var(--athena-navy)] hover:bg-[var(--athena-gold-light)] font-semibold"
        >
          Review Launch Checklist <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: "Active", cls: "bg-green-100 text-green-700 border-green-300" },
    invited: { label: "Invite Sent", cls: "bg-amber-100 text-amber-700 border-amber-300" },
    not_invited: { label: "Not Invited", cls: "bg-red-100 text-red-700 border-red-300" },
  };
  const m = map[status] ?? map.not_invited;
  return (
    <span className={cn("text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border", m.cls)}>
      {m.label}
    </span>
  );
}
