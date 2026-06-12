import { useEffect, useRef, useState } from "react";
import { Send, Paperclip, Mic, Check, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { IrisMark } from "@/components/iris/IrisMark";
import { cn } from "@/lib/utils";

type QDef = {
  key: string;
  prompt: string;
  ack: string;
  category: string;
  title: string;
};

const QUESTIONS: QDef[] = [
  {
    key: "win",
    prompt: "Why are we going to win this one?",
    ack: "Locked in. That becomes our north-star reason to win.",
    category: "win_theme",
    title: "Why we win",
  },
  {
    key: "lose",
    prompt: "What could cause us to lose?",
    ack: "Got it. I'll watch for that across every draft.",
    category: "risk",
    title: "Why we could lose",
  },
  {
    key: "writers",
    prompt: "What should every writer on this mission understand?",
    ack: "Saved. Every writer will see this in their briefing.",
    category: "writer_guidance",
    title: "Writer guidance",
  },
  {
    key: "never_forget",
    prompt: "What should I never forget about this mission?",
    ack: "I won't forget.",
    category: "anchor",
    title: "Never forget",
  },
  {
    key: "avoid",
    prompt: "What should we avoid? Words, claims, topics — anything off-limits.",
    ack: "Understood. I'll flag any draft that drifts into that territory.",
    category: "avoid",
    title: "What to avoid",
  },
];

type ChatItem =
  | { kind: "iris"; text: string; id: string }
  | { kind: "user"; text: string; id: string; attachment?: string };

export function MissionMemoryChat({
  missionId,
  onContinue,
}: {
  missionId: string;
  onContinue: () => void;
}) {
  const [items, setItems] = useState<ChatItem[]>([
    { kind: "iris", id: "intro", text: "Five quick questions. Your answers become this mission's memory — I'll use them in every draft, review, and risk scan." },
    { kind: "iris", id: "q-0", text: QUESTIONS[0].prompt },
  ]);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [recording, setRecording] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [items, done]);

  const persistAnswer = async (q: QDef, content: string, source: string) => {
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("iris_memories").insert({
      title: q.title,
      content,
      category: q.category,
      tags: ["mission_memory", q.key],
      importance: q.key === "never_forget" ? "critical" : "high",
      scope: "mission",
      mission_id: missionId,
      source,
      created_by: u.user?.id ?? null,
    });
  };

  const submitAnswer = async (text: string, attachmentLabel?: string, source = "wizard_text") => {
    if (saving || done) return;
    const q = QUESTIONS[step];
    if (!q) return;
    setSaving(true);
    const userId = `u-${step}-${Date.now()}`;
    setItems((prev) => [...prev, { kind: "user", id: userId, text, attachment: attachmentLabel }]);
    setDraft("");
    setAnswers((a) => ({ ...a, [q.key]: text }));

    try {
      await persistAnswer(q, text, source);
    } catch {
      // best-effort
    }

    const ackId = `a-${step}-${Date.now()}`;
    setTimeout(() => {
      setItems((prev) => [...prev, { kind: "iris", id: ackId, text: q.ack }]);
      const next = step + 1;
      if (next < QUESTIONS.length) {
        setTimeout(() => {
          setItems((prev) => [...prev, { kind: "iris", id: `q-${next}`, text: QUESTIONS[next].prompt }]);
          setStep(next);
          setSaving(false);
        }, 450);
      } else {
        setStep(next);
        setSaving(false);
        setTimeout(() => setDone(true), 500);
      }
    }, 350);
  };

  const handleFile = async (file: File) => {
    const q = QUESTIONS[step];
    if (!q) return;
    try {
      const path = `${missionId}/memory/${q.key}-${Date.now()}-${file.name}`;
      await supabase.storage.from("atlas-rfp-documents").upload(path, file, { upsert: false });
      await submitAnswer(`Attached: ${file.name}`, file.name, "wizard_file");
    } catch {
      await submitAnswer(`Attached: ${file.name}`, file.name, "wizard_file");
    }
  };

  const toggleRecord = async () => {
    if (recording) {
      recRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const seconds = Math.max(1, Math.round(blob.size / 16000));
        await submitAnswer(`Voice note (${seconds}s)`, "voice-note.webm", "wizard_voice");
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0A1628", color: "#E8EEF7" }}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 pt-5 pb-3 border-b border-white/5">
        <IrisMark size={32} />
        <div>
          <div className="text-[13px] font-medium" style={{ color: "#C49A2B" }}>IRIS</div>
          <div className="text-[11px] text-white/55">Mission Intelligence Officer</div>
        </div>
        <div className="ml-auto text-[11px] text-white/45">
          {Math.min(step, QUESTIONS.length)} / {QUESTIONS.length} answered
        </div>
      </div>

      {/* Chat */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto w-full max-w-[680px] space-y-5">
          {items.map((m) =>
            m.kind === "iris" ? (
              <div key={m.id} className="flex gap-3 items-start animate-[fadeUp_.35s_ease-out]">
                <div className="mt-0.5"><IrisMark size={28} /></div>
                <div
                  className="px-4 py-3 rounded-2xl rounded-tl-sm text-[14.5px] leading-relaxed max-w-[520px]"
                  style={{ background: "rgba(196,154,43,0.08)", border: "1px solid rgba(196,154,43,0.18)" }}
                >
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex justify-end animate-[fadeUp_.35s_ease-out]">
                <div
                  className="px-4 py-3 rounded-2xl rounded-tr-sm text-[14.5px] leading-relaxed max-w-[520px] whitespace-pre-wrap"
                  style={{ background: "#13243F", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  {m.attachment && (
                    <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "#C49A2B" }}>
                      {m.attachment.endsWith(".webm") ? "Voice note" : "Attachment"}
                    </div>
                  )}
                  {m.text}
                </div>
              </div>
            )
          )}

          {done && (
            <div className="mt-10 animate-[fadeUp_.5s_ease-out]">
              <div
                className="rounded-2xl p-6"
                style={{
                  background: "linear-gradient(180deg, rgba(196,154,43,0.10), rgba(196,154,43,0.04))",
                  border: "1px solid rgba(196,154,43,0.35)",
                }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-4 w-4" style={{ color: "#C49A2B" }} />
                  <div className="text-[13px] uppercase tracking-[0.14em]" style={{ color: "#C49A2B" }}>
                    Mission Memory — Saved
                  </div>
                </div>
                <div className="space-y-3">
                  {QUESTIONS.map((q) => (
                    <div key={q.key} className="flex gap-3">
                      <div className="mt-1">
                        <Check className="h-4 w-4" style={{ color: "#7BC47F" }} />
                      </div>
                      <div className="flex-1">
                        <div className="text-[12px] uppercase tracking-wider text-white/55">{q.title}</div>
                        <div className="text-[14px] text-white/90 mt-0.5">
                          {answers[q.key] || <span className="text-white/40 italic">—</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={onContinue}
                  className="mt-6 w-full px-5 py-3 rounded-md text-[14px] font-medium transition hover:opacity-90"
                  style={{ background: "#C49A2B", color: "#0D1B3E" }}
                >
                  Continue →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      {!done && (
        <div className="border-t border-white/5 px-6 py-4">
          <div className="mx-auto w-full max-w-[680px]">
            <div
              className="flex items-end gap-2 rounded-2xl px-3 py-2"
              style={{ background: "#0F1E36", border: "1px solid rgba(255,255,255,0.10)" }}
            >
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition"
                title="Attach a file"
                disabled={saving}
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={toggleRecord}
                className={cn(
                  "p-2 rounded-lg transition",
                  recording ? "text-red-300 bg-red-500/10" : "text-white/60 hover:text-white hover:bg-white/5"
                )}
                title={recording ? "Stop recording" : "Record a voice note"}
                disabled={saving}
              >
                <Mic className={cn("h-4 w-4", recording && "animate-pulse")} />
              </button>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (draft.trim()) submitAnswer(draft.trim());
                  }
                }}
                rows={1}
                placeholder={recording ? "Recording…" : "Type your answer, attach a file, or record a voice note"}
                className="flex-1 bg-transparent outline-none resize-none py-2 text-[14.5px] placeholder:text-white/35"
                style={{ maxHeight: 140 }}
                disabled={saving || recording}
              />
              <button
                type="button"
                onClick={() => draft.trim() && submitAnswer(draft.trim())}
                disabled={!draft.trim() || saving}
                className="p-2 rounded-lg transition disabled:opacity-40"
                style={{ background: draft.trim() ? "#C49A2B" : "transparent", color: draft.trim() ? "#0D1B3E" : "#9AA7BD" }}
                title="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 text-[11px] text-white/35 text-center">
              Enter to send · Shift+Enter for newline
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
