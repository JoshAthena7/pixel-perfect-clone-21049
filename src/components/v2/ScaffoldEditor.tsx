// Scaffold Editor — replaces the blank section editor whenever an active
// Response Template exists on the mission. Locked headers + editable content zones.

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock, CheckCircle2, Circle, AlertTriangle } from "lucide-react";
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

  // Hydrate drafts from server
  useEffect(() => {
    if (!progData?.rows) return;
    const next: Record<string, string> = {};
    for (const row of progData.rows as any[]) {
      next[row.element_id] = row.content ?? "";
    }
    setDrafts((prev) => ({ ...next, ...prev }));
  }, [progData]);

  const elements = tplData?.elements ?? [];
  const isActive = tplData?.template?.status === "active";

  // Group: top-level + nested subsections under each header
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

  async function saveDraft(elementId: string, content: string) {
    setDrafts((prev) => ({ ...prev, [elementId]: content }));
    if (readOnly) return;
    try {
      await updateProg({ data: { sectionId, elementId, content } });
      refetch();
    } catch {
      /* swallow — non-blocking auto-save */
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-[#6366F1]/40 bg-[#6366F1]/10 px-4 py-2.5 text-[11px] uppercase tracking-[0.18em] text-[#6366F1] font-mono flex items-center gap-2">
        <Lock className="h-3 w-3" />
        Response Template · Required by client · Enforced by IRIS
      </div>

      {grouped.map((g, i) => {
        // word_limit sibling appears in flat list — find one whose order_index is between this header and the next
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
            onChange={saveDraft}
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

function HeaderBlock({
  index, header, children, wordLimit, drafts, onChange, readOnly,
}: {
  index: number;
  header: any;
  children: any[];
  wordLimit: number | null;
  drafts: Record<string, string>;
  onChange: (id: string, v: string) => void;
  readOnly: boolean;
}) {
  // Header itself is a writable element (unless it has subsection children)
  const hasChildren = children.length > 0;
  const headerContent = drafts[header.id] ?? "";
  const headerWords = countWords(headerContent);
  const headerComplete = headerContent.trim().length > 0;

  // Overall completion at this block
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
              readOnly={readOnly}
            />
          ) : (
            <textarea
              value={headerContent}
              onChange={(e) => onChange(header.id, e.target.value)}
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
                    readOnly={readOnly}
                  />
                ) : (
                  <textarea
                    value={content}
                    onChange={(e) => onChange(c.id, e.target.value)}
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
  columns, value, onChange, readOnly,
}: {
  columns: string[];
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
}) {
  // Persist table content as JSON in value. Fallback to empty array.
  let rows: string[][] = [];
  try { rows = value ? JSON.parse(value) : []; } catch { rows = []; }
  if (!rows.length) rows = [columns.map(() => "")];

  function commit(next: string[][]) {
    onChange(JSON.stringify(next));
  }

  return (
    <div className="overflow-hidden rounded-md border border-white/10">
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
