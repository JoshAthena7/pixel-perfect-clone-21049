/**
 * Sticky Notes panel — typed coordination notes with acknowledgment,
 * replies, resolution, escalation, and Slack delivery.
 *
 * Note types: decision / question / blocker / insight.
 * QUESTION + BLOCKER notes also write to atlas_notifications for routing.
 * DECISION notes broadcast to the mission_team role.
 *
 * Slack: enabled when VITE_SLACK_WEBHOOK_URL is configured. Otherwise the
 * toggle is hidden entirely (no broken state).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Pin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fireAssistEvent } from "@/lib/fireAssistEvent";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onClose: () => void;
  missionId: string;
  questionId: string | null;
  questionNumber: string | null;
  questionText: string | null;
};

type NoteType = "decision" | "question" | "blocker" | "insight";

type SeenEntry = { user_id: string; seen_at: string };

type NoteRow = {
  id: string;
  question_id: string;
  mission_id: string;
  author_id: string;
  content: string;
  note_type: NoteType;
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  seen_by: SeenEntry[];
  reply_to_note_id: string | null;
  escalation_level: number;
  slack_posted: boolean;
  created_at: string;
  author?: { display_name: string | null; email: string | null } | null;
  resolver?: { display_name: string | null; email: string | null } | null;
};

const NOTE_TYPES: {
  type: NoteType;
  label: string;
  description: string;
  color: string;
  bgSelected: string;
  borderSelected: string;
}[] = [
  {
    type: "decision",
    label: "📋 Decision",
    description: "We've decided something. This is locked.",
    color: "rgba(196,154,43,0.95)",
    bgSelected: "rgba(196,154,43,0.15)",
    borderSelected: "rgba(196,154,43,0.6)",
  },
  {
    type: "question",
    label: "❓ Question",
    description: "I need to know something before I can proceed.",
    color: "rgba(96,165,250,0.95)",
    bgSelected: "rgba(96,165,250,0.12)",
    borderSelected: "rgba(96,165,250,0.5)",
  },
  {
    type: "blocker",
    label: "🚧 Blocker",
    description: "I cannot proceed until this is resolved.",
    color: "rgba(248,113,113,0.95)",
    bgSelected: "rgba(248,113,113,0.12)",
    borderSelected: "rgba(248,113,113,0.5)",
  },
  {
    type: "insight",
    label: "💡 Insight",
    description: "FYI — something worth knowing.",
    color: "rgba(74,222,128,0.95)",
    bgSelected: "rgba(74,222,128,0.12)",
    borderSelected: "rgba(74,222,128,0.5)",
  },
];

const TYPE_BY: Record<NoteType, (typeof NOTE_TYPES)[number]> = NOTE_TYPES.reduce(
  (acc, t) => ({ ...acc, [t.type]: t }),
  {} as Record<NoteType, (typeof NOTE_TYPES)[number]>,
);

const SLACK_WEBHOOK_URL: string | undefined =
  (import.meta.env.VITE_SLACK_WEBHOOK_URL as string | undefined) || undefined;

function firstNameOf(name: string | null | undefined, email: string | null | undefined): string {
  const raw = name || email || "Someone";
  return raw.split(/[\s@]/)[0];
}

function relTime(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

function escalationState(createdAt: string) {
  const hours = (Date.now() - new Date(createdAt).getTime()) / 3_600_000;
  const h = Math.max(0, Math.round(hours));
  if (hours < 12) {
    return { label: `⏱ Awaiting response · ${h}h elapsed`, color: "rgba(255,255,255,0.45)" };
  }
  if (hours < 24) {
    return {
      label: `⚠ No response · ${h}h — your lead has been alerted`,
      color: "rgba(251,191,36,0.85)",
    };
  }
  if (hours < 48) {
    return {
      label: `🔴 ${h}h with no response — follow up with your lead directly`,
      color: "rgba(248,113,113,0.85)",
    };
  }
  return {
    label: `🔴 ${Math.round(hours / 24)}d unresolved — escalate immediately`,
    color: "rgba(248,113,113,1)",
  };
}

async function postNoteToSlack(args: {
  noteId: string;
  noteType: NoteType;
  content: string;
  questionNumber: string | null;
  questionTitle: string | null;
}) {
  if (!SLACK_WEBHOOK_URL) return;
  const typeEmoji: Record<NoteType, string> = {
    decision: "📋",
    question: "❓",
    blocker: "🚧",
    insight: "💡",
  };
  const emoji = typeEmoji[args.noteType];
  const label = args.noteType.toUpperCase();
  const qNum = args.questionNumber ?? "?";
  const title = args.questionTitle ?? "";
  const payload = {
    text: `${emoji} ATLAS · Q${qNum} · ${label}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: `${emoji} ${label} — Q${qNum}` } },
      { type: "section", text: { type: "mrkdwn", text: `*${title}*\n${args.content}` } },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `Posted in ATLAS · ${new Date().toLocaleString()}` }],
      },
      ...(args.noteType === "question" || args.noteType === "blocker"
        ? [
            {
              type: "section",
              text: { type: "mrkdwn", text: `_This note requires a response. Reply in ATLAS._` },
            },
          ]
        : []),
    ],
  };
  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("question_notes" as any)
      .update({ slack_posted: true, slack_posted_at: new Date().toISOString() } as never)
      .eq("id", args.noteId);
  } catch (err) {
    console.warn("[sticky-notes] Slack post failed (non-fatal)", err);
  }
}

export function StickyNotesPanel({
  open,
  onClose,
  missionId,
  questionId,
  questionNumber,
  questionText,
}: Props) {
  const qc = useQueryClient();
  const [selectedType, setSelectedType] = useState<NoteType | null>(null);
  const [text, setText] = useState("");
  const [shareSlack, setShareSlack] = useState(false);
  const [saving, setSaving] = useState(false);
  const [replyOpenFor, setReplyOpenFor] = useState<string | null>(null);
  const [resolveOpenFor, setResolveOpenFor] = useState<string | null>(null);
  const [isLead, setIsLead] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const queryKey = ["sticky-notes-v2", questionId];

  // Load current user + lead/admin status
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!alive) return;
      const uid = auth.user?.id ?? null;
      setMe(uid);
      if (uid) {
        const [{ data: admin }, { data: lead }] = await Promise.all([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          supabase.rpc("has_role" as any, { _user_id: uid, _role: "admin" as never }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          supabase.rpc("has_role" as any, { _user_id: uid, _role: "engagement_lead" as never }),
        ]);
        if (!alive) return;
        setIsLead(Boolean(admin) || Boolean(lead));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const { data: notes = [] } = useQuery<NoteRow[]>({
    queryKey,
    enabled: open && !!questionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("question_notes")
        .select(
          "id, question_id, mission_id, author_id, content, note_type, is_resolved, resolved_by, resolved_at, resolution_note, seen_by, reply_to_note_id, escalation_level, slack_posted, created_at, author:profiles!question_notes_author_id_fkey(display_name, email), resolver:profiles!question_notes_resolved_by_fkey(display_name, email)",
        )
        .eq("question_id", questionId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as NoteRow[];
    },
  });

  // Split parents and replies
  const { parents, repliesByParent } = useMemo(() => {
    const parents: NoteRow[] = [];
    const repliesByParent = new Map<string, NoteRow[]>();
    for (const n of notes) {
      if (n.reply_to_note_id) {
        const arr = repliesByParent.get(n.reply_to_note_id) ?? [];
        arr.push(n);
        repliesByParent.set(n.reply_to_note_id, arr);
      } else {
        parents.push(n);
      }
    }
    // sort replies oldest first
    repliesByParent.forEach((arr) =>
      arr.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    );
    return { parents, repliesByParent };
  }, [notes]);

  useEffect(() => {
    if (open && selectedType) setTimeout(() => taRef.current?.focus(), 60);
  }, [open, selectedType]);

  async function handleStick() {
    const body = text.trim();
    if (!body || !selectedType || !questionId || !me) return;
    if (body.length > 500) return;
    setSaving(true);
    try {
      const insertPayload = {
        question_id: questionId,
        mission_id: missionId,
        author_id: me,
        content: body,
        note_type: selectedType,
        is_resolved: false,
        seen_by: [],
        escalation_level: 0,
        pinned_to_slack: shareSlack && !!SLACK_WEBHOOK_URL,
      };
      const { data: inserted, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("question_notes" as any)
        .insert(insertPayload as never)
        .select(
          "id, question_id, mission_id, author_id, content, note_type, is_resolved, resolved_by, resolved_at, resolution_note, seen_by, reply_to_note_id, escalation_level, slack_posted, created_at, author:profiles!question_notes_author_id_fkey(display_name, email), resolver:profiles!question_notes_resolved_by_fkey(display_name, email)",
        )
        .single();
      if (error) throw error;
      const note = inserted as unknown as NoteRow;

      // ATC Mission Radar event
      const preview = body.length > 80 ? body.slice(0, 80) + "…" : body;
      fireAssistEvent(missionId, questionId, me, "sticky_note_posted", {
        note_id: note.id,
        note_type: selectedType,
        question_id: questionId,
        question_number: questionNumber,
        content_preview: preview,
        summary: `${firstNameOf(note.author?.display_name, note.author?.email)} ${
          selectedType === "decision"
            ? "posted a decision"
            : selectedType === "question"
              ? "asked a question"
              : selectedType === "blocker"
                ? "flagged a blocker"
                : "shared an insight"
        } on Q${questionNumber ?? "?"}`,
      }).catch(() => {});

      // Notification routing
      const messagePrefix =
        selectedType === "blocker"
          ? "🚧 BLOCKER"
          : selectedType === "question"
            ? "❓ Question"
            : selectedType === "decision"
              ? "📋 Decision"
              : "💡 Insight";
      const truncated = body.length > 100 ? body.slice(0, 100) + "..." : body;

      if (selectedType === "question" || selectedType === "blocker") {
        await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from("atlas_notifications" as any)
          .insert({
            recipient_role: "engagement_lead",
            type: selectedType === "blocker" ? "sticky_note_blocker" : "sticky_note_question",
            message: `${messagePrefix} on Q${questionNumber ?? "?"}: "${truncated}"`,
            metadata: {
              note_id: note.id,
              question_id: questionId,
              question_number: questionNumber,
              mission_id: missionId,
              note_type: selectedType,
              posted_by: me,
            },
            is_read: false,
          } as never);
      } else if (selectedType === "decision") {
        await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from("atlas_notifications" as any)
          .insert({
            recipient_role: "mission_team",
            type: "sticky_note_decision",
            message: `${messagePrefix} on Q${questionNumber ?? "?"}: "${truncated}"`,
            metadata: {
              note_id: note.id,
              question_id: questionId,
              question_number: questionNumber,
              mission_id: missionId,
              note_type: selectedType,
            },
            is_read: false,
          } as never);
      }

      if (shareSlack && SLACK_WEBHOOK_URL) {
        postNoteToSlack({
          noteId: note.id,
          noteType: selectedType,
          content: body,
          questionNumber,
          questionTitle: questionText,
        });
      }

      qc.setQueryData<NoteRow[]>(queryKey, (prev) => [note, ...(prev ?? [])]);
      qc.invalidateQueries({ queryKey: ["question-note-counts", missionId] });
      qc.invalidateQueries({ queryKey: ["unanswered-notes", missionId] });

      // Reset composer
      setText("");
      setShareSlack(false);
      setSelectedType(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkSeen(note: NoteRow) {
    if (!me) return;
    const already = (note.seen_by ?? []).some((s) => s.user_id === me);
    if (already) return;
    const next = [
      ...(note.seen_by ?? []),
      { user_id: me, seen_at: new Date().toISOString() },
    ];
    qc.setQueryData<NoteRow[]>(queryKey, (prev) =>
      (prev ?? []).map((n) => (n.id === note.id ? { ...n, seen_by: next } : n)),
    );
    await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("question_notes" as any)
      .update({ seen_by: next } as never)
      .eq("id", note.id);
  }

  async function handleResolve(note: NoteRow, resolutionText: string) {
    if (!me) return;
    const nowIso = new Date().toISOString();
    await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("question_notes" as any)
      .update({
        is_resolved: true,
        resolved_by: me,
        resolved_at: nowIso,
        resolution_note: resolutionText.trim() || null,
      } as never)
      .eq("id", note.id);

    await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("atlas_notifications" as any)
      .insert({
        recipient_role: "specific_user",
        recipient_id: note.author_id,
        type: "sticky_note_resolved",
        message: `✅ Your ${note.note_type} on Q${questionNumber ?? "?"} was resolved: "${
          resolutionText.trim() || "Marked as resolved"
        }"`,
        metadata: {
          note_id: note.id,
          question_id: note.question_id,
          mission_id: note.mission_id,
        },
        is_read: false,
      } as never);

    fireAssistEvent(missionId, note.question_id, me, "sticky_note_posted", {
      event_subtype: "resolved",
      note_id: note.id,
      note_type: note.note_type,
      question_number: questionNumber,
      summary: `Resolved a ${note.note_type} note on Q${questionNumber ?? "?"}`,
    }).catch(() => {});

    setResolveOpenFor(null);
    qc.invalidateQueries({ queryKey });
    qc.invalidateQueries({ queryKey: ["question-note-counts", missionId] });
    qc.invalidateQueries({ queryKey: ["unanswered-notes", missionId] });
  }

  async function handleReply(parent: NoteRow, replyText: string) {
    if (!me || !replyText.trim() || !questionId) return;
    const { data: inserted, error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("question_notes" as any)
      .insert({
        question_id: questionId,
        mission_id: missionId,
        author_id: me,
        content: replyText.trim(),
        note_type: "insight",
        reply_to_note_id: parent.id,
        is_resolved: false,
        seen_by: [],
      } as never)
      .select("id")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }

    await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("atlas_notifications" as any)
      .insert({
        recipient_role: "specific_user",
        recipient_id: parent.author_id,
        type: "sticky_note_reply",
        message: `💬 Reply to your ${parent.note_type} on Q${questionNumber ?? "?"}: "${replyText
          .trim()
          .slice(0, 80)}"`,
        metadata: {
          reply_id: (inserted as unknown as { id: string }).id,
          parent_note_id: parent.id,
          question_id: questionId,
          mission_id: missionId,
        },
        is_read: false,
      } as never);

    setReplyOpenFor(null);
    qc.invalidateQueries({ queryKey });
  }

  if (!open) return null;

  const titleTrim = (questionText ?? "").length > 35
    ? (questionText ?? "").slice(0, 35) + "…"
    : (questionText ?? "");

  const charCount = text.length;
  const charColor =
    charCount > 480 ? "#f87171" : charCount > 400 ? "#fbbf24" : "rgba(255,255,255,0.4)";
  const canPost =
    !!selectedType && !!text.trim() && text.length <= 500 && !saving && !!questionId && !!me;

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "transparent", zIndex: 49 }}
      />
      <aside
        style={{
          position: "fixed",
          top: 56,
          right: 0,
          bottom: 0,
          width: 400,
          background: "#060e1a",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "-8px 0 24px rgba(0,0,0,0.4)",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          animation: "stickySlideIn 180ms ease-out",
        }}
      >
        <style>{`
          @keyframes stickySlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        `}</style>

        {/* HEADER */}
        <div
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "white", fontSize: 13, fontWeight: 500 }}>📌 Sticky Notes</div>
            <div
              style={{
                color: "rgba(255,255,255,0.5)",
                fontSize: 10,
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={questionText ?? ""}
            >
              {questionNumber ? `Q${questionNumber} · ` : ""}
              {titleTrim}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.6)",
              cursor: "pointer",
              padding: 4,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* COMPOSER */}
        <div
          style={{
            padding: 12,
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "#050d18",
          }}
        >
          {/* Type pills */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {NOTE_TYPES.map((t) => {
              const active = selectedType === t.type;
              return (
                <button
                  key={t.type}
                  onClick={() => setSelectedType(t.type)}
                  style={{
                    height: 28,
                    fontSize: 11,
                    fontWeight: 500,
                    borderRadius: 14,
                    cursor: "pointer",
                    background: active ? t.bgSelected : "rgba(255,255,255,0.04)",
                    border: `1px solid ${active ? t.borderSelected : "rgba(255,255,255,0.1)"}`,
                    color: active ? t.color : "rgba(255,255,255,0.55)",
                    transition: "all 120ms ease",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          {selectedType && (
            <div
              style={{
                marginTop: 6,
                fontSize: 9,
                fontStyle: "italic",
                color: "rgba(255,255,255,0.45)",
              }}
            >
              {TYPE_BY[selectedType].description}
            </div>
          )}

          {/* Textarea */}
          <div style={{ marginTop: 10, position: "relative" }}>
            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 500))}
              rows={4}
              disabled={!selectedType}
              placeholder="Type your note..."
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 4,
                padding: 10,
                color: "white",
                fontSize: 12,
                lineHeight: 1.5,
                resize: "none",
                outline: "none",
                boxSizing: "border-box",
                opacity: selectedType ? 1 : 0.4,
                pointerEvents: selectedType ? "auto" : "none",
                fontFamily: "inherit",
              }}
            />
            {charCount > 0 && (
              <div
                style={{
                  position: "absolute",
                  bottom: 6,
                  right: 8,
                  fontSize: 9,
                  color: charColor,
                  pointerEvents: "none",
                }}
              >
                {charCount}/500
              </div>
            )}
          </div>

          {/* Action row */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 10,
            }}
          >
            {SLACK_WEBHOOK_URL ? (
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={shareSlack}
                  onChange={(e) => setShareSlack(e.target.checked)}
                  style={{ width: 12, height: 12, cursor: "pointer" }}
                />
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.55)" }}>
                  Share to Slack
                </span>
                {shareSlack && (
                  <span
                    style={{
                      fontSize: 10,
                      color: "rgba(74,222,128,0.9)",
                      fontWeight: 700,
                    }}
                  >
                    #
                  </span>
                )}
              </label>
            ) : (
              <span />
            )}

            <button
              onClick={handleStick}
              disabled={!canPost}
              style={{
                background: "#C49A2B",
                color: "white",
                border: "none",
                borderRadius: 4,
                padding: "6px 14px",
                fontSize: 11,
                fontWeight: 600,
                cursor: canPost ? "pointer" : "not-allowed",
                opacity: canPost ? 1 : 0.5,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Pin size={11} />
              Stick It
            </button>
          </div>
        </div>

        {/* NOTES LIST */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 12,
            background: "#060e1a",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {parents.length === 0 ? (
            <div
              style={{
                margin: "auto",
                textAlign: "center",
                color: "rgba(255,255,255,0.35)",
                fontSize: 12,
                fontStyle: "italic",
                padding: 24,
              }}
            >
              No notes yet. Pick a type above to leave the first.
            </div>
          ) : (
            parents.map((n) => (
              <NoteCard
                key={n.id}
                note={n}
                replies={repliesByParent.get(n.id) ?? []}
                me={me}
                isLead={isLead}
                onMarkSeen={() => handleMarkSeen(n)}
                onOpenReply={() =>
                  setReplyOpenFor((cur) => (cur === n.id ? null : n.id))
                }
                onCloseReply={() => setReplyOpenFor(null)}
                onSubmitReply={(t) => handleReply(n, t)}
                replyOpen={replyOpenFor === n.id}
                onOpenResolve={() =>
                  setResolveOpenFor((cur) => (cur === n.id ? null : n.id))
                }
                onCloseResolve={() => setResolveOpenFor(null)}
                onSubmitResolve={(t) => handleResolve(n, t)}
                resolveOpen={resolveOpenFor === n.id}
              />
            ))
          )}
        </div>
      </aside>
    </>
  );
}

function NoteCard(props: {
  note: NoteRow;
  replies: NoteRow[];
  me: string | null;
  isLead: boolean;
  onMarkSeen: () => void;
  onOpenReply: () => void;
  onCloseReply: () => void;
  onSubmitReply: (t: string) => void;
  replyOpen: boolean;
  onOpenResolve: () => void;
  onCloseResolve: () => void;
  onSubmitResolve: (t: string) => void;
  resolveOpen: boolean;
}) {
  const {
    note,
    replies,
    me,
    isLead,
    onMarkSeen,
    onOpenReply,
    onCloseReply,
    onSubmitReply,
    replyOpen,
    onOpenResolve,
    onCloseResolve,
    onSubmitResolve,
    resolveOpen,
  } = props;
  const t = TYPE_BY[note.note_type];
  const seenCount = (note.seen_by ?? []).length;
  const alreadySeen = !!me && (note.seen_by ?? []).some((s) => s.user_id === me);
  const showEsc =
    !note.is_resolved && (note.note_type === "question" || note.note_type === "blocker");
  const esc = showEsc ? escalationState(note.created_at) : null;
  const authorName = firstNameOf(note.author?.display_name, note.author?.email);
  const resolverName = note.resolver
    ? firstNameOf(note.resolver.display_name, note.resolver.email)
    : null;

  const [replyText, setReplyText] = useState("");
  const [resolveText, setResolveText] = useState("");

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        borderLeft: `3px solid ${t.color}`,
        borderRadius: 4,
        padding: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
        }}
      >
        <span
          style={{
            color: t.color,
            fontSize: 8,
            fontWeight: 600,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          {t.label}
        </span>
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 9 }}>{authorName}</span>
          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 8 }}>
            {relTime(note.created_at)}
          </span>
        </span>
      </div>

      <div
        style={{
          marginTop: 6,
          color: "white",
          fontSize: 12,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {note.content}
      </div>

      {/* Status row */}
      {note.is_resolved && (
        <div style={{ marginTop: 8 }}>
          <div style={{ color: "rgba(74,222,128,0.95)", fontSize: 9 }}>
            ✅ Resolved {resolverName ? `by ${resolverName} · ` : "· "}
            {note.resolved_at ? relTime(note.resolved_at) : ""}
          </div>
          {note.resolution_note && (
            <div
              style={{
                marginTop: 4,
                color: "rgba(255,255,255,0.55)",
                fontSize: 9,
                fontStyle: "italic",
              }}
            >
              "{note.resolution_note}"
            </div>
          )}
        </div>
      )}

      {esc && (
        <div
          style={{
            marginTop: 6,
            fontSize: 8,
            fontStyle: "italic",
            color: esc.color,
          }}
        >
          {esc.label}
        </div>
      )}

      {seenCount > 0 && (
        <div style={{ marginTop: 6, fontSize: 8, color: "rgba(255,255,255,0.35)" }}>
          Seen by {seenCount} {seenCount === 1 ? "person" : "people"}
        </div>
      )}

      {note.slack_posted && (
        <div style={{ marginTop: 4, fontSize: 8, color: "rgba(255,255,255,0.4)" }}>
          Posted to Slack ✓
        </div>
      )}

      {/* Action row */}
      <div
        style={{
          marginTop: 8,
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {!alreadySeen && (
          <button
            onClick={onMarkSeen}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontSize: 9,
              color: "rgba(255,255,255,0.55)",
            }}
          >
            ✓ Mark Seen
          </button>
        )}
        <button
          onClick={onOpenReply}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontSize: 9,
            color: "rgba(255,255,255,0.55)",
          }}
        >
          💬 Reply
        </button>
        {isLead &&
          !note.is_resolved &&
          (note.note_type === "question" || note.note_type === "blocker") && (
            <button
              onClick={onOpenResolve}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontSize: 9,
                color: "rgba(74,222,128,0.9)",
              }}
            >
              ✅ Resolve
            </button>
          )}
      </div>

      {/* Inline reply form */}
      {replyOpen && (
        <div
          style={{
            marginTop: 8,
            padding: 8,
            background: "rgba(255,255,255,0.02)",
            borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
            Replying to {authorName}'s {note.note_type} note
          </div>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value.slice(0, 500))}
            rows={2}
            style={{
              width: "100%",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 4,
              padding: 8,
              color: "white",
              fontSize: 11,
              resize: "none",
              outline: "none",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
            placeholder="Reply..."
          />
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 6,
              marginTop: 6,
            }}
          >
            <button
              onClick={onCloseReply}
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 4,
                padding: "4px 10px",
                fontSize: 10,
                color: "rgba(255,255,255,0.55)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (replyText.trim()) onSubmitReply(replyText);
                setReplyText("");
              }}
              disabled={!replyText.trim()}
              style={{
                background: "#C49A2B",
                color: "white",
                border: "none",
                borderRadius: 4,
                padding: "4px 12px",
                fontSize: 10,
                fontWeight: 600,
                cursor: replyText.trim() ? "pointer" : "not-allowed",
                opacity: replyText.trim() ? 1 : 0.5,
              }}
            >
              Reply
            </button>
          </div>
        </div>
      )}

      {/* Inline resolve form */}
      {resolveOpen && (
        <div
          style={{
            marginTop: 8,
            padding: 8,
            background: "rgba(74,222,128,0.05)",
            borderRadius: 4,
            border: "1px solid rgba(74,222,128,0.15)",
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: "rgba(74,222,128,0.85)",
              marginBottom: 4,
            }}
          >
            Resolution note (optional)
          </div>
          <textarea
            value={resolveText}
            onChange={(e) => setResolveText(e.target.value.slice(0, 500))}
            rows={2}
            style={{
              width: "100%",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 4,
              padding: 8,
              color: "white",
              fontSize: 11,
              resize: "none",
              outline: "none",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
            placeholder="How was this resolved?"
          />
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 6,
              marginTop: 6,
            }}
          >
            <button
              onClick={onCloseResolve}
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 4,
                padding: "4px 10px",
                fontSize: 10,
                color: "rgba(255,255,255,0.55)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onSubmitResolve(resolveText);
                setResolveText("");
              }}
              style={{
                background: "rgba(74,222,128,0.85)",
                color: "#0a0a0a",
                border: "none",
                borderRadius: 4,
                padding: "4px 12px",
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Mark Resolved
            </button>
          </div>
        </div>
      )}

      {/* Replies */}
      {replies.length > 0 && (
        <div
          style={{
            marginTop: 10,
            paddingLeft: 12,
            borderLeft: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {replies.map((r) => (
            <div key={r.id}>
              <div
                style={{
                  fontSize: 9,
                  color: "rgba(255,255,255,0.5)",
                  marginBottom: 2,
                }}
              >
                {firstNameOf(r.author?.display_name, r.author?.email)} ·{" "}
                <span style={{ color: "rgba(255,255,255,0.35)" }}>
                  {relTime(r.created_at)}
                </span>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.85)",
                  lineHeight: 1.4,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {r.content}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
