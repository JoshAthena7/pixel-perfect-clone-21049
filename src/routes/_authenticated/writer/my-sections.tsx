import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { SectionThread } from "@/components/war-room/comms/SectionThread";
import { dueState } from "@/lib/due-date";
import { StuckButton } from "@/components/war-room/writer/StuckButton";
import { logActivity } from "@/lib/activity-log";
import { LoadingSkeleton, ErrorBanner } from "@/components/war-room/LoadState";

export const Route = createFileRoute("/_authenticated/writer/my-sections")({
  head: () => ({ meta: [{ title: "My Brief — Writer Portal" }] }),
  component: WriterMySections,
});

type Assignment = {
  id: string;
  status: string;
  due_date: string | null;
  word_count_min: number | null;
  word_count_max: number | null;
  section_id: string;
  section?: { section_name: string; instructions: string | null; evaluation_weight_pct: number | null };
};

const STATUS_STYLES: Record<string, string> = {
  "Not Started": "bg-muted text-muted-foreground",
  "In Progress": "bg-amber-500/20 text-amber-300",
  "Under Review": "bg-blue-500/20 text-blue-300",
  Complete: "bg-emerald-500/20 text-emerald-300",
};
const STATUSES = ["Not Started", "In Progress", "Under Review", "Complete"] as const;


// ── Writer SOS Button ─────────────────────────────────────────────
function WriterSOSButton({ engagementId, memberName }: { engagementId: string; memberName: string }) {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!desc.trim() || !engagementId) return;
    setSaving(true);
    await supabase.from("sos_alerts").insert({
      engagement_id: engagementId,
      severity: "Orange",
      description: desc,
      status: "Open",
      submitted_by: memberName || "Writer",
      category: "Writer Issue",
    });
    setSaving(false);
    setDesc("");
    setOpen(false);
    toast.success("SOS submitted — leadership has been notified.");
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-colors"
      >
        🚨 Raise SOS
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-red-500/30 bg-background p-5 space-y-4">
            <div>
              <h2 className="text-base font-bold text-red-400">🚨 Raise SOS</h2>
              <p className="text-xs text-muted-foreground mt-1">Use this when you need immediate leadership attention. Leadership will be notified.</p>
            </div>
            <textarea
              className="w-full rounded-md border border-red-500/30 bg-muted/30 px-3 py-2 text-sm outline-none focus:border-red-500 resize-none"
              placeholder="What's the issue? Be specific."
              rows={3}
              value={desc}
              onChange={e => setDesc(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setOpen(false)} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={submit} disabled={saving || !desc.trim()}
                className="rounded-md bg-red-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
                {saving ? "Submitting…" : "Submit SOS"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function WriterMySections() {
  const { engagement, member, member } = useEngagement();
  const { user } = useSession();
  const [items, setItems] = useState<Assignment[]>([]);
  const [streak, setStreak] = useState<number | null>(null);
  const [completeFor, setCompleteFor] = useState<Assignment | null>(null);
  const [checks, setChecks] = useState({ theme: false, compliance: false, words: false, draft: false });
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    if (!engagement || !user) return;
    setIsLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("section_assignments")
      .select("id, status, due_date, word_count_min, word_count_max, section_id, heatmap_sections!inner(section_name, instructions, evaluation_weight_pct)")
      .eq("engagement_id", engagement.id)
      .eq("user_id", user.id);
    setIsLoading(false);
    if (error) { setLoadError(error.message); return; }
    setItems(
      ((data as any[]) ?? [])
        .map((r) => ({ ...r, section: r.heatmap_sections }))
        .sort((a, b) => (b.section?.evaluation_weight_pct ?? -1) - (a.section?.evaluation_weight_pct ?? -1)),
    );
    const { data: seen } = await supabase
      .from("writer_last_seen")
      .select("streak_count")
      .eq("engagement_id", engagement.id)
      .eq("user_id", user.id)
      .maybeSingle();
    setStreak(seen?.streak_count ?? 1);
  }

  useEffect(() => { load(); }, [engagement?.id, user?.id]);

  async function setStatus(a: Assignment, status: string) {
    if (status === "Complete") {
      setCompleteFor(a);
      setChecks({ theme: false, compliance: false, words: false, draft: false });
      return;
    }
    const { error } = await supabase.from("section_assignments").update({ status }).eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Status updated");
    load();
  }

  async function confirmComplete() {
    if (!completeFor) return;
    if (!Object.values(checks).every(Boolean)) return toast.error("Check every box before completing.");
    burstConfetti(2000);
    const { error } = await supabase.from("section_assignments").update({ status: "Complete" }).eq("id", completeFor.id);
    if (error) return toast.error(error.message);
    if (engagement && member) {
      logActivity({
        engagementId: engagement.id,
        userId: user?.id ?? null,
        actorName: member.display_name,
        action: "section_completed",
        targetTable: "section_assignments",
        targetId: completeFor.id,
        metadata: { section_name: completeFor.section?.section_name ?? null },
      });
    }
    setCompleteFor(null);
    toast.success("Section marked Complete 🎉");
    load();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Brief</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your personal mission briefing — sections, deadlines, and what's next.</p>
        </div>
        {streak !== null && (
          <WriterSOSButton engagementId={engagement?.id ?? ""} memberName={member?.display_name ?? ""} />
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--gold)]/40 bg-[var(--gold)]/10 px-3 py-1 text-xs font-semibold text-[var(--gold)]">
            <Flame className="h-3.5 w-3.5" /> Day {streak} 🔥
          </div>
        )}
      </div>

      <ErrorBanner error={loadError} onRetry={load} label="Couldn't load your sections." />

      <TriviaCard />
      <TriviaScoreCard />


      {isLoading && items.length === 0 ? (
        <LoadingSkeleton label="Loading your sections…" />
      ) : items.length === 0 ? (
        <Card className="border-border bg-surface p-6 text-sm text-muted-foreground">
          No sections assigned yet. Your lead will assign sections to you here.
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((a) => (
            <Card key={a.id} className="border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold">{a.section?.section_name}</div>
                    {a.section?.evaluation_weight_pct != null && (
                      <Badge
                        variant="outline"
                        className={`border-[var(--gold)]/40 bg-[var(--gold)]/10 text-[10px] font-bold tracking-wider text-[var(--gold)] ${
                          (a.section.evaluation_weight_pct ?? 0) > 10 ? "border-red-500/60 bg-red-500/10 text-red-300" : ""
                        }`}
                        title="Evaluation weight"
                      >
                        {a.section.evaluation_weight_pct}% wt
                      </Badge>
                    )}
                  </div>
                  {(() => {
                    const ds = dueState(a.due_date);
                    if (!ds) return null;
                    return (
                      <div
                        className="mt-0.5 inline-flex items-center gap-1.5 text-[11px]"
                        style={{ color: ds.color, fontWeight: ds.bold ? 700 : 400 }}
                      >
                        <span
                          className={`inline-block h-1.5 w-1.5 rounded-full ${ds.pulse ? "animate-pulse" : ""}`}
                          style={{ backgroundColor: ds.color }}
                        />
                        {ds.text}
                      </div>
                    );
                  })()}
                </div>
                <Badge className={STATUS_STYLES[a.status] ?? ""}>{a.status}</Badge>
              </div>
              <div className="mt-3 rounded-md border border-border/60 bg-background/40 p-3 text-xs">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Section brief</div>
                {a.section?.instructions ? (
                  <div className="whitespace-pre-wrap text-foreground/90">{a.section.instructions}</div>
                ) : (
                  <div className="italic text-muted-foreground">Brief coming soon</div>
                )}
              </div>
              {(a.word_count_min || a.word_count_max) && (
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Word count: {a.word_count_min ?? "—"} – {a.word_count_max ?? "—"}
                </div>
              )}
              <div className="mt-3 flex items-center gap-2">
                <Select value={a.status} onValueChange={(v) => setStatus(a, v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="ml-auto flex items-center gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link
                      to="/engagement/$id/section/$sectionId/edit"
                      params={{ id: engagement?.id ?? "", sectionId: a.section_id }}
                    >
                      Open editor
                    </Link>
                  </Button>
                  <StuckButton sectionId={a.section_id} sectionName={a.section?.section_name ?? "section"} />
                </div>
              </div>
              <p className="mt-3 text-[11px] italic text-muted-foreground">Submit drafts in the client environment.</p>
              <SectionThread sectionId={a.section_id} />
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!completeFor} onOpenChange={(o) => !o && setCompleteFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submission checklist</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            {[
              { k: "theme", l: "Win theme addressed" },
              { k: "compliance", l: "Compliance requirements met" },
              { k: "words", l: "Word count within range" },
              { k: "draft", l: "Draft submitted in client environment" },
            ].map((it) => (
              <label key={it.k} className="flex items-center gap-3">
                <Checkbox
                  checked={(checks as any)[it.k]}
                  onCheckedChange={(v) => setChecks((c) => ({ ...c, [it.k]: !!v }))}
                />
                <span>{it.l}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCompleteFor(null)}>Cancel</Button>
            <Button onClick={confirmComplete}>Mark Complete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TriviaCard() {
  const { engagement, member, member } = useEngagement();
  const { user } = useSession();
  const day = getQuestionDay();
  const stateCode = engagement?.state ?? null;

  // Question: prefer state_trivia_bank rotated by day; fall back to hardcoded TRIVIA.
  type BankQ = { question: string; choices: string[]; correct_index: number; explanation: string | null };
  const [bankQ, setBankQ] = useState<BankQ | null>(null);
  const [bankLoaded, setBankLoaded] = useState(false);
  const [seedingBank, setSeedingBank] = useState(false);

  // Load (and lazily seed) the bank for this state
  useEffect(() => {
    let cancelled = false;
    if (!stateCode) { setBankQ(null); setBankLoaded(true); return; }
    setBankLoaded(false);
    (async () => {
      const { data } = await supabase
        .from("state_trivia_bank")
        .select("question, choices, correct_index, explanation")
        .eq("state", stateCode)
        .order("id", { ascending: true });
      if (cancelled) return;
      const rows = (data as BankQ[] | null) ?? [];
      if (rows.length > 0) {
        setBankQ(rows[((day % rows.length) + rows.length) % rows.length]);
        setBankLoaded(true);
        return;
      }
      // No bank yet for this state — auto-seed in the background, then retry once.
      setSeedingBank(true);
      try {
        await seedStateTrivia({ data: { state: stateCode } });
        const { data: after } = await supabase
          .from("state_trivia_bank")
          .select("question, choices, correct_index, explanation")
          .eq("state", stateCode)
          .order("id", { ascending: true });
        if (cancelled) return;
        const rows2 = (after as BankQ[] | null) ?? [];
        if (rows2.length > 0) {
          setBankQ(rows2[((day % rows2.length) + rows2.length) % rows2.length]);
        }
      } catch {
        // fall through to hardcoded fallback
      } finally {
        if (!cancelled) {
          setSeedingBank(false);
          setBankLoaded(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [stateCode, day]);

  // Unified shape for rendering
  const fallback = questionForDay(day);
  const t = bankQ
    ? { q: bankQ.question, options: bankQ.choices, answerIndex: bankQ.correct_index, fact: bankQ.explanation ?? "" }
    : fallback;

  const [picked, setPicked] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load existing answer for today (locks UI if already submitted)
  useEffect(() => {
    if (!engagement || !member) return;
    supabase
      .from("trivia_answers")
      .select("correct")
      .eq("engagement_id", engagement.id)
      .eq("member_id", member.id)
      .eq("question_day", day)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setLocked(true);
          setPicked(data.correct ? t.answerIndex : -1);
        }
      });
  }, [engagement?.id, member?.id, day, t.answerIndex]);

  async function pick(i: number) {
    if (locked || saving || !engagement || !member || !user) return;
    setSaving(true);
    setPicked(i);
    setLocked(true);
    const { error } = await supabase.from("trivia_answers").insert({
      engagement_id: engagement.id,
      member_id: member.id,
      user_id: user.id,
      question_day: day,
      correct: i === t.answerIndex,
    });
    setSaving(false);
    if (error) toast.error(error.message);
  }

  return (
    <Card className="border-[var(--gold)]/30 bg-surface p-4">
      <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--gold)] font-semibold">
        {stateCode ? `${stateCode} Trivia` : "Daily Trivia"} · Daily
      </div>
      {!bankLoaded ? (
        <div className="mt-3 text-xs italic text-muted-foreground">
          {seedingBank ? `Generating ${stateCode} trivia bank…` : "Loading…"}
        </div>
      ) : (
        <>
          <div className="mt-2 text-sm font-semibold">{t.q}</div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {t.options.map((opt, i) => {
              const isCorrect = i === t.answerIndex;
              const isPicked = picked === i;
              const reveal = locked;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={reveal || saving}
                  onClick={() => pick(i)}
                  className={`rounded-md border px-3 py-2 text-left text-xs transition ${
                    reveal
                      ? isCorrect
                        ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200"
                        : isPicked
                        ? "border-[color:var(--red)]/60 bg-[color:var(--red)]/10 text-foreground"
                        : "border-border opacity-60"
                      : "border-border hover:border-[var(--gold)]/60"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {locked && t.fact && (
            <div className="mt-3 text-xs text-muted-foreground">{t.fact}</div>
          )}
          {locked && (
            <div className="mt-2 text-[11px] italic text-muted-foreground">Locked for today — come back tomorrow for a new question.</div>
          )}
        </>
      )}
    </Card>
  );
}

function TriviaScoreCard() {
  const { engagement, member, member } = useEngagement();
  const [score, setScore] = useState<{ correct: number; answered: number } | null>(null);

  useEffect(() => {
    if (!engagement || !member) return;
    supabase
      .from("trivia_answers")
      .select("correct")
      .eq("engagement_id", engagement.id)
      .eq("member_id", member.id)
      .then(({ data }) => {
        const rows = (data as { correct: boolean }[] | null) ?? [];
        setScore({ correct: rows.filter((r) => r.correct).length, answered: rows.length });
      });
  }, [engagement?.id, member?.id]);

  if (!score) return null;
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-[var(--gold)]" />
        <span className="font-medium">Trivia score: {score.correct} correct / {score.answered} answered</span>
      </div>
    </div>
  );
}
