import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { X, ExternalLink, Pin, ArrowLeft, Flag, MessageSquare, Compass } from "lucide-react";
import { getWriterDrillDown, getWriterIrisSentence, type WriterQuestionRow } from "@/lib/writer-drilldown.functions";
import { fireAssistEvent } from "@/lib/fireAssistEvent";
import { toast } from "sonner";
import { WriterDrawerNoQuestions, StickyNotesEmptyCard } from "./AtcEmptyStates";

const GOLD = "#c9a84c";

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}
function relTime(iso: string | null | undefined) {
  if (!iso) return "Never";
  const h = (Date.now() - new Date(iso).getTime()) / 3600_000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
function firstNameOf(s: string) { return s.split(/[\s@]/)[0] || s; }

// Status border color for question rows.
function statusBorderColor(q: WriterQuestionRow): string {
  if (q.healthStatus === "at_risk") return "#ef4444";
  if (q.status === "finalized") return "#22c55e";
  if (q.status === "in_review") return "#3b82f6";
  if (q.status === "active") return GOLD;
  return "#475569";
}

// Live status pill text + color (matches Team Pulse logic).
function liveBadge(totals: { total: number; active: number; finalized: number; atRisk: number }, hoursSinceActivity: number | null) {
  const idle = totals.total > 0 && totals.active > 0 && (hoursSinceActivity == null || hoursSinceActivity > 8);
  if (totals.total === 0) return { label: "— Unassigned", color: "#94a3b8" };
  if (totals.atRisk > 0) return { label: "⚠ At Risk", color: "#ef4444" };
  if (idle) return { label: "● Idle", color: "#f59e0b" };
  if (totals.finalized > 0) return { label: "✓ Active", color: "#22c55e" };
  return { label: "● Active", color: "#22c55e" };
}

export type WriterDrawerTarget = {
  userId: string;
  name: string;
  role: string;
  hoursSinceActivity: number | null;
  lastActivity: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  target: WriterDrawerTarget | null;
  missionId: string;
  missionName: string;
  daysToDeadline: number | null;
  senderFirstName: string;
  onNudge: (writerId: string) => void;
  onOpenFlightDeck: (writerId: string, questionId?: string) => void;
};

export function WriterDrawer({
  open, onClose, target, missionId, missionName, daysToDeadline,
  senderFirstName, onNudge, onOpenFlightDeck,
}: Props) {
  const [notesForQ, setNotesForQ] = useState<{ id: string; number: string | null; title: string } | null>(null);
  const [flagging, setFlagging] = useState(false);

  const fetchDrill = useServerFn(getWriterDrillDown);
  const fetchIris = useServerFn(getWriterIrisSentence);

  const drillQ = useQuery({
    queryKey: ["writer-drill", missionId, target?.userId],
    enabled: open && !!target?.userId,
    queryFn: () => fetchDrill({ data: { missionId, writerId: target!.userId } }),
  });

  const totals = drillQ.data?.totals ?? { total: 0, finalized: 0, active: 0, atRisk: 0 };

  const irisQ = useQuery({
    queryKey: ["writer-iris", missionId, target?.userId, totals.total, totals.atRisk, totals.finalized, totals.active],
    enabled: open && !!target?.userId && !!drillQ.data,
    staleTime: 5 * 60_000,
    queryFn: () => fetchIris({
      data: {
        missionId,
        writerName: target!.name,
        total: totals.total,
        finalized: totals.finalized,
        active: totals.active,
        atRisk: totals.atRisk,
        lastActivityRel: relTime(target!.lastActivity),
        daysToDeadline,
      },
    }),
  });

  // Fire writer_reviewed when drawer opens for a new writer.
  useEffect(() => {
    if (!open || !target) return;
    fireAssistEvent(missionId, null, null, "writer_reviewed", {
      writer_id: target.userId,
      writer_name: target.name,
      mission_name: missionName,
    });
    // Only when target changes / drawer opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target?.userId]);

  // ESC handling — nested overlay first, then drawer.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (notesForQ) { setNotesForQ(null); return; }
      onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, notesForQ, onClose]);

  async function handleFlag() {
    if (!target || flagging) return;
    setFlagging(true);
    try {
      await fireAssistEvent(missionId, null, null, "writer_flagged", {
        writer_id: target.userId,
        writer_name: target.name,
        reason: "Flagged for review from ATC drill-down",
      });
      toast.success("Flagged. Visible in Mission Radar.", {
        style: { background: "#1a1408", border: `1px solid ${GOLD}`, color: GOLD },
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to flag");
    } finally {
      setFlagging(false);
    }
  }

  if (!target) return null;

  const live = liveBadge(totals, target.hoursSinceActivity);
  const writerFirst = firstNameOf(target.name);

  return (
    <>
      {/* Backdrop click-catcher (transparent — keeps ATC visible) */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={`fixed top-0 right-0 h-screen z-50 flex flex-col transition-transform duration-200 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
        style={{
          width: 480,
          background: "#080f1c",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.4)",
        }}
        role="dialog"
        aria-label={`Writer drill-down: ${target.name}`}
      >
        {/* Header */}
        <div
          className="shrink-0 px-4 py-3 flex flex-col gap-2"
          style={{ background: "#050d18", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0 text-white"
              style={{ background: "rgba(255,255,255,0.08)", border: `2px solid ${live.color}` }}
            >
              {initials(target.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold text-white truncate">{target.name}</div>
              <span className="inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/55 uppercase tracking-wide">
                {target.role || "Member"}
              </span>
            </div>
            <div className="text-right shrink-0">
              <div
                className="text-[11px] font-semibold px-2 py-0.5 rounded"
                style={{ background: `${live.color}22`, color: live.color, border: `1px solid ${live.color}55` }}
              >
                {live.label}
              </div>
              <div className="text-[10px] text-white/40 mt-1" style={{ fontFamily: "'Courier New', monospace" }}>
                Last seen {relTime(target.lastActivity)}
              </div>
            </div>
            <button
              onClick={onClose}
              className="ml-1 p-1 rounded hover:bg-white/5 text-white/55"
              aria-label="Close drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="min-h-[16px]">
            {irisQ.isLoading || !irisQ.data ? (
              <div className="h-3 w-3/4 rounded bg-white/5 animate-pulse" />
            ) : irisQ.data.sentence ? (
              <div className="text-[11px] italic" style={{ color: GOLD }}>
                {irisQ.data.sentence}
              </div>
            ) : (
              <div className="text-[11px] italic text-white/30">IRIS is quiet for now.</div>
            )}
          </div>
        </div>

        {/* Body: question list or nested notes overlay */}
        <div className="flex-1 min-h-0 relative">
          <div className="absolute inset-0 overflow-y-auto">
            {drillQ.isLoading ? (
              <div className="p-6 text-center text-xs text-white/40">Loading questions…</div>
            ) : drillQ.data && drillQ.data.questions.length === 0 ? (
              <div className="p-6 text-center text-xs text-white/40">
                No questions assigned to {writerFirst}.
              </div>
            ) : (
              <ul>
                {(drillQ.data?.questions ?? []).map((q) => (
                  <QuestionRow
                    key={q.questionId}
                    q={q}
                    onOpenFlightDeck={() => onOpenFlightDeck(target.userId, q.questionId)}
                    onOpenNotes={() => setNotesForQ({ id: q.questionId, number: q.questionNumber, title: q.questionTitle })}
                  />
                ))}
              </ul>
            )}
          </div>

          {notesForQ && (
            <NotesOverlay
              missionId={missionId}
              question={notesForQ}
              onBack={() => setNotesForQ(null)}
            />
          )}
        </div>

        {/* Action bar */}
        <div
          className="shrink-0 flex items-center gap-2 px-3"
          style={{
            height: 56,
            background: "#050d18",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            padding: "12px 16px",
          }}
        >
          <button
            onClick={() => { onClose(); setTimeout(() => onNudge(target.userId), 220); }}
            className="flex-1 text-[11px] py-1.5 rounded border border-white/15 text-white hover:bg-white/5 inline-flex items-center justify-center gap-1.5"
          >
            <MessageSquare className="w-3 h-3" /> Nudge {writerFirst}
          </button>
          <button
            onClick={() => onOpenFlightDeck(target.userId)}
            className="flex-1 text-[11px] py-1.5 rounded border border-white/15 text-white/85 hover:bg-white/5 inline-flex items-center justify-center gap-1.5"
          >
            <Compass className="w-3 h-3" /> Flight Deck
          </button>
          <button
            onClick={handleFlag}
            disabled={flagging}
            className="flex-1 text-[11px] py-1.5 rounded border inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            style={{ borderColor: "rgba(245,158,11,0.5)", color: "#fbbf24", background: "rgba(245,158,11,0.05)" }}
          >
            <Flag className="w-3 h-3" /> Flag for Review
          </button>
        </div>
      </aside>
    </>
  );
}

// =================== Question row ===================
function QuestionRow({
  q, onOpenFlightDeck, onOpenNotes,
}: { q: WriterQuestionRow; onOpenFlightDeck: () => void; onOpenNotes: () => void }) {
  const border = statusBorderColor(q);
  const statusLabel =
    q.status === "finalized" ? "Finalized" :
    q.status === "in_review" ? "In Review" :
    q.status === "active"    ? "Active"    :
    q.status === "not_started" ? "Not Started" : (q.status ?? "—");
  const statusColor =
    q.status === "finalized" ? "#22c55e" :
    q.status === "in_review" ? "#3b82f6" :
    q.status === "active"    ? GOLD :
    "#94a3b8";

  return (
    <li
      className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors"
      style={{ minHeight: 72, borderLeft: `3px solid ${border}` }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-semibold font-mono shrink-0" style={{ color: GOLD }}>
            Q{q.questionNumber ?? "?"}
          </span>
          <span className="text-[12px] text-white truncate">{q.questionTitle.slice(0, 55)}{q.questionTitle.length > 55 ? "…" : ""}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-white/55 flex-wrap">
          <span
            className="px-1.5 py-0.5 rounded text-[9px] font-semibold"
            style={{ background: `${statusColor}22`, color: statusColor }}
          >
            {statusLabel}
          </span>
          {q.writerConfidence && <span>· Confidence: <span className="text-white/75">{q.writerConfidence}</span></span>}
          {q.internalDueDate && (
            <span style={{ fontFamily: "'Courier New', monospace" }}>· Due {q.internalDueDate}</span>
          )}
        </div>
        <div className="text-[10px] text-white/40 italic mt-0.5 truncate">
          {q.lastCheckIn
            ? `Checked in ${relTime(q.lastCheckIn.at)}: ${q.lastCheckIn.status ?? "—"}${q.lastCheckIn.note ? ` — ${q.lastCheckIn.note}` : ""}`
            : "No check-ins yet"}
        </div>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button
          onClick={onOpenFlightDeck}
          className="p-1 rounded hover:bg-white/10 text-white/55 hover:text-white"
          title="Open in Flight Deck (new tab)"
          aria-label="Open in Flight Deck"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onOpenNotes}
          className="p-1 rounded hover:bg-white/10 text-white/55 hover:text-white"
          title="View sticky notes"
          aria-label="View notes"
        >
          <Pin className="w-3.5 h-3.5" />
        </button>
      </div>
    </li>
  );
}

// =================== Read-only sticky notes overlay ===================
const NOTE_COLORS = ["#FFF176", "#FFD54F", "#A5D6A7", "#80DEEA"];
function rotationFor(createdAt: string): number {
  const ms = new Date(createdAt).getTime();
  return (ms % 5) - 2;
}

function NotesOverlay({
  missionId, question, onBack,
}: { missionId: string; question: { id: string; number: string | null; title: string }; onBack: () => void }) {
  const notesQ = useQuery({
    queryKey: ["drawer-notes", question.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("question_notes")
        .select("id, content, created_at, author:profiles!question_notes_author_id_fkey(display_name, email)")
        .eq("question_id", question.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div
      className="absolute inset-0 z-10 flex flex-col animate-in slide-in-from-right duration-200"
      style={{ background: "#080f1c" }}
    >
      <div
        className="shrink-0 flex items-center gap-2 px-4 py-2"
        style={{ background: "#050d18", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button
          onClick={onBack}
          className="text-[11px] text-white/65 hover:text-white inline-flex items-center gap-1 px-1.5 py-1 rounded hover:bg-white/5"
        >
          <ArrowLeft className="w-3 h-3" /> Questions
        </button>
        <div className="ml-2 min-w-0 flex items-center gap-2">
          <span className="text-[11px] font-mono shrink-0" style={{ color: GOLD }}>Q{question.number ?? "?"}</span>
          <span className="text-[12px] text-white/85 truncate">{question.title.slice(0, 40)}{question.title.length > 40 ? "…" : ""}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4" style={{ background: "#080f1c" }}>
        {notesQ.isLoading ? (
          <div className="text-xs text-white/40 text-center py-6">Loading notes…</div>
        ) : (notesQ.data ?? []).length === 0 ? (
          <div className="text-xs text-white/40 text-center py-10">
            No sticky notes pinned to this question yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {(notesQ.data ?? []).map((n: any, idx: number) => {
              const color = NOTE_COLORS[idx % NOTE_COLORS.length];
              const rot = rotationFor(n.created_at);
              const author = (n.author?.display_name || n.author?.email || "Someone").split(/[\s@]/)[0];
              return (
                <div
                  key={n.id}
                  className="p-3 shadow-md text-black"
                  style={{
                    background: color,
                    transform: `rotate(${rot}deg)`,
                    fontFamily: "Georgia, serif",
                    minHeight: 90,
                  }}
                >
                  <div className="text-[13px] leading-snug whitespace-pre-wrap">{n.content}</div>
                  <div className="mt-2 text-[10px] text-black/55 flex items-center justify-between">
                    <span>— {author}</span>
                    <span style={{ fontFamily: "'Courier New', monospace" }}>{relTime(n.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 py-2 text-[10px] text-white/40 italic text-center border-t border-white/[0.06]" style={{ background: "#050d18" }}>
        Post notes from the Flight Deck.
      </div>
    </div>
  );
}
