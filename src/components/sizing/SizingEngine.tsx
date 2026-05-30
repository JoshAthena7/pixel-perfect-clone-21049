import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, Sparkles, AlertTriangle, Users, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  extractSizingData,
  saveSizingAssumptions,
  assignQuestionToWriter,
  capacityFor,
  type SizingData,
  type SizingAssumptions,
  type SizingSection,
} from "@/lib/ai/sizing.functions";
import { ServicesChecklist } from "./ServicesChecklist";

type Props = { engagementId: string };

type Member = { id: string; display_name: string; role: string };
type RfpQuestion = {
  id: string;
  body: string;
  question_number: string | null;
  evaluation_weight_pct: number | null;
  page_limit: number | null;
  assigned_to: string | null;
};

const DEFAULT_ASSUMPTIONS: SizingAssumptions = {
  baseline: "moderate",
  turnaround_override_active: false,
  complexity: "standard",
};

function weightTone(pct: number | null | undefined): string {
  if (pct == null) return "text-muted-foreground";
  if (pct > 10) return "text-red-500 font-bold";
  if (pct >= 5) return "text-amber-500 font-semibold";
  return "text-muted-foreground";
}

function loadTone(used: number, capacity: number): string {
  const pct = capacity > 0 ? (used / capacity) * 100 : 0;
  if (pct > 95) return "bg-red-500";
  if (pct >= 80) return "bg-amber-500";
  return "bg-emerald-500";
}

export function SizingEngine({ engagementId }: Props) {
  const extractFn = useServerFn(extractSizingData);
  const saveAssumptionsFn = useServerFn(saveSizingAssumptions);
  const assignFn = useServerFn(assignQuestionToWriter);

  const [sizingData, setSizingData] = useState<SizingData | null>(null);
  const [assumptions, setAssumptions] = useState<SizingAssumptions>(DEFAULT_ASSUMPTIONS);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [questions, setQuestions] = useState<RfpQuestion[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [extracting, setExtracting] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [{ data: cfg }, { data: mem }, { data: qs }] = await Promise.all([
      supabase
        .from("engagement_config")
        .select("sizing_data, sizing_assumptions, submission_days_remaining")
        .eq("engagement_id", engagementId)
        .maybeSingle(),
      supabase
        .from("engagement_members")
        .select("id, display_name, role")
        .eq("engagement_id", engagementId)
        .order("display_name"),
      supabase
        .from("rfp_questions")
        .select("id, body, question_number, evaluation_weight_pct, page_limit, assigned_to")
        .eq("engagement_id", engagementId),
    ]);
    setSizingData((cfg?.sizing_data as SizingData) ?? null);
    setAssumptions((cfg?.sizing_assumptions as SizingAssumptions) ?? DEFAULT_ASSUMPTIONS);
    setDaysRemaining(cfg?.submission_days_remaining ?? null);
    setMembers((mem as Member[]) ?? []);
    setQuestions((qs as RfpQuestion[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [engagementId]);

  // Auto-trigger extraction once if no sizing data yet
  useEffect(() => {
    if (!loading && !sizingData && !extracting) {
      runExtract();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  async function runExtract() {
    setExtracting(true);
    try {
      const res = await extractFn({ data: { engagementId } });
      if (!(res as any).ok) {
        toast.error((res as any).message ?? "Could not extract sizing data.");
      } else {
        toast.success("Sizing data extracted from RFP.");
        await load();
      }
    } catch (e: any) {
      toast.error(e.message ?? "Extraction failed.");
    } finally {
      setExtracting(false);
    }
  }

  async function updateAssumptions(next: SizingAssumptions) {
    setAssumptions(next);
    try {
      await saveAssumptionsFn({ data: { engagementId, assumptions: next } });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save assumptions.");
    }
  }

  async function assign(questionId: string, memberId: string | null) {
    setQuestions((prev) => prev.map((q) => (q.id === questionId ? { ...q, assigned_to: memberId } : q)));
    try {
      await assignFn({ data: { questionId, memberId } });
    } catch (e: any) {
      toast.error(e.message ?? "Assignment failed.");
      load();
    }
  }

  const writerCapacity = useMemo(() => capacityFor(assumptions, daysRemaining), [assumptions, daysRemaining]);
  const turnaroundCapped = daysRemaining !== null && daysRemaining < 90;

  const totals = useMemo(() => {
    const sections = sizingData?.sections ?? [];
    const totalPages =
      sizingData?.total_page_limit ??
      sections.reduce((sum, s) => sum + (s.page_limit ?? 0), 0);
    const totalQuestions = sizingData?.total_questions ?? sections.reduce((s, sec) => s + (sec.questions?.length ?? 0), 0);
    const writersNeeded = writerCapacity > 0 ? Math.ceil(totalPages / writerCapacity) : 0;
    const hasHighWeight = sections.some((s) => (s.evaluation_weight_pct ?? 0) > 30);
    const recommendedTeamSize = writersNeeded + (hasHighWeight ? 1 : 0);
    return { totalPages, totalQuestions, writersNeeded, recommendedTeamSize, sectionCount: sections.length };
  }, [sizingData, writerCapacity]);

  const sortedSections = useMemo(() => {
    const arr = [...(sizingData?.sections ?? [])];
    arr.sort((a, b) => (b.evaluation_weight_pct ?? 0) - (a.evaluation_weight_pct ?? 0));
    return arr;
  }, [sizingData]);

  // Writer load: total pages assigned per member (sum of page_limit for assigned rfp_questions)
  const writerLoad = useMemo(() => {
    const byWriter: Record<string, { pages: number; questions: RfpQuestion[] }> = {};
    let unassignedPages = 0;
    const unassignedQs: RfpQuestion[] = [];
    for (const q of questions) {
      const p = q.page_limit ?? 0;
      if (q.assigned_to) {
        const bucket = byWriter[q.assigned_to] ?? (byWriter[q.assigned_to] = { pages: 0, questions: [] });
        bucket.pages += p;
        bucket.questions.push(q);
      } else {
        unassignedPages += p;
        unassignedQs.push(q);
      }
    }
    return { byWriter, unassignedPages, unassignedQs };
  }, [questions]);

  function toggleExpand(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function questionForSection(sec: SizingSection, qIdx: number): RfpQuestion | undefined {
    const sizingQ = sec.questions[qIdx];
    if (!sizingQ) return undefined;
    return questions.find(
      (rq) =>
        (sizingQ.question_number && rq.question_number === sizingQ.question_number) ||
        (rq.body && sizingQ.question_text && rq.body.toLowerCase().includes(sizingQ.question_text.slice(0, 40).toLowerCase())),
    );
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading sizing…</div>;
  }

  return (
    <div className="space-y-6">
      {/* SUMMARY STRIP */}
      <Card className="border-border bg-surface p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Total pages" value={totals.totalPages || "—"} />
          <Stat label="Sections" value={totals.sectionCount || "—"} />
          <Stat label="Questions" value={totals.totalQuestions || "—"} />
          <Stat label="Writer capacity" value={writerCapacity} suffix="pages" />
          <Stat
            label="Writers needed"
            value={totals.writersNeeded || "—"}
            sub={totals.recommendedTeamSize !== totals.writersNeeded ? `+1 buffer · team ${totals.recommendedTeamSize}` : null}
          />
        </div>
      </Card>

      {/* ASSUMPTIONS */}
      <Card className="border-border bg-surface p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold">Sizing Assumptions</h3>
            <p className="text-xs text-muted-foreground">Tune these as you learn more about the client.</p>
          </div>
          <Button size="sm" variant="outline" onClick={runExtract} disabled={extracting} className="gap-1.5">
            {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {sizingData ? "Re-extract from RFP" : "Extract from RFP"}
          </Button>
        </div>

        {turnaroundCapped && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div>
              <div className="font-bold">Turnaround under 90 days ({daysRemaining}d remaining)</div>
              Applying 30 page cap per writer regardless of baseline selection.
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label className="text-xs">Client baseline strength</Label>
            <Select
              value={assumptions.baseline}
              onValueChange={(v) => updateAssumptions({ ...assumptions, baseline: v as SizingAssumptions["baseline"] })}
            >
              <SelectTrigger className="mt-1 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weak">Weak baseline · 50 pages/writer</SelectItem>
                <SelectItem value="moderate">Moderate baseline · 70 pages/writer</SelectItem>
                <SelectItem value="solid">Solid baseline · 90 pages/writer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Complexity modifier</Label>
            <Select
              value={assumptions.complexity}
              onValueChange={(v) => updateAssumptions({ ...assumptions, complexity: v as SizingAssumptions["complexity"] })}
            >
              <SelectTrigger className="mt-1 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard MCO</SelectItem>
                <SelectItem value="high">High complexity (LTSS/HCBS/IDD/Dual) · −10 pages</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Submission window</Label>
            <div className="mt-1 rounded-md border border-border bg-background/40 px-3 py-2 text-xs">
              {daysRemaining === null ? "No submission date set" : `${daysRemaining} days remaining`}
            </div>
          </div>
        </div>
      </Card>

      {/* SECTION TABLE + WRITER LOAD */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="border-border bg-surface p-4 space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <FileText className="h-4 w-4" /> Section Breakdown
          </h3>
          {sortedSections.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              {extracting ? "Extracting sections…" : "No sections yet. Run extraction above."}
            </div>
          ) : (
            <div className="space-y-2">
              {sortedSections.map((sec) => {
                const isOpen = expanded.has(sec.name);
                const sectionWriters = Math.max(1, writerCapacity > 0 ? Math.ceil((sec.page_limit ?? 0) / writerCapacity) : 1);
                const weight = sec.evaluation_weight_pct ?? 0;
                return (
                  <div key={sec.name} className="rounded-md border border-border bg-background/30">
                    <button
                      type="button"
                      onClick={() => toggleExpand(sec.name)}
                      className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-white/[0.02]"
                    >
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                      <span className="flex-1 text-left text-sm font-semibold truncate">{sec.name}</span>
                      <div className="hidden md:flex items-center gap-2 w-40">
                        <div className="h-1.5 flex-1 rounded-full bg-border overflow-hidden">
                          <div className="h-full bg-[var(--gold)]" style={{ width: `${Math.min(weight, 100)}%` }} />
                        </div>
                        <span className="text-xs font-semibold tabular-nums">{weight.toFixed(0)}%</span>
                      </div>
                      {weight > 20 && (
                        <Badge className="bg-red-500/15 text-red-500 hover:bg-red-500/15 text-[10px]">HIGH</Badge>
                      )}
                      {weight >= 10 && weight <= 20 && (
                        <Badge className="bg-amber-500/15 text-amber-500 hover:bg-amber-500/15 text-[10px]">MED</Badge>
                      )}
                      <span className="text-xs text-muted-foreground tabular-nums">{sec.page_limit ?? "—"}p</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{sec.questions?.length ?? 0}Q</span>
                      <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">{sectionWriters}w</span>
                      {sec.ai_estimated && (
                        <Badge variant="outline" className="text-[9px] border-purple-500/40 text-purple-400">AI EST</Badge>
                      )}
                    </button>
                    {isOpen && (
                      <div className="border-t border-border px-3 py-2 space-y-1.5">
                        {(sec.questions ?? []).map((q, qIdx) => {
                          const rfpQ = questionForSection(sec, qIdx);
                          return (
                            <div key={qIdx} className="flex items-center gap-2 py-1 text-xs">
                              <span className="w-10 text-muted-foreground tabular-nums">{q.question_number ?? `Q${qIdx + 1}`}</span>
                              <span className="flex-1 truncate" title={q.question_text}>{q.question_text}</span>
                              <span className={`tabular-nums w-12 text-right ${weightTone(q.evaluation_weight_pct)}`}>
                                {q.evaluation_weight_pct != null ? `${q.evaluation_weight_pct.toFixed(1)}%` : "—"}
                              </span>
                              <span className="tabular-nums w-10 text-right text-muted-foreground">{q.page_limit ?? "—"}p</span>
                              {rfpQ ? (
                                <Select
                                  value={rfpQ.assigned_to ?? "_unassigned"}
                                  onValueChange={(v) => assign(rfpQ.id, v === "_unassigned" ? null : v)}
                                >
                                  <SelectTrigger className="h-7 w-32 text-[11px]">
                                    <SelectValue placeholder="Assign…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="_unassigned">— Unassigned</SelectItem>
                                    {members.map((m) => (
                                      <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-[10px] italic text-muted-foreground w-32 text-right">no rfp row</span>
                              )}
                            </div>
                          );
                        })}
                        {(sec.questions ?? []).length === 0 && (
                          <div className="text-[11px] italic text-muted-foreground">No questions extracted for this section.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="border-border bg-surface p-4 space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Users className="h-4 w-4" /> Writer Load
          </h3>
          {members.length === 0 ? (
            <div className="text-xs text-muted-foreground">No members yet.</div>
          ) : (
            <div className="space-y-2">
              {members.map((m) => {
                const load = writerLoad.byWriter[m.id];
                const used = load?.pages ?? 0;
                const pct = writerCapacity > 0 ? (used / writerCapacity) * 100 : 0;
                const overCap = used > writerCapacity;
                return (
                  <div key={m.id} className="rounded-md border border-border bg-background/30 p-2.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold truncate">{m.display_name}</span>
                      {overCap && (
                        <Badge className="bg-red-500/15 text-red-500 hover:bg-red-500/15 text-[10px]">OVER CAPACITY</Badge>
                      )}
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-border overflow-hidden">
                      <div className={`h-full ${loadTone(used, writerCapacity)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
                      <span>{used}p / {writerCapacity}p</span>
                      <span>{load?.questions.length ?? 0} questions</span>
                    </div>
                  </div>
                );
              })}
              <div className="mt-3 rounded-md border border-dashed border-border p-3 text-xs">
                <div className="flex items-center justify-between font-semibold">
                  <span>Unassigned</span>
                  <span className="tabular-nums">{writerLoad.unassignedPages}p · {writerLoad.unassignedQs.length}Q</span>
                </div>
                {writerLoad.unassignedQs.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground max-h-32 overflow-y-auto">
                    {writerLoad.unassignedQs.slice(0, 10).map((q) => (
                      <li key={q.id} className="truncate">• {q.question_number ?? ""} {q.body.slice(0, 60)}</li>
                    ))}
                    {writerLoad.unassignedQs.length > 10 && <li>… +{writerLoad.unassignedQs.length - 10} more</li>}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* SERVICES CHECKLIST */}
      <ServicesChecklist engagementId={engagementId} />
    </div>
  );
}

function Stat({ label, value, sub, suffix }: { label: string; value: any; sub?: string | null; suffix?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-xl font-bold tabular-nums">{value}</span>
        {suffix && <span className="text-[10px] text-muted-foreground">{suffix}</span>}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
