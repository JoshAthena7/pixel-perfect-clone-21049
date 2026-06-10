import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateSectionIntelligence, type SectionIntel } from "@/lib/iris-section-intel.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

type Volume = { id: string; name: string | null; order_index: number | null };
type Section = {
  id: string;
  volume_id: string | null;
  parent_section_id: string | null;
  section_number: string | null;
  name: string | null;
  page_limit: number | null;
  evaluation_weight: number | null;
  description: string | null;
  iris_confidence: string | null;
  reviewed_by_admin: boolean;
  order_index: number | null;
};
type Question = {
  id: string;
  section_id: string | null;
  question_number: string | null;
  question_text: string | null;
  word_limit: number | null;
  page_limit: number | null;
  evaluation_criteria: string | null;
  iris_confidence: string | null;
  reviewed_by_admin: boolean;
  due_date: string | null;
};
type MissionDoc = {
  id: string;
  file_name: string | null;
  document_type: string | null;
  section_tags: string[] | null;
};

const BUCKET = "atlas-rfp-documents";

function ConfidenceBadge({ c }: { c: string | null | undefined }) {
  const conf = (c ?? "low").toLowerCase();
  if (conf === "high")
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
        High Confidence
      </span>
    );
  if (conf === "medium")
    return (
      <span className="inline-flex items-center rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
        Review Needed
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
      IRIS Suggestion
    </span>
  );
}

// Tiny per-key debounced writer
function useDebouncedSaver() {
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(
    () => () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
    },
    [],
  );
  return (key: string, fn: () => Promise<void> | void, ms = 500) => {
    const prev = timers.current.get(key);
    if (prev) clearTimeout(prev);
    const t = setTimeout(async () => {
      try {
        await fn();
      } catch (e) {
        console.error("save failed", key, e);
        toast.error("Save failed. Retrying on next change.");
      }
    }, ms);
    timers.current.set(key, t);
  };
}

async function fetchAll(missionId: string) {
  const [volumes, sections, questions, docs, mission] = await Promise.all([
    supabase.from("mission_volumes").select("id,name,order_index").eq("mission_id", missionId).order("order_index"),
    supabase
      .from("mission_sections")
      .select(
        "id,volume_id,parent_section_id,section_number,name,page_limit,evaluation_weight,description,iris_confidence,reviewed_by_admin,order_index",
      )
      .eq("mission_id", missionId)
      .order("order_index"),
    supabase
      .from("mission_questions")
      .select(
        "id,section_id,question_number,question_text,word_limit,page_limit,evaluation_criteria,iris_confidence,reviewed_by_admin,due_date",
      )
      .eq("mission_id", missionId)
      .order("question_number"),
    supabase
      .from("mission_documents")
      .select("id,file_name,document_type,section_tags")
      .eq("mission_id", missionId),
    supabase.from("missions").select("submission_deadline").eq("id", missionId).single(),
  ]);
  return {
    volumes: (volumes.data ?? []) as Volume[],
    sections: (sections.data ?? []) as Section[],
    questions: (questions.data ?? []) as Question[],
    docs: (docs.data ?? []) as MissionDoc[],
    submission_deadline: (mission.data?.submission_deadline as string | null) ?? null,
  };
}

type NodeStatus = "gray" | "amber" | "green";

function computeSectionStatus(
  section: Section,
  sectionQuestions: Question[],
  childSections: Section[],
  allChildren: Map<string, Section[]>,
  allQuestions: Map<string, Question[]>,
): NodeStatus {
  // green if section.reviewed and every question.reviewed and every child green
  const sectionFieldsReviewed = section.reviewed_by_admin;
  const allQReviewed = sectionQuestions.every((q) => q.reviewed_by_admin);
  const childStatuses = childSections.map((c) =>
    computeSectionStatus(c, allQuestions.get(c.id) ?? [], allChildren.get(c.id) ?? [], allChildren, allQuestions),
  );
  const allChildGreen = childStatuses.every((s) => s === "green");
  if (sectionFieldsReviewed && allQReviewed && allChildGreen) return "green";
  const anyTouched =
    sectionFieldsReviewed ||
    sectionQuestions.some((q) => q.reviewed_by_admin) ||
    childStatuses.some((s) => s !== "gray");
  return anyTouched ? "amber" : "gray";
}

export function Step2Cascade({ missionId }: { missionId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const save = useDebouncedSaver();
  const genIntel = useServerFn(generateSectionIntelligence);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["cascade", missionId],
    queryFn: () => fetchAll(missionId),
  });

  // Local edit buffers so typing is fluid; reset whenever server data changes.
  const [secBuf, setSecBuf] = useState<Record<string, Partial<Section>>>({});
  const [qBuf, setQBuf] = useState<Record<string, Partial<Question>>>({});
  useEffect(() => {
    setSecBuf({});
    setQBuf({});
  }, [data?.sections.length, data?.questions.length]);

  const [selectedSecId, setSelectedSecId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [intelCache, setIntelCache] = useState<Record<string, SectionIntel | "loading" | "error">>({});
  const [showSkipDialog, setShowSkipDialog] = useState(false);

  // Section indexes
  const { childMap, qMap, topSections, currentSection, orderedSections } = useMemo(() => {
    const sections = data?.sections ?? [];
    const questions = data?.questions ?? [];
    const childMap = new Map<string, Section[]>();
    const qMap = new Map<string, Question[]>();
    const topSections = sections.filter((s) => s.parent_section_id == null);
    for (const s of sections) {
      if (s.parent_section_id) {
        const arr = childMap.get(s.parent_section_id) ?? [];
        arr.push(s);
        childMap.set(s.parent_section_id, arr);
      }
    }
    for (const q of questions) {
      if (!q.section_id) continue;
      const arr = qMap.get(q.section_id) ?? [];
      arr.push(q);
      qMap.set(q.section_id, arr);
    }
    // Flatten in tree order for prev/next nav
    const ordered: Section[] = [];
    const walk = (s: Section) => {
      ordered.push(s);
      (childMap.get(s.id) ?? []).forEach(walk);
    };
    topSections.forEach(walk);
    const cur = selectedSecId
      ? sections.find((s) => s.id === selectedSecId) ?? ordered[0] ?? null
      : ordered[0] ?? null;
    return { childMap, qMap, topSections, currentSection: cur, orderedSections: ordered };
  }, [data, selectedSecId]);

  // Default-select first section & expand its parents/volume
  useEffect(() => {
    if (!selectedSecId && orderedSections[0]) setSelectedSecId(orderedSections[0].id);
  }, [orderedSections, selectedSecId]);

  // Generate IRIS intel for the selected section (once)
  useEffect(() => {
    if (!currentSection) return;
    const id = currentSection.id;
    if (intelCache[id]) return;
    setIntelCache((c) => ({ ...c, [id]: "loading" }));
    genIntel({ data: { mission_id: missionId, section_id: id } })
      .then((res) => setIntelCache((c) => ({ ...c, [id]: res })))
      .catch(() => setIntelCache((c) => ({ ...c, [id]: "error" })));
  }, [currentSection, genIntel, intelCache, missionId]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="space-y-3">
        <p className="text-destructive">Failed to load cascade.</p>
        <Button variant="outline" onClick={() => refetch()}>Try again</Button>
      </div>
    );
  }

  // Empty state
  if (data.sections.length === 0) {
    return <EmptyCascade missionId={missionId} onCreated={() => refetch()} />;
  }

  // Compute statuses
  const statuses = new Map<string, NodeStatus>();
  for (const s of data.sections) {
    statuses.set(
      s.id,
      computeSectionStatus(s, qMap.get(s.id) ?? [], childMap.get(s.id) ?? [], childMap, qMap),
    );
  }
  const topGreen = topSections.filter((s) => statuses.get(s.id) === "green").length;
  const pctReviewed = topSections.length ? Math.round((topGreen / topSections.length) * 100) : 0;
  const allGreen = topSections.length > 0 && topSections.every((s) => statuses.get(s.id) === "green");

  // High-confidence counts for "Confirm All Green" button
  const highSecFields = data.sections.filter(
    (s) => (s.iris_confidence ?? "").toLowerCase() === "high" && !s.reviewed_by_admin,
  ).length;
  const highQFields = data.questions.filter(
    (q) => (q.iris_confidence ?? "").toLowerCase() === "high" && !q.reviewed_by_admin,
  ).length;
  const totalHighReady = highSecFields + highQFields;

  // ----- Save helpers -----
  const updateSection = (id: string, patch: Partial<Section>) => {
    setSecBuf((b) => ({ ...b, [id]: { ...b[id], ...patch } }));
    save(`sec:${id}`, async () => {
      await supabase.from("mission_sections").update(patch).eq("id", id);
      qc.invalidateQueries({ queryKey: ["cascade", missionId] });
    });
  };
  const updateQuestion = (id: string, patch: Partial<Question>) => {
    setQBuf((b) => ({ ...b, [id]: { ...b[id], ...patch } }));
    save(`q:${id}`, async () => {
      await supabase.from("mission_questions").update(patch).eq("id", id);
      qc.invalidateQueries({ queryKey: ["cascade", missionId] });
    });
  };

  const confirmQuestion = async (id: string) => {
    await supabase.from("mission_questions").update({ reviewed_by_admin: true }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["cascade", missionId] });
  };
  const confirmSectionHighFields = async (sec: Section) => {
    if ((sec.iris_confidence ?? "").toLowerCase() === "high") {
      await supabase.from("mission_sections").update({ reviewed_by_admin: true }).eq("id", sec.id);
    }
    const qIds = (qMap.get(sec.id) ?? [])
      .filter((q) => (q.iris_confidence ?? "").toLowerCase() === "high")
      .map((q) => q.id);
    if (qIds.length)
      await supabase.from("mission_questions").update({ reviewed_by_admin: true }).in("id", qIds);
    toast.success("Confirmed high-confidence fields.");
    qc.invalidateQueries({ queryKey: ["cascade", missionId] });
  };
  const confirmAllHigh = async () => {
    const secIds = data.sections
      .filter((s) => (s.iris_confidence ?? "").toLowerCase() === "high")
      .map((s) => s.id);
    const qIds = data.questions
      .filter((q) => (q.iris_confidence ?? "").toLowerCase() === "high")
      .map((q) => q.id);
    if (secIds.length)
      await supabase.from("mission_sections").update({ reviewed_by_admin: true }).in("id", secIds);
    if (qIds.length)
      await supabase.from("mission_questions").update({ reviewed_by_admin: true }).in("id", qIds);
    toast.success(`Confirmed ${secIds.length + qIds.length} high-confidence fields.`);
    qc.invalidateQueries({ queryKey: ["cascade", missionId] });
  };

  const skipAll = async () => {
    const secIds = data.sections.map((s) => s.id);
    const qIds = data.questions.map((q) => q.id);
    if (secIds.length)
      await supabase.from("mission_sections").update({ reviewed_by_admin: true }).in("id", secIds);
    if (qIds.length)
      await supabase.from("mission_questions").update({ reviewed_by_admin: true }).in("id", qIds);
    toast.message("Review skipped.");
    navigate({ to: "/olympus/missions/$missionId/wizard", params: { missionId }, search: { step: 5 } });
  };

  // ----- Get visible buffer-merged section/question -----
  const liveSec = (s: Section) => ({ ...s, ...(secBuf[s.id] ?? {}) });
  const liveQ = (q: Question) => ({ ...q, ...(qBuf[q.id] ?? {}) });

  const idx = orderedSections.findIndex((s) => s.id === currentSection?.id);
  const prevSec = idx > 0 ? orderedSections[idx - 1] : null;
  const nextSec = idx >= 0 && idx < orderedSections.length - 1 ? orderedSections[idx + 1] : null;

  return (
    <div className="min-h-[calc(100vh-160px)] flex flex-col lg:flex-row gap-4 -mx-4 lg:mx-0">
      {/* LEFT — Navigator */}
      <aside className="lg:w-[280px] shrink-0 rounded-xl border border-border bg-[var(--athena-navy-dark)]/60 p-4 lg:max-h-[calc(100vh-160px)] overflow-y-auto">
        <div className="text-[11px] uppercase tracking-wider text-[var(--athena-gold)] font-medium mb-2">
          Mission Structure
        </div>
        <div className="text-xs text-muted-foreground mb-3">{pctReviewed}% reviewed</div>
        {allGreen && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-200">
            <CheckCircle2 className="h-4 w-4" /> All sections reviewed
          </div>
        )}

        <ol className="space-y-1 text-sm">
          {data.volumes.length === 0 && (
            <NavGroup label="(Ungrouped)">
              {topSections.map((s) =>
                renderSectionNode({ s, depth: 0, statuses, childMap, expanded, setExpanded, selectedSecId, setSelectedSecId }),
              )}
            </NavGroup>
          )}
          {data.volumes.map((v) => {
            const vSecs = topSections.filter((s) => s.volume_id === v.id);
            if (!vSecs.length) return null;
            const open = expanded[`v:${v.id}`] ?? true;
            return (
              <li key={v.id}>
                <button
                  onClick={() => setExpanded((e) => ({ ...e, [`v:${v.id}`]: !open }))}
                  className="w-full flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                >
                  {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <span className="truncate">{v.name ?? "Volume"}</span>
                </button>
                {open && (
                  <ul className="mt-1 space-y-1">
                    {vSecs.map((s) =>
                      renderSectionNode({
                        s,
                        depth: 0,
                        statuses,
                        childMap,
                        expanded,
                        setExpanded,
                        selectedSecId,
                        setSelectedSecId,
                      }),
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>

        <Button
          onClick={confirmAllHigh}
          disabled={totalHighReady === 0}
          className="w-full mt-4 bg-[var(--athena-gold)] text-[var(--athena-navy-dark)] hover:bg-[var(--athena-gold-light)] disabled:opacity-50"
          size="sm"
        >
          Confirm All Green Fields
        </Button>
        <p className="text-[11px] text-muted-foreground mt-1 text-center">
          {totalHighReady} high confidence fields ready to confirm.
        </p>
      </aside>

      {/* MAIN */}
      <section className="flex-1 min-w-0 space-y-4 lg:max-h-[calc(100vh-160px)] overflow-y-auto pr-1">
        {allGreen && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-emerald-100">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm">All sections reviewed. Ready to build your strategy.</span>
            </div>
            <Button
              onClick={() =>
                navigate({
                  to: "/olympus/missions/$missionId/wizard",
                  params: { missionId },
                  search: { step: 5 },
                })
              }
              className="bg-[var(--athena-gold)] text-[var(--athena-navy-dark)] hover:bg-[var(--athena-gold-light)]"
            >
              Build Win Strategy →
            </Button>
          </div>
        )}

        {currentSection && (
          <SectionEditor
            key={currentSection.id}
            section={liveSec(currentSection)}
            questions={(qMap.get(currentSection.id) ?? []).map(liveQ)}
            children={(childMap.get(currentSection.id) ?? []).map((c) => ({
              section: liveSec(c),
              questions: (qMap.get(c.id) ?? []).map(liveQ),
            }))}
            submissionDeadline={data.submission_deadline}
            onSection={updateSection}
            onQuestion={updateQuestion}
            onConfirmQuestion={confirmQuestion}
            onConfirmSectionHigh={confirmSectionHighFields}
          />
        )}

        <div className="flex items-center justify-between pt-3 border-t border-border">
          <Button
            variant="outline"
            disabled={!prevSec}
            onClick={() => prevSec && setSelectedSecId(prevSec.id)}
          >
            ← Previous Section
          </Button>
          <span className="text-xs text-muted-foreground">
            Section {idx + 1} of {orderedSections.length}
          </span>
          <Button
            variant="outline"
            disabled={!nextSec}
            onClick={() => nextSec && setSelectedSecId(nextSec.id)}
          >
            Next Section →
          </Button>
        </div>

        {!allGreen && (
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => setShowSkipDialog(true)}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Skip Review and Continue →
            </button>
          </div>
        )}
      </section>

      {/* RIGHT — IRIS Intel */}
      <aside className="lg:w-[320px] shrink-0 rounded-xl border-l-2 border-[var(--athena-gold)] bg-[var(--athena-navy-light)]/40 p-4 lg:max-h-[calc(100vh-160px)] overflow-y-auto">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-[var(--athena-gold)] animate-pulse" />
          <span className="text-[11px] uppercase tracking-wider text-[var(--athena-gold)] font-medium">
            IRIS Intelligence
          </span>
        </div>
        {currentSection && (
          <IntelPanel
            sectionId={currentSection.id}
            sectionName={`${currentSection.section_number ?? ""} ${currentSection.name ?? ""}`.trim()}
            state={intelCache[currentSection.id]}
            missionId={missionId}
            docs={data.docs.filter((d) => (d.section_tags ?? []).includes(currentSection.id))}
            onDocsChanged={() => qc.invalidateQueries({ queryKey: ["cascade", missionId] })}
          />
        )}
      </aside>

      <AlertDialog open={showSkipDialog} onOpenChange={setShowSkipDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skip the cascade review?</AlertDialogTitle>
            <AlertDialogDescription>
              Skipping the review means some fields may have errors or missing data. Your writers will see whatever
              IRIS extracted without your review. Skip anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Reviewing</AlertDialogCancel>
            <AlertDialogAction onClick={skipAll}>Skip Anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <ul className="space-y-1">{children}</ul>
    </li>
  );
}

function renderSectionNode(args: {
  s: Section;
  depth: number;
  statuses: Map<string, NodeStatus>;
  childMap: Map<string, Section[]>;
  expanded: Record<string, boolean>;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  selectedSecId: string | null;
  setSelectedSecId: (id: string) => void;
}): React.ReactNode {
  const { s, depth, statuses, childMap, expanded, setExpanded, selectedSecId, setSelectedSecId } = args;
  const status = statuses.get(s.id) ?? "gray";
  const children = childMap.get(s.id) ?? [];
  const open = expanded[`s:${s.id}`] ?? true;
  const selected = selectedSecId === s.id;
  const dotClass =
    status === "green"
      ? "bg-emerald-500"
      : status === "amber"
      ? "bg-amber-500"
      : "bg-muted-foreground/40";
  return (
    <li key={s.id}>
      <div
        className={cn(
          "flex items-center gap-1.5 rounded px-2 py-1.5 cursor-pointer hover:bg-[var(--athena-navy-light)]/40",
          selected && "border-l-2 border-[var(--athena-gold)] bg-[var(--athena-navy-light)]/40",
        )}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => setSelectedSecId(s.id)}
      >
        {children.length > 0 ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((ex) => ({ ...ex, [`s:${s.id}`]: !open }));
            }}
            className="text-muted-foreground"
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span className="w-3" />
        )}
        <span className="flex-1 truncate text-xs">
          <span className="text-[var(--athena-gold)] mr-1">{s.section_number ?? ""}</span>
          {s.name ?? "Untitled"}
        </span>
        <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", dotClass)} />
      </div>
      {open && children.length > 0 && (
        <ul className="space-y-1">
          {children.map((c) =>
            renderSectionNode({ ...args, s: c, depth: depth + 1 }),
          )}
        </ul>
      )}
    </li>
  );
}

function SectionEditor({
  section,
  questions,
  children,
  submissionDeadline,
  onSection,
  onQuestion,
  onConfirmQuestion,
  onConfirmSectionHigh,
}: {
  section: Section;
  questions: Question[];
  children: { section: Section; questions: Question[] }[];
  submissionDeadline: string | null;
  onSection: (id: string, patch: Partial<Section>) => void;
  onQuestion: (id: string, patch: Partial<Question>) => void;
  onConfirmQuestion: (id: string) => void;
  onConfirmSectionHigh: (s: Section) => void;
}) {
  return (
    <div className="space-y-5">
      <SectionHeader
        section={section}
        onSection={onSection}
        onConfirmHigh={() => onConfirmSectionHigh(section)}
      />

      {questions.length === 0 && children.length === 0 && (
        <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          No questions were extracted for this section. You can add questions manually or mark this section as
          reviewed.
        </div>
      )}

      {questions.map((q) => (
        <QuestionCard
          key={q.id}
          q={q}
          submissionDeadline={submissionDeadline}
          onChange={(patch) => onQuestion(q.id, patch)}
          onConfirm={() => onConfirmQuestion(q.id)}
        />
      ))}

      {children.map((ch) => (
        <div key={ch.section.id} className="space-y-3">
          <SectionHeader
            section={ch.section}
            onSection={onSection}
            onConfirmHigh={() => onConfirmSectionHigh(ch.section)}
            smaller
          />
          {ch.questions.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No questions extracted.</p>
          ) : (
            ch.questions.map((q) => (
              <QuestionCard
                key={q.id}
                q={q}
                submissionDeadline={submissionDeadline}
                onChange={(patch) => onQuestion(q.id, patch)}
                onConfirm={() => onConfirmQuestion(q.id)}
              />
            ))
          )}
        </div>
      ))}
    </div>
  );
}

function SectionHeader({
  section,
  onSection,
  onConfirmHigh,
  smaller,
}: {
  section: Section;
  onSection: (id: string, patch: Partial<Section>) => void;
  onConfirmHigh: () => void;
  smaller?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          <input
            value={section.section_number ?? ""}
            onChange={(e) => onSection(section.id, { section_number: e.target.value })}
            placeholder="#"
            className={cn(
              "bg-transparent border-b border-transparent focus:border-[var(--athena-gold)] outline-none text-[var(--athena-gold)] font-semibold w-20",
              smaller ? "text-base" : "text-xl",
            )}
          />
          <input
            value={section.name ?? ""}
            onChange={(e) => onSection(section.id, { name: e.target.value })}
            placeholder="Section name"
            className={cn(
              "flex-1 bg-transparent border-b border-transparent focus:border-[var(--athena-gold)] outline-none font-semibold",
              smaller ? "text-base" : "text-xl",
            )}
          />
        </div>
        <button
          onClick={onConfirmHigh}
          className="text-xs text-[var(--athena-gold)] hover:underline shrink-0"
          type="button"
        >
          Confirm all high confidence fields in this section
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FieldRow label="Page Limit" confidence={section.iris_confidence}>
          <Input
            type="number"
            value={section.page_limit ?? ""}
            onChange={(e) =>
              onSection(section.id, {
                page_limit: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </FieldRow>
        <FieldRow label="Evaluation Weight (%)" confidence={section.iris_confidence}>
          <Input
            type="number"
            value={section.evaluation_weight ?? ""}
            onChange={(e) =>
              onSection(section.id, {
                evaluation_weight: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </FieldRow>
        <FieldRow label="Description" confidence={section.iris_confidence} fullWidth>
          <Textarea
            rows={3}
            value={section.description ?? ""}
            onChange={(e) => onSection(section.id, { description: e.target.value })}
          />
        </FieldRow>
      </div>

      {section.reviewed_by_admin && (
        <div className="text-xs text-emerald-400 inline-flex items-center gap-1">
          <Check className="h-3 w-3" /> Section confirmed
        </div>
      )}
    </div>
  );
}

function FieldRow({
  label,
  confidence,
  fullWidth,
  children,
}: {
  label: string;
  confidence: string | null;
  fullWidth?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", fullWidth && "sm:col-span-2")}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <ConfidenceBadge c={confidence} />
      </div>
      {children}
    </div>
  );
}

function QuestionCard({
  q,
  submissionDeadline,
  onChange,
  onConfirm,
}: {
  q: Question;
  submissionDeadline: string | null;
  onChange: (patch: Partial<Question>) => void;
  onConfirm: () => void;
}) {
  const dueDateValue = useMemo(() => {
    if (q.due_date) return q.due_date.slice(0, 10);
    if (submissionDeadline) {
      const d = new Date(submissionDeadline);
      d.setDate(d.getDate() - 14);
      return d.toISOString().slice(0, 10);
    }
    return "";
  }, [q.due_date, submissionDeadline]);

  // Persist the auto-calculated due date on first render so it survives refresh
  useEffect(() => {
    if (!q.due_date && dueDateValue) onChange({ due_date: dueDateValue });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={cn(
        "rounded-lg border shadow-sm p-4 space-y-3 transition-colors",
        q.reviewed_by_admin
          ? "bg-emerald-500/5 border-emerald-500/30"
          : "bg-card border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-semibold text-[var(--athena-gold)]">
          Question {q.question_number ?? ""}
        </span>
      </div>

      <Textarea
        rows={3}
        value={q.question_text ?? ""}
        onChange={(e) => onChange({ question_text: e.target.value })}
        placeholder="Question text"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FieldRow label="Word Limit" confidence={q.iris_confidence}>
          <Input
            type="number"
            value={q.word_limit ?? ""}
            onChange={(e) =>
              onChange({ word_limit: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
        </FieldRow>
        <FieldRow label="Page Limit" confidence={q.iris_confidence}>
          <Input
            type="number"
            value={q.page_limit ?? ""}
            onChange={(e) =>
              onChange({ page_limit: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
        </FieldRow>
        <FieldRow label="Evaluation Criteria" confidence={q.iris_confidence} fullWidth>
          <Textarea
            rows={2}
            value={q.evaluation_criteria ?? ""}
            onChange={(e) => onChange({ evaluation_criteria: e.target.value })}
          />
        </FieldRow>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Due Date</label>
          <Input
            type="date"
            value={dueDateValue}
            onChange={(e) => onChange({ due_date: e.target.value || null })}
          />
          <p className="text-[11px] text-muted-foreground">Auto-calculated from submission deadline</p>
        </div>
      </div>

      <div className="flex justify-end">
        {q.reviewed_by_admin ? (
          <span className="inline-flex items-center gap-1 text-sm text-emerald-400 font-medium">
            <CheckCircle2 className="h-4 w-4" /> Confirmed
          </span>
        ) : (
          <Button size="sm" onClick={onConfirm} variant="outline">
            Confirm
          </Button>
        )}
      </div>
    </div>
  );
}

function IntelPanel({
  sectionId,
  sectionName,
  state,
  missionId,
  docs,
  onDocsChanged,
}: {
  sectionId: string;
  sectionName: string;
  state: SectionIntel | "loading" | "error" | undefined;
  missionId: string;
  docs: MissionDoc[];
  onDocsChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);

  const onUpload = async (file: File) => {
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? "anon";
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${missionId}/sections/${sectionId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;
      const { error: dErr } = await supabase.from("mission_documents").insert({
        mission_id: missionId,
        file_name: file.name,
        file_url: path,
        document_type: "research",
        section_tags: [sectionId],
        uploaded_by: userId,
      });
      if (dErr) throw dErr;
      toast.success("Document added to this section's intelligence.");
      onDocsChanged();
    } catch (e) {
      console.error(e);
      toast.error("Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const removeDoc = async (doc: MissionDoc) => {
    await supabase.from("mission_documents").delete().eq("id", doc.id);
    onDocsChanged();
  };

  return (
    <div className="space-y-4 text-sm">
      <div className="text-xs text-muted-foreground">{sectionName}</div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground/80 mb-1">
          What This Section Is Really Asking
        </h4>
        {state === "loading" || state === undefined ? (
          <SkeletonText lines={3} />
        ) : state === "error" ? (
          <p className="text-xs text-amber-300">IRIS could not generate insight for this section.</p>
        ) : (
          <p className="text-sm text-foreground/90">{state.summary}</p>
        )}
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground/80 mb-1">Key Requirements</h4>
        {state === "loading" || state === undefined ? (
          <SkeletonText lines={3} />
        ) : state === "error" ? null : (
          <ul className="list-disc list-inside text-sm space-y-1 text-foreground/85">
            {state.requirements.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground/80 mb-1 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> Risks to Watch
        </h4>
        {state === "loading" || state === undefined ? (
          <SkeletonText lines={2} />
        ) : state === "error" ? null : (
          <ul className="space-y-1 text-sm text-foreground/85">
            {state.risks.map((r, i) => (
              <li key={i} className="flex gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" /> <span>{r}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="pt-2 border-t border-border space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          Upload additional intelligence for this section
        </label>
        <label className="block border-2 border-dashed border-border rounded-lg p-3 text-center cursor-pointer hover:border-[var(--athena-gold)] transition-colors">
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
              e.currentTarget.value = "";
            }}
          />
          <Upload className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
          <span className="text-xs text-muted-foreground">
            {uploading ? "Uploading…" : "Drop or click to add PDF / Word"}
          </span>
        </label>
        {docs.length > 0 && (
          <ul className="space-y-1">
            {docs.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between text-xs rounded border border-border bg-muted/30 px-2 py-1"
              >
                <span className="truncate">{d.file_name ?? "Document"}</span>
                <button
                  type="button"
                  onClick={() => removeDoc(d)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SkeletonText({ lines }: { lines: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3 w-full" />
      ))}
    </div>
  );
}

function EmptyCascade({ missionId, onCreated }: { missionId: string; onCreated: () => void }) {
  const [form, setForm] = useState({ section_number: "", name: "", page_limit: "", evaluation_weight: "" });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Section name is required.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("mission_sections").insert({
        mission_id: missionId,
        section_number: form.section_number || null,
        name: form.name,
        page_limit: form.page_limit ? Number(form.page_limit) : null,
        evaluation_weight: form.evaluation_weight ? Number(form.evaluation_weight) : null,
        iris_confidence: "low",
      });
      if (error) throw error;
      toast.success("Section added.");
      setForm({ section_number: "", name: "", page_limit: "", evaluation_weight: "" });
      onCreated();
    } catch (e) {
      console.error(e);
      toast.error("Failed to add section.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-5 py-8">
      <div>
        <h2 className="text-2xl font-semibold">No sections yet</h2>
        <p className="text-sm text-muted-foreground">
          IRIS did not extract a structure from your documents. Add your first section to begin.
        </p>
      </div>
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="grid grid-cols-3 gap-3">
          <Input
            placeholder="Number"
            value={form.section_number}
            onChange={(e) => setForm((f) => ({ ...f, section_number: e.target.value }))}
          />
          <Input
            className="col-span-2"
            placeholder="Section name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            type="number"
            placeholder="Page limit"
            value={form.page_limit}
            onChange={(e) => setForm((f) => ({ ...f, page_limit: e.target.value }))}
          />
          <Input
            type="number"
            placeholder="Eval weight %"
            value={form.evaluation_weight}
            onChange={(e) => setForm((f) => ({ ...f, evaluation_weight: e.target.value }))}
          />
        </div>
        <Button
          onClick={submit}
          disabled={saving}
          className="bg-[var(--athena-gold)] text-[var(--athena-navy-dark)] hover:bg-[var(--athena-gold-light)]"
        >
          {saving ? "Adding…" : "Add Section"}
        </Button>
      </div>
    </div>
  );
}
