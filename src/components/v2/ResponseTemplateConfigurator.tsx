// Response Template Configurator
// Mission Setup "Step 5" experience. Used inline on the Mission Overview
// and on a dedicated /response-template route. Supports:
//   - Upload .docx/.pdf → IRIS-parsed structure (stubbed today)
//   - Manual element builder
//   - Skip
//   - Inline edit of parsed structure + confirm

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Upload, FileText, Plus, X, GripVertical, CheckCircle2, AlertTriangle,
  ChevronDown, Lock, Pencil, Loader2, ArrowRight, Edit3,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getResponseTemplate,
  saveResponseTemplate,
  skipResponseTemplate,
  parseTemplateFile,
  type ElementType,
  type TemplateElementInput,
} from "@/lib/response-template.functions";

const ELEMENT_TYPES: { value: ElementType; label: string }[] = [
  { value: "header", label: "Header" },
  { value: "subsection", label: "Sub-section" },
  { value: "field", label: "Field" },
  { value: "table", label: "Table" },
  { value: "word_limit", label: "Word Limit" },
];

type Mode = "choose" | "parsing" | "review" | "manual" | "confirmed";

type EditableEl = TemplateElementInput & { _key: string };

function k() { return crypto.randomUUID(); }

function toEditable(els: TemplateElementInput[]): EditableEl[] {
  return els.map((e) => ({ ...e, _key: k() }));
}

export function ResponseTemplateConfigurator({
  missionId,
  onConfirmed,
}: {
  missionId: string;
  onConfirmed?: () => void;
}) {
  const qc = useQueryClient();
  const getTpl = useServerFn(getResponseTemplate);
  const parseFn = useServerFn(parseTemplateFile);
  const saveFn = useServerFn(saveResponseTemplate);
  const skipFn = useServerFn(skipResponseTemplate);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["response-template", missionId],
    queryFn: () => getTpl({ data: { missionId } }),
  });

  const [mode, setMode] = useState<Mode>("choose");
  const [els, setEls] = useState<EditableEl[]>([]);
  const [source, setSource] = useState<"upload" | "manual">("manual");
  const [fileName, setFileName] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<string | null>(null);
  const [citation, setCitation] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already configured?
  const tpl = data?.template;
  const isActive = tpl?.status === "active";
  const isSkipped = tpl?.status === "skipped";

  if (isLoading) {
    return <div className="text-sm text-muted-foreground p-4">Loading template…</div>;
  }

  // CONFIRMED STATE — show summary
  if (isActive && mode !== "manual" && mode !== "review") {
    return (
      <ConfirmedState
        elementsCount={(data?.elements ?? []).length}
        confirmedAt={tpl?.confirmed_at ?? null}
        onEdit={() => {
          setEls(toEditable(
            (data?.elements ?? []).map((e) => ({
              order_index: e.order_index,
              element_type: e.element_type,
              label: e.label,
              parent_id: e.parent_id,
              word_limit: e.word_limit,
              table_columns: e.table_columns,
            })),
          ));
          setSource((tpl?.source as any) ?? "manual");
          setFileName(tpl?.source_file_name ?? null);
          setFilePath(tpl?.source_file_path ?? null);
          setMode("review");
        }}
        elements={data?.elements ?? []}
      />
    );
  }

  if (isSkipped && mode === "choose") {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-amber-200">Response Template skipped</h3>
            <p className="text-xs text-amber-200/80 mt-1">
              Writers will use a blank editor. You can configure a template at any time.
            </p>
          </div>
          <button
            onClick={() => setMode("manual")}
            className="rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/20"
          >
            Configure now
          </button>
        </div>
      </div>
    );
  }

  // CHOICE STATE
  if (mode === "choose") {
    return (
      <div className="space-y-5">
        <header>
          <h3 className="text-lg font-semibold text-foreground">Response Template</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            Does the client require a specific structure for all responses? Many RFPs include a
            required format — headers, sub-sections, tables, or word limits — that every answer
            must follow. If yours does, configure it here. IRIS will apply it to every section in
            the Studio and block non-compliant responses from advancing to review.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UploadCard
            onFile={async (file) => {
              setBusy(true);
              setMode("parsing");
              try {
                // Upload to vault storage bucket
                const safe = file.name.normalize("NFKD").replace(/[^\w.\-]+/g, "_");
                const path = `${missionId}/response-template/${Date.now()}-${safe}`;
                const { error: upErr } = await supabase.storage
                  .from("mission-library")
                  .upload(path, file);
                if (upErr) throw upErr;

                // Register in mission_library as a vault doc (Response Template category)
                await supabase.from("mission_library").insert({
                  mission_id: missionId,
                  name: file.name,
                  category: "Response Template",
                  file_path: path,
                  file_size: file.size,
                  is_rfp: false,
                });

                // Parse (stubbed)
                const parsed = await parseFn({
                  data: { missionId, fileName: file.name },
                });
                setEls(toEditable(parsed.elements));
                setSource("upload");
                setFileName(file.name);
                setFilePath(path);
                setConfidence(parsed.irisConfidence ?? null);
                setCitation(parsed.irisSourceCitation ?? null);
                setMode("review");
              } catch (e: any) {
                toast.error(e?.message ?? "Failed to parse template");
                setMode("choose");
              } finally {
                setBusy(false);
              }
            }}
          />
          <ManualCard
            onClick={() => {
              setEls([
                { _key: k(), order_index: 0, element_type: "header", label: "" },
              ]);
              setSource("manual");
              setMode("manual");
            }}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3">
          <span className="text-xs text-muted-foreground">
            No response template for this mission
          </span>
          <button
            onClick={async () => {
              setBusy(true);
              try {
                await skipFn({ data: { missionId } });
                toast.success("Marked as skipped");
                qc.invalidateQueries({ queryKey: ["response-template", missionId] });
                await refetch();
              } catch (e: any) {
                toast.error(e?.message ?? "Failed");
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  // PARSING SPINNER
  if (mode === "parsing") {
    return (
      <div className="rounded-xl border border-[#6366F1]/30 bg-[#6366F1]/5 p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#6366F1] mx-auto mb-3" />
        <p className="text-sm font-medium text-foreground">IRIS is reading your template…</p>
        <p className="text-xs text-muted-foreground mt-1">
          Extracting required structure · Mapping to sections
        </p>
      </div>
    );
  }

  // REVIEW / MANUAL — inline editor
  return (
    <ElementsEditor
      els={els}
      setEls={setEls}
      source={source}
      confidence={confidence}
      citation={citation}
      onCancel={() => setMode("choose")}
      onConfirm={async () => {
        const clean = els
          .filter((e) => e.label.trim().length > 0)
          .map((e, i) => ({
            order_index: i,
            element_type: e.element_type,
            label: e.label.trim(),
            parent_id: e.parent_id ?? null,
            word_limit: e.word_limit ?? null,
            table_columns: e.table_columns ?? null,
          }));
        if (clean.length === 0) {
          toast.error("Add at least one element");
          return;
        }
        setBusy(true);
        try {
          await saveFn({
            data: {
              missionId,
              source,
              sourceFileName: fileName,
              sourceFilePath: filePath,
              irisConfidence: confidence,
              irisSourceCitation: citation,
              elements: clean,
            },
          });
          toast.success("Response template confirmed");
          qc.invalidateQueries({ queryKey: ["response-template", missionId] });
          await refetch();
          setMode("confirmed");
          onConfirmed?.();
        } catch (e: any) {
          toast.error(e?.message ?? "Failed to save");
        } finally {
          setBusy(false);
        }
      }}
      busy={busy}
    />
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function UploadCard({ onFile }: { onFile: (file: File) => void }) {
  const [drag, setDrag] = useState(false);
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition ${
        drag ? "border-[#6366F1] bg-[#6366F1]/10" : "border-white/15 hover:border-[#6366F1]/40 hover:bg-white/[0.02]"
      }`}
    >
      <Upload className="h-6 w-6 text-[#6366F1]" />
      <div className="text-sm font-semibold text-foreground">Upload Template File</div>
      <div className="text-[11px] text-muted-foreground leading-relaxed">
        .docx or .pdf<br />IRIS will parse it automatically
      </div>
      <input
        type="file"
        accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </label>
  );
}

function ManualCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 p-6 text-center transition hover:border-[#6366F1]/40 hover:bg-white/[0.02]"
    >
      <Edit3 className="h-6 w-6 text-[#6366F1]" />
      <div className="text-sm font-semibold text-foreground">Define Structure Manually</div>
      <div className="text-[11px] text-muted-foreground leading-relaxed">
        For templates described in RFP text<br />or communicated verbally
      </div>
    </button>
  );
}

function ElementsEditor({
  els, setEls, source, confidence, citation, onCancel, onConfirm, busy,
}: {
  els: EditableEl[];
  setEls: React.Dispatch<React.SetStateAction<EditableEl[]>>;
  source: "upload" | "manual";
  confidence: string | null;
  citation: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  function update(i: number, patch: Partial<EditableEl>) {
    setEls((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }
  function remove(i: number) {
    setEls((prev) => prev.filter((_, idx) => idx !== i));
  }
  function add() {
    setEls((prev) => [
      ...prev,
      { _key: k(), order_index: prev.length, element_type: "header", label: "" },
    ]);
  }
  function move(i: number, dir: -1 | 1) {
    setEls((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {source === "upload" ? "IRIS parsed the following required response structure" : "Define Required Response Structure"}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {source === "upload"
              ? "Review and confirm before activating."
              : "Add elements in the order they must appear in every response."}
          </p>
        </div>
        {confidence && (
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#6366F1] font-mono">
            IRIS Confidence: {confidence}
          </div>
        )}
      </header>

      <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
        {els.map((el, i) => (
          <div
            key={el._key}
            className="flex items-center gap-2 rounded-lg border border-white/5 bg-background/40 px-3 py-2"
          >
            <div className="flex flex-col gap-0.5">
              <button onClick={() => move(i, -1)} className="text-muted-foreground hover:text-foreground text-[10px]" title="Move up">▲</button>
              <button onClick={() => move(i, 1)} className="text-muted-foreground hover:text-foreground text-[10px]" title="Move down">▼</button>
            </div>
            <div className="w-6 text-center text-xs text-muted-foreground font-mono">{i + 1}.</div>
            <input
              value={el.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder="Element label"
              className="flex-1 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:border-[#6366F1]/60"
            />
            <select
              value={el.element_type}
              onChange={(e) => update(i, { element_type: e.target.value as ElementType })}
              className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-xs text-foreground focus:outline-none"
            >
              {ELEMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            {el.element_type === "word_limit" && (
              <input
                type="number"
                min={1}
                placeholder="Words"
                value={el.word_limit ?? ""}
                onChange={(e) => update(i, { word_limit: e.target.value ? parseInt(e.target.value) : null })}
                className="w-20 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-xs text-foreground"
              />
            )}
            <button
              onClick={() => remove(i)}
              className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        <button
          onClick={add}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-2 text-xs text-muted-foreground hover:border-[#6366F1]/40 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Add Element
        </button>
      </div>

      {citation && (
        <div className="text-[10px] text-muted-foreground font-mono">Source: {citation}</div>
      )}

      <footer className="flex items-center justify-between pt-2">
        <button onClick={onCancel} disabled={busy} className="text-xs text-muted-foreground hover:text-foreground">
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-[#6366F1] px-4 py-2 text-sm font-semibold text-white hover:bg-[#7274F3] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Confirm & Activate <ArrowRight className="h-4 w-4" />
        </button>
      </footer>
    </div>
  );
}

function ConfirmedState({
  elementsCount, confirmedAt, onEdit, elements,
}: {
  elementsCount: number;
  confirmedAt: string | null;
  onEdit: () => void;
  elements: any[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-emerald-200">Response Template configured</h3>
            <p className="text-xs text-emerald-200/80 mt-1">
              {elementsCount} required elements · Applied to all sections on activation
            </p>
            {confirmedAt && (
              <p className="text-[10px] text-emerald-200/60 mt-1">
                Confirmed {new Date(confirmedAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20"
          >
            {open ? "Hide" : "View"} Structure
          </button>
          <button
            onClick={onEdit}
            className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20 inline-flex items-center gap-1.5"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        </div>
      </div>
      {open && (
        <ol className="mt-4 space-y-1.5 border-t border-emerald-500/20 pt-4">
          {elements.map((el, i) => (
            <li key={el.id} className="flex items-center gap-3 text-xs">
              <span className="font-mono text-muted-foreground w-6">{i + 1}.</span>
              <span className="text-foreground flex-1">{el.label}</span>
              <span className="text-[10px] uppercase tracking-wider text-[#6366F1] font-mono">
                [{el.element_type}{el.word_limit ? ` · ${el.word_limit}w` : ""}]
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
