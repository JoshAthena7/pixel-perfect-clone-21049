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
import { getQuestionDay, questionForDay } from "@/lib/trivia-helpers";
import { Link } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import { burstConfetti } from "@/lib/confetti";
import { toast } from "sonner";
import { format } from "date-fns";
import { Flame } from "lucide-react";
import { SectionThread } from "@/components/war-room/comms/SectionThread";

export const Route = createFileRoute("/_authenticated/writer/my-sections")({
  head: () => ({ meta: [{ title: "My Sections — Writer Portal" }] }),
  component: WriterMySections,
});

type Assignment = {
  id: string;
  status: string;
  due_date: string | null;
  word_count_min: number | null;
  word_count_max: number | null;
  section_id: string;
  section?: { section_name: string; instructions: string | null };
};

const STATUS_STYLES: Record<string, string> = {
  "Not Started": "bg-muted text-muted-foreground",
  "In Progress": "bg-amber-500/20 text-amber-300",
  "Under Review": "bg-blue-500/20 text-blue-300",
  Complete: "bg-emerald-500/20 text-emerald-300",
};
const STATUSES = ["Not Started", "In Progress", "Under Review", "Complete"] as const;

function WriterMySections() {
  const { engagement } = useEngagement();
  const { user } = useSession();
  const [items, setItems] = useState<Assignment[]>([]);
  const [streak, setStreak] = useState<number | null>(null);
  const [completeFor, setCompleteFor] = useState<Assignment | null>(null);
  const [checks, setChecks] = useState({ theme: false, compliance: false, words: false, draft: false });

  async function load() {
    if (!engagement || !user) return;
    const { data } = await supabase
      .from("section_assignments")
      .select("id, status, due_date, word_count_min, word_count_max, section_id, heatmap_sections!inner(section_name, instructions)")
      .eq("engagement_id", engagement.id)
      .eq("user_id", user.id);
    setItems(
      ((data as any[]) ?? []).map((r) => ({
        ...r,
        section: r.heatmap_sections,
      })),
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
    setCompleteFor(null);
    toast.success("Section marked Complete 🎉");
    load();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Sections</h1>
          <p className="mt-1 text-sm text-muted-foreground">Submit drafts in the client environment.</p>
        </div>
        {streak !== null && (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--gold)]/40 bg-[var(--gold)]/10 px-3 py-1 text-xs font-semibold text-[var(--gold)]">
            <Flame className="h-3.5 w-3.5" /> Day {streak} 🔥
          </div>
        )}
      </div>

      <TriviaCard />
      <TriviaScoreCard />


      {items.length === 0 ? (
        <Card className="border-border bg-surface p-6 text-sm text-muted-foreground">
          No sections assigned yet. Your lead will assign sections to you here.
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((a) => (
            <Card key={a.id} className="border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{a.section?.section_name}</div>
                  {a.due_date && (
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      Due {format(new Date(a.due_date), "MMM d, yyyy")}
                    </div>
                  )}
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
  const { engagement, member } = useEngagement();
  const { user } = useSession();
  const day = getQuestionDay();
  const t = questionForDay(day);
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
          // We don't store which option they picked — just reveal correct answer.
          setPicked(data.correct ? t.answerIndex : -1);
        }
      });
  }, [engagement?.id, member?.id, day]);

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
    if (error) {
      // Race / dup — keep locked, just inform softly
      toast.error(error.message);
    }
  }

  return (
    <Card className="border-[var(--gold)]/30 bg-surface p-4">
      <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--gold)] font-semibold">
        Indiana Trivia · Daily
      </div>
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
      {locked && (
        <div className="mt-3 text-xs text-muted-foreground">{t.fact}</div>
      )}
      {locked && (
        <div className="mt-2 text-[11px] italic text-muted-foreground">Locked for today — come back tomorrow for a new question.</div>
      )}
    </Card>
  );
}

function TriviaScoreCard() {
  const { engagement, member } = useEngagement();
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
    <Link
      to="/writer/progress"
      className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3 text-sm hover:border-[var(--gold)]/60"
    >
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-[var(--gold)]" />
        <span className="font-medium">Trivia score: {score.correct} correct / {score.answered} answered</span>
      </div>
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">View leaderboard →</span>
    </Link>
  );
}
