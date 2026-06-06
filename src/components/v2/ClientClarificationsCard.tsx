import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listClarifications,
  createClarification,
  updateClarification,
  deleteClarification,
  type Clarification,
  type ClarificationStatus,
} from "@/lib/client-clarifications.functions";
import { ChevronDown, ChevronRight, Plus, Trash2, AlertTriangle, MessageSquareQuote } from "lucide-react";
import { toast } from "sonner";

type Props = {
  missionId: string;
  qaDeadline: string | null; // ISO date string
  canManage: boolean;
};

const STATUS_LABEL: Record<ClarificationStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  answered: "Answered",
  withdrawn: "Withdrawn",
};

const STATUS_STYLES: Record<ClarificationStatus, { bg: string; border: string; color: string }> = {
  draft: { bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.30)", color: "#cbd5e1" },
  submitted: { bg: "rgba(59,127,255,0.12)", border: "rgba(59,127,255,0.35)", color: "#7da8ff" },
  answered: { bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.35)", color: "#86efac" },
  withdrawn: { bg: "rgba(244,114,114,0.10)", border: "rgba(244,114,114,0.30)", color: "#fca5a5" },
};

function fmtShort(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((t - today.getTime()) / (24 * 60 * 60 * 1000));
}

export function ClientClarificationsCard({ missionId, qaDeadline, canManage }: Props) {
  const qc = useQueryClient();
  const listFn = useServerFn(listClarifications);
  const createFn = useServerFn(createClarification);
  const updateFn = useServerFn(updateClarification);
  const deleteFn = useServerFn(deleteClarification);

  const { data, isLoading } = useQuery({
    queryKey: ["client-clarifications", missionId],
    queryFn: () => listFn({ data: { missionId } }),
  });

  const clarifications = data?.clarifications ?? [];
  const [adding, setAdding] = useState(false);
  const [newQ, setNewQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["client-clarifications", missionId] });

  const create = useMutation({
    mutationFn: (question: string) => createFn({ data: { missionId, question } }),
    onSuccess: () => {
      setNewQ("");
      setAdding(false);
      invalidate();
      toast.success("Clarification added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: (vars: { id: string; status?: ClarificationStatus; client_response?: string }) =>
      updateFn({ data: vars }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Clarification removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const daysLeft = daysUntil(qaDeadline);
  const overdue = daysLeft !== null && daysLeft < 0;
  const unansweredPastDeadline = overdue
    ? clarifications.filter((c) => c.status !== "answered" && c.status !== "withdrawn")
    : [];
  const showIrisRisk = unansweredPastDeadline.length > 0;

  return (
    <section
      className="rounded-xl border p-5"
      style={{
        background: "rgba(255,255,255,0.02)",
        borderColor: "rgba(255,255,255,0.08)",
      }}
      aria-label="Client clarifications"
    >
      <header className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <MessageSquareQuote size={18} strokeWidth={1.5} className="text-[#7da8ff] mt-0.5 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold tracking-wide uppercase text-foreground">
              Client Clarifications
            </h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Questions submitted to the RFP issuer. Internal team questions live in Sections.
            </p>
          </div>
        </div>
        <DeadlinePill iso={qaDeadline} daysLeft={daysLeft} />
      </header>

      {showIrisRisk && (
        <div
          className="mb-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px]"
          style={{
            background: "rgba(244,114,114,0.08)",
            borderColor: "rgba(244,114,114,0.35)",
            color: "#fca5a5",
          }}
        >
          <AlertTriangle size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span>
            <strong className="font-semibold">IRIS risk flag:</strong>{" "}
            {unansweredPastDeadline.length} unanswered clarification
            {unansweredPastDeadline.length === 1 ? "" : "s"} past the Q&amp;A deadline. These may affect section content.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="py-6 text-center text-[12px] text-muted-foreground">Loading…</div>
      ) : clarifications.length === 0 && !adding ? (
        <div className="py-6 text-center text-[12px] text-muted-foreground">
          No clarification questions yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground" style={{ background: "rgba(255,255,255,0.02)" }}>
                <th className="px-3 py-2 w-10">#</th>
                <th className="px-3 py-2">Question</th>
                <th className="px-3 py-2 w-24">Submitted</th>
                <th className="px-3 py-2 w-28">Status</th>
                {canManage && <th className="px-3 py-2 w-8" />}
              </tr>
            </thead>
            <tbody>
              {clarifications.map((c) => {
                const isOpen = expanded === c.id;
                const canExpand = c.status === "answered" && !!c.client_response;
                return (
                  <Row
                    key={c.id}
                    clarification={c}
                    isOpen={isOpen}
                    canExpand={canExpand}
                    canManage={canManage}
                    onToggleExpand={() => setExpanded(isOpen ? null : c.id)}
                    onUpdate={(vars) => update.mutate({ id: c.id, ...vars })}
                    onDelete={() => {
                      if (confirm(`Remove clarification #${c.number}?`)) remove.mutate(c.id);
                    }}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <div className="mt-3">
          {adding ? (
            <div className="rounded-lg border p-3" style={{ borderColor: "rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.02)" }}>
              <textarea
                value={newQ}
                onChange={(e) => setNewQ(e.target.value)}
                placeholder="Type the clarification question to send to the client…"
                rows={2}
                className="w-full resize-none rounded-md border bg-transparent px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1"
                style={{ borderColor: "rgba(255,255,255,0.12)" }}
                autoFocus
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setAdding(false); setNewQ(""); }}
                  className="rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => create.mutate(newQ)}
                  disabled={create.isPending || newQ.trim().length < 3}
                  className="rounded-md bg-[#3b7fff] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-[#5293ff] disabled:opacity-50"
                >
                  {create.isPending ? "Adding…" : "Add clarification"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:border-[#3b7fff]/40 hover:text-foreground transition-colors"
              style={{ borderColor: "rgba(255,255,255,0.15)" }}
            >
              <Plus size={13} strokeWidth={2} /> Add clarification question
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function DeadlinePill({ iso, daysLeft }: { iso: string | null; daysLeft: number | null }) {
  if (!iso) {
    return (
      <span className="shrink-0 text-[11px] text-muted-foreground">
        No Q&amp;A deadline set
      </span>
    );
  }
  let tone: { bg: string; color: string; border: string };
  let label: string;
  if (daysLeft === null) {
    tone = { bg: "rgba(148,163,184,0.10)", color: "#cbd5e1", border: "rgba(148,163,184,0.30)" };
    label = fmtShort(iso);
  } else if (daysLeft < 0) {
    tone = { bg: "rgba(244,114,114,0.10)", color: "#fca5a5", border: "rgba(244,114,114,0.35)" };
    label = `${fmtShort(iso)} · ${Math.abs(daysLeft)}d overdue`;
  } else if (daysLeft <= 3) {
    tone = { bg: "rgba(245,158,11,0.10)", color: "#fcd34d", border: "rgba(245,158,11,0.35)" };
    label = `${fmtShort(iso)} · ${daysLeft}d remaining`;
  } else {
    tone = { bg: "rgba(34,197,94,0.10)", color: "#86efac", border: "rgba(34,197,94,0.30)" };
    label = `${fmtShort(iso)} · ${daysLeft}d remaining`;
  }
  return (
    <span
      className="shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]"
      style={{ background: tone.bg, color: tone.color, borderColor: tone.border }}
      title="Deadline for clarification questions"
    >
      {label}
    </span>
  );
}

function Row({
  clarification: c,
  isOpen,
  canExpand,
  canManage,
  onToggleExpand,
  onUpdate,
  onDelete,
}: {
  clarification: Clarification;
  isOpen: boolean;
  canExpand: boolean;
  canManage: boolean;
  onToggleExpand: () => void;
  onUpdate: (vars: { status?: ClarificationStatus; client_response?: string }) => void;
  onDelete: () => void;
}) {
  const [editingResponse, setEditingResponse] = useState(false);
  const [responseDraft, setResponseDraft] = useState(c.client_response ?? "");
  const styles = STATUS_STYLES[c.status];

  return (
    <>
      <tr className="border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
        <td className="px-3 py-2.5 text-muted-foreground font-mono text-[11px] align-top">{c.number}</td>
        <td className="px-3 py-2.5 align-top">
          <button
            type="button"
            onClick={canExpand ? onToggleExpand : undefined}
            className={`flex items-start gap-1.5 text-left text-foreground ${canExpand ? "hover:text-[#7da8ff]" : "cursor-default"}`}
          >
            {canExpand && (
              isOpen ? <ChevronDown size={13} className="mt-0.5 shrink-0" /> : <ChevronRight size={13} className="mt-0.5 shrink-0" />
            )}
            <span className="leading-snug">{c.question}</span>
          </button>
        </td>
        <td className="px-3 py-2.5 text-muted-foreground align-top whitespace-nowrap">
          {fmtShort(c.submitted_at)}
        </td>
        <td className="px-3 py-2.5 align-top">
          {canManage ? (
            <select
              value={c.status}
              onChange={(e) => onUpdate({ status: e.target.value as ClarificationStatus })}
              className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] cursor-pointer focus:outline-none"
              style={{ background: styles.bg, color: styles.color, borderColor: styles.border }}
            >
              {(Object.keys(STATUS_LABEL) as ClarificationStatus[]).map((s) => (
                <option key={s} value={s} className="bg-[#0a0e1a] text-foreground">
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          ) : (
            <span
              className="inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]"
              style={{ background: styles.bg, color: styles.color, borderColor: styles.border }}
            >
              {STATUS_LABEL[c.status]}
            </span>
          )}
        </td>
        {canManage && (
          <td className="px-3 py-2.5 align-top">
            <button
              type="button"
              onClick={onDelete}
              title="Remove clarification"
              className="text-muted-foreground hover:text-[#fca5a5]"
            >
              <Trash2 size={13} strokeWidth={1.75} />
            </button>
          </td>
        )}
      </tr>
      {isOpen && (
        <tr style={{ background: "rgba(34,197,94,0.04)" }}>
          <td />
          <td colSpan={canManage ? 4 : 3} className="px-3 pb-3 pt-1">
            <div className="text-[10px] uppercase tracking-[0.12em] text-[#86efac] mb-1">
              Client response · {fmtShort(c.answered_at)}
            </div>
            {editingResponse ? (
              <div>
                <textarea
                  value={responseDraft}
                  onChange={(e) => setResponseDraft(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-md border bg-transparent px-3 py-2 text-[12px] text-foreground focus:outline-none"
                  style={{ borderColor: "rgba(255,255,255,0.12)" }}
                />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { setEditingResponse(false); setResponseDraft(c.client_response ?? ""); }}
                    className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => { onUpdate({ client_response: responseDraft }); setEditingResponse(false); }}
                    className="rounded-md bg-[#3b7fff] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white hover:bg-[#5293ff]"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-[12px] text-foreground leading-relaxed whitespace-pre-wrap">
                {c.client_response || <span className="italic text-muted-foreground">No response recorded yet.</span>}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => { setResponseDraft(c.client_response ?? ""); setEditingResponse(true); }}
                    className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-[#7da8ff] hover:text-[#a3c0ff]"
                  >
                    Edit
                  </button>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
