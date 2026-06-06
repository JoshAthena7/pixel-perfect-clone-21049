// Scaffold Editor — replaces the blank section editor whenever an active
// Response Template exists on the mission. Locked headers + editable content zones.
//
// Autosave contract (GAP 1):
//   - Local state updates immediately on every keystroke.
//   - A 30s debounce timer per element flushes to the server.
//   - On blur, pending changes flush immediately.
//   - Save state is surfaced via the floating SaveIndicator.
//   - On save failure, the latest content is persisted to localStorage
//     under `draft-backup:${sectionId}:${elementId}` and a Retry CTA is
//     shown. The draft is never lost — writers can copy from localStorage
//     even after a hard refresh.

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock, CheckCircle2, Circle, AlertTriangle, RefreshCw, Check } from "lucide-react";
import {
  getResponseTemplate,
  getSectionTemplateProgress,
  updateSectionTemplateProgress,
} from "@/lib/response-template.functions";

type Props = {
  missionId: string;
  sectionId: string;
  readOnly?: boolean;
};

function countWords(text: string) {
  const t = (text ?? "").trim();
  return t ? t.split(/\s+/).length : 0;
}

const AUTOSAVE_INTERVAL_MS = 30_000;
const BACKUP_KEY = (sectionId: string, elementId: string) =>
  `draft-backup:${sectionId}:${elementId}`;

type SaveStatus = "idle" | "saving" | "saved" | "error";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s} seconds ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function ScaffoldEditor({ missionId, sectionId, readOnly }: Props) {
  const getTpl = useServerFn(getResponseTemplate);
  const getProg = useServerFn(getSectionTemplateProgress);
  const updateProg = useServerFn(updateSectionTemplateProgress);

  const { data: tplData } = useQuery({
    queryKey: ["response-template", missionId],
    queryFn: () => getTpl({ data: { missionId } }),
  });
  const { data: progData, refetch } = useQuery({
    queryKey: ["section-template-progress", sectionId],
    queryFn: () => getProg({ data: { sectionId } }),
  });

  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Autosave bookkeeping. Refs to avoid re-render churn.
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingRef = useRef<Record<string, string>>({});
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [, setNowTick] = useState(0);

  // Re-render every 15s so the "Saved · X seconds ago" indicator stays fresh.
  useEffect(() => {
    const t = setInterval(() => setNowTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  // Hydrate drafts from server (server values take precedence on first load).
  useEffect(() => {
    if (!progData?.rows) return;
    const next: Record<string, string> = {};
    for (const row of progData.rows as any[]) {
      next[row.element_id] = row.content ?? "";
    }
    setDrafts((prev) => ({ ...next, ...prev }));
  }, [progData]);

  // Cleanup pending timers on unmount, flushing any held content best-effort.
  useEffect(() => {
    return () => {
      const pending = pendingRef.current;
      for (const elementId of Object.keys(pending)) {
        try {
          updateProg({ data: { sectionId, elementId, content: pending[elementId] } });
        } catch { /* best-effort flush */ }
      }
      for (const t of Object.values(timersRef.current)) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId]);

  const elements = tplData?.elements ?? [];
  const isActive = tplData?.template?.status === "active";

  const grouped = useMemo(() => {
    const headers = elements.filter((e) => !e.parent_id);
    return headers.map((h) => ({
      header: h,
      children: elements.filter((e) => e.parent_id === h.id),
    }));
  }, [elements]);

  if (!isActive) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-sm text-muted-foreground">
        No response template configured for this mission. Writers use a free-form editor.
      </div>
    );
  }

  async function commitSave(elementId: string, content: string) {
    if (readOnly) return;
    setStatus("saving");
    setLastError(null);
    try {
      await updateProg({ data: { sectionId, elementId, content } });
      delete pendingRef.current[elementId];
      try { localStorage.removeItem(BACKUP_KEY(sectionId, elementId)); } catch { /* noop */ }
      setLastSavedAt(Date.now());
      setStatus("saved");
      refetch();
    } catch (err: any) {
      // Preserve draft locally so the writer never loses work.
      try {
        localStorage.setItem(
          BACKUP_KEY(sectionId, elementId),
          JSON.stringify({ content, ts: Date.now() }),
        );
      } catch { /* quota — best-effort */ }
      setLastError(err?.message ?? "Network error");
      setStatus("error");
    }
  }

  function scheduleAutosave(elementId: string) {
    if (timersRef.current[elementId]) clearTimeout(timersRef.current[elementId]);
    timersRef.current[elementId] = setTimeout(() => {
      const content = pendingRef.current[elementId];
      if (content === undefined) return;
      commitSave(elementId, content);
    }, AUTOSAVE_INTERVAL_MS);
  }

  function onDraftChange(elementId: string, content: string) {
    setDrafts((prev) => ({ ...prev, [elementId]: content }));
    pendingRef.current[elementId] = content;
    setStatus("idle");
    scheduleAutosave(elementId);
  }

  function onFieldBlur(elementId: string) {
    const content = pendingRef.current[elementId];
    if (content === undefined) return;
    if (timersRef.current[elementId]) {
      clearTimeout(timersRef.current[elementId]);
      delete timersRef.current[elementId];
    }
    commitSave(elementId, content);
  }

  async function retryAll() {
    const pending = { ...pendingRef.current };
    for (const elementId of Object.keys(pending)) {
      await commitSave(elementId, pending[elementId]);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-[#6366F1]/40 bg-[#6366F1]/10 px-4 py-2.5 text-[11px] uppercase tracking-[0.18em] text-[#6366F1] font-mono flex items-center gap-2">
        <Lock className="h-3 w-3" />
        Response Template · Required by client · Enforced by IRIS
        <div className="flex-1" />
        <SaveIndicator
          status={status}
          lastSavedAt={lastSavedAt}
          error={lastError}
          onRetry={retryAll}
        />
      </div>

      {grouped.map((g, i) => {
        const wl = elements.find(
          (e) =>
            !e.parent_id &&
            e.element_type === "word_limit" &&
            e.order_index > g.header.order_index &&
            e.order_index <
              (grouped[i + 1]?.header.order_index ?? Number.MAX_SAFE_INTEGER),
        );
        return (
          <HeaderBlock
            key={g.header.id}
            index={i + 1}
            header={g.header}
            children={g.children}
            wordLimit={wl?.word_limit ?? g.header.word_limit ?? null}
            drafts={drafts}
            onChange={onDraftChange}
            onBlur={onFieldBlur}
            readOnly={!!readOnly}
          />
        );
      })}

      <div className="pt-4 border-t border-white/5">
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-2">
          Additional Information (Optional)
        </div>
        <textarea
          rows={4}
          placeholder="Free-form content beyond required structure…"
          className="w-full rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-foreground focus:outline-none focus:border-white/30"
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}

function SaveIndicator({
  status, lastSavedAt, error, onRetry,
}: {
  status: SaveStatus;
  lastSavedAt: number | null;
  error: string | null;
  onRetry: () => void;
}) {
  if (status === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[10px] font-mono normal-case tracking-normal text-red-300 hover:bg-red-500/20"
        title={error ?? "Save failed"}
      >
        <AlertTriangle className="h-3 w-3" />
        Save failed — your work is preserved locally. Retry?
      </button>
    );
  }
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-mono normal-case tracking-normal text-muted-foreground">
        <RefreshCw className="h-3 w-3 animate-spin" />
        Saving…
      </span>
    );
  }
  if (status === "saved" && lastSavedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-mono normal-case tracking-normal text-emerald-400/80">
        <Check className="h-3 w-3" />
        Saved · {timeAgo(lastSavedAt)}
      </span>
    );
  }
  if (lastSavedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-mono normal-case tracking-normal text-muted-foreground">
        Last saved {timeAgo(lastSavedAt)}
      </span>
    );
  }
  return null;
}

function HeaderBlock({
  index, header, children, wordLimit, drafts, onChange, onBlur, readOnly,
}: {
  index: number;
  header: any;
  children: any[];
  wordLimit: number | null;
  drafts: Record<string, string>;
  onChange: (id: string, v: string) => void;
  onBlur: (id: string) => void;
  readOnly: boolean;
}) {
  const hasChildren = children.length > 0;
  const headerContent = drafts[header.id] ?? "";
  const headerWords = countWords(headerContent);
  const headerComplete = headerContent.trim().length > 0;

  const childrenComplete = children.every((c) => (drafts[c.id] ?? "").trim().length > 0);
  const blockComplete = hasChildren ? childrenComplete : headerComplete;

  return (
    <section className="border-l-2 border-[#6366F1]/60 pl-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-xs text-muted-foreground">{index}.</span>
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
          {header.label}
        </h3>
        <Lock className="h-3 w-3 text-[#6366F1]" />
        <div className="flex-1" />
        {blockComplete ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {!hasChildren && (
        <>
          {header.element_type === "table" ? (
            <TableEditor
              columns={header.table_columns ?? []}
              value={headerContent}
              onChange={(v) => onChange(header.id, v)}
              onBlur={() => onBlur(header.id)}
              readOnly={readOnly}
            />
          ) : (
            <textarea
              value={headerContent}
              onChange={(e) => onChange(header.id, e.target.value)}
              onBlur={() => onBlur(header.id)}
              rows={6}
              placeholder="Write here…"
              readOnly={readOnly}
              className="w-full rounded-md border border-white/10 bg-background/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-[#6366F1]/60"
            />
          )}
          {wordLimit && (
            <WordCounter current={headerWords} limit={wordLimit} />
          )}
        </>
      )}

      {hasChildren && (
        <div className="space-y-3 mt-1">
          {children.map((c, ci) => {
            const content = drafts[c.id] ?? "";
            const words = countWords(content);
            const complete = content.trim().length > 0;
            return (
              <div key={c.id} className="pl-2">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[11px] font-semibold text-foreground">
                    {index}{String.fromCharCode(97 + ci)}. {c.label}
                  </span>
                  {complete ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Circle className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
                {c.element_type === "table" ? (
                  <TableEditor
                    columns={c.table_columns ?? []}
                    value={content}
                    onChange={(v) => onChange(c.id, v)}
                    onBlur={() => onBlur(c.id)}
                    readOnly={readOnly}
                  />
                ) : (
                  <textarea
                    value={content}
                    onChange={(e) => onChange(c.id, e.target.value)}
                    onBlur={() => onBlur(c.id)}
                    rows={4}
                    placeholder="Write here…"
                    readOnly={readOnly}
                    className="w-full rounded-md border border-white/10 bg-background/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-[#6366F1]/60"
                  />
                )}
                {c.word_limit && <WordCounter current={words} limit={c.word_limit} />}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function WordCounter({ current, limit }: { current: number; limit: number }) {
  const pct = current / limit;
  const color =
    current > limit ? "text-red-400"
    : pct >= 0.9 ? "text-amber-400"
    : "text-muted-foreground";
  return (
    <div className={`mt-1 text-[10px] font-mono ${color}`}>
      Max {limit} words · Current: {current} words
      {current > limit && (
        <span className="ml-2 inline-flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> Over limit by {current - limit}
        </span>
      )}
    </div>
  );
}

function TableEditor({
  columns, value, onChange, onBlur, readOnly,
}: {
  columns: string[];
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  readOnly: boolean;
}) {
  let rows: string[][] = [];
  try { rows = value ? JSON.parse(value) : []; } catch { rows = []; }
  if (!rows.length) rows = [columns.map(() => "")];

  function commit(next: string[][]) {
    onChange(JSON.stringify(next));
  }

  return (
    <div className="overflow-hidden rounded-md border border-white/10" onBlur={onBlur}>
      <table className="w-full text-xs">
        <thead className="bg-[#6366F1]/10">
          <tr>
            {columns.map((c, i) => (
              <th key={i} className="px-2 py-1.5 text-left font-semibold text-[#6366F1] uppercase text-[10px] tracking-wider">
                {c} <Lock className="inline h-2.5 w-2.5 ml-1" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-t border-white/5">
              {columns.map((_, ci) => (
                <td key={ci} className="p-1">
                  <input
                    value={row[ci] ?? ""}
                    onChange={(e) => {
                      const next = rows.map((r, i) => i === ri ? r.map((v, j) => j === ci ? e.target.value : v) : r);
                      commit(next);
                    }}
                    readOnly={readOnly}
                    className="w-full bg-transparent px-2 py-1 text-foreground focus:outline-none focus:bg-white/[0.04]"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && (
        <button
          onClick={() => commit([...rows, columns.map(() => "")])}
          className="w-full border-t border-white/10 bg-white/[0.02] py-1.5 text-[11px] text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
        >
          + Add row
        </button>
      )}
    </div>
  );
}

// ─── Compliance Panel ────────────────────────────────────────────────────────

export function TemplateCompliancePanel({
  missionId, sectionId,
}: {
  missionId: string;
  sectionId: string;
}) {
  const getTpl = useServerFn(getResponseTemplate);
  const getProg = useServerFn(getSectionTemplateProgress);
  const { data: tplData } = useQuery({
    queryKey: ["response-template", missionId],
    queryFn: () => getTpl({ data: { missionId } }),
  });
  const { data: progData } = useQuery({
    queryKey: ["section-template-progress", sectionId],
    queryFn: () => getProg({ data: { sectionId } }),
    refetchInterval: 4000,
  });

  if (tplData?.template?.status !== "active") return null;

  const elements = (tplData?.elements ?? []).filter((e) => e.element_type !== "word_limit");
  const rows = (progData?.rows ?? []) as any[];
  const completeIds = new Set(rows.filter((r) => r.is_complete).map((r) => r.element_id));
  const complete = elements.filter((e) => completeIds.has(e.id)).length;
  const total = elements.length;
  const pct = total === 0 ? 0 : Math.round((complete / total) * 100);

  return (
    <div className="rounded-lg border border-[#6366F1]/30 bg-[#6366F1]/5 p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-[#6366F1] font-mono font-semibold mb-3">
        Template Compliance
      </div>
      <ul className="space-y-1.5 mb-3">
        {elements.map((e) => {
          const isComplete = completeIds.has(e.id);
          return (
            <li key={e.id} className="flex items-center gap-2 text-xs">
              {isComplete ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className={isComplete ? "text-foreground" : "text-muted-foreground"}>
                {e.label}
              </span>
              <span className="ml-auto text-[10px] text-muted-foreground">
                {isComplete ? "Complete" : "Empty"}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>{complete} of {total} elements complete</span>
        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-400 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="font-mono tabular-nums">{pct}%</span>
      </div>
    </div>
  );
}
