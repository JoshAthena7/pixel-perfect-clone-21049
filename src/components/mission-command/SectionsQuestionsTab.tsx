import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ChevronRight,
  ChevronDown,
  MoreVertical,
  Plus,
  Search,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SkeletonRows, ErrorState, EmptyState } from "@/components/shared/data-states";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Volume = { id: string; name: string; order_index: number | null };
type Section = {
  id: string;
  volume_id: string | null;
  parent_section_id: string | null;
  section_number: string | null;
  name: string;
  page_limit: number | null;
  evaluation_weight: number | null;
  order_index: number | null;
};
type Question = {
  id: string;
  section_id: string;
  question_number: string;
  question_text: string;
  word_limit: number | null;
  page_limit: number | null;
  evaluation_criteria: string | null;
  due_date: string | null;
  status: string | null;
  health_status: string | null;
  is_withdrawn: boolean | null;
};
type Assignment = {
  id: string;
  question_id: string;
  assigned_writer_id: string | null;
  acceptance_status: string | null;
};
type TeamMember = {
  id: string;
  mission_role: string | null;
  member: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
};

export function SectionsQuestionsTab({
  missionId,
  missionName,
}: {
  missionId: string;
  missionName: string;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterWriter, setFilterWriter] = useState<string>("all");
  const [filterHealth, setFilterHealth] = useState<string>("all");
  const [filterAcceptance, setFilterAcceptance] = useState<string>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["mission-hierarchy", missionId],
    queryFn: async () => {
      const [vols, secs, qs, asgs, team] = await Promise.all([
        supabase.from("mission_volumes").select("*").eq("mission_id", missionId).order("order_index"),
        supabase
          .from("mission_sections")
          .select("*")
          .eq("mission_id", missionId)
          .order("order_index"),
        supabase
          .from("mission_questions")
          .select("*")
          .eq("mission_id", missionId)
          .order("question_number"),
        supabase.from("mission_assignments").select("*").eq("mission_id", missionId),
        supabase
          .from("mission_team_members")
          .select("id, mission_role, member:atlas_team_members(id, first_name, last_name)")
          .eq("mission_id", missionId),
      ]);
      return {
        volumes: (vols.data ?? []) as Volume[],
        sections: (secs.data ?? []) as Section[],
        questions: (qs.data ?? []) as Question[],
        assignments: (asgs.data ?? []) as Assignment[],
        team: (team.data ?? []) as TeamMember[],
      };
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["mission-hierarchy", missionId] });

  const writers = useMemo(
    () => (data?.team ?? []).filter((t) => t.mission_role === "writer" || t.mission_role === "Writer"),
    [data],
  );
  const allMembers = data?.team ?? [];

  const writerName = (id: string | null) => {
    if (!id) return null;
    const m = allMembers.find((t) => t.member?.id === id)?.member;
    if (!m) return null;
    return `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim();
  };

  const filtersActive =
    search || filterWriter !== "all" || filterHealth !== "all" || filterAcceptance !== "all";

  const filteredQuestions = useMemo(() => {
    if (!data) return [];
    const s = search.toLowerCase().trim();
    return data.questions.filter((q) => {
      if (s) {
        const sec = data.sections.find((sec) => sec.id === q.section_id);
        const hay = `${q.question_text} ${q.question_number} ${sec?.name ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (filterHealth !== "all" && q.health_status !== filterHealth) return false;
      const asg = data.assignments.find((a) => a.question_id === q.id);
      if (filterWriter !== "all" && asg?.assigned_writer_id !== filterWriter) return false;
      if (filterAcceptance !== "all" && (asg?.acceptance_status ?? "pending") !== filterAcceptance)
        return false;
      return true;
    });
  }, [data, search, filterWriter, filterHealth, filterAcceptance]);

  if (isError) return <ErrorState message="Couldn't load sections and questions." onRetry={() => refetch()} />;
  if (isLoading || !data) {
    return <SkeletonRows rows={5} height="h-24" />;
  }

  const sectionsByVolume = (volId: string) =>
    data.sections.filter((s) => s.volume_id === volId && !s.parent_section_id);
  const subSections = (parentId: string) =>
    data.sections.filter((s) => s.parent_section_id === parentId);
  const sectionQuestions = (secId: string) =>
    filteredQuestions.filter((q) => q.section_id === secId);

  const sectionHealth = (secId: string) => {
    const qs = data.questions.filter((q) => q.section_id === secId && !q.is_withdrawn);
    if (qs.some((q) => q.health_status === "at_risk")) return "at_risk";
    if (qs.some((q) => q.health_status === "watch")) return "watch";
    if (qs.length > 0) return "healthy";
    return null;
  };

  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));
  const isOpen = (id: string) => expanded[id] !== false; // default open

  const totalShown = filteredQuestions.length;
  const emptyByFilter = filtersActive && totalShown === 0;

  const clearFilters = () => {
    setSearch("");
    setFilterWriter("all");
    setFilterHealth("all");
    setFilterAcceptance("all");
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="rounded-xl border border-border bg-surface/40 p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions and sections"
            className="pl-8 h-9"
          />
        </div>
        <Select value={filterWriter} onValueChange={setFilterWriter}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Writer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All writers</SelectItem>
            {writers.map((w) => (
              <SelectItem key={w.id} value={w.member?.id ?? w.id}>
                {writerName(w.member?.id ?? null) ?? "Unknown"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterHealth} onValueChange={setFilterHealth}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Health" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All health</SelectItem>
            <SelectItem value="healthy">Healthy</SelectItem>
            <SelectItem value="watch">Watch</SelectItem>
            <SelectItem value="at_risk">At Risk</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterAcceptance} onValueChange={setFilterAcceptance}>
          <SelectTrigger className="w-[170px] h-9">
            <SelectValue placeholder="Acceptance" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All acceptance</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="need_help">Need Help</SelectItem>
            <SelectItem value="capacity_concern">Capacity Concern</SelectItem>
          </SelectContent>
        </Select>
        {filtersActive && (
          <button
            onClick={clearFilters}
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            <X className="h-3 w-3" /> Clear filters
          </button>
        )}
      </div>

      {emptyByFilter && (
        <EmptyState
          title="No questions match your filters"
          action={
            <button onClick={clearFilters} className="text-primary hover:underline text-sm">
              Clear filters
            </button>
          }
        />
      )}

      {/* Hierarchy */}
      {data.volumes.length === 0 && (
        <EmptyState
          title="No volumes yet"
          description="Add structure via the Cascade Review to start organizing this mission."
        />
      )}

      {data.volumes.map((vol) => {
        const volSections = sectionsByVolume(vol.id);
        const volQCount = data.questions.filter((q) =>
          data.sections
            .filter((s) => s.volume_id === vol.id)
            .some((s) => s.id === q.section_id),
        ).length;
        const open = isOpen(`v-${vol.id}`);
        return (
          <div key={vol.id} className="rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => toggle(`v-${vol.id}`)}
              className="w-full flex items-center gap-2 bg-background px-4 py-3 text-left hover:bg-surface/60"
            >
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="font-bold text-foreground">{vol.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {volSections.length} sections · {volQCount} questions
              </span>
            </button>
            {open && (
              <div className="bg-surface/30">
                {volSections.map((sec) => (
                  <SectionNode
                    key={sec.id}
                    section={sec}
                    subs={subSections(sec.id)}
                    questions={sectionQuestions(sec.id)}
                    allQuestions={(secId: string) =>
                      filteredQuestions.filter((q) => q.section_id === secId)
                    }
                    subSectionsFor={subSections}
                    isOpen={isOpen}
                    toggle={toggle}
                    sectionHealth={sectionHealth}
                    assignments={data.assignments}
                    writers={writers}
                    allMembers={allMembers}
                    writerName={writerName}
                    missionId={missionId}
                    missionName={missionName}
                    refresh={refresh}
                  />
                ))}
                <div className="px-4 py-3">
                  <AddSectionForm volumeId={vol.id} missionId={missionId} refresh={refresh} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SectionNode(props: {
  section: Section;
  subs: Section[];
  questions: Question[];
  allQuestions: (secId: string) => Question[];
  subSectionsFor: (id: string) => Section[];
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
  sectionHealth: (id: string) => string | null;
  assignments: Assignment[];
  writers: TeamMember[];
  allMembers: TeamMember[];
  writerName: (id: string | null) => string | null;
  missionId: string;
  missionName: string;
  refresh: () => void;
  depth?: number;
}) {
  const {
    section,
    subs,
    questions,
    allQuestions,
    subSectionsFor,
    isOpen,
    toggle,
    sectionHealth,
    refresh,
    missionId,
  } = props;
  const open = isOpen(`s-${section.id}`);
  const health = sectionHealth(section.id);
  const depth = props.depth ?? 0;
  const [editing, setEditing] = useState(false);
  const [addingQ, setAddingQ] = useState(false);

  return (
    <div className="border-t border-border" style={{ paddingLeft: depth * 12 }}>
      <div className="flex items-center gap-2 px-4 py-2.5 bg-surface/50">
        <button onClick={() => toggle(`s-${section.id}`)} className="shrink-0">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {editing ? (
          <SectionEditForm
            section={section}
            onDone={() => {
              setEditing(false);
              refresh();
            }}
          />
        ) : (
          <>
            <span className="font-medium text-foreground">
              {section.section_number ? `${section.section_number} · ` : ""}
              {section.name}
            </span>
            <span className="text-xs text-muted-foreground">
              {section.page_limit ? `${section.page_limit}pp` : ""}
              {section.evaluation_weight ? ` · ${section.evaluation_weight}%` : ""}
              {questions.length > 0 && ` · ${questions.length}q`}
            </span>
            {health && (
              <span
                className={cn(
                  "ml-2 inline-block h-2 w-2 rounded-full",
                  health === "healthy" && "bg-green-400",
                  health === "watch" && "bg-amber-400",
                  health === "at_risk" && "bg-red-400",
                )}
              />
            )}
          </>
        )}
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setAddingQ(true)}>
                <Plus className="h-4 w-4 mr-2" /> Add Question
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEditing(true)}>Edit Section</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {open && (
        <div>
          {subs.map((sub) => (
            <SectionNode
              {...props}
              key={sub.id}
              section={sub}
              subs={subSectionsFor(sub.id)}
              questions={allQuestions(sub.id)}
              depth={depth + 1}
            />
          ))}
          {questions.map((q) => (
            <QuestionRow
              key={q.id}
              question={q}
              assignment={props.assignments.find((a) => a.question_id === q.id)}
              writers={props.writers}
              allMembers={props.allMembers}
              writerName={props.writerName}
              missionId={missionId}
              missionName={props.missionName}
              refresh={refresh}
            />
          ))}
          {addingQ && (
            <div className="px-4 py-3 bg-surface/20 border-t border-border">
              <AddQuestionForm
                missionId={missionId}
                sectionId={section.id}
                onDone={() => {
                  setAddingQ(false);
                  refresh();
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuestionRow({
  question,
  assignment,
  writers,
  allMembers,
  writerName,
  missionId,
  missionName,
  refresh,
}: {
  question: Question;
  assignment?: Assignment;
  writers: TeamMember[];
  allMembers: TeamMember[];
  writerName: (id: string | null) => string | null;
  missionId: string;
  missionName: string;
  refresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const text = question.question_text ?? "";
  const truncated = text.length > 100 && !expanded;
  const shown = truncated ? text.slice(0, 100) + "…" : text;
  const writer = writerName(assignment?.assigned_writer_id ?? null);

  const isWithdrawn = question.is_withdrawn;

  const reassign = async (newWriterId: string) => {
    const oldWriter = assignment?.assigned_writer_id ?? null;
    if (newWriterId === oldWriter) return;
    try {
      if (assignment) {
        const { error } = await supabase
          .from("mission_assignments")
          .update({ assigned_writer_id: newWriterId, acceptance_status: "pending" })
          .eq("id", assignment.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("mission_assignments").insert({
          mission_id: missionId,
          question_id: question.id,
          assigned_writer_id: newWriterId,
          acceptance_status: "pending",
          assigned_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
      // Notifications
      const notifs: any[] = [
        {
          recipient_id: newWriterId,
          recipient_role: "specific_user",
          type: "assignment_acceptance_required",
          message: `You have been assigned ${question.question_number} on ${missionName}. Accept or flag your availability.`,
          metadata: { mission_id: missionId, question_id: question.id },
        },
      ];
      if (oldWriter && oldWriter !== newWriterId) {
        notifs.push({
          recipient_id: oldWriter,
          recipient_role: "specific_user",
          type: "assignment_removed",
          message: `Your assignment ${question.question_number} on ${missionName} has been reassigned.`,
          metadata: { mission_id: missionId, question_id: question.id },
        });
      }
      await supabase.from("atlas_notifications").insert(notifs);
      await supabase.from("mission_audit_log").insert({
        mission_id: missionId,
        action: `Question ${question.question_number} reassigned`,
        metadata: {
          question_id: question.id,
          old_writer: oldWriter,
          new_writer: newWriterId,
        },
      });
      toast.success("Writer reassigned.");
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Reassignment failed");
    }
  };

  const updateDueDate = async (d: Date | undefined) => {
    if (!d) return;
    const { error } = await supabase
      .from("mission_questions")
      .update({ due_date: d.toISOString() })
      .eq("id", question.id);
    if (error) toast.error(error.message);
    else refresh();
  };

  const withdraw = async () => {
    const { error } = await supabase
      .from("mission_questions")
      .update({ is_withdrawn: true, status: "withdrawn" })
      .eq("id", question.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (assignment?.assigned_writer_id) {
      await supabase.from("atlas_notifications").insert({
        recipient_id: assignment.assigned_writer_id,
        recipient_role: "specific_user",
        type: "assignment_removed",
        message: `Question ${question.question_number} on ${missionName} has been withdrawn by the state.`,
        metadata: { mission_id: missionId, question_id: question.id },
      });
    }
    await supabase.from("mission_audit_log").insert({
      mission_id: missionId,
      action: `Question ${question.question_number} withdrawn`,
      metadata: { question_id: question.id },
    });
    toast.success("Question withdrawn.");
    setWithdrawOpen(false);
    refresh();
  };

  return (
    <div
      className={cn(
        "border-t border-border bg-background px-4 py-3 text-sm",
        isWithdrawn && "opacity-50 line-through",
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span className="font-mono text-xs text-primary shrink-0">{question.question_number}</span>
        <div className="min-w-0 flex-1">
          <p className="text-foreground">{shown}</p>
          {text.length > 100 && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-xs text-primary hover:underline mt-1"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Writer */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="text-xs px-2 py-1 rounded bg-surface hover:bg-surface-hover">
                {writer ?? "Unassigned"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {writers.length === 0 && (
                <DropdownMenuItem disabled>No writers on mission</DropdownMenuItem>
              )}
              {writers.map((w) => {
                const id = w.member?.id;
                if (!id) return null;
                return (
                  <DropdownMenuItem key={id} onClick={() => reassign(id)}>
                    {writerName(id) ?? "Unknown"}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Due date */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="text-xs px-2 py-1 rounded bg-surface hover:bg-surface-hover">
                {question.due_date
                  ? format(new Date(question.due_date), "MMM d")
                  : "No due date"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={question.due_date ? new Date(question.due_date) : undefined}
                onSelect={updateDueDate}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          {/* Health */}
          <HealthBadge value={question.health_status} />
          {/* Status */}
          <StatusBadge value={question.status} />
          {/* Acceptance */}
          {assignment && <AcceptanceBadge value={assignment.acceptance_status} />}

          {/* Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground">
                Reassign Writer
              </div>
              {writers.map((w) => {
                const id = w.member?.id;
                if (!id) return null;
                return (
                  <DropdownMenuItem key={id} onClick={() => reassign(id)}>
                    {writerName(id) ?? "Unknown"}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuItem onClick={() => setWithdrawOpen(true)} className="text-red-400">
                Mark as Withdrawn
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AlertDialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark question as withdrawn?</AlertDialogTitle>
            <AlertDialogDescription>
              Marking as withdrawn removes this question from all active assignments and Flight
              Decks. This cannot be undone without admin intervention. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={withdraw}>Withdraw</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function HealthBadge({ value }: { value: string | null }) {
  if (!value) return null;
  const map: Record<string, string> = {
    healthy: "bg-green-500/20 text-green-400",
    watch: "bg-amber-500/20 text-amber-400",
    at_risk: "bg-red-500/20 text-red-400",
  };
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded uppercase", map[value] ?? "bg-muted")}>
      {value.replace("_", " ")}
    </span>
  );
}
function StatusBadge({ value }: { value: string | null }) {
  if (!value) return null;
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-hover text-muted-foreground uppercase">
      {value.replace(/_/g, " ")}
    </span>
  );
}
function AcceptanceBadge({ value }: { value: string | null }) {
  if (!value) return null;
  const map: Record<string, string> = {
    pending: "bg-amber-500/20 text-amber-400",
    accepted: "bg-green-500/20 text-green-400",
    need_help: "bg-blue-500/20 text-blue-400",
    capacity_concern: "bg-red-500/20 text-red-400",
  };
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded uppercase", map[value] ?? "bg-muted")}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

function SectionEditForm({ section, onDone }: { section: Section; onDone: () => void }) {
  const [number, setNumber] = useState(section.section_number ?? "");
  const [name, setName] = useState(section.name);
  const [pageLimit, setPageLimit] = useState(section.page_limit?.toString() ?? "");
  const [weight, setWeight] = useState(section.evaluation_weight?.toString() ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await supabase
        .from("mission_sections")
        .update({
          section_number: number || null,
          name,
          page_limit: pageLimit ? Number(pageLimit) : null,
          evaluation_weight: weight ? Number(weight) : null,
        })
        .eq("id", section.id);
    }, 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [number, name, pageLimit, weight]);

  return (
    <div className="flex flex-wrap items-center gap-2 flex-1">
      <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="#" className="h-7 w-16" />
      <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 flex-1 min-w-[140px]" />
      <Input
        value={pageLimit}
        onChange={(e) => setPageLimit(e.target.value)}
        placeholder="pages"
        type="number"
        className="h-7 w-20"
      />
      <Input
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        placeholder="%"
        type="number"
        className="h-7 w-20"
      />
      <Button size="sm" variant="ghost" onClick={onDone} className="h-7">
        Done
      </Button>
    </div>
  );
}

function AddSectionForm({
  volumeId,
  missionId,
  refresh,
}: {
  volumeId: string;
  missionId: string;
  refresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [pageLimit, setPageLimit] = useState("");
  const [weight, setWeight] = useState("");

  const save = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from("mission_sections").insert({
      mission_id: missionId,
      volume_id: volumeId,
      parent_section_id: null,
      section_number: number || null,
      name,
      page_limit: pageLimit ? Number(pageLimit) : null,
      evaluation_weight: weight ? Number(weight) : null,
    });
    if (error) toast.error(error.message);
    else {
      setName("");
      setNumber("");
      setPageLimit("");
      setWeight("");
      setOpen(false);
      refresh();
    }
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1" /> Add Section
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="#" className="h-8 w-20" />
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Section name" className="h-8 flex-1 min-w-[180px]" />
      <Input
        value={pageLimit}
        onChange={(e) => setPageLimit(e.target.value)}
        placeholder="pages"
        type="number"
        className="h-8 w-20"
      />
      <Input
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        placeholder="weight %"
        type="number"
        className="h-8 w-24"
      />
      <Button size="sm" onClick={save}>
        Save
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}

function AddQuestionForm({
  missionId,
  sectionId,
  onDone,
}: {
  missionId: string;
  sectionId: string;
  onDone: () => void;
}) {
  const [number, setNumber] = useState("");
  const [text, setText] = useState("");
  const [wordLimit, setWordLimit] = useState("");
  const [pageLimit, setPageLimit] = useState("");
  const [criteria, setCriteria] = useState("");
  const [due, setDue] = useState<Date | undefined>();

  const save = async () => {
    if (!number.trim() || !text.trim()) {
      toast.error("Question number and text are required");
      return;
    }
    const { error } = await supabase.from("mission_questions").insert({
      mission_id: missionId,
      section_id: sectionId,
      question_number: number,
      question_text: text,
      word_limit: wordLimit ? Number(wordLimit) : null,
      page_limit: pageLimit ? Number(pageLimit) : null,
      evaluation_criteria: criteria || null,
      due_date: due ? due.toISOString() : null,
      status: "not_started",
      health_status: "healthy",
      is_withdrawn: false,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Question added");
      onDone();
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="Q number"
          className="h-8 w-32"
        />
        <Input
          value={wordLimit}
          onChange={(e) => setWordLimit(e.target.value)}
          placeholder="words"
          type="number"
          className="h-8 w-24"
        />
        <Input
          value={pageLimit}
          onChange={(e) => setPageLimit(e.target.value)}
          placeholder="pages"
          type="number"
          className="h-8 w-24"
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              {due ? format(due, "MMM d") : "Due date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar mode="single" selected={due} onSelect={setDue} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Question text"
        rows={2}
      />
      <Input
        value={criteria}
        onChange={(e) => setCriteria(e.target.value)}
        placeholder="Evaluation criteria (optional)"
        className="h-8"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={save}>
          Save Question
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
