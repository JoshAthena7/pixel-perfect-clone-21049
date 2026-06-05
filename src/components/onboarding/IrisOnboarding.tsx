import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { synthesizeIrisLine } from "@/lib/iris-voice.functions";
import {
  IRIS_SCRIPTS,
  MODULE_NAMES,
  MODULE_CARDS,
  QUICK_REPLIES,
  FALLBACK_ANSWER,
  type QuickReply,
} from "@/lib/iris-onboarding-scripts";
import { Check, Lock, Volume2, VolumeX, Send } from "lucide-react";

const MUTE_STORAGE_KEY = "iris.voice.muted";

type ChatMessage =
  | { id: string; from: "iris"; text: string; module?: number; card?: { title: string; body: string } | null }
  | { id: string; from: "user"; text: string };

type SessionRow = {
  id: string;
  user_id: string;
  last_module: number;
  is_complete: boolean;
};

function uid() {
  return Math.random().toString(36).slice(2, 11);
}

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

      // In replay mode always start a fresh session so the demo runs from Module 1.
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

      return { show: true as const, userId: user.id, firstName, session, replay: replayRequested };
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
      startAtModule={Math.min(7, Math.max(1, data.session.last_module + 1))}
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [questionsAsked, setQuestionsAsked] = useState<Record<number, string[]>>({});
  const [input, setInput] = useState("");
  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  });
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const spokenIdsRef = useRef<Set<string>>(new Set());
  const speakLine = useServerFn(synthesizeIrisLine);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? "1" : "0");
    }
    if (muted && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, [muted]);

  // Narrate the latest IRIS message
  useEffect(() => {
    if (muted) return;
    const last = messages[messages.length - 1];
    if (!last || last.from !== "iris") return;
    if (spokenIdsRef.current.has(last.id)) return;
    spokenIdsRef.current.add(last.id);

    let cancelled = false;
    (async () => {
      try {
        const { audioBase64, mimeType } = await speakLine({ data: { text: last.text } });
        if (cancelled || muted) return;
        // Stop any previous line
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        const audio = new Audio(`data:${mimeType};base64,${audioBase64}`);
        audioRef.current = audio;
        audio.play().catch(() => {
          // Autoplay blocked — user can click Unmute / interact to enable
        });
      } catch (err) {
        // Silent fallback per spec — text still renders
        console.warn("IRIS voice unavailable", err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, muted]);

  // Seed initial IRIS message for current module
  useEffect(() => {
    if (messages.length === 0) {
      if (startAtModule > 1) {
        setMessages([
          { id: uid(), from: "iris", text: `Resuming your briefing at Module ${startAtModule}.` },
          buildModuleMessage(startAtModule),
        ]);
      } else {
        const greet = IRIS_SCRIPTS[1].replace("Welcome to ATLAS.", `Welcome to ATLAS, ${firstName}.`);
        setMessages([
          { id: uid(), from: "iris", text: greet, module: 1, card: MODULE_CARDS[1] },
        ]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function buildModuleMessage(n: number): ChatMessage {
    return { id: uid(), from: "iris", text: IRIS_SCRIPTS[n], module: n, card: MODULE_CARDS[n] };
  }

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
    setBusy(true);
    const cleared = currentModule;
    await logModuleCleared(cleared);

    if (cleared >= 7) {
      // Mark complete
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

    const next = cleared + 1;
    setMessages((m) => [...m, { id: uid(), from: "user", text: QUICK_REPLIES[cleared][0].label }]);
    setTimeout(() => {
      setMessages((m) => [...m, buildModuleMessage(next)]);
      setCurrentModule(next);
      setBusy(false);
    }, 350);
  }

  function askQuickQuestion(q: QuickReply) {
    if (busy || q.kind !== "question" || !q.answer) return;
    setQuestionsAsked((prev) => ({ ...prev, [currentModule]: [...(prev[currentModule] || []), q.label] }));
    setMessages((m) => [
      ...m,
      { id: uid(), from: "user", text: q.label },
      { id: uid(), from: "iris", text: q.answer! },
    ]);
  }

  function submitFreeText() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setQuestionsAsked((prev) => ({ ...prev, [currentModule]: [...(prev[currentModule] || []), text] }));
    setMessages((m) => [
      ...m,
      { id: uid(), from: "user", text },
      { id: uid(), from: "iris", text: matchAnswer(currentModule, text) },
    ]);
  }

  const replies = QUICK_REPLIES[currentModule] || [];

  return (
    <div className="fixed inset-0 z-[200] flex" style={{ background: "#0b1220" }}>
      {/* Left rail */}
      <aside className="hidden md:flex flex-col" style={{ width: 200, background: "#0a0f1a", borderRight: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="px-4 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ color: "#d4af37", fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>ATLAS</div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, letterSpacing: 2, marginTop: 2 }}>ONBOARDING</div>
        </div>
        <nav className="flex-1 py-3">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => {
            const state = n < currentModule ? "complete" : n === currentModule ? "active" : "locked";
            return (
              <div
                key={n}
                className="flex items-center gap-2 px-4 py-2.5"
                style={{
                  borderLeft: state === "active" ? "3px solid #d4af37" : "3px solid transparent",
                  background: state === "active" ? "rgba(212,175,55,0.06)" : "transparent",
                  color: state === "locked" ? "rgba(255,255,255,0.3)" : state === "active" ? "#fff" : "rgba(255,255,255,0.65)",
                  fontSize: 13,
                }}
              >
                <span style={{ width: 16, display: "inline-flex", justifyContent: "center" }}>
                  {state === "complete" ? <Check size={14} color="#10b981" /> : state === "locked" ? <Lock size={11} /> : <span style={{ color: "#d4af37" }}>›</span>}
                </span>
                <span style={{ flex: 1 }}>{MODULE_NAMES[n]}</span>
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header
          className="flex items-center justify-between px-6 py-3"
          style={{ background: "#0a0f1a", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div>
            <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>
              IRIS — Intelligence &amp; Readiness Integration System
            </div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 }}>
              Onboarding — Module {currentModule} of 7
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{currentModule} / 7</span>
            <button
              onClick={() => setMuted((m) => !m)}
              className="flex items-center gap-1.5 px-2 py-1 rounded"
              style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}
              aria-label={muted ? "Unmute IRIS" : "Mute IRIS"}
              title={muted ? "Unmute IRIS" : "Mute IRIS"}
            >
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              <span>{muted ? "Unmute" : "Mute"}</span>
            </button>
          </div>
        </header>

        {/* Progress bar */}
        <div style={{ height: 2, background: "rgba(255,255,255,0.06)" }}>
          <div style={{ height: "100%", width: `${(currentModule / 7) * 100}%`, background: "#d4af37", transition: "width 300ms" }} />
        </div>

        {/* Thread */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6" style={{ background: "#0b1220" }}>
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((m) =>
              m.from === "iris" ? (
                <IrisBubble key={m.id} text={m.text} card={"card" in m ? m.card ?? undefined : undefined} module={"module" in m ? m.module : undefined} />
              ) : (
                <UserBubble key={m.id} text={m.text} />
              )
            )}
          </div>
        </div>

        {/* Input */}
        <div style={{ background: "#0a0f1a", borderTop: "1px solid rgba(255,255,255,0.08)" }} className="px-6 py-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex flex-wrap gap-2 mb-3">
              {replies.map((r, i) =>
                r.kind === "advance" ? (
                  <button
                    key={i}
                    onClick={advance}
                    disabled={busy}
                    className="px-4 py-2 rounded font-medium"
                    style={{ background: "#1e3a5f", color: "#fff", border: "1px solid #d4af37", fontSize: 13 }}
                  >
                    {r.label}
                  </button>
                ) : (
                  <button
                    key={i}
                    onClick={() => askQuickQuestion(r)}
                    disabled={busy}
                    className="px-3 py-2 rounded"
                    style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.12)", fontSize: 12 }}
                  >
                    {r.label}
                  </button>
                )
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitFreeText()}
                placeholder="Ask IRIS a question..."
                className="flex-1 px-3 py-2 rounded"
                style={{ background: "rgba(255,255,255,0.04)", color: "#fff", border: "1px solid rgba(255,255,255,0.1)", fontSize: 13 }}
              />
              <button
                onClick={submitFreeText}
                className="px-3 py-2 rounded flex items-center gap-1"
                style={{ background: "rgba(212,175,55,0.15)", color: "#d4af37", border: "1px solid rgba(212,175,55,0.4)", fontSize: 13 }}
              >
                <Send size={14} /> Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IrisBubble({ text, card, module }: { text: string; card?: { title: string; body: string }; module?: number }) {
  return (
    <div className="flex gap-3">
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 36, height: 36, borderRadius: "50%", background: "#0a0f1a", border: "1px solid #d4af37", color: "#d4af37", fontWeight: 700, fontSize: 11, letterSpacing: 1 }}
      >
        IRIS
      </div>
      <div className="flex-1 min-w-0">
        {module ? (
          <div style={{ color: "rgba(212,175,55,0.8)", fontSize: 10, fontWeight: 700, letterSpacing: 1.5, marginBottom: 4 }}>
            MODULE {module} — {MODULE_NAMES[module]?.toUpperCase()}
          </div>
        ) : null}
        <div
          className="rounded-lg px-4 py-3"
          style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.92)", fontSize: 14, lineHeight: 1.6, border: "1px solid rgba(255,255,255,0.06)" }}
        >
          {text}
        </div>
        {card ? (
          <div
            className="mt-3 rounded-lg px-4 py-3"
            style={{ background: "rgba(212,175,55,0.04)", border: "1px solid rgba(212,175,55,0.25)" }}
          >
            <div style={{ color: "#d4af37", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{card.title}</div>
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, lineHeight: 1.5 }}>{card.body}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div
        className="rounded-lg px-4 py-2 max-w-[75%]"
        style={{ background: "#1e3a5f", color: "#fff", fontSize: 13, border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {text}
      </div>
    </div>
  );
}

function matchAnswer(moduleNum: number, text: string): string {
  const replies = QUICK_REPLIES[moduleNum] || [];
  const norm = text.toLowerCase();
  for (const r of replies) {
    if (r.kind === "question" && r.answer && norm.includes(r.label.toLowerCase().replace(/[?.]/g, "").slice(0, 10))) {
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
