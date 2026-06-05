import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { X, Upload, Loader2, AlertTriangle, FileSpreadsheet, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  extractMissionMatrixFromUpload,
  commitMissionMatrix,
} from "@/lib/matrix-import.functions";

type SQ = {
  question_number: string;
  title: string;
  question_text?: string;
  section_number?: string;
  parent_number?: string;
  assigned_writer_name?: string;
  assigned_sme_name?: string;
  page_limit?: number | null;
  evaluation_weight?: number | null;
  pens_down_date?: string | null;
  scoring_criteria?: string;
};

type Person = { name: string; role?: "writer" | "sme" | "both"; email?: string };

export function UploadMatrixModal({
  missionId,
  onClose,
  onCommitted,
}: {
  missionId: string;
  onClose: () => void;
  onCommitted: () => void;
}) {
  const qc = useQueryClient();
  const extractFn = useServerFn(extractMissionMatrixFromUpload);
  const commitFn = useServerFn(commitMissionMatrix);

  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<"input" | "extracting" | "review" | "saving">("input");
  const [questions, setQuestions] = useState<SQ[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [notes, setNotes] = useState<string>("");
  const [confirmReplace, setConfirmReplace] = useState(false);

  async function handleExtract() {
    if (!file) {
      toast.error("Pick a file first.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File too large (max 20MB).");
      return;
    }
    setStage("extracting");
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? "anon";
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${uid}/${missionId}/${Date.now()}_${safe}`;
      const { error: upErr } = await supabase.storage.from("mission-matrix").upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

      const r = await extractFn({
        data: {
          missionId,
          filePath: path,
          fileName: file.name,
          mimeType: file.type || null,
        },
      });
      setQuestions(r.questions);
      setPeople(r.people ?? []);
      setNotes(r.notes ?? "");
      setStage("review");
      toast.success(`IRIS parsed ${r.questions.length} questions from ${file.name}.`);
    } catch (e: any) {
      toast.error(e.message);
      setStage("input");
    }
  }

  async function handleCommit() {
    if (!confirmReplace) {
      toast.error("Confirm replacement first.");
      return;
    }
    setStage("saving");
    try {
      const cleaned = questions
        .filter((q) => q.question_number.trim() && q.title.trim())
        .map((q) => ({
          ...q,
          // strip empty strings -> undefined so server zod passes
          question_text: q.question_text || null,
          section_number: q.section_number || null,
          parent_number: q.parent_number || null,
          assigned_writer_name: q.assigned_writer_name || null,
          assigned_sme_name: q.assigned_sme_name || null,
          scoring_criteria: q.scoring_criteria || null,
          pens_down_date: q.pens_down_date || null,
          page_limit: q.page_limit ?? null,
          evaluation_weight: q.evaluation_weight ?? null,
        }));
      const r = await commitFn({
        data: { missionId, questions: cleaned, replace: true },
      });
      toast.success(
        `Saved ${r.inserted} questions. Removed ${r.removed} old · matched ${r.matchedProfiles} users · ${r.placeholdersCreated} SME placeholders.`,
      );
      qc.invalidateQueries({ queryKey: ["olympus-questions", missionId] });
      onCommitted();
    } catch (e: any) {
      toast.error(e.message);
      setStage("review");
    }
  }

  function patch(i: number, p: Partial<SQ>) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...p } : q)));
  }
  function remove(i: number) {
    setQuestions((qs) => qs.filter((_, idx) => idx !== i));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 sm:p-8 overflow-y-auto">
      <div className="relative my-auto w-full max-w-6xl rounded-[14px] border border-border bg-surface shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
              Mission Setup · Source of Truth
            </div>
            <h2 className="mt-1 text-xl font-semibold">Upload Client Matrix</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload the client's question + assignment matrix. IRIS extracts questions, sections, writers, SMEs,
              page limits, weights, and pens-down dates — then replaces this mission's questions in one shot.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {stage === "input" || stage === "extracting" ? (
          <div className="space-y-4 px-6 py-6">
            <label className="block">
              <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Matrix file
              </div>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.pdf,.docx,.txt,.md,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={stage === "extracting"}
                className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-primary/15 file:px-3 file:py-1.5 file:text-xs file:text-primary"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Accepts Excel (.xlsx / .xls), CSV, PDF, Word (.docx), and plain text. Max 20 MB.
              </p>
            </label>

            <div className="rounded-md border border-border/60 bg-background/50 p-3 text-xs text-muted-foreground">
              <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                Heads up — replace mode
              </div>
              This upload will become the new source of truth and will <strong>replace every existing question</strong>{" "}
              on this mission. You'll review the parsed rows before committing.
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                disabled={stage === "extracting"}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={handleExtract}
                disabled={!file || stage === "extracting"}
                className="inline-flex items-center gap-2 rounded-md bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50"
              >
                {stage === "extracting" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> IRIS is parsing…
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5" /> Parse with IRIS
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 px-6 py-5">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
                <FileSpreadsheet className="h-3 w-3" /> {questions.length} questions
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-muted-foreground">
                {new Set(questions.map((q) => q.section_number || "—")).size} sections
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-muted-foreground">
                {people.length} people detected
              </span>
              {notes && <span className="text-[11px] italic text-muted-foreground">{notes}</span>}
            </div>

            {people.length > 0 && (
              <details className="rounded-md border border-border/60 bg-background/50 p-3 text-xs">
                <summary className="cursor-pointer font-medium">People detected ({people.length})</summary>
                <div className="mt-2 flex flex-wrap gap-2">
                  {people.map((p, i) => (
                    <span key={i} className="rounded bg-surface px-2 py-1">
                      <strong>{p.name}</strong>
                      {p.role ? <span className="ml-1 text-muted-foreground">({p.role})</span> : null}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Names matching existing users are linked automatically. Others are added as placeholder identities (no
                  invite sent).
                </p>
              </details>
            )}

            <div className="max-h-[420px] overflow-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-surface">
                  <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-2 py-2 text-left">#</th>
                    <th className="px-2 py-2 text-left">Sec</th>
                    <th className="px-2 py-2 text-left">Parent</th>
                    <th className="px-2 py-2 text-left">Title</th>
                    <th className="px-2 py-2 text-left">Writer</th>
                    <th className="px-2 py-2 text-left">SME</th>
                    <th className="px-2 py-2 text-right">Pages</th>
                    <th className="px-2 py-2 text-right">Weight</th>
                    <th className="px-2 py-2 text-left">Pens-down</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {questions.map((q, i) => (
                    <tr key={i} className="border-b border-border/40 align-top hover:bg-surface-hover/40">
                      <td className="px-1 py-1">
                        <input
                          value={q.question_number}
                          onChange={(e) => patch(i, { question_number: e.target.value })}
                          className="w-16 rounded border border-border/60 bg-background px-1.5 py-1"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={q.section_number ?? ""}
                          onChange={(e) => patch(i, { section_number: e.target.value })}
                          className="w-16 rounded border border-border/60 bg-background px-1.5 py-1"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={q.parent_number ?? ""}
                          onChange={(e) => patch(i, { parent_number: e.target.value })}
                          className="w-16 rounded border border-border/60 bg-background px-1.5 py-1"
                          placeholder="—"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={q.title}
                          onChange={(e) => patch(i, { title: e.target.value })}
                          className="w-full min-w-[220px] rounded border border-border/60 bg-background px-1.5 py-1"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={q.assigned_writer_name ?? ""}
                          onChange={(e) => patch(i, { assigned_writer_name: e.target.value })}
                          className="w-32 rounded border border-border/60 bg-background px-1.5 py-1"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={q.assigned_sme_name ?? ""}
                          onChange={(e) => patch(i, { assigned_sme_name: e.target.value })}
                          className="w-32 rounded border border-border/60 bg-background px-1.5 py-1"
                        />
                      </td>
                      <td className="px-1 py-1 text-right">
                        <input
                          type="number"
                          value={q.page_limit ?? ""}
                          onChange={(e) =>
                            patch(i, {
                              page_limit: e.target.value ? Math.max(1, parseInt(e.target.value, 10)) : null,
                            })
                          }
                          className="w-14 rounded border border-border/60 bg-background px-1.5 py-1 text-right"
                        />
                      </td>
                      <td className="px-1 py-1 text-right">
                        <input
                          type="number"
                          step="0.5"
                          value={q.evaluation_weight ?? ""}
                          onChange={(e) =>
                            patch(i, {
                              evaluation_weight: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                          className="w-16 rounded border border-border/60 bg-background px-1.5 py-1 text-right"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="date"
                          value={q.pens_down_date ?? ""}
                          onChange={(e) => patch(i, { pens_down_date: e.target.value || null })}
                          className="rounded border border-border/60 bg-background px-1.5 py-1"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <button
                          onClick={() => remove(i)}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                          aria-label="Remove row"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <label className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
              <input
                type="checkbox"
                checked={confirmReplace}
                onChange={(e) => setConfirmReplace(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <strong>Replace all existing questions</strong> on this mission with these {questions.length} rows. This
                cannot be undone. Existing assignments, scores, and progress tied to the old questions will be removed.
              </span>
            </label>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setStage("input")}
                disabled={stage === "saving"}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-surface-hover"
              >
                Re-upload
              </button>
              <button
                onClick={handleCommit}
                disabled={!confirmReplace || stage === "saving" || questions.length === 0}
                className="inline-flex items-center gap-2 rounded-md bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50"
              >
                {stage === "saving" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                  </>
                ) : (
                  <>Commit as Source of Truth</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
