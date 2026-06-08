import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  X,
  Upload,
  Loader2,
  AlertTriangle,
  FileSpreadsheet,
  Trash2,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  extractMissionMatrixFromUpload,
  commitMissionMatrix,
  previewMissionMatrixSpreadsheet,
  applyMissionMatrixMapping,
} from "@/lib/matrix-import.functions";

type MappingTarget =
  | "skip"
  | "question_number"
  | "title"
  | "question_text"
  | "section_number"
  | "parent_number"
  | "volume"
  | "assigned_writer_name"
  | "assigned_sme_name"
  | "strategic_owner_name"
  | "support_sme_names"
  | "page_limit"
  | "evaluation_weight"
  | "pens_down_date"
  | "scoring_criteria"
  | "import_notes";

const MAPPING_LABELS: Record<MappingTarget, string> = {
  skip: "— Skip column —",
  question_number: "Question Number",
  title: "Question Title",
  question_text: "Question Text / Prompt",
  section_number: "Section Number",
  parent_number: "Parent Question Number",
  volume: "Volume",
  assigned_writer_name: "Athena Writer",
  assigned_sme_name: "Lead SME",
  strategic_owner_name: "Strategic Owner",
  support_sme_names: "Support SME(s)",
  page_limit: "Page Limit",
  evaluation_weight: "Evaluation Weight",
  pens_down_date: "Pens-Down Date",
  scoring_criteria: "Scoring Criteria",
  import_notes: "Notes / Comments",
};

type SQ = {
  question_number: string;
  title: string;
  question_text?: string;
  section_number?: string;
  parent_number?: string;
  volume?: string;
  assigned_writer_name?: string;
  assigned_sme_name?: string;
  strategic_owner_name?: string;
  support_sme_names?: string[];
  page_limit?: number | null;
  evaluation_weight?: number | null;
  pens_down_date?: string | null;
  scoring_criteria?: string;
  import_notes?: string;
};

type Person = { name: string; role?: "writer" | "sme" | "owner" | "both"; email?: string };

type Preview = {
  sheetName: string;
  headers: string[];
  rows: string[][];
  totalRows: number;
  guessedMapping: Record<string, MappingTarget>;
};

function isSpreadsheetFile(f: File): boolean {
  const n = f.name.toLowerCase();
  return (
    n.endsWith(".xlsx") ||
    n.endsWith(".xls") ||
    n.endsWith(".csv") ||
    f.type.includes("spreadsheet") ||
    f.type.includes("excel") ||
    f.type === "text/csv"
  );
}

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
  const previewFn = useServerFn(previewMissionMatrixSpreadsheet);
  const applyFn = useServerFn(applyMissionMatrixMapping);

  const [file, setFile] = useState<File | null>(null);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [stage, setStage] = useState<
    "input" | "uploading" | "mapping" | "extracting" | "review" | "saving"
  >("input");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, MappingTarget>>({});
  const [questions, setQuestions] = useState<SQ[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [notes, setNotes] = useState<string>("");
  const [confirmReplace, setConfirmReplace] = useState(false);

  async function uploadFile(): Promise<{ path: string; mime: string | null }> {
    if (!file) throw new Error("Pick a file first.");
    if (file.size > 20 * 1024 * 1024) throw new Error("File too large (max 20MB).");
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? "anon";
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${uid}/${missionId}/${Date.now()}_${safe}`;
    const { error: upErr } = await supabase.storage.from("mission-matrix").upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
    setUploadedPath(path);
    return { path, mime: file.type || null };
  }

  async function handleProcess() {
    if (!file) {
      toast.error("Pick a file first.");
      return;
    }
    setStage("uploading");
    try {
      const { path, mime } = await uploadFile();
      if (isSpreadsheetFile(file)) {
        setStage("extracting");
        const p = await previewFn({
          data: { missionId, filePath: path, fileName: file.name, mimeType: mime },
        });
        setPreview(p);
        setMapping(p.guessedMapping);
        setStage("mapping");
      } else {
        setStage("extracting");
        const r = await extractFn({
          data: { missionId, filePath: path, fileName: file.name, mimeType: mime },
        });
        setQuestions(r.questions);
        setPeople(r.people ?? []);
        setNotes(r.notes ?? "");
        setStage("review");
        toast.success(`IRIS parsed ${r.questions.length} questions from ${file.name}.`);
      }
    } catch (e: any) {
      toast.error(e.message);
      setStage("input");
    }
  }

  async function handleApplyMapping() {
    if (!file || !uploadedPath || !preview) return;
    // Require both Question Number and Title to be mapped.
    const targets = new Set(Object.values(mapping));
    if (!targets.has("question_number") || !targets.has("title")) {
      toast.error("Map both Question Number and Question Title before continuing.");
      return;
    }
    setStage("extracting");
    try {
      const r = await applyFn({
        data: {
          missionId,
          filePath: uploadedPath,
          fileName: file.name,
          mimeType: file.type || null,
          mapping,
        },
      });
      setQuestions(r.questions);
      setPeople(r.people ?? []);
      setNotes(r.notes ?? "");
      setStage("review");
      toast.success(`Mapped ${r.questions.length} questions.`);
    } catch (e: any) {
      toast.error(e.message);
      setStage("mapping");
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
          question_text: q.question_text || null,
          section_number: q.section_number || null,
          parent_number: q.parent_number || null,
          volume: q.volume || null,
          assigned_writer_name: q.assigned_writer_name || null,
          assigned_sme_name: q.assigned_sme_name || null,
          strategic_owner_name: q.strategic_owner_name || null,
          support_sme_names: q.support_sme_names && q.support_sme_names.length > 0 ? q.support_sme_names : null,
          scoring_criteria: q.scoring_criteria || null,
          import_notes: q.import_notes || null,
          pens_down_date: q.pens_down_date || null,
          page_limit: q.page_limit ?? null,
          evaluation_weight: q.evaluation_weight ?? null,
        }));
      const r = await commitFn({
        data: { missionId, questions: cleaned, replace: true },
      });
      const t = r.staffingSummary?.totals;
      toast.success(
        `Saved ${r.inserted} questions · ${r.matchedProfiles} users linked · ${r.placeholdersCreated} placeholders.` +
          (t
            ? ` IRIS: ${t.unassigned_writer} unstaffed, ${t.red_health} red, ${t.yellow_health} yellow.`
            : ""),
      );
      qc.invalidateQueries({ queryKey: ["olympus-questions", missionId] });
      qc.invalidateQueries({ queryKey: ["mission-staffing-summary", missionId] });
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

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 p-4 sm:p-8 overflow-y-auto">
      <div className="relative my-auto w-full max-w-6xl rounded-[14px] border border-border bg-surface shadow-2xl">

        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
              Mission Setup · Assignment Matrix Import Engine
            </div>
            <h2 className="mt-1 text-xl font-semibold">Upload Assignment Matrix</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload your Assignment Matrix. ATLAS detects the columns, you confirm the mapping, then IRIS
              creates one Question Ownership record per row and generates a staffing summary.
            </p>
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className={stageBadge(stage, "input", "uploading")}>1 · Upload</span>
              <ArrowRight className="h-3 w-3" />
              <span className={stageBadge(stage, "mapping")}>2 · Map Columns</span>
              <ArrowRight className="h-3 w-3" />
              <span className={stageBadge(stage, "review", "saving")}>3 · Review & Commit</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {stage === "input" || stage === "uploading" || stage === "extracting" ? (
          <div className="space-y-4 px-6 py-6">
            <label className="block">
              <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Matrix file
              </div>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.pdf,.docx,.txt,.md"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={stage !== "input"}
                className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-primary/15 file:px-3 file:py-1.5 file:text-xs file:text-primary"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Excel (.xlsx) and CSV go through the column-mapping step. PDF / Word use IRIS auto-extraction.
                Max 20 MB.
              </p>
            </label>

            <div className="rounded-md border border-border/60 bg-background/50 p-3 text-xs text-muted-foreground">
              <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                Heads up — replace mode
              </div>
              This upload becomes the new source of truth and{" "}
              <strong>replaces every existing question</strong> on this mission. You'll review the parsed rows
              before committing.
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                disabled={stage !== "input"}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={handleProcess}
                disabled={!file || stage !== "input"}
                className="inline-flex items-center gap-2 rounded-md bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50"
              >
                {stage === "input" ? (
                  <>
                    <Upload className="h-3.5 w-3.5" /> Analyze File
                  </>
                ) : (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />{" "}
                    {stage === "uploading" ? "Uploading…" : "Analyzing…"}
                  </>
                )}
              </button>
            </div>
          </div>
        ) : stage === "mapping" && preview ? (
          <MappingStep
            preview={preview}
            mapping={mapping}
            onMappingChange={setMapping}
            onBack={() => setStage("input")}
            onApply={handleApplyMapping}
          />
        ) : (
          <ReviewStep
            questions={questions}
            people={people}
            notes={notes}
            confirmReplace={confirmReplace}
            saving={stage === "saving"}
            onConfirmChange={setConfirmReplace}
            onPatch={patch}
            onRemove={remove}
            onBack={() => setStage(preview ? "mapping" : "input")}
            onCommit={handleCommit}
          />
        )}
      </div>
    </div>
  );
}

function stageBadge(
  cur: string,
  ...active: string[]
): string {
  const on = active.includes(cur);
  return `rounded px-1.5 py-0.5 font-medium uppercase tracking-wider ${
    on ? "bg-primary/15 text-primary" : "text-muted-foreground/60"
  }`;
}

// ───────────────────────────────────────────────────────────── Mapping step ──

function MappingStep({
  preview,
  mapping,
  onMappingChange,
  onBack,
  onApply,
}: {
  preview: Preview;
  mapping: Record<string, MappingTarget>;
  onMappingChange: (m: Record<string, MappingTarget>) => void;
  onBack: () => void;
  onApply: () => void;
}) {
  const targets = new Set(Object.values(mapping));
  const missingRequired: string[] = [];
  if (!targets.has("question_number")) missingRequired.push("Question Number");
  if (!targets.has("title")) missingRequired.push("Question Title");

  return (
    <div className="space-y-4 px-6 py-5">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
          <FileSpreadsheet className="h-3 w-3" /> Sheet: {preview.sheetName}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-muted-foreground">
          {preview.headers.length} columns
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-muted-foreground">
          {preview.totalRows} data rows
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-400">
          <Sparkles className="h-3 w-3" /> IRIS auto-guessed mapping
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        Confirm how each column in your spreadsheet maps to a Question Ownership field. Multiple columns can
        map to <strong>Support SME(s)</strong>; their values will be combined. Required fields:{" "}
        <strong>Question Number</strong> and <strong>Question Title</strong>.
      </p>

      <div className="max-h-[480px] overflow-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left">Source column</th>
              <th className="px-3 py-2 text-left">Sample values</th>
              <th className="px-3 py-2 text-left">Maps to</th>
            </tr>
          </thead>
          <tbody>
            {preview.headers.map((header) => {
              const samples = preview.rows
                .map((r) => r[preview.headers.indexOf(header)])
                .filter((v) => v && v.length > 0)
                .slice(0, 3);
              return (
                <tr key={header} className="border-b border-border/40 align-top">
                  <td className="px-3 py-2 font-medium text-foreground">{header}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {samples.length > 0
                      ? samples.map((s, i) => (
                          <div key={i} className="truncate max-w-[280px]">
                            <span className="text-foreground/70">·</span> {s}
                          </div>
                        ))
                      : <span className="italic">empty</span>}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={mapping[header] ?? "skip"}
                      onChange={(e) =>
                        onMappingChange({
                          ...mapping,
                          [header]: e.target.value as MappingTarget,
                        })
                      }
                      className="w-full max-w-[240px] rounded border border-border/60 bg-background px-2 py-1.5"
                    >
                      {Object.entries(MAPPING_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {missingRequired.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          Still need to map: <strong>{missingRequired.join(", ")}</strong>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          onClick={onBack}
          className="rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-surface-hover"
        >
          Re-upload
        </button>
        <button
          onClick={onApply}
          disabled={missingRequired.length > 0}
          className="inline-flex items-center gap-2 rounded-md bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50"
        >
          Apply Mapping <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────── Review step ──

function ReviewStep({
  questions,
  people,
  notes,
  confirmReplace,
  saving,
  onConfirmChange,
  onPatch,
  onRemove,
  onBack,
  onCommit,
}: {
  questions: SQ[];
  people: Person[];
  notes: string;
  confirmReplace: boolean;
  saving: boolean;
  onConfirmChange: (b: boolean) => void;
  onPatch: (i: number, p: Partial<SQ>) => void;
  onRemove: (i: number) => void;
  onBack: () => void;
  onCommit: () => void;
}) {
  return (
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
            Names matching existing users are linked. Others become placeholder identities (no invite sent).
          </p>
        </details>
      )}

      <div className="max-h-[420px] overflow-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Sec</th>
              <th className="px-2 py-2 text-left">Title</th>
              <th className="px-2 py-2 text-left">Writer</th>
              <th className="px-2 py-2 text-left">Lead SME</th>
              <th className="px-2 py-2 text-left">Owner</th>
              <th className="px-2 py-2 text-left">Support SMEs</th>
              <th className="px-2 py-2 text-right">Pages</th>
              <th className="px-2 py-2 text-left">Pens-down</th>
              <th className="px-2 py-2 text-left">Notes</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {questions.map((q, i) => (
              <tr key={i} className="border-b border-border/40 align-top hover:bg-surface-hover/40">
                <td className="px-1 py-1">
                  <input
                    value={q.question_number}
                    onChange={(e) => onPatch(i, { question_number: e.target.value })}
                    className="w-16 rounded border border-border/60 bg-background px-1.5 py-1"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    value={q.section_number ?? ""}
                    onChange={(e) => onPatch(i, { section_number: e.target.value })}
                    className="w-16 rounded border border-border/60 bg-background px-1.5 py-1"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    value={q.title}
                    onChange={(e) => onPatch(i, { title: e.target.value })}
                    className="w-full min-w-[220px] rounded border border-border/60 bg-background px-1.5 py-1"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    value={q.assigned_writer_name ?? ""}
                    onChange={(e) => onPatch(i, { assigned_writer_name: e.target.value })}
                    className="w-28 rounded border border-border/60 bg-background px-1.5 py-1"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    value={q.assigned_sme_name ?? ""}
                    onChange={(e) => onPatch(i, { assigned_sme_name: e.target.value })}
                    className="w-28 rounded border border-border/60 bg-background px-1.5 py-1"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    value={q.strategic_owner_name ?? ""}
                    onChange={(e) => onPatch(i, { strategic_owner_name: e.target.value })}
                    className="w-28 rounded border border-border/60 bg-background px-1.5 py-1"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    value={(q.support_sme_names ?? []).join(", ")}
                    onChange={(e) =>
                      onPatch(i, {
                        support_sme_names: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="Name, Name"
                    className="w-40 rounded border border-border/60 bg-background px-1.5 py-1"
                  />
                </td>
                <td className="px-1 py-1 text-right">
                  <input
                    type="number"
                    value={q.page_limit ?? ""}
                    onChange={(e) =>
                      onPatch(i, {
                        page_limit: e.target.value ? Math.max(1, parseInt(e.target.value, 10)) : null,
                      })
                    }
                    className="w-14 rounded border border-border/60 bg-background px-1.5 py-1 text-right"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="date"
                    value={q.pens_down_date ?? ""}
                    onChange={(e) => onPatch(i, { pens_down_date: e.target.value || null })}
                    className="rounded border border-border/60 bg-background px-1.5 py-1"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    value={q.import_notes ?? ""}
                    onChange={(e) => onPatch(i, { import_notes: e.target.value })}
                    className="w-40 rounded border border-border/60 bg-background px-1.5 py-1"
                    placeholder="—"
                  />
                </td>
                <td className="px-1 py-1">
                  <button
                    onClick={() => onRemove(i)}
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
          onChange={(e) => onConfirmChange(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <strong>Replace all existing questions</strong> on this mission with these {questions.length} rows.
          Defaults applied: SME Meeting = Not Scheduled · Draft = Not Started · Review = Not Started · Risk =
          auto-calculated. This cannot be undone.
        </span>
      </label>

      <div className="flex justify-end gap-2">
        <button
          onClick={onBack}
          disabled={saving}
          className="rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-surface-hover"
        >
          Back
        </button>
        <button
          onClick={onCommit}
          disabled={!confirmReplace || saving || questions.length === 0}
          className="inline-flex items-center gap-2 rounded-md bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </>
          ) : (
            <>Commit as Source of Truth</>
          )}
        </button>
      </div>
    </div>
  );
}
