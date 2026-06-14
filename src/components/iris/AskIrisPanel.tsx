/**
 * AskIrisPanel — consolidated IRIS surface that replaces the floating
 * AssistsBar and the bottom-right IrisDock. Right-side overlay (420px desktop,
 * full-screen mobile), persistent across in-app navigation. Open/close/collapse
 * state is mirrored to sessionStorage so it survives client-side route changes
 * but resets on hard reload.
 *
 * Events:
 *   atlas:iris:open      → open the panel
 *   atlas:iris:close     → close the panel
 *   atlas:iris:prefill   → open + drop text into composer
 *   atlas:iris:state     → broadcast { open: boolean } for header buttons
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ChevronRight,
  X,
  Send,
  Pencil,
  Users,
  FileText,
  Edit3,
  HelpCircle,
  AlertTriangle,
  Copy,
  ExternalLink,
  Globe,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { askIrisWithSources } from "@/lib/iris/perplexity.functions";
import ReactMarkdown from "react-markdown";
import { IrisMark } from "@/components/iris/IrisMark";
import { useIris, getPageLabel } from "@/components/iris/IrisContext";

const IRIS = "#A78BFA";
const IRIS_BORDER = "rgba(127,119,221,0.3)";
const PANEL_BG = "#0A1628";
const SOS_RED = "rgba(224,74,74,0.9)";
const GOLD = "#C49A2B";

type CardKind =
  | { kind: "draft"; draft: string }
  | { kind: "score"; total: number; breakdown: Array<{ label: string; score: number; max: number }>; gaps: string[]; detail: string }
  | { kind: "risks"; items: Array<{ label: string; detail: string; href: string }> }
  | { kind: "intel"; items: Array<{ headline: string; url: string | null; assessment: string | null; href: string }> }
  | { kind: "sources"; answer: string; citations: Array<{ url: string; domain: string }> };

type Msg = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  at: number;
  card?: CardKind;
};

const STATE_KEY = "atlas_iris_panel_state";

type PanelState = "closed" | "open" | "collapsed";

function loadPanelState(): PanelState {
  if (typeof window === "undefined") return "closed";
  try {
    const v = sessionStorage.getItem(STATE_KEY);
    if (v === "open" || v === "collapsed" || v === "closed") return v;
  } catch { /* ignore */ }
  return "closed";
}

const proactiveFiredFor = new Set<string>();

export function AskIrisPanel() {
  const iris = useIris();
  const navigate = useNavigate();
  const askWithSourcesFn = useServerFn(askIrisWithSources);
  const [state, setState] = useState<PanelState>(() => loadPanelState());
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [waitingFirstToken, setWaitingFirstToken] = useState(false);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [sosOpen, setSosOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [nudgeFor, setNudgeFor] = useState<{ questionId: string; questionNumber: string | null } | null>(null);
  const [lastQuestionId, setLastQuestionId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Persist + broadcast state.
  useEffect(() => {
    try { sessionStorage.setItem(STATE_KEY, state); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent("atlas:iris:state", { detail: { open: state !== "closed" } }));
  }, [state]);

  // Event bridge.
  useEffect(() => {
    const onOpen = () => { setState("open"); setTimeout(() => inputRef.current?.focus(), 80); };
    const onClose = () => setState("closed");
    const onPrefill = (e: Event) => {
      const ce = e as CustomEvent<string>;
      setState("open");
      if (typeof ce.detail === "string") setInput((prev) => prev || ce.detail);
      setTimeout(() => inputRef.current?.focus(), 80);
    };
    window.addEventListener("atlas:iris:open", onOpen);
    window.addEventListener("atlas:iris:close", onClose);
    window.addEventListener("atlas:iris:prefill", onPrefill as EventListener);
    return () => {
      window.removeEventListener("atlas:iris:open", onOpen);
      window.removeEventListener("atlas:iris:close", onClose);
      window.removeEventListener("atlas:iris:prefill", onPrefill as EventListener);
    };
  }, []);

  // Backtick shortcut — toggle panel unless user is typing in a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "`") return;
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable) return;
      }
      e.preventDefault();
      setState((s) => (s === "closed" ? "open" : "closed"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Auto-scroll on new messages.
  useEffect(() => {
    if (state === "open" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, state]);

  // Context divider when question changes mid-conversation.
  useEffect(() => {
    const qid = iris.current_question_id;
    if (qid !== lastQuestionId) {
      if (qid && messages.length > 0) {
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: "system",
            text: `— Now working on Question ${iris.current_question_number ?? ""} —`,
            at: Date.now(),
          },
        ]);
      }
      setLastQuestionId(qid);
    }
  }, [iris.current_question_id, iris.current_question_number, lastQuestionId, messages.length]);

  // Proactive nudge: 30s on new question, only once per question per session.
  useEffect(() => {
    if (!iris.current_question_id) { setNudgeFor(null); return; }
    const qid = iris.current_question_id;
    if (proactiveFiredFor.has(qid)) return;
    if (state === "open") { proactiveFiredFor.add(qid); return; }
    const t = window.setTimeout(() => {
      if (proactiveFiredFor.has(qid)) return;
      proactiveFiredFor.add(qid);
      setNudgeFor({ questionId: qid, questionNumber: iris.current_question_number });
    }, 30_000);
    return () => window.clearTimeout(t);
  }, [iris.current_question_id, iris.current_question_number, state]);

  // Generate (cached) greeting when entering home state.
  useEffect(() => {
    if (state !== "open") return;
    if (messages.length > 0) return;
    if (greeting !== null) return;
    setGreeting(staticGreeting(iris));
  }, [state, messages.length, greeting, iris]);

  const pageLabel = useMemo(() => getPageLabel(iris.current_page), [iris.current_page]);

  const contextLine = useMemo(() => {
    if (iris.current_question_id) {
      return `Question ${iris.current_question_number ?? ""} — ${iris.current_section_name ?? "section"}`;
    }
    if (iris.current_page.startsWith("/my-work")) return "My Work";
    if (iris.current_page.startsWith("/portfolio")) return "Portfolio view";
    if (iris.current_page.includes("tab=oracle")) return "Intelligence";
    return pageLabel;
  }, [iris, pageLabel]);

  const placeholder = iris.current_question_id
    ? `Ask IRIS about question ${iris.current_question_number ?? ""}...`
    : "Ask IRIS anything about this mission...";

  // ---------- Send / stream ----------
  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || streaming) return;

    if (/^\/(sources|web|cite)\b/i.test(text)) return runAskWithSources(text.replace(/^\/(sources|web|cite)\s*/i, ""));
    if (/^score (my|this) draft/i.test(text)) return runScore(text);
    if (/^draft (a |the )?response/i.test(text)) return runDraft(text);
    if (/(what'?s|whats|what is).*at risk|risk(s)? right now/i.test(text)) return runRisks(text);
    if (/latest intelligence|recent intelligence|what.*new intel|daily brief|brief me/i.test(text)) {
      // brief flows through normal stream for the daily brief variant
      if (/latest intelligence|recent intelligence|what.*new intel/i.test(text)) return runLatestIntel(text);
    }

    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", text, at: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    await streamReply([...messages, userMsg]);
  };

  const runAskWithSources = async (query: string) => {
    const q = query.trim();
    if (!q) {
      toast.info("Type a question after /sources to search with citations.");
      return;
    }
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text: q, at: Date.now() }]);
    setInput("");
    const assistantId = crypto.randomUUID();
    setMessages((m) => [...m, { id: assistantId, role: "assistant", text: "Searching live sources…", at: Date.now() }]);
    setStreaming(true);
    try {
      const r = await askWithSourcesFn({ data: { query: q } });
      setMessages((m) => m.map((mm) => mm.id === assistantId
        ? { ...mm, text: r.content || "No answer.", card: { kind: "sources", answer: r.content, citations: r.citations } }
        : mm));
    } catch (e) {
      setMessages((m) => m.map((mm) => mm.id === assistantId
        ? { ...mm, text: `Source search failed: ${(e as Error).message}` }
        : mm));
    } finally {
      setStreaming(false);
    }
  };

  const streamReply = async (history: Msg[]) => {
    setStreaming(true);
    setWaitingFirstToken(true);
    const assistantId = crypto.randomUUID();
    setMessages((m) => [...m, { id: assistantId, role: "assistant", text: "", at: Date.now() }]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const last = history.filter((h) => h.role !== "system").slice(-10).map((h) => ({ role: h.role, content: h.text }));
      const res = await fetch("/api/chat/iris", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          missionId: iris.current_mission_id,
          sectionId: iris.current_section_id,
          questionId: iris.current_question_id,
          questionText: iris.current_question_text,
          questionNumber: iris.current_question_number,
          sectionName: iris.current_section_name,
          pageLabel,
          messages: last,
        }),
      });
      if (!res.ok || !res.body) {
        const errTxt = await res.text();
        setMessages((m) => m.map((mm) => mm.id === assistantId ? { ...mm, text: errTxt || "IRIS couldn't respond. Try again." } : mm));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (waitingFirstToken) setWaitingFirstToken(false);
        acc += chunk;
        setMessages((m) => m.map((mm) => mm.id === assistantId ? { ...mm, text: acc } : mm));
      }
      if (!acc) {
        setMessages((m) => m.map((mm) => mm.id === assistantId ? { ...mm, text: "Response interrupted. Ask again?" } : mm));
      }
    } catch (e) {
      setMessages((m) => m.map((mm) => mm.id === assistantId ? { ...mm, text: `Response interrupted. ${(e as Error).message}. Ask again?` } : mm));
    } finally {
      setStreaming(false);
      setWaitingFirstToken(false);
    }
  };

  const runRisks = async (text: string) => {
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text, at: Date.now() }]);
    setInput("");
    if (!iris.current_mission_id) {
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", at: Date.now(), text: "Open a mission first and I'll surface its live risks." }]);
      return;
    }
    const mid = iris.current_mission_id;
    const [qs, asg] = await Promise.all([
      supabase.from("questions").select("id,question_number,status").eq("mission_id", mid).in("status", ["at_risk", "blocked", "overdue"]).limit(8),
      supabase.from("mission_assignments").select("id,acceptance_status").eq("mission_id", mid).eq("acceptance_status", "pending").limit(8),
    ]);
    const items = [
      ...((qs.data ?? []).map((q) => ({
        label: `Question ${(q as { question_number: string | null }).question_number ?? "?"}`,
        detail: `Status: ${(q as { status: string }).status}`,
        href: `/olympus/missions/${mid}?tab=questions`,
      }))),
      ...((asg.data ?? []).map((a) => ({
        label: `Assignment pending acceptance`,
        detail: `id ${(a as { id: string }).id.slice(0, 8)}`,
        href: `/olympus/missions/${mid}?tab=team`,
      }))),
    ];
    setMessages((m) => [...m, {
      id: crypto.randomUUID(), role: "assistant", at: Date.now(),
      text: items.length ? `${items.length} item${items.length === 1 ? "" : "s"} need attention right now.` : "Nothing flagged at risk right now.",
      card: { kind: "risks", items },
    }]);
  };

  const runLatestIntel = async (text: string) => {
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text, at: Date.now() }]);
    setInput("");
    if (!iris.current_mission_id) {
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", at: Date.now(), text: "Open a mission first and I'll pull the latest intel." }]);
      return;
    }
    const mid = iris.current_mission_id;
    const { data } = await supabase
      .from("intelligence_feed_items")
      .select("headline,source_url,iris_assessment")
      .eq("mission_id", mid)
      .eq("is_reviewed", false)
      .gte("iris_relevance_score", 60)
      .order("created_at", { ascending: false })
      .limit(5);
    const items = (data ?? []).map((d) => ({
      headline: (d as { headline: string }).headline,
      url: (d as { source_url: string | null }).source_url,
      assessment: (d as { iris_assessment: string | null }).iris_assessment,
      href: `/olympus/missions/${mid}?tab=oracle&sub=feed`,
    }));
    setMessages((m) => [...m, {
      id: crypto.randomUUID(), role: "assistant", at: Date.now(),
      text: items.length ? "Here's the latest intelligence:" : "Nothing new at relevance 60+ yet.",
      card: { kind: "intel", items },
    }]);
  };

  const runDraft = async (text: string) => {
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text, at: Date.now() }]);
    setInput("");
    const assistantId = crypto.randomUUID();
    setMessages((m) => [...m, { id: assistantId, role: "assistant", text: "Drafting…", at: Date.now() }]);
    setStreaming(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const promptText = `Draft a complete response for the current question/section. Use the Style Guide voice, connect to Win Themes, and cite a research finding. Return the draft body only — no preamble.`;
      const res = await fetch("/api/chat/iris", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({
          missionId: iris.current_mission_id,
          sectionId: iris.current_section_id,
          questionId: iris.current_question_id,
          questionText: iris.current_question_text,
          questionNumber: iris.current_question_number,
          sectionName: iris.current_section_name,
          pageLabel,
          messages: [{ role: "user", content: promptText }],
        }),
      });
      const txt = await res.text();
      setMessages((m) => m.map((mm) => mm.id === assistantId ? { ...mm, text: "Drafted a response.", card: { kind: "draft", draft: txt } } : mm));
    } catch (e) {
      setMessages((m) => m.map((mm) => mm.id === assistantId ? { ...mm, text: `Draft failed: ${(e as Error).message}` } : mm));
    } finally { setStreaming(false); }
  };

  const runScore = async (text: string) => {
    const draftText = text.replace(/^score (my|this) draft:?/i, "").trim();
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text, at: Date.now() }]);
    setInput("");
    const assistantId = crypto.randomUUID();
    setMessages((m) => [...m, { id: assistantId, role: "assistant", text: "Scoring your draft…", at: Date.now() }]);
    setStreaming(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const scorePrompt = `Score the following draft against: RFP requirements, evaluation criteria, Win Themes, Style Guide, page/word limits. Return ONLY valid JSON: { "total": number (0-100), "breakdown": [{"label": "Requirements Coverage", "score": number 0-30, "max": 30}, {"label":"Win Theme Alignment","score":number 0-25,"max":25}, {"label":"Evidence Quality","score":number 0-20,"max":20}, {"label":"Style Compliance","score":number 0-15,"max":15}, {"label":"Conciseness","score":number 0-10,"max":10}], "gaps": string[], "detail": string }.\n\nDRAFT:\n${draftText || "(no draft pasted)"}`;
      const res = await fetch("/api/chat/iris", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({
          missionId: iris.current_mission_id,
          sectionId: iris.current_section_id,
          questionId: iris.current_question_id,
          questionText: iris.current_question_text,
          questionNumber: iris.current_question_number,
          sectionName: iris.current_section_name,
          pageLabel,
          messages: [{ role: "user", content: scorePrompt }],
        }),
      });
      const raw = await res.text();
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("IRIS returned no score JSON.");
      const parsed = JSON.parse(match[0]);
      setMessages((m) => m.map((mm) => mm.id === assistantId ? { ...mm, text: `Quick score: ${parsed.total}/100. For the full report, use the Score Draft button.`, card: { kind: "score", ...parsed } } : mm));
    } catch (e) {
      setMessages((m) => m.map((mm) => mm.id === assistantId ? { ...mm, text: `Scoring failed: ${(e as Error).message}` } : mm));
    } finally { setStreaming(false); }
  };

  // ---------- Quick action handlers ----------
  const onFindSme = () => {
    const ctx = iris.current_question_number ? `for question ${iris.current_question_number}` : "";
    send(`I need subject matter expertise ${ctx}. Who in the Athena collective can help?`);
  };
  const onBriefMe = () => send("Give me my daily brief.");
  const onDraftForMe = () => {
    if (!iris.current_question_id) {
      toast.info("Open a question first, then ask IRIS to draft a response.");
      return;
    }
    send(`Draft a response for question ${iris.current_question_number ?? ""} — ${iris.current_question_text ?? ""}`);
  };
  const onGetHelp = () => {
    const ctx = iris.current_question_number ? `on question ${iris.current_question_number}` : "";
    send(`I'm stuck ${ctx}. What should I focus on to move forward?`);
  };

  const clearConversation = () => {
    if (messages.length > 3) {
      if (!confirm("Clear this conversation and start fresh?")) return;
    }
    setMessages([]);
    setGreeting(null);
  };

  // ---------- Render ----------
  const navigateTo = (href: string) => {
    navigate({ to: href as never });
  };

  if (state === "closed") {
    return (
      <ProactiveNudge nudge={nudgeFor} onOpen={() => { setState("open"); setNudgeFor(null); }} />
    );
  }

  if (state === "collapsed") {
    return (
      <button
        onClick={() => setState("open")}
        className="fixed top-[64px] right-0 bottom-0 w-[40px] z-40 flex flex-col items-center justify-start pt-3 gap-3"
        style={{ background: PANEL_BG, borderLeft: `1px solid ${IRIS_BORDER}` }}
        aria-label="Expand Ask IRIS"
      >
        <IrisMark className="h-5 w-5" />
        <span
          className="text-[11px] text-white/60 tracking-wide select-none"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          IRIS
        </span>
      </button>
    );
  }

  return (
    <>
      <ProactiveNudge nudge={null} onOpen={() => undefined} />
      <div
        className="fixed top-[64px] right-0 bottom-0 z-40 flex flex-col w-full md:w-[420px] shadow-2xl"
        style={{ background: PANEL_BG, borderLeft: `1px solid ${IRIS_BORDER}` }}
      >
        {/* Header */}
        <div className="h-16 px-4 flex items-center justify-between" style={{ borderBottom: `1px solid rgba(127,119,221,0.2)` }}>
          <div className="flex items-center gap-2 min-w-0">
            <IrisMark className="h-6 w-6 shrink-0" />
            <div className="min-w-0">
              <div className="text-white text-[16px] font-medium leading-tight">IRIS</div>
              <div className="text-[12px] text-white/55 truncate">{contextLine}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setState("collapsed")} title="Minimize" className="h-7 w-7 inline-flex items-center justify-center text-white/65 hover:text-white">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button onClick={() => setState("closed")} title="Close" className="h-7 w-7 inline-flex items-center justify-center text-white/65 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
          {messages.length === 0 ? (
            <HomeState
              greeting={greeting ?? "How can I help with this mission?"}
              onPostUpdate={() => setUpdateOpen(true)}
              onFindSme={onFindSme}
              onBriefMe={onBriefMe}
              onDraftForMe={onDraftForMe}
              onGetHelp={onGetHelp}
              onSos={() => setSosOpen(true)}
            />
          ) : (
            <ConversationState
              messages={messages}
              waitingFirstToken={waitingFirstToken && streaming}
              onBack={clearConversation}
              onNavigate={navigateTo}
              onOpenInThread={(draft) => {
                if (iris.current_mission_id && iris.current_question_id) {
                  navigate({
                    to: "/olympus/missions/$missionId",
                    params: { missionId: iris.current_mission_id },
                    search: { tab: "work", sub: "questions", question: iris.current_question_id, draft } as never,
                  });
                  toast.success("Opening question with draft");
                } else {
                  toast.error("Open a question first to use the draft.");
                }
              }}
            />
          )}
        </div>

        {/* Input zone */}
        <div className="px-3 py-3" style={{ background: "rgba(0,0,0,0.25)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
              }}
              placeholder={placeholder}
              disabled={streaming}
              className="flex-1 resize-none rounded-md text-[13px] text-white placeholder:text-white/40 focus:outline-none"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "0.5px solid rgba(255,255,255,0.1)",
                padding: "8px 12px",
                maxHeight: 96,
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={streaming || !input.trim()}
              className="h-8 w-8 inline-flex items-center justify-center rounded-full disabled:opacity-50"
              style={{ background: "rgba(127,119,221,0.8)", color: "white" }}
              title="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <div className="text-[10px] text-white/35 mt-1.5">Shift+Enter for new line · Press ` to toggle</div>
        </div>
      </div>

      {/* Inline overlays kept simple as small popovers via the existing modals */}
      <PostUpdateOverlay
        open={updateOpen}
        onClose={() => setUpdateOpen(false)}
        missionId={iris.current_mission_id}
        onSent={(text) => {
          setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", at: Date.now(), text: `Done. Your team has been updated: "${text.slice(0, 100)}${text.length > 100 ? "…" : ""}"` }]);
        }}
      />
      <SosOverlay
        open={sosOpen}
        onClose={() => setSosOpen(false)}
        missionId={iris.current_mission_id}
        questionId={iris.current_question_id}
        onSent={() => {
          setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", at: Date.now(), text: "Your engagement lead and mission admins have been notified immediately." }]);
        }}
      />
    </>
  );
}

/* ============ Subcomponents ============ */

function staticGreeting(iris: ReturnType<typeof useIris>): string {
  if (iris.current_question_id) {
    return `I've reviewed question ${iris.current_question_number ?? ""}. Ask me about requirements, intel, or have me draft a response.`;
  }
  if (iris.current_page.startsWith("/portfolio")) return "Looking at the portfolio. Ask about mission health, risks, or priorities.";
  if (iris.current_page.startsWith("/my-work")) return "Here are your assignments. Ask what to focus on, or have me brief you.";
  return "How can I help with this mission?";
}

function HomeState(props: {
  greeting: string;
  onPostUpdate: () => void;
  onFindSme: () => void;
  onBriefMe: () => void;
  onDraftForMe: () => void;
  onGetHelp: () => void;
  onSos: () => void;
}) {
  return (
    <div className="space-y-4">
      <div
        className="rounded-lg p-3.5 text-[13px] text-white/85 leading-relaxed"
        style={{ background: "rgba(127,119,221,0.08)", border: "0.5px solid rgba(127,119,221,0.2)" }}
      >
        {props.greeting}
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-widest text-white/45 mb-2">What do you need?</div>
        <div className="grid grid-cols-2 gap-2">
          <ActionCard icon={<Pencil className="h-3.5 w-3.5" />} label="Update Reality" sub="Use when mission strategy needs to change" onClick={props.onPostUpdate} />
          <ActionCard icon={<Users className="h-3.5 w-3.5" />} label="Find an SME" sub="Get expert help fast" onClick={props.onFindSme} />
          <ActionCard icon={<FileText className="h-3.5 w-3.5" />} label="Brief me" sub="Today's intel summary" onClick={props.onBriefMe} />
          <ActionCard icon={<Edit3 className="h-3.5 w-3.5" />} label="Draft a response" sub="IRIS writes the first draft" onClick={props.onDraftForMe} />
          <ActionCard icon={<HelpCircle className="h-3.5 w-3.5" />} label="I'm stuck" sub="Get unstuck fast" onClick={props.onGetHelp} />
          <ActionCard icon={<AlertTriangle className="h-3.5 w-3.5" />} label="SOS" sub="Critically blocked" onClick={props.onSos} danger />
        </div>
      </div>
    </div>
  );
}

function ActionCard({ icon, label, sub, onClick, danger }: { icon: ReactNode; label: string; sub: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-lg p-2.5 hover:brightness-125 transition"
      style={{
        background: danger ? "rgba(224,74,74,0.06)" : "rgba(255,255,255,0.04)",
        border: danger ? "0.5px solid rgba(224,74,74,0.15)" : "0.5px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="flex items-center gap-1.5 text-[13px] font-medium" style={{ color: danger ? SOS_RED : "white" }}>
        {icon} {label}
      </div>
      <div className="text-[11px] text-white/50 mt-0.5">{sub}</div>
    </button>
  );
}

function ConversationState(props: {
  messages: Msg[];
  waitingFirstToken: boolean;
  onBack: () => void;
  onNavigate: (href: string) => void;
  onOpenInThread: (draft: string) => void;
}) {
  return (
    <div className="space-y-3">
      <button onClick={props.onBack} className="text-[12px] text-white/50 hover:text-white">↩ Start over</button>
      {props.messages.map((m) => (
        <MessageRow key={m.id} m={m} onNavigate={props.onNavigate} onOpenInThread={props.onOpenInThread} />
      ))}
      {props.waitingFirstToken && (
        <div className="flex gap-1 items-center pl-2">
          <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: IRIS, animationDelay: "0ms" }} />
          <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: IRIS, animationDelay: "150ms" }} />
          <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: IRIS, animationDelay: "300ms" }} />
        </div>
      )}
    </div>
  );
}

function MessageRow({ m, onNavigate, onOpenInThread }: { m: Msg; onNavigate: (h: string) => void; onOpenInThread: (d: string) => void }) {
  if (m.role === "system") {
    return (
      <div className="text-center text-[11px] text-white/40 py-1">{m.text}</div>
    );
  }
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] text-white text-[13px]" style={{ background: "rgba(255,255,255,0.06)", border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: "10px 0 10px 10px", padding: "10px 14px" }}>
          <div className="whitespace-pre-wrap break-words">{m.text}</div>
          <div className="text-[10px] text-white/35 mt-1 text-right">{fmtTime(m.at)}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <IrisMark className="h-3 w-3 mt-2 shrink-0" />
      <div className="max-w-[85%] text-white text-[13px]" style={{ background: "rgba(127,119,221,0.08)", border: "0.5px solid rgba(127,119,221,0.15)", borderRadius: "0 10px 10px 10px", padding: "10px 14px" }}>
        <div className="prose prose-invert prose-sm max-w-none leading-relaxed">
          <ReactMarkdown>{m.text || " "}</ReactMarkdown>
        </div>
        {m.card?.kind === "draft" && <DraftCardView card={m.card} onOpenInThread={onOpenInThread} />}
        {m.card?.kind === "score" && <ScoreCardView card={m.card} />}
        {m.card?.kind === "risks" && <RiskCardView card={m.card} onNavigate={onNavigate} />}
        {m.card?.kind === "intel" && <IntelCardView card={m.card} onNavigate={onNavigate} />}
        <div className="text-[10px] text-white/35 mt-1">{fmtTime(m.at)}</div>
      </div>
    </div>
  );
}

function DraftCardView({ card, onOpenInThread }: { card: Extract<CardKind, { kind: "draft" }>; onOpenInThread: (d: string) => void }) {
  return (
    <div className="mt-2 rounded-lg p-3" style={{ border: `1px solid ${GOLD}66`, background: "rgba(196,154,43,0.04)" }}>
      <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: GOLD }}>Draft response</div>
      <div className="whitespace-pre-wrap text-white text-[13px] max-h-44 overflow-y-auto">{card.draft}</div>
      <div className="flex gap-2 mt-2">
        <button className="text-[11px] px-2 py-1 rounded border border-white/15 text-white/80 inline-flex items-center gap-1" onClick={() => { navigator.clipboard.writeText(card.draft); toast.success("Copied"); }}>
          <Copy className="h-3 w-3" /> Copy
        </button>
        <button className="text-[11px] px-2 py-1 rounded" style={{ background: GOLD, color: "#1a0f00" }} onClick={() => onOpenInThread(card.draft)}>
          Open in Thread
        </button>
      </div>
    </div>
  );
}

function ScoreCardView({ card }: { card: Extract<CardKind, { kind: "score" }> }) {
  return (
    <div className="mt-2 rounded-lg p-3" style={{ border: `1px solid ${IRIS}55`, background: "rgba(127,119,221,0.06)" }}>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: IRIS }}>Quick score</span>
        <span className="text-2xl font-bold" style={{ color: IRIS }}>{card.total}<span className="text-sm text-white/55">/100</span></span>
      </div>
      <div className="mt-2 space-y-1">
        {card.breakdown.map((b) => (
          <div key={b.label} className="text-[11px]">
            <div className="flex justify-between text-white/70"><span>{b.label}</span><span>{b.score}/{b.max}</span></div>
            <div className="h-1 rounded mt-0.5 bg-white/10 overflow-hidden">
              <div className="h-full" style={{ width: `${(b.score / b.max) * 100}%`, background: IRIS }} />
            </div>
          </div>
        ))}
      </div>
      {card.gaps?.length > 0 && (
        <ul className="mt-2 text-[11px] text-white/75 list-disc pl-4 space-y-0.5">
          {card.gaps.slice(0, 2).map((g, i) => <li key={i}>{g}</li>)}
        </ul>
      )}
    </div>
  );
}

function RiskCardView({ card, onNavigate }: { card: Extract<CardKind, { kind: "risks" }>; onNavigate: (h: string) => void }) {
  if (!card.items.length) return null;
  return (
    <ul className="mt-2 space-y-1">
      {card.items.map((it, i) => (
        <li key={i}>
          <button onClick={() => onNavigate(it.href)} className="w-full text-left text-[11px] rounded px-2 py-1.5 border border-amber-400/30 hover:bg-amber-500/10">
            <span className="font-semibold text-white">{it.label}</span>
            <span className="text-white/55"> — {it.detail}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function IntelCardView({ card, onNavigate }: { card: Extract<CardKind, { kind: "intel" }>; onNavigate: (h: string) => void }) {
  if (!card.items.length) return null;
  return (
    <ul className="mt-2 space-y-1.5">
      {card.items.map((it, i) => (
        <li key={i} className="text-[11px] rounded p-2 border border-white/10">
          <div className="font-semibold text-white">{it.headline}</div>
          {it.assessment && <div className="text-white/55 mt-0.5">{it.assessment}</div>}
          <div className="flex gap-3 mt-1">
            {it.url && <a href={it.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1" style={{ color: IRIS }}>Open <ExternalLink className="h-3 w-3" /></a>}
            <button onClick={() => onNavigate(it.href)} style={{ color: IRIS }}>View in IRIS</button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function fmtTime(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* ============ Inline overlays ============ */

function PostUpdateOverlay({ open, onClose, missionId, onSent }: { open: boolean; onClose: () => void; missionId: string | null; onSent: (text: string) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const submit = async () => {
    if (!text.trim() || !missionId) {
      if (!missionId) toast.error("Open a mission first.");
      return;
    }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: team } = await supabase.from("mission_team_members").select("member_id").eq("mission_id", missionId);
      const recipients = (team ?? []).map((t) => (t as { member_id: string }).member_id);
      if (recipients.length) {
        await supabase.from("atlas_notifications").insert(recipients.map((id) => ({
          recipient_id: id,
          recipient_role: "user",
          type: "reality_update",
          message: `Reality update: ${text.slice(0, 240)}`,
          metadata: { mission_id: missionId, posted_by: user?.id ?? null },
        })));
      }
      await supabase.from("mission_audit_log").insert({
        mission_id: missionId,
        action: "Reality update posted",
        actor_id: user?.id ?? null,
        details: { text },
      } as never);
      onSent(text);
      setText("");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end p-6" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div className="w-full max-w-[400px] rounded-lg p-4 space-y-3" style={{ background: PANEL_BG, border: `1px solid ${IRIS_BORDER}` }} onClick={(e) => e.stopPropagation()}>
        <div className="text-white text-[14px] font-medium">Update Reality</div>
        <div className="text-[11px] text-white/55 -mt-1">Use when the mission's strategic direction needs to change (north star, why-win, state priorities, competitive landscape). For real-time observations, use Mission Pulse instead.</div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="What changed about the mission strategy?" rows={5} className="w-full bg-white/5 text-white placeholder:text-white/40 rounded p-2 text-[13px] border border-white/10 focus:outline-none" />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-[12px] text-white/60 px-2 py-1">Cancel</button>
          <button onClick={submit} disabled={busy || !text.trim()} className="text-[12px] px-3 py-1.5 rounded disabled:opacity-50" style={{ background: IRIS, color: "#0F0A2A" }}>
            {busy ? "Sending…" : "Send to team"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SosOverlay({ open, onClose, missionId, questionId, onSent }: { open: boolean; onClose: () => void; missionId: string | null; questionId: string | null; onSent: () => void }) {
  const [text, setText] = useState("");
  const [priority, setPriority] = useState<"watch" | "at_risk" | "blocked">("at_risk");
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const submit = async () => {
    if (!text.trim() || !missionId) {
      if (!missionId) toast.error("Open a mission first.");
      return;
    }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const [admins, leads] = await Promise.all([
        supabase.from("user_roles").select("user_id").eq("role", "admin"),
        supabase.from("mission_team_members").select("member_id,mission_role").eq("mission_id", missionId),
      ]);
      const ids = new Set<string>();
      (admins.data ?? []).forEach((r) => ids.add((r as { user_id: string }).user_id));
      (leads.data ?? []).forEach((r) => {
        const role = (r as { mission_role: string | null }).mission_role ?? "";
        if (/engagement|lead|principal/i.test(role)) ids.add((r as { member_id: string }).member_id);
      });
      if (ids.size) {
        await supabase.from("atlas_notifications").insert(Array.from(ids).map((id) => ({
          recipient_id: id,
          recipient_role: "user",
          type: "sos",
          message: `SOS (${priority}): ${text.slice(0, 240)}`,
          metadata: { mission_id: missionId, priority, raised_by: user?.id ?? null, question_id: questionId },
        })));
      }
      if (questionId && priority !== "watch") {
        await supabase.from("questions").update({ status: priority === "blocked" ? "blocked" : "at_risk" }).eq("id", questionId);
      }
      await supabase.from("mission_audit_log").insert({
        mission_id: missionId,
        action: "SOS triggered",
        actor_id: user?.id ?? null,
        details: { text, priority, question_id: questionId },
      } as never);
      onSent();
      setText("");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end p-6" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div className="w-full max-w-[400px] rounded-lg p-4 space-y-3" style={{ background: PANEL_BG, border: `1px solid ${SOS_RED}` }} onClick={(e) => e.stopPropagation()}>
        <div className="text-[14px] font-medium" style={{ color: SOS_RED }}>SOS — Alert Leadership</div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe the situation" rows={5} className="w-full bg-white/5 text-white placeholder:text-white/40 rounded p-2 text-[13px] border border-white/10 focus:outline-none" />
        <div className="flex gap-2 text-[11px]">
          {(["watch", "at_risk", "blocked"] as const).map((p) => (
            <button key={p} onClick={() => setPriority(p)} className="px-2 py-1 rounded border" style={{
              borderColor: priority === p ? (p === "watch" ? "#f59e0b" : p === "at_risk" ? "#ef4444" : "#7f1d1d") : "rgba(255,255,255,0.15)",
              color: priority === p ? "white" : "rgba(255,255,255,0.7)",
              background: priority === p ? (p === "watch" ? "rgba(245,158,11,0.18)" : p === "at_risk" ? "rgba(239,68,68,0.18)" : "rgba(127,29,29,0.4)") : "transparent",
            }}>{p === "at_risk" ? "At Risk" : p === "blocked" ? "Blocked" : "Watch"}</button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-[12px] text-white/60 px-2 py-1">Cancel</button>
          <button onClick={submit} disabled={busy || !text.trim()} className="text-[12px] px-3 py-1.5 rounded disabled:opacity-50" style={{ background: SOS_RED, color: "white" }}>
            {busy ? "Alerting…" : "Alert Leadership"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProactiveNudge({ nudge, onOpen }: { nudge: { questionId: string; questionNumber: string | null } | null; onOpen: () => void }) {
  if (!nudge) return null;
  return (
    <div className="fixed top-[64px] right-4 z-40 mt-2">
      <button
        onClick={onOpen}
        className="rounded-md px-3 py-1.5 text-[12px] shadow-lg"
        style={{ background: "rgba(196,154,43,0.15)", border: `1px solid ${GOLD}66`, color: GOLD }}
      >
        IRIS has intel on {nudge.questionNumber ?? "this question"} →
      </button>
    </div>
  );
}
