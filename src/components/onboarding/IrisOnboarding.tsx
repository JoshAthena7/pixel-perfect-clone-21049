import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  IRIS_SCRIPTS,
  MODULE_NAMES,
  MODULE_CARDS,
  QUICK_REPLIES,
  FALLBACK_ANSWER,
  type QuickReply,
} from "@/lib/iris-onboarding-scripts";
import { Volume2, VolumeX, ArrowRight, X, MessageSquare } from "lucide-react";

const MUTE_STORAGE_KEY = "iris.voice.muted";
const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQQAAAAAAA==";

type SessionRow = {
  id: string;
  user_id: string;
  last_module: number;
  is_complete: boolean;
};

type IrisAnswer = { question: string; answer: string };

function isReplayRequested() {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  return url.searchParams.get("iris-demo") === "1" || url.searchParams.get("replay") === "iris";
}

function useOnboardingGate() {
  const replay = isReplayRequested();
  return useQuery({
    queryKey: ["iris-onboarding-gate", replay],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) return { show: false as const };

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, display_name, has_onboarded")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile) return { show: false as const };

      const replayRequested = isReplayRequested();
      if (profile.has_onboarded && !replayRequested) return { show: false as const };

      const firstName = (profile.display_name || "").split(" ")[0] || "operator";

      let session: SessionRow | null = null;
      if (!replayRequested) {
        const { data: existing } = await supabase
          .from("iris_onboarding_sessions")
          .select("id, user_id, last_module, is_complete")
          .eq("user_id", user.id)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        session = existing as SessionRow | null;
      }

      if (!session) {
        const { data: created, error } = await supabase
          .from("iris_onboarding_sessions")
          .insert({ user_id: user.id, last_module: 0 })
          .select("id, user_id, last_module, is_complete")
          .single();
        if (error) throw error;
        session = created as SessionRow;
      }

      return { show: true as const, userId: user.id, firstName, session, replayRequested };
    },
    staleTime: Infinity,
  });
}

export function IrisOnboardingMount() {
  const { data, isLoading } = useOnboardingGate();
  const [dismissed, setDismissed] = useState(false);
  if (isLoading || dismissed) return null;
  if (!data || !data.show) return null;
  return (
    <IrisOnboarding
      userId={data.userId}
      firstName={data.firstName}
      sessionId={data.session.id}
      startAtModule={1}
      onComplete={() => setDismissed(true)}
    />
  );
}

type Props = {
  userId: string;
  firstName: string;
  sessionId: string;
  startAtModule: number;
  onComplete: () => void;
};

function IrisOnboarding({ userId, firstName, sessionId, startAtModule, onComplete }: Props) {
  const navigate = useNavigate();
  const [currentModule, setCurrentModule] = useState(startAtModule);
  const [answers, setAnswers] = useState<Record<number, IrisAnswer[]>>({});
  const [questionsAsked, setQuestionsAsked] = useState<Record<number, string[]>>({});
  const [input, setInput] = useState("");
  const [askOpen, setAskOpen] = useState(false);
  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  });
  const [busy, setBusy] = useState(false);
  const [transitionKey, setTransitionKey] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const spokenForModule = useRef<number | null>(null);
  const playbackPrimed = useRef(false);
  const preparedAudio = useRef<{ module: number; text: string; promise: Promise<string | null> } | null>(null);

  const script = IRIS_SCRIPTS[currentModule];
  const card = MODULE_CARDS[currentModule];
  const moduleName = MODULE_NAMES[currentModule];
  const replies = QUICK_REPLIES[currentModule] || [];
  const advanceReply = replies.find((r) => r.kind === "advance");
  const questionReplies = useMemo(() => replies.filter((r) => r.kind === "question"), [replies]);
  const moduleAnswers = answers[currentModule] || [];

  const greetedScript = useMemo(() => {
    if (currentModule === 1) {
      return script.replace("Welcome to ATLAS.", `Welcome to ATLAS, ${firstName}.`);
    }
    return script;
  }, [currentModule, script, firstName]);

  // Persist mute
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? "1" : "0");
    }
    if (muted && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, [muted]);

  function primePlayback() {
    if (playbackPrimed.current) return Promise.resolve();
    const audio = audioRef.current ?? new Audio(SILENT_WAV);
    audio.preload = "auto";
    audioRef.current = audio;
    return audio.play().catch(() => undefined).finally(() => {
      audio.pause();
      audio.currentTime = 0;
      playbackPrimed.current = true;
    });
  }

  async function createIrisAudioUrl(text: string) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return null;

      const response = await fetch("/api/iris-voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) return null;
      return URL.createObjectURL(await response.blob());
    } catch {
      return null;
    }
  }

  async function playPreparedAudioUrl(audioUrl: string) {
    try {
      const audio = audioRef.current ?? new Audio(SILENT_WAV);
      audio.onended = () => URL.revokeObjectURL(audioUrl);
      audio.onerror = () => URL.revokeObjectURL(audioUrl);
      audio.src = audioUrl;
      audioRef.current = audio;
      await audio.play();
    } catch {
      // Silent fallback — text still renders
    }
  }

  async function playIrisLine(text: string, options?: { force?: boolean }) {
    if (muted && !options?.force) return;
    const audioUrl = await createIrisAudioUrl(text);
    if (audioUrl) await playPreparedAudioUrl(audioUrl);
  }

  // Narrate current module (browsers block autoplay until first user gesture,
  // so module 1 waits for the first pointerdown to prime + play).
  useEffect(() => {
    if (muted) return;
    if (spokenForModule.current === currentModule) return;

    let cancelled = false;
    const queuedAudio =
      preparedAudio.current?.module === currentModule && preparedAudio.current.text === greetedScript
        ? preparedAudio.current.promise
        : createIrisAudioUrl(greetedScript);
    preparedAudio.current = { module: currentModule, text: greetedScript, promise: queuedAudio };

    const speak = async () => {
      if (cancelled) return;
      spokenForModule.current = currentModule;
      await primePlayback();
      const audioUrl = await queuedAudio;
      if (audioUrl) await playPreparedAudioUrl(audioUrl);
      if (cancelled && audioRef.current) audioRef.current.pause();
    };

    if (playbackPrimed.current) {
      speak();
      return () => {
        cancelled = true;
      };
    }

    const onFirstGesture = () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
      speak();
    };
    window.addEventListener("pointerdown", onFirstGesture, { once: true });
    window.addEventListener("keydown", onFirstGesture, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };
  }, [currentModule, greetedScript, muted]);


  async function logModuleCleared(n: number) {
    const qs = questionsAsked[n] || [];
    await supabase.from("iris_onboarding_module_log").insert({
      session_id: sessionId,
      module_number: n,
      questions_asked: qs,
    });
    await supabase
      .from("iris_onboarding_sessions")
      .update({ last_module: n })
      .eq("id", sessionId);
  }

  async function advance() {
    if (busy) return;
    await primePlayback();
    setBusy(true);
    const cleared = currentModule;
    await logModuleCleared(cleared);

    if (cleared >= 7) {
      const hash = await sha256(`${userId}:${sessionId}:${Date.now()}`);
      await supabase
        .from("iris_onboarding_sessions")
        .update({ is_complete: true, completed_at: new Date().toISOString(), completion_hash: hash })
        .eq("id", sessionId);
      await supabase
        .from("profiles")
        .update({ has_onboarded: true, onboarded_at: new Date().toISOString() })
        .eq("id", userId);
      onComplete();
      navigate({ to: "/home" });
      return;
    }

    setAskOpen(false);
    setInput("");
    setTransitionKey((k) => k + 1);
    setCurrentModule(cleared + 1);
    setBusy(false);
  }

  function askQuickQuestion(q: QuickReply) {
    if (busy || q.kind !== "question" || !q.answer) return;
    setQuestionsAsked((prev) => ({
      ...prev,
      [currentModule]: [...(prev[currentModule] || []), q.label],
    }));
    setAnswers((prev) => ({
      ...prev,
      [currentModule]: [...(prev[currentModule] || []), { question: q.label, answer: q.answer! }],
    }));
  }

  function submitFreeText() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setAskOpen(false);
    const reply = matchAnswer(currentModule, text);
    setQuestionsAsked((prev) => ({
      ...prev,
      [currentModule]: [...(prev[currentModule] || []), text],
    }));
    setAnswers((prev) => ({
      ...prev,
      [currentModule]: [...(prev[currentModule] || []), { question: text, answer: reply }],
    }));
  }

  async function skipBriefing() {
    if (busy) return;
    setBusy(true);
    try {
      await supabase
        .from("iris_onboarding_sessions")
        .update({ is_complete: true, completed_at: new Date().toISOString() })
        .eq("id", sessionId);
      await supabase
        .from("profiles")
        .update({ has_onboarded: true, onboarded_at: new Date().toISOString() })
        .eq("id", userId);
    } finally {
      onComplete();
      navigate({ to: "/home" });
    }
  }

  async function handleVoiceClick() {
    await primePlayback();
    if (muted) setMuted(false);
    spokenForModule.current = currentModule;
    await playIrisLine(greetedScript, { force: true });
  }

  const isFinal = currentModule >= 7;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col atlas-stage"
      style={{ color: "var(--foreground)" }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "rgba(8,145,178,0.10)",
              border: "1px solid rgba(8,145,178,0.4)",
            }}
            aria-hidden
          >
            <span style={{ color: "var(--iris)", fontSize: 10, fontWeight: 700, letterSpacing: 1.5 }}>
              IRIS
            </span>
          </div>
          <div className="leading-tight">
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 2, color: "var(--athena-gold)" }}>
              ATLAS
            </div>
            <div style={{ fontSize: 10, color: "var(--muted-foreground)", letterSpacing: 1.5 }}>
              OPERATOR BRIEFING
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleVoiceClick}
            aria-label={muted ? "Unmute IRIS" : "Mute IRIS"}
            title={muted ? "Turn on and play IRIS" : "Replay IRIS voice"}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-colors"
            style={{
              color: "var(--muted-foreground)",
              fontSize: 11,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            <span className="hidden sm:inline">{muted ? "Voice off" : "Play voice"}</span>
          </button>
          <button
            type="button"
            onClick={skipBriefing}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-colors"
            style={{
              color: "var(--muted-foreground)",
              fontSize: 11,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.02)",
            }}
            aria-label="Skip briefing"
          >
            <X size={13} />
            <span className="hidden sm:inline">Skip briefing</span>
          </button>
        </div>
      </header>

      {/* Step indicator */}
      <div className="px-8 pb-6">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => {
            const state = n < currentModule ? "complete" : n === currentModule ? "active" : "upcoming";
            return (
              <div
                key={n}
                className="h-[3px] flex-1 rounded-full transition-all duration-500"
                style={{
                  background:
                    state === "active"
                      ? "var(--athena-gold)"
                      : state === "complete"
                      ? "rgba(196,154,34,0.55)"
                      : "rgba(255,255,255,0.08)",
                  boxShadow: state === "active" ? "0 0 12px rgba(196,154,34,0.45)" : "none",
                }}
              />
            );
          })}
        </div>
        <div
          className="mx-auto mt-3 flex w-full max-w-3xl items-center justify-between"
          style={{ fontSize: 11, color: "var(--muted-foreground)", letterSpacing: 1.5 }}
        >
          <span>MODULE {String(currentModule).padStart(2, "0")} / 07</span>
          <span>{moduleName.toUpperCase()}</span>
        </div>
      </div>

      {/* Scrollable briefing body */}
      <div className="flex-1 overflow-y-auto px-8 pb-10">
        <div
          key={transitionKey}
          className="mx-auto w-full max-w-3xl"
          style={{ animation: "briefing-rise 380ms ease-out both" }}
        >
          {/* Module heading */}
          <h1
            className="display-tight"
            style={{
              fontSize: "clamp(2rem, 4vw, 3rem)",
              fontWeight: 300,
              color: "var(--foreground)",
              marginTop: "1.5rem",
            }}
          >
            {moduleName}
          </h1>
          <div
            style={{
              marginTop: 14,
              height: 1,
              width: 64,
              background: "linear-gradient(90deg, var(--athena-gold), transparent)",
            }}
          />

          {/* Script */}
          <p
            className="mt-8"
            style={{
              fontSize: 18,
              lineHeight: 1.7,
              color: "color-mix(in oklab, var(--foreground) 88%, transparent)",
              maxWidth: "62ch",
            }}
          >
            {greetedScript}
          </p>

          {/* Reference card */}
          {card ? (
            <div
              className="mt-8 rounded-lg"
              style={{
                background: "rgba(196,154,34,0.04)",
                border: "1px solid rgba(196,154,34,0.22)",
                padding: "18px 20px",
              }}
            >
              <div
                style={{
                  color: "var(--athena-gold)",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 2,
                  marginBottom: 8,
                }}
              >
                AT A GLANCE — {card.title.toUpperCase()}
              </div>
              <div style={{ color: "rgba(232,237,245,0.82)", fontSize: 14, lineHeight: 1.6 }}>
                {card.body}
              </div>
            </div>
          ) : null}

          {/* IRIS answers (inline, calm — no chat bubbles) */}
          {moduleAnswers.length > 0 ? (
            <div className="mt-8 space-y-5">
              {moduleAnswers.map((a, i) => (
                <div
                  key={i}
                  style={{
                    borderLeft: "2px solid var(--iris)",
                    paddingLeft: 16,
                    animation: "briefing-rise 280ms ease-out both",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      letterSpacing: 1.5,
                      color: "color-mix(in oklab, var(--iris) 80%, white)",
                      marginBottom: 6,
                      textTransform: "uppercase",
                      fontWeight: 600,
                    }}
                  >
                    You asked — {a.question}
                  </div>
                  <div style={{ color: "rgba(232,237,245,0.88)", fontSize: 14, lineHeight: 1.65 }}>
                    {a.answer}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {/* Quick questions */}
          {questionReplies.length > 0 ? (
            <div className="mt-10">
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: 2,
                  color: "var(--muted-foreground)",
                  marginBottom: 10,
                  fontWeight: 600,
                }}
              >
                ASK IRIS
              </div>
              <div className="flex flex-wrap gap-2">
                {questionReplies.map((q, i) => {
                  const asked = (questionsAsked[currentModule] || []).includes(q.label);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => askQuickQuestion(q)}
                      disabled={busy || asked}
                      className="rounded-full px-3.5 py-1.5 transition-all"
                      style={{
                        fontSize: 12,
                        background: asked ? "rgba(8,145,178,0.08)" : "rgba(255,255,255,0.03)",
                        color: asked ? "color-mix(in oklab, var(--iris) 70%, white)" : "rgba(232,237,245,0.85)",
                        border: asked
                          ? "1px solid rgba(8,145,178,0.35)"
                          : "1px solid rgba(255,255,255,0.10)",
                        cursor: asked ? "default" : "pointer",
                      }}
                    >
                      {q.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setAskOpen((v) => !v)}
                  className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-all"
                  style={{
                    fontSize: 12,
                    background: askOpen ? "rgba(8,145,178,0.10)" : "rgba(255,255,255,0.03)",
                    color: askOpen ? "var(--iris)" : "rgba(232,237,245,0.7)",
                    border: askOpen
                      ? "1px solid rgba(8,145,178,0.4)"
                      : "1px solid rgba(255,255,255,0.10)",
                  }}
                  aria-expanded={askOpen}
                >
                  <MessageSquare size={12} />
                  Ask something else
                </button>
              </div>

              {askOpen ? (
                <div className="mt-4 flex items-center gap-2">
                  <input
                    autoFocus
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitFreeText();
                      if (e.key === "Escape") setAskOpen(false);
                    }}
                    placeholder="Type a question for IRIS…"
                    className="iris-input flex-1 rounded-md px-3 py-2"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      color: "var(--foreground)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      fontSize: 14,
                    }}
                  />
                  <button
                    type="button"
                    onClick={submitFreeText}
                    className="rounded-md px-3 py-2 transition-colors"
                    style={{
                      background: "rgba(8,145,178,0.15)",
                      color: "var(--iris)",
                      border: "1px solid rgba(8,145,178,0.4)",
                      fontSize: 13,
                    }}
                  >
                    Ask
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Footer / advance */}
      <footer
        className="px-8 py-5"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          background: "linear-gradient(to top, rgba(0,0,0,0.35), transparent)",
        }}
      >
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between">
          <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            {isFinal ? "Briefing complete. You're cleared to operate." : `Step ${currentModule} of 7`}
          </div>
          <button
            type="button"
            onClick={advance}
            disabled={busy}
            className="group inline-flex items-center gap-2 rounded-md px-5 py-2.5 transition-all"
            style={{
              background: "var(--athena-gold)",
              color: "var(--primary-foreground)",
              fontWeight: 600,
              fontSize: 13,
              letterSpacing: 0.5,
              boxShadow: "0 0 24px rgba(196,154,34,0.35)",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {advanceReply ? advanceReply.label : "Continue"}
            <ArrowRight
              size={15}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </button>
        </div>
      </footer>

      <style>{`
        @keyframes briefing-rise {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function matchAnswer(moduleNum: number, text: string): string {
  const replies = QUICK_REPLIES[moduleNum] || [];
  const norm = text.toLowerCase();
  for (const r of replies) {
    if (
      r.kind === "question" &&
      r.answer &&
      norm.includes(r.label.toLowerCase().replace(/[?.]/g, "").slice(0, 10))
    ) {
      return r.answer;
    }
  }
  return FALLBACK_ANSWER;
}

async function sha256(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
