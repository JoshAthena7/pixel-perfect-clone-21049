import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { X, Eye, Send, Flag, Star, ArrowLeftRight, Bookmark } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SaveAsInsightDialog } from "./SaveAsInsightDialog";
import { LessonsLearnedDialog } from "./LessonsLearnedDialog";
import {
  listThreadMessages,
  postThreadMessage,
  listMissionTeam,
  maybePostInactivityCheckIn,
  maybePostWinThemeAlignment,
} from "@/lib/thread.functions";
import { QuestionBriefPanel } from "./QuestionBriefPanel";

type Props = {
  open: boolean;
  onClose: () => void;
  missionId: string | null;
  questionId: string | null;
  questionNumber: string | null;
  questionText: string | null;
  onRequestFindSME?: (topic: string) => void;
};

const GOLD = "#C49A2B";
const PURPLE_BG = "rgba(127,119,221,0.07)";
const PURPLE_BORDER = "rgba(127,119,221,0.2)";

type ThreadMsg = {
  id: string;
  sender_id: string | null;
  sender_name: string;
  message_body: string;
  message_type: "regular" | "decision" | "iris" | "system" | "iris_decision" | "win_theme_alignment" | "cross_reference";
  iris_action: "recommend_expert" | "surface_intelligence" | "flag_conflict" | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type Member = { id: string; name: string; email: string | null; role: string | null };

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function ThreadPanel({
  open,
  onClose,
  missionId,
  questionId,
  questionNumber,
  questionText,
  onRequestFindSME,
}: Props) {
  const qc = useQueryClient();
  const list = useServerFn(listThreadMessages);
  const post = useServerFn(postThreadMessage);
  const team = useServerFn(listMissionTeam);
  const inactivityCheck = useServerFn(maybePostInactivityCheckIn);
  const winThemeCheck = useServerFn(maybePostWinThemeAlignment);

  const enabled = open && !!questionId && !!missionId;

  const { data: msgsData } = useQuery({
    queryKey: ["thread", questionId],
    enabled,
    queryFn: () => list({ data: { questionId: questionId! } }),
    refetchInterval: open ? 5000 : false,
  });
  const messages = (msgsData?.messages ?? []) as ThreadMsg[];

  const { data: teamData } = useQuery({
    queryKey: ["thread-team", missionId],
    enabled,
    queryFn: () => team({ data: { missionId: missionId! } }),
  });
  const members = (teamData?.members ?? []) as Member[];

  // Inactivity check-in on open
  useEffect(() => {
    if (!enabled) return;
    inactivityCheck({ data: { missionId: missionId!, questionId: questionId! } })
      .then((r) => {
        if (r.posted) qc.invalidateQueries({ queryKey: ["thread", questionId] });
      })
      .catch(() => {});
    // Win Theme Alignment one-time orientation post (idempotent server-side).
    winThemeCheck({ data: { missionId: missionId!, questionId: questionId! } })
      .then((r) => {
        if (r.posted) qc.invalidateQueries({ queryKey: ["thread", questionId] });
      })
      .catch((e) => console.error("[ThreadPanel] win theme alignment check failed", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, questionId]);

  const [text, setText] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const [lessonsOpen, setLessonsOpen] = useState(false);

  const sendMutation = useMutation({
    mutationFn: (vars: { body: string; messageType: "regular" | "decision" }) =>
      post({
        data: {
          missionId: missionId!,
          questionId: questionId!,
          body: vars.body,
          messageType: vars.messageType,
          mentions: mentionIds,
        },
      }),
    onSuccess: () => {
      setText("");
      setMentionIds([]);
      qc.invalidateQueries({ queryKey: ["thread", questionId] });
      // Refetch again shortly to catch the IRIS async reply.
      setTimeout(() => qc.invalidateQueries({ queryKey: ["thread", questionId] }), 1500);
      setTimeout(() => qc.invalidateQueries({ queryKey: ["thread", questionId] }), 5000);
    },
  });

  // Auto-scroll feed to bottom on message updates
  useEffect(() => {
    if (!open) return;
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, messages.length]);

  const filteredMembers = useMemo(() => {
    if (!mentionQuery) return members.slice(0, 6);
    const q = mentionQuery.toLowerCase();
    return members.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [members, mentionQuery]);

  const onTextChange = (v: string) => {
    setText(v);
    const m = v.match(/(^|\s)@([\w-]*)$/);
    if (m) {
      setMentionOpen(true);
      setMentionQuery(m[2]);
    } else {
      setMentionOpen(false);
    }
  };

  const selectMention = (member: Member) => {
    if (mentionIds.includes(member.id) === false) {
      setMentionIds((prev) => [...prev, member.id]);
    }
    setText((prev) => prev.replace(/(^|\s)@([\w-]*)$/, (_full, lead) => `${lead}@${member.name} `));
    setMentionOpen(false);
    taRef.current?.focus();
  };

  const submit = (messageType: "regular" | "decision") => {
    const body = text.trim();
    if (!body || !missionId || !questionId) return;
    sendMutation.mutate({ body, messageType });
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 380,
        zIndex: 60,
        background: "#07101e",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        flexDirection: "column",
        boxShadow: "-12px 0 32px rgba(0,0,0,0.4)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "white", fontSize: 14, fontWeight: 500 }}>Thread</div>
          <div
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.5)",
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {questionNumber ? `Q${questionNumber} · ` : ""}
            {questionText ?? "No question selected"}
          </div>
        </div>
        {questionId && (
          <button
            onClick={() => setLessonsOpen(true)}
            title="Mark question complete"
            style={{
              background: "transparent",
              border: "1px solid rgba(196,154,43,0.45)",
              color: GOLD,
              fontSize: 10.5,
              padding: "3px 8px",
              borderRadius: 6,
              cursor: "pointer",
              marginRight: 6,
            }}
          >
            Mark Complete
          </button>
        )}
        <button
          onClick={onClose}
          aria-label="Close thread"
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,0.55)",
            cursor: "pointer",
            padding: 4,
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Feed */}
      <div
        ref={feedRef}
        style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}
      >
        {missionId && questionId && (
          <QuestionBriefPanel
            missionId={missionId}
            questionId={questionId}
            questionText={questionText ?? ""}
          />
        )}
        {/* IRIS context block (always shown once at top) */}
        <div
          style={{
            background: PURPLE_BG,
            border: `0.5px solid ${PURPLE_BORDER}`,
            borderRadius: 8,
            padding: "10px 12px",
            color: "rgba(220,215,255,0.85)",
            fontSize: 11.5,
            lineHeight: 1.6,
          }}
        >
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 4, color: "rgba(180,170,255,0.9)" }}>
            <Eye size={11} />
            <span style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>IRIS</span>
          </div>
          This is the living memory of question {questionNumber ?? "—"}. Everything discussed, decided, and documented
          here stays attached to this question permanently. IRIS is listening — she will surface relevant intelligence,
          recommend experts, and flag conflicting guidance as the discussion develops.
        </div>

        {(() => {
          const pinned = messages.filter((m) => m.message_type === "win_theme_alignment");
          const rest = messages.filter((m) => m.message_type !== "win_theme_alignment");
          return (
            <>
              {pinned.map((m) => (
                <WinThemeAlignmentRow key={m.id} msg={m} />
              ))}
              {rest.length === 0 && pinned.length === 0 ? (
                <div
                  style={{
                    color: "rgba(255,255,255,0.4)",
                    fontSize: 12,
                    textAlign: "center",
                    padding: "32px 0",
                  }}
                >
                  No discussion yet. Be the first to work the question.
                </div>
              ) : (
                rest.map((m) =>
                  m.message_type === "cross_reference" ? (
                    <CrossReferenceRow
                      key={m.id}
                      msg={m}
                      onNote={(body) => sendMutation.mutate({ body, messageType: "regular" })}
                    />
                  ) : (
                    <MessageRow key={m.id} msg={m} missionId={missionId} onFindExpert={onRequestFindSME} />
                  ),
                )
              )}
            </>
          );
        })()}
      </div>

      {/* Composer */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: 10 }}>
        <div style={{ position: "relative" }}>
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="Work the question. Tag teammates with @, capture decisions with the decision button."
            rows={3}
            style={{
              width: "100%",
              resize: "vertical",
              minHeight: 56,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 6,
              color: "white",
              fontSize: 12,
              padding: "8px 10px",
              lineHeight: 1.5,
              fontFamily: "inherit",
            }}
          />
          {mentionOpen && filteredMembers.length > 0 && (
            <div
              style={{
                position: "absolute",
                bottom: "100%",
                left: 0,
                right: 0,
                marginBottom: 4,
                background: "#0b1729",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6,
                maxHeight: 180,
                overflowY: "auto",
                zIndex: 5,
              }}
            >
              {filteredMembers.map((m) => (
                <button
                  key={m.id}
                  onClick={() => selectMention(m)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 10px",
                    background: "transparent",
                    border: "none",
                    color: "rgba(255,255,255,0.85)",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ color: GOLD }}>@</span>
                  {m.name}
                  {m.role ? <span style={{ color: "rgba(255,255,255,0.4)", marginLeft: 6, fontSize: 10 }}>{m.role}</span> : null}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            onClick={() => submit("regular")}
            disabled={sendMutation.isPending || !text.trim()}
            style={{
              background: GOLD,
              color: "#1a1408",
              border: "none",
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 600,
              cursor: sendMutation.isPending || !text.trim() ? "not-allowed" : "pointer",
              opacity: sendMutation.isPending || !text.trim() ? 0.5 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Send size={11} />
            Send
          </button>
          <button
            onClick={() => submit("decision")}
            disabled={sendMutation.isPending || !text.trim()}
            style={{
              background: "transparent",
              color: "rgba(196,154,43,0.85)",
              border: "1px solid rgba(196,154,43,0.4)",
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: 12,
              cursor: sendMutation.isPending || !text.trim() ? "not-allowed" : "pointer",
              opacity: sendMutation.isPending || !text.trim() ? 0.5 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Flag size={11} />
            Capture decision
          </button>
        </div>
      </div>
      <LessonsLearnedDialog
        open={lessonsOpen}
        onOpenChange={setLessonsOpen}
        missionId={missionId}
        questionId={questionId}
        onClosed={() => {
          qc.invalidateQueries({ queryKey: ["thread", questionId] });
          onClose();
        }}
      />
    </div>
  );
}

function MessageRow({ msg, missionId, onFindExpert }: { msg: ThreadMsg; missionId: string | null; onFindExpert?: (topic: string) => void }) {
  const [saveOpen, setSaveOpen] = useState(false);
  const ago = formatDistanceToNow(new Date(msg.created_at), { addSuffix: true });
  const isIris = msg.message_type === "iris";
  const isDecision = msg.message_type === "decision";
  const isFlagConflict = isIris && msg.iris_action === "flag_conflict";

  const bg = isFlagConflict
    ? "rgba(224,74,74,0.07)"
    : isIris
      ? PURPLE_BG
      : isDecision
        ? "rgba(196,154,43,0.05)"
        : "rgba(255,255,255,0.02)";
  const border = isFlagConflict
    ? "0.5px solid rgba(224,74,74,0.35)"
    : isIris
      ? `0.5px solid ${PURPLE_BORDER}`
      : isDecision
        ? "0.5px solid rgba(196,154,43,0.4)"
        : "0.5px solid rgba(255,255,255,0.05)";

  const topic = (msg.metadata as any)?.topic as string | undefined;

  return (
    <div style={{ background: bg, border, borderRadius: 8, padding: "8px 10px", position: "relative" }}>
      {isDecision && (
        <span
          style={{
            position: "absolute",
            top: 6,
            right: 8,
            fontSize: 9,
            fontWeight: 600,
            color: GOLD,
            background: "rgba(196,154,43,0.15)",
            border: "1px solid rgba(196,154,43,0.4)",
            padding: "1px 6px",
            borderRadius: 4,
            letterSpacing: "0.06em",
          }}
        >
          DECISION
        </span>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <div
          aria-hidden
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: isIris ? "rgba(127,119,221,0.25)" : "rgba(255,255,255,0.1)",
            color: isIris ? "rgba(220,215,255,0.95)" : "rgba(255,255,255,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 8,
            fontWeight: 600,
          }}
        >
          {isIris ? <Eye size={9} /> : initials(msg.sender_name)}
        </div>
        <span style={{ color: isIris ? "rgba(200,195,255,0.9)" : "white", fontSize: 11 }}>{msg.sender_name}</span>
        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 9 }}>{ago}</span>
      </div>
      <div style={{ color: "white", fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{msg.message_body}</div>
      {isIris && msg.iris_action === "recommend_expert" && (
        <div style={{ marginTop: 6 }}>
          <button
            onClick={() => onFindExpert?.(topic ?? "")}
            style={{
              background: "rgba(127,119,221,0.18)",
              border: "1px solid rgba(127,119,221,0.4)",
              color: "rgba(220,215,255,0.95)",
              fontSize: 11,
              padding: "3px 10px",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Find expert →
          </button>
        </div>
      )}
      <div style={{ marginTop: 6, display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => setSaveOpen(true)}
          title="Save as Insight"
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.55)",
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 6,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Bookmark size={10} />
          Save as Insight
        </button>
      </div>
      <SaveAsInsightDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        initialContent={msg.message_body}
        missionId={missionId}
      />
    </div>
  );
}

function WinThemeAlignmentRow({ msg }: { msg: ThreadMsg }) {
  const meta = (msg.metadata ?? {}) as {
    connected_questions?: Array<{ question_id: string; label: string; rationale: string | null }>;
  };
  const connected = meta.connected_questions ?? [];

  // Split body into header paragraph and bullet lines.
  const lines = msg.message_body.split("\n");
  const bodyText = lines.filter((l) => !l.trim().startsWith("•")).join("\n").trim();
  const bullets = lines.filter((l) => l.trim().startsWith("•"));

  const openSection = (questionId: string) => {
    try {
      window.dispatchEvent(new CustomEvent("atlas:thread:open", { detail: { questionId } }));
      // eslint-disable-next-line no-console
      console.log("[atlas:thread:open] dispatched", { questionId });
    } catch (e) {
      console.error("[atlas:thread:open] dispatch failed", e);
    }
  };

  return (
    <div
      style={{
        background: "rgba(196,154,43,0.06)",
        border: "0.5px solid rgba(196,154,43,0.25)",
        borderRadius: 8,
        padding: "10px 12px",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <div
          aria-hidden
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "rgba(196,154,43,0.18)",
            color: GOLD,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Star size={10} />
        </div>
        <span style={{ color: "rgba(255,225,160,0.95)", fontSize: 11 }}>IRIS</span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: GOLD,
            background: "rgba(196,154,43,0.15)",
            border: "1px solid rgba(196,154,43,0.4)",
            padding: "1px 6px",
            borderRadius: 4,
            letterSpacing: "0.06em",
            marginLeft: 2,
          }}
        >
          WIN THEME ALIGNMENT
        </span>
      </div>
      <div
        style={{
          color: "rgba(255,255,255,0.75)",
          fontSize: 11,
          lineHeight: 1.7,
          whiteSpace: "pre-wrap",
        }}
      >
        {bodyText}
      </div>
      {bullets.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
          {bullets.map((b, i) => (
            <div
              key={i}
              style={{
                color: "rgba(255,255,255,0.55)",
                fontSize: 10,
                fontStyle: "italic",
                lineHeight: 1.6,
              }}
            >
              {b}
            </div>
          ))}
        </div>
      )}
      {connected.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {connected.map((c) => (
            <button
              key={c.question_id}
              onClick={() => openSection(c.question_id)}
              style={{
                background: "rgba(196,154,43,0.12)",
                border: "1px solid rgba(196,154,43,0.35)",
                color: "rgba(255,225,160,0.95)",
                fontSize: 10,
                padding: "3px 9px",
                borderRadius: 999,
                cursor: "pointer",
              }}
            >
              See {c.label} Thread →
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CrossReferenceRow({ msg, onNote }: { msg: ThreadMsg; onNote: (body: string) => void }) {
  const meta = (msg.metadata ?? {}) as {
    original_question_id?: string;
    section_name?: string;
    decision_text?: string;
    why_relevant?: string;
    original_created_at?: string;
  };
  const sectionName = meta.section_name ?? "Section";
  const decisionText = meta.decision_text ?? "";
  const whyRelevant = meta.why_relevant ?? "";
  const ago = meta.original_created_at
    ? formatDistanceToNow(new Date(meta.original_created_at), { addSuffix: true })
    : "";
  const BLUE = "#7BA7D4";

  const openSource = () => {
    if (!meta.original_question_id) return;
    try {
      window.dispatchEvent(
        new CustomEvent("atlas:thread:open", { detail: { questionId: meta.original_question_id } }),
      );
      // eslint-disable-next-line no-console
      console.log("[atlas:thread:open] dispatched", { questionId: meta.original_question_id });
    } catch (e) {
      console.error("[atlas:thread:open] dispatch failed", e);
    }
  };

  const noteThis = () => {
    if (!decisionText) return;
    onNote(`Referenced from ${sectionName}: ${decisionText}`);
  };

  return (
    <div
      style={{
        background: "rgba(74,111,165,0.07)",
        border: "0.5px solid rgba(74,111,165,0.25)",
        borderRadius: 8,
        padding: "10px 12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <div
          aria-hidden
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "rgba(74,111,165,0.18)",
            color: BLUE,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ArrowLeftRight size={10} />
        </div>
        <span style={{ color: "rgba(200,220,245,0.95)", fontSize: 11 }}>IRIS</span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: BLUE,
            background: "rgba(74,111,165,0.18)",
            border: `1px solid ${BLUE}55`,
            padding: "1px 6px",
            borderRadius: 4,
            letterSpacing: "0.06em",
            marginLeft: 2,
          }}
        >
          CROSS-REFERENCE
        </span>
      </div>
      <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 11, lineHeight: 1.6 }}>
        {msg.message_body}
      </div>

      <div
        style={{
          marginTop: 8,
          background: "rgba(255,255,255,0.04)",
          border: "0.5px solid rgba(255,255,255,0.08)",
          borderRadius: 6,
          padding: "8px 10px",
        }}
      >
        <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 9, marginBottom: 4 }}>
          {sectionName}
          {ago ? ` · ${ago}` : ""}
        </div>
        <div
          style={{
            color: "white",
            fontSize: 11,
            fontWeight: 500,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}
        >
          {decisionText}
        </div>
        {whyRelevant ? (
          <div
            style={{
              marginTop: 4,
              color: "rgba(255,255,255,0.55)",
              fontSize: 10,
              fontStyle: "italic",
            }}
          >
            {whyRelevant}
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button
          onClick={noteThis}
          style={{
            background: "transparent",
            border: `1px solid ${BLUE}66`,
            color: "rgba(200,220,245,0.95)",
            fontSize: 10,
            padding: "3px 9px",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Note this in my Thread
        </button>
        {meta.original_question_id ? (
          <button
            onClick={openSource}
            style={{
              background: `${BLUE}22`,
              border: `1px solid ${BLUE}66`,
              color: "rgba(200,220,245,0.95)",
              fontSize: 10,
              padding: "3px 9px",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Go to {sectionName} Thread →
          </button>
        ) : null}
      </div>
    </div>
  );
}
