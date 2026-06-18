import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Pin, Pencil } from "lucide-react";
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

type NoteRow = {
  id: string;
  question_id: string;
  mission_id: string;
  author_id: string;
  content: string;
  pinned_to_slack: boolean;
  created_at: string;
  author?: { display_name: string | null; email: string | null } | null;
};

const NOTE_COLORS = ["#FFF176", "#FFD54F", "#A5D6A7", "#80DEEA"];

function rotationFor(createdAt: string): number {
  const ms = new Date(createdAt).getTime();
  return (ms % 5) - 2; // -2..+2
}

function firstNameOf(n: NoteRow): string {
  const raw = n.author?.display_name || n.author?.email || "Someone";
  return raw.split(/[\s@]/)[0];
}

function initialOf(name: string): string {
  return (name[0] || "?").toUpperCase();
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

// TODO: wire to Slack incoming webhook URL stored in mission config
function notifySlack(qNum: string | null, firstName: string, text: string) {
  console.log(`[ATLAS] 📌 Q${qNum ?? "?"} — ${firstName}: ${text}`);
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
  const [text, setText] = useState("");
  const [pinSlack, setPinSlack] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fadeIds, setFadeIds] = useState<Set<string>>(new Set());
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const queryKey = ["sticky-notes", questionId];

  const { data: notes = [] } = useQuery<NoteRow[]>({
    queryKey,
    enabled: open && !!questionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("question_notes")
        .select("id, question_id, mission_id, author_id, content, pinned_to_slack, created_at, author:profiles!question_notes_author_id_fkey(display_name, email)")
        .eq("question_id", questionId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as NoteRow[];
    },
  });

  useEffect(() => {
    if (open) setTimeout(() => taRef.current?.focus(), 80);
  }, [open]);

  async function handleStick() {
    const body = text.trim();
    if (!body || !questionId) return;
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Not signed in");

      const { data, error } = await supabase
        .from("question_notes")
        .insert({
          question_id: questionId,
          mission_id: missionId,
          author_id: uid,
          content: body,
          pinned_to_slack: pinSlack,
        })
        .select("id, question_id, mission_id, author_id, content, pinned_to_slack, created_at, author:profiles!question_notes_author_id_fkey(display_name, email)")
        .single();
      if (error) throw error;

      const row = data as unknown as NoteRow;
      qc.setQueryData<NoteRow[]>(queryKey, (prev) => [row, ...(prev ?? [])]);
      setFadeIds((s) => new Set(s).add(row.id));
      setText("");

      if (pinSlack) {
        notifySlack(questionNumber, firstNameOf(row), body);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const titleTrim = (questionText ?? "").length > 50
    ? (questionText ?? "").slice(0, 50) + "…"
    : (questionText ?? "");

  return (
    <>
      {/* invisible click-catcher so the deck stays visible; click outside closes */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "transparent",
          zIndex: 49,
        }}
      />
      <aside
        style={{
          position: "fixed",
          top: 56,
          right: 0,
          bottom: 0,
          width: 380,
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
          @keyframes stickyFadeIn { from { opacity: 0; transform: translateY(-4px) rotate(var(--rot,0deg)); } to { opacity: 1; transform: rotate(var(--rot,0deg)); } }
        `}</style>

        {/* HEADER */}
        <div
          style={{
            padding: "12px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "white", fontSize: 14, fontWeight: 500 }}>
              📌 Sticky Notes
            </div>
            <div
              style={{
                color: "rgba(255,255,255,0.55)",
                fontSize: 11,
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

        {/* BODY */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 16,
            background: "#060e1a",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {notes.length === 0 ? (
            <div
              style={{
                margin: "auto",
                background: "#FFF9C4",
                opacity: 0.7,
                borderRadius: 2,
                padding: 20,
                width: 240,
                textAlign: "center",
                boxShadow: "2px 3px 8px rgba(0,0,0,0.35)",
                transform: "rotate(-1deg)",
              }}
            >
              <Pencil size={20} color="#aaa" />
              <div
                style={{
                  marginTop: 8,
                  fontFamily: "Georgia, serif",
                  fontStyle: "italic",
                  fontSize: 13,
                  color: "#888",
                  lineHeight: 1.4,
                }}
              >
                Nothing pinned yet. Leave the first one — a decision, a warning, a reference. It stays here forever.
              </div>
            </div>
          ) : (
            notes.map((n, i) => {
              const bg = NOTE_COLORS[i % NOTE_COLORS.length];
              const rot = rotationFor(n.created_at);
              const fname = firstNameOf(n);
              const fade = fadeIds.has(n.id);
              return (
                <div
                  key={n.id}
                  style={{
                    background: bg,
                    borderRadius: 2,
                    padding: 12,
                    boxShadow: "2px 3px 8px rgba(0,0,0,0.35)",
                    transform: `rotate(${rot}deg)`,
                    ["--rot" as never]: `${rot}deg`,
                    animation: fade ? "stickyFadeIn 200ms ease-out" : undefined,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <div
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: "#5D4037",
                        color: "white",
                        fontSize: 9,
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {initialOf(fname)}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#333" }}>{fname}</span>
                    <span style={{ color: "#666", fontSize: 10 }}>·</span>
                    <span style={{ fontSize: 10, color: "#666" }}>{relTime(n.created_at)}</span>
                  </div>
                  <div
                    style={{
                      fontFamily: "Georgia, serif",
                      fontSize: 13,
                      color: "#1a1a1a",
                      lineHeight: 1.4,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {n.content}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* INPUT */}
        <div
          style={{
            padding: 16,
            background: "#050d18",
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="What does the team need to know about this question?"
            style={{
              width: "100%",
              background: "#FFFDE7",
              border: "none",
              borderRadius: 2,
              padding: 10,
              fontFamily: "Georgia, serif",
              fontSize: 13,
              color: "#1a1a1a",
              resize: "none",
              boxShadow: "inset 0 1px 3px rgba(0,0,0,0.15)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 10,
            }}
          >
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={pinSlack}
                onChange={(e) => setPinSlack(e.target.checked)}
                style={{ width: 12, height: 12, cursor: "pointer" }}
              />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>Pin to Slack</span>
            </label>
            <button
              onClick={handleStick}
              disabled={saving || !text.trim()}
              style={{
                background: "#C49A2B",
                color: "white",
                border: "none",
                borderRadius: 4,
                padding: "6px 16px",
                fontSize: 12,
                fontWeight: 600,
                cursor: saving || !text.trim() ? "not-allowed" : "pointer",
                opacity: saving || !text.trim() ? 0.6 : 1,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Pin size={12} />
              Stick It
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
