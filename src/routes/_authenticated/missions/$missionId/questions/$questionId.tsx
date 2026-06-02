import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createSignal } from "@/lib/signals";
import { irisAskQuestion } from "@/lib/iris-ask.functions";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Send } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/missions/$missionId/questions/$questionId",
)({
  component: ResponseView,
});

type Q = {
  id: string;
  mission_id: string;
  question_number: string;
  title: string;
  question_text: string;
  pens_down_date: string | null;
  current_focus: string | null;
  next_step: string | null;
  waiting_on: string | null;
  guidance: string | null;
};

type Gate = { id: string; gate_name: string; target_date: string | null };
type WinTheme = { id: string; title: string; question_ids: string[] | null };

type NeedType = "direction" | "decision" | "help" | "air_cover";
type Choice = null | "learned" | "need" | "unchanged";

const NEED_COLORS: Record<NeedType, { bg: string; border: string; text: string; label: string }> = {
  direction: { bg: "rgba(59,130,246,0.15)", border: "#3b82f6", text: "#60a5fa", label: "NEED DIRECTION" },
  decision: { bg: "rgba(168,85,247,0.15)", border: "#a855f7", text: "#c084fc", label: "NEED DECISION" },
  help: { bg: "rgba(245,158,11,0.15)", border: "#f59e0b", text: "#fbbf24", label: "NEED HELP" },
  air_cover: { bg: "rgba(239,68,68,0.15)", border: "#ef4444", text: "#f87171", label: "NEED AIR COVER" },
};

function ResponseView() {
  const { missionId, questionId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: q, isLoading } = useQuery({
    queryKey: ["question", questionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("question_records")
        .select("id,mission_id,question_number,title,question_text,pens_down_date,current_focus,next_step,waiting_on,guidance")
        .eq("id", questionId)
        .maybeSingle();
      if (error) throw error;
      return data as Q | null;
    },
  });

  const { data: gates = [] } = useQuery({
    queryKey: ["mission-gates", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_review_gates")
        .select("id,gate_name,target_date")
        .eq("mission_id", missionId)
        .order("gate_order");
      return (data ?? []) as Gate[];
    },
  });

  const { data: winThemes = [] } = useQuery({
    queryKey: ["mission-winthemes", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("win_themes")
        .select("id,title,question_ids")
        .eq("mission_id", missionId);
      return (data ?? []) as WinTheme[];
    },
  });
  const connectedTheme = winThemes.find((w) => (w.question_ids ?? []).includes(questionId));

  const nextGate = gates
    .filter((g) => g.target_date && new Date(g.target_date) > new Date())
    .sort((a, b) => new Date(a.target_date!).getTime() - new Date(b.target_date!).getTime())[0];

  const daysUntil = (iso: string | null) =>
    iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000) : null;

  const dueDays = daysUntil(q?.pens_down_date ?? null);
  const gateDays = daysUntil(nextGate?.target_date ?? null);

  // Update reality state
  const [choice, setChoice] = useState<Choice>(null);
  const [needType, setNeedType] = useState<NeedType | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submitUpdate = useMutation({
    mutationFn: async () => {
      if (!choice || !q) return;
      setSubmitting(true);
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) throw new Error("Not signed in");

      const { data: profile } = await supabase
        .from("profiles").select("display_name,email").eq("id", user.id).maybeSingle();
      const name = profile?.display_name || profile?.email?.split("@")[0] || "Unknown";

      const { error } = await supabase.from("reality_updates").insert({
        question_id: questionId,
        mission_id: missionId,
        user_id: user.id,
        user_name: name,
        signal_type: choice,
        need_type: choice === "need" ? needType : null,
        details: details.trim() || null,
      });
      if (error) throw error;

      // Emit IRIS signal
      const severity =
        choice === "need" && (needType === "air_cover" || needType === "decision") ? "critical"
        : choice === "need" ? "warning"
        : "info";
      const titleMap: Record<string, string> = {
        learned: "Writer learned something",
        need: needType ? NEED_COLORS[needType].label : "Writer needs something",
        unchanged: "Status check — no change",
      };
      await createSignal({
        mission_id: missionId,
        source_module: "response_view",
        signal_type: choice === "need" ? "decision_needed" : choice === "learned" ? "comment_added" : "comment_added",
        signal_title: `${titleMap[choice]} · ${q.question_number}`,
        signal_summary: details.trim() || q.title,
        severity,
        related_question_id: questionId,
      }, qc);
    },
    onSuccess: () => {
      toast.success("Signal sent.");
      setChoice(null);
      setNeedType(null);
      setDetails("");
      setSubmitting(false);
      qc.invalidateQueries({ queryKey: ["reality-updates", questionId] });
      qc.invalidateQueries({ queryKey: ["mission-reality-latest", missionId] });
      qc.invalidateQueries({ queryKey: ["attention-needs"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setSubmitting(false);
    },
  });

  // Ask IRIS state
  const askFn = useServerFn(irisAskQuestion);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const onAsk = async () => {
    if (!prompt.trim()) return;
    setAsking(true);
    setAnswer("");
    try {
      const r = await askFn({ data: { questionId, prompt: prompt.trim() } });
      setAnswer(r.answer);
    } catch (e: any) {
      setAnswer(`_Error: ${e?.message ?? "unknown"}_`);
    } finally {
      setAsking(false);
    }
  };

  // Escape to return
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = !!(e.target as HTMLElement)?.closest("textarea,input,select,[contenteditable='true']");
      if (e.key === "Escape" && !inField) {
        navigate({ to: "/missions/$missionId/questions", params: { missionId } });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, missionId]);

  if (isLoading) return <div className="px-8 py-12 text-sm text-muted-foreground">Loading…</div>;
  if (!q) {
    return (
      <div className="px-8 py-12 text-sm">
        Response not found.{" "}
        <Link to="/missions/$missionId/questions" params={{ missionId }} className="text-primary hover:underline">
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-surface/60 backdrop-blur px-8 py-5">
        <Link
          to="/missions/$missionId/questions"
          params={{ missionId }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Responses
        </Link>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="font-mono text-xs text-muted-foreground">{q.question_number}</span>
          <h1 className="text-2xl font-semibold tracking-tight">{q.title}</h1>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-8 py-10 space-y-10">
        {/* IRIS Briefing */}
        <section className="rounded-[12px] border border-border bg-surface pl-1">
          <div className="border-l-2 border-[color:var(--iris,#22d3ee)] pl-6 pr-6 py-6 space-y-6">
            <div className="flex items-center gap-2">
              <span className="pulse-dot" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--iris,#22d3ee)]">IRIS Brief</span>
            </div>

            <Field label="Today · Current Focus" value={q.current_focus || "IRIS is preparing your brief…"} muted={!q.current_focus} />

            <Field
              label="Why It Matters"
              value={
                connectedTheme
                  ? `${connectedTheme.title}${dueDays !== null ? ` · Due in ${dueDays} days` : ""}`
                  : dueDays !== null
                  ? `Due in ${dueDays} days`
                  : "Not linked to a win theme yet."
              }
            />

            <Field label="Waiting On" value={q.waiting_on || "Nothing outstanding"} muted={!q.waiting_on} />

            <Field
              label="Next Gate"
              value={
                nextGate
                  ? `${nextGate.gate_name} · ${new Date(nextGate.target_date!).toLocaleDateString()} · ${gateDays} days away`
                  : "No upcoming gates."
              }
              muted={!nextGate}
            />

            {q.guidance && <Field label="Guidance" value={q.guidance} />}

            <div className="pt-1">
              <Link
                to="/missions/$missionId/briefing"
                params={{ missionId }}
                className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                View full briefing →
              </Link>
            </div>
          </div>
        </section>

        {/* Source documents link (replaces removed Library nav) */}
        <div>
          <Link
            to="/missions/$missionId/library"
            params={{ missionId }}
            className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Source documents →
          </Link>
        </div>


        {/* Update Reality */}
        <section>
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Update Reality
          </div>

          {choice === null ? (
            <div className="grid grid-cols-3 gap-3">
              <RealityButton
                label="I Learned Something"
                onClick={() => setChoice("learned")}
                bg="rgba(34,197,94,0.15)" border="#22c55e" color="#22c55e"
              />
              <RealityButton
                label="I Need Something"
                onClick={() => setChoice("need")}
                bg="rgba(245,158,11,0.15)" border="#f59e0b" color="#f59e0b"
              />
              <RealityButton
                label="Nothing Changed"
                onClick={() => setChoice("unchanged")}
                bg="rgba(85,96,112,0.15)" border="#556070" color="#8b9ab5"
              />
            </div>
          ) : choice === "need" && !needType ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(Object.keys(NEED_COLORS) as NeedType[]).map((k) => (
                  <RealityButton
                    key={k}
                    label={NEED_COLORS[k].label}
                    onClick={() => setNeedType(k)}
                    bg={NEED_COLORS[k].bg}
                    border={NEED_COLORS[k].border}
                    color={NEED_COLORS[k].text}
                  />
                ))}
              </div>
              <button
                onClick={() => { setChoice(null); }}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                ← Back
              </button>
            </div>
          ) : (
            <div className="rounded-[12px] border border-border bg-surface p-5 space-y-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {choice === "learned" ? "I Learned Something"
                 : choice === "unchanged" ? "Nothing Changed"
                 : needType ? NEED_COLORS[needType].label : ""}
              </div>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="What do you want to say?"
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => submitUpdate.mutate()}
                  disabled={submitting || (choice !== "unchanged" && !details.trim())}
                  className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? "Sending…" : "Submit"}
                </button>
                <button
                  onClick={() => { setChoice(null); setNeedType(null); setDetails(""); }}
                  className="rounded-md border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Ask IRIS */}
        <section className="rounded-[12px] border border-border bg-surface p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-[color:var(--iris,#22d3ee)]" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Ask IRIS</span>
          </div>
          <div className="flex gap-2">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onAsk(); }}
              placeholder="Ask IRIS anything about this response…"
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none"
            />
            <button
              onClick={onAsk}
              disabled={asking || !prompt.trim()}
              className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Send className="h-3.5 w-3.5" /> {asking ? "…" : "Send"}
            </button>
          </div>
          {(asking || answer) && (
            <div className="rounded-md border border-border bg-background/40 px-4 py-3 text-sm whitespace-pre-wrap text-[color:var(--iris,#22d3ee)]">
              {asking ? "IRIS is thinking…" : answer}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className={`mt-1.5 text-sm leading-relaxed ${muted ? "text-muted-foreground italic" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

function RealityButton({
  label, onClick, bg, border, color,
}: { label: string; onClick: () => void; bg: string; border: string; color: string }) {
  return (
    <button
      onClick={onClick}
      className="rounded-[10px] border px-4 py-5 text-xs font-semibold uppercase tracking-wider transition hover:brightness-125"
      style={{ background: bg, borderColor: border, color }}
    >
      {label}
    </button>
  );
}
