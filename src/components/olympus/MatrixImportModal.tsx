import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { X, Upload, Loader2, FileSpreadsheet } from "lucide-react";
import { logOlympusAction } from "@/lib/audit";

const GOLD = "#C9A84C";
const NAVY = "#1F3864";

/**
 * Matrix importer (merge / upsert mode).
 *
 * Reads an Excel "Assignment Matrix" (NJ CSOC format) and uses it as the
 * source of truth for the mission's v2 questions, team members, and
 * per-question assignments.
 *
 * Columns expected on the first sheet, header rows on lines 1-2, data
 * starting on line 3:
 *   A  Line                  -> sort_order
 *   B  Section/Question      -> section
 *   C  Technical Requirement -> question_text
 *   D  Page Count            -> (ignored)
 *   E  Page Limitation       -> page_limit
 *   K  Developer             -> writer_name
 *   L  Strategic Owner       -> workstream_lead
 *   M  Lead SME              -> athena_sme_name
 *   N  Support SME           -> reviewer_name
 */

type ParsedRow = {
  line: number;
  section: string;
  question_text: string;
  page_limit: number | null;
  writer: string[];
  strategic_owner: string[];
  lead_sme: string[];
  support_sme: string[];
};

type Diff = {
  rows: ParsedRow[];
  uniqueNames: string[];
  newQuestionsCount: number;
  updatedQuestionsCount: number;
  newTeamCount: number;
  existingTeamCount: number;
  assignmentsTouched: number;
};

const CELL_PREFIX_RE = /^(signer\s*:|approver\s*:|owner\s*:)\s*/i;
const PAREN_RE = /\([^)]*\)/g;
const SPLIT_RE = /\s*[,/&]+\s*|\s+and\s+/i;

function splitNames(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  const s = String(raw).trim();
  if (!s) return [];
  const lower = s.toLowerCase();
  if (lower === "n/a" || lower === "na" || lower === "tbd" || lower === "—" || lower === "-") return [];
  return s
    .replace(PAREN_RE, " ")
    .split(SPLIT_RE)
    .map((p) => p.replace(CELL_PREFIX_RE, "").trim())
    .filter((p) => {
      if (!p) return false;
      const l = p.toLowerCase();
      return l !== "n/a" && l !== "na" && l !== "tbd";
    });
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function parseWorkbook(buffer: ArrayBuffer): ParsedRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  });
  const out: ParsedRow[] = [];
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const line = toInt(r[0]);
    const section = cellToString(r[1]);
    const question_text = cellToString(r[2]);
    if (!section && !question_text) continue;
    if (line === null && !section) continue;
    out.push({
      line: line ?? out.length + 1,
      section,
      question_text,
      page_limit: toInt(r[4]),
      writer: splitNames(r[10]),
      strategic_owner: splitNames(r[11]),
      lead_sme: splitNames(r[12]),
      support_sme: splitNames(r[13]),
    });
  }
  return out;
}

export function MatrixImportModal({
  missionId,
  onClose,
  onImported,
}: {
  missionId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [diff, setDiff] = useState<Diff | null>(null);

  async function buildDiff(rows: ParsedRow[]) {
    // Collect unique names
    const nameSet = new Set<string>();
    rows.forEach((r) => {
      [...r.writer, ...r.strategic_owner, ...r.lead_sme, ...r.support_sme].forEach((n) =>
        nameSet.add(n),
      );
    });
    const uniqueNames = Array.from(nameSet).sort();

    // Existing team members
    const { data: team } = await supabase
      .from("mission_team_members")
      .select("id,name")
      .eq("mission_id", missionId);
    const existingTeamSet = new Set((team ?? []).map((t) => (t.name || "").toLowerCase()));
    const newTeamCount = uniqueNames.filter((n) => !existingTeamSet.has(n.toLowerCase())).length;

    // Existing questions (v2)
    const { data: qs } = await supabase
      .from("questions")
      .select("id,section,sort_order")
      .eq("mission_id", missionId)
      .eq("architecture_version", "v2");
    const existingSections = new Set((qs ?? []).map((q) => (q.section || "").trim()));

    let newQuestionsCount = 0;
    let updatedQuestionsCount = 0;
    rows.forEach((r) => {
      if (r.section && existingSections.has(r.section)) updatedQuestionsCount++;
      else newQuestionsCount++;
    });

    setDiff({
      rows,
      uniqueNames,
      newQuestionsCount,
      updatedQuestionsCount,
      newTeamCount,
      existingTeamCount: uniqueNames.length - newTeamCount,
      assignmentsTouched: rows.length,
    });
  }

  async function onPickFile(file: File) {
    setParsing(true);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const rows = parseWorkbook(buf);
      if (rows.length === 0) {
        toast.error("No data rows found in this file");
        setParsing(false);
        return;
      }
      await buildDiff(rows);
    } catch (err: any) {
      toast.error(`Failed to parse: ${err?.message ?? err}`);
    } finally {
      setParsing(false);
    }
  }

  async function commit() {
    if (!diff) return;
    setImporting(true);
    try {
      // 1) Upsert team members (merge: insert missing, leave existing alone)
      const { data: team } = await supabase
        .from("mission_team_members")
        .select("id,name")
        .eq("mission_id", missionId);
      const teamByName = new Map<string, string>(
        (team ?? []).map((t) => [(t.name || "").toLowerCase(), t.id]),
      );
      const newMembers = diff.uniqueNames
        .filter((n) => !teamByName.has(n.toLowerCase()))
        .map((n) => ({
          mission_id: missionId,
          name: n,
          role: "Contributor",
          source: "tracker_import",
          active: true,
        }));
      if (newMembers.length > 0) {
        const { error } = await supabase.from("mission_team_members").insert(newMembers);
        if (error) throw error;
      }

      // 2) Fetch existing v2 questions, key by section
      const { data: qs } = await supabase
        .from("questions")
        .select("id,section,sort_order")
        .eq("mission_id", missionId)
        .eq("architecture_version", "v2");
      const qBySection = new Map<string, { id: string; sort_order: number | null }>();
      (qs ?? []).forEach((q) => {
        if (q.section) qBySection.set(q.section.trim(), { id: q.id, sort_order: q.sort_order });
      });

      // 3) Upsert questions (insert or update)
      const toInsert: any[] = [];
      const toUpdate: { id: string; patch: any }[] = [];
      diff.rows.forEach((r) => {
        const existing = r.section ? qBySection.get(r.section) : undefined;
        const payload = {
          mission_id: missionId,
          architecture_version: "v2",
          status: "draft",
          section: r.section || null,
          question_text: r.question_text || null,
          page_limit: r.page_limit,
          sort_order: r.line,
        };
        if (existing) toUpdate.push({ id: existing.id, patch: payload });
        else toInsert.push(payload);
      });

      let inserted: { id: string; section: string | null; sort_order: number | null }[] = [];
      if (toInsert.length > 0) {
        const { data, error } = await supabase
          .from("questions")
          .insert(toInsert)
          .select("id,section,sort_order");
        if (error) throw error;
        inserted = data ?? [];
      }

      // Apply updates (run in parallel batches)
      for (const u of toUpdate) {
        const { error } = await supabase.from("questions").update(u.patch).eq("id", u.id);
        if (error) throw error;
      }

      // Build final section -> question_id map
      const finalQById = new Map<string, string>();
      (qs ?? []).forEach((q) => {
        if (q.section) finalQById.set(q.section.trim(), q.id);
      });
      inserted.forEach((q) => {
        if (q.section) finalQById.set(q.section.trim(), q.id);
      });

      // For rows without section, match inserted by sort_order
      const insertedByOrder = new Map<number, string>();
      inserted.forEach((q) => {
        if (q.sort_order != null) insertedByOrder.set(q.sort_order, q.id);
      });

      // 4) Upsert assignments (unique on question_id)
      const assignmentPayloads = diff.rows
        .map((r) => {
          const qid = r.section
            ? finalQById.get(r.section)
            : insertedByOrder.get(r.line);
          if (!qid) return null;
          const extras: string[] = [];
          const pickFirst = (arr: string[], label: string) => {
            if (arr.length === 0) return null;
            if (arr.length > 1) extras.push(`${label}: ${arr.slice(1).join(", ")}`);
            return arr[0];
          };
          const writer_name = pickFirst(r.writer, "Add'l Writers");
          const workstream_lead = pickFirst(r.strategic_owner, "Add'l Strategic Owners");
          const athena_sme_name = pickFirst(r.lead_sme, "Add'l Lead SMEs");
          const reviewer_name = pickFirst(r.support_sme, "Add'l Support SMEs");
          const hasAny = writer_name || workstream_lead || athena_sme_name || reviewer_name;
          return {
            question_id: qid,
            mission_id: missionId,
            writer_name,
            workstream_lead,
            athena_sme_name,
            reviewer_name,
            status: hasAny ? "Assigned" : "Unassigned",
            notes: extras.length > 0 ? extras.join(" • ") : null,
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);

      if (assignmentPayloads.length > 0) {
        // Chunk to keep payloads small
        const CHUNK = 200;
        for (let i = 0; i < assignmentPayloads.length; i += CHUNK) {
          const slice = assignmentPayloads.slice(i, i + CHUNK);
          const { error } = await supabase
            .from("question_assignments")
            .upsert(slice, { onConflict: "question_id" });
          if (error) throw error;
        }
      }

      await logOlympusAction({
        action_type: "matrix.import",
        action_summary: `Imported assignment matrix (${diff.rows.length} rows, ${diff.newQuestionsCount} new questions, ${diff.newTeamCount} new team members)`,
        mission_id: missionId,
        target_table: "questions",
        metadata: {
          file: fileName,
          rows: diff.rows.length,
          new_questions: diff.newQuestionsCount,
          updated_questions: diff.updatedQuestionsCount,
          new_team: diff.newTeamCount,
        },
      });

      toast.success(
        `Imported ${diff.rows.length} questions · ${diff.newTeamCount} new team members`,
      );
      onImported();
      onClose();
    } catch (err: any) {
      toast.error(`Import failed: ${err?.message ?? err}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl rounded-lg border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" style={{ color: GOLD }} />
            <h2 className="text-sm font-bold">Import Assignment Matrix</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-surface-hover"
            disabled={importing}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {!diff && (
            <>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Upload your assignment matrix (.xlsx). It will be merged into this mission:
                new questions and team members are added, existing questions matched by
                section number are updated, and per-question assignments are upserted.
                Existing manually-added team members are preserved.
              </p>
              <div className="rounded-md border border-dashed border-border bg-surface/50 p-6 text-center">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onPickFile(f);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={parsing}
                  className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-bold shadow"
                  style={{ backgroundColor: GOLD, color: NAVY }}
                >
                  {parsing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Parsing…
                    </>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5" /> Choose .xlsx file
                    </>
                  )}
                </button>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Expected: Line · Section · Technical Requirement · Page Limit · Developer ·
                  Strategic Owner · Lead SME · Support SME
                </div>
              </div>
            </>
          )}

          {diff && (
            <>
              <div className="rounded-md border border-border bg-surface px-4 py-3 text-xs">
                <div className="mb-2 font-semibold">{fileName}</div>
                <div className="grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
                  <Stat label="Rows" value={diff.rows.length} />
                  <Stat label="New questions" value={diff.newQuestionsCount} tone="add" />
                  <Stat label="Updated questions" value={diff.updatedQuestionsCount} />
                  <Stat label="Assignments touched" value={diff.assignmentsTouched} />
                  <Stat label="Unique people" value={diff.uniqueNames.length} />
                  <Stat label="New team members" value={diff.newTeamCount} tone="add" />
                  <Stat label="Existing team matched" value={diff.existingTeamCount} />
                </div>
              </div>

              <div className="max-h-64 overflow-auto rounded-md border border-border">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-surface-hover text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 text-left">#</th>
                      <th className="px-2 py-1.5 text-left">Section</th>
                      <th className="px-2 py-1.5 text-left">Question</th>
                      <th className="px-2 py-1.5 text-left">Writer</th>
                      <th className="px-2 py-1.5 text-left">Strategic</th>
                      <th className="px-2 py-1.5 text-left">Lead SME</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.rows.slice(0, 50).map((r) => (
                      <tr key={r.line} className="border-t border-border/40">
                        <td className="px-2 py-1 text-muted-foreground">{r.line}</td>
                        <td className="px-2 py-1 font-mono">{r.section || "—"}</td>
                        <td className="px-2 py-1 max-w-[280px] truncate" title={r.question_text}>
                          {r.question_text || "—"}
                        </td>
                        <td className="px-2 py-1 text-muted-foreground">
                          {r.writer[0] ?? "—"}
                        </td>
                        <td className="px-2 py-1 text-muted-foreground">
                          {r.strategic_owner[0] ?? "—"}
                        </td>
                        <td className="px-2 py-1 text-muted-foreground">
                          {r.lead_sme[0] ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {diff.rows.length > 50 && (
                  <div className="px-2 py-1 text-[10px] text-muted-foreground">
                    …and {diff.rows.length - 50} more
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            onClick={onClose}
            disabled={importing}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-surface-hover disabled:opacity-50"
          >
            Cancel
          </button>
          {diff && (
            <>
              <button
                onClick={() => {
                  setDiff(null);
                  setFileName(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                disabled={importing}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-surface-hover disabled:opacity-50"
              >
                Choose different file
              </button>
              <button
                onClick={commit}
                disabled={importing}
                className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-bold shadow disabled:opacity-50"
                style={{ backgroundColor: GOLD, color: NAVY }}
              >
                {importing && <Loader2 className="h-3 w-3 animate-spin" />}
                {importing ? "Importing…" : `Confirm import (${diff.rows.length} rows)`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "add" }) {
  return (
    <div className="rounded border border-border/60 bg-background px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={`text-sm font-bold ${tone === "add" && value > 0 ? "text-emerald-400" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
