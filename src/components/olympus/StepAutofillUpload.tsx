import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Upload, Sparkles, X, FileText, AlertTriangle } from "lucide-react";
import { irisAutofillStep } from "@/lib/iris-step-autofill.functions";

const GOLD = "#C9A84C";
const NAVY = "#1F3864";
const MAX_BYTES = 12 * 1024 * 1024; // 12 MB

export type AutofillField = {
  key: string;
  label: string;
  type: "string" | "text" | "number" | "date" | "array";
  description?: string;
  currentValue?: string;
};

type Suggestion = {
  key: string;
  value: string | string[] | null;
  confidence: "high" | "medium" | "low";
  source: string;
};

type Props = {
  missionId: string;
  stepLabel: string;
  fields: AutofillField[];
  onApply: (patch: Record<string, string | string[]>) => void;
  className?: string;
};

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = String(r.result || "");
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function StepAutofillUpload({
  missionId,
  stepLabel,
  fields,
  onApply,
  className,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const autofill = useServerFn(irisAutofillStep);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});

  const fieldByKey = new Map(fields.map((f) => [f.key, f]));

  function reset() {
    setSuggestions(null);
    setAccepted({});
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function onPickFile(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error(`File too large (max ${MAX_BYTES / 1024 / 1024} MB)`);
      return;
    }
    setLoading(true);
    setFileName(file.name);
    setSuggestions(null);
    try {
      const name = file.name.toLowerCase();
      const type = file.type.toLowerCase();
      const isPdf = type.includes("pdf") || name.endsWith(".pdf");
      const isImage = type.startsWith("image/");
      const isTxt =
        type === "text/plain" ||
        name.endsWith(".txt") ||
        name.endsWith(".md") ||
        name.endsWith(".csv");
      const isDocx =
        name.endsWith(".docx") ||
        type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

      let fileData: string;
      let mimeType: string;
      let sendName: string = file.name;

      if (isPdf || isImage) {
        fileData = await toBase64(file);
        mimeType = file.type || (isPdf ? "application/pdf" : "image/png");
      } else if (isDocx) {
        // @ts-expect-error — mammoth browser subpath has no types
        const mammoth: any = await import("mammoth/mammoth.browser");
        const buf = await file.arrayBuffer();
        const res2 = await mammoth.extractRawText({ arrayBuffer: buf });
        const text = (res2?.value ?? "").toString().trim();
        if (!text) throw new Error("Couldn't read any text from that document");
        fileData = btoa(unescape(encodeURIComponent(text)));
        mimeType = "text/plain";
        sendName = file.name.replace(/\.[^.]+$/, "") + ".txt";
      } else if (isTxt) {
        const text = await file.text();
        fileData = btoa(unescape(encodeURIComponent(text)));
        mimeType = "text/plain";
      } else {
        toast.error("Unsupported file type. Use PDF, DOCX, TXT, or an image.");
        setLoading(false);
        return;
      }

      const callAutofill = async (fd: string, fn: string, mt: string) =>
        autofill({
          data: {
            missionId,
            stepLabel,
            fields: fields.map((f) => ({
              key: f.key,
              label: f.label,
              type: f.type,
              description: f.description,
              currentValue: f.currentValue,
            })),
            fileData: fd,
            fileName: fn,
            mimeType: mt,
          },
        });

      let res = await callAutofill(fileData, sendName, mimeType);
      let list = (res?.suggestions ?? []) as Suggestion[];

      // OCR fallback: if nothing came back and the original is a PDF or DOCX,
      // re-send the document as page images so Gemini can OCR scanned content
      // or read documents where text extraction missed everything.
      if (list.length === 0 && (isPdf || isDocx)) {
        try {
          toast.info("No matches yet — retrying with OCR…");
          const imageB64 = await renderDocToStitchedJpeg(file, isPdf);
          if (imageB64) {
            const ocrName =
              file.name.replace(/\.[^.]+$/, "") + "-ocr.jpg";
            res = await callAutofill(imageB64, ocrName, "image/jpeg");
            list = (res?.suggestions ?? []) as Suggestion[];
          }
        } catch (ocrErr) {
          console.warn("[autofill] OCR fallback failed", ocrErr);
        }
      }

      setSuggestions(list);
      // Default-accept high+medium confidence
      const next: Record<string, boolean> = {};
      list.forEach((s) => {
        next[s.key] = s.confidence !== "low";
      });
      setAccepted(next);
      if (list.length === 0) {
        toast.warning("IRIS couldn't extract any fields from this document.");
      } else {
        toast.success(`IRIS proposed ${list.length} field${list.length === 1 ? "" : "s"}`);
      }
    } catch (err: any) {
      toast.error(`Autofill failed: ${err?.message ?? err}`);
    } finally {
      setLoading(false);
    }
  }

  function apply() {
    if (!suggestions) return;
    const patch: Record<string, string | string[]> = {};
    suggestions.forEach((s) => {
      if (!accepted[s.key]) return;
      if (s.value === null || s.value === undefined) return;
      patch[s.key] = s.value;
    });
    if (Object.keys(patch).length === 0) {
      toast.info("Nothing selected to apply");
      return;
    }
    onApply(patch);
    toast.success(`Applied ${Object.keys(patch).length} field${Object.keys(patch).length === 1 ? "" : "s"}`);
    close();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold hover:bg-surface-hover ${className ?? ""}`}
        title={`Upload a document to auto-fill ${stepLabel}`}
      >
        <Sparkles className="h-3.5 w-3.5" style={{ color: GOLD }} />
        Upload to autofill
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-lg border border-border bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" style={{ color: GOLD }} />
                <h2 className="text-sm font-bold">
                  Autofill: <span className="text-muted-foreground">{stepLabel}</span>
                </h2>
              </div>
              <button onClick={close} disabled={loading} className="rounded p-1 hover:bg-surface-hover">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              {!suggestions && (
                <>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Upload a PDF, Word doc, text file, or image (RFP, SOW, briefing, screenshot)
                    and IRIS will propose values for this step's fields. Nothing saves until you
                    review and confirm. Existing values are not overwritten unless you accept the
                    suggestion.
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,.md,.csv,text/plain,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onPickFile(f);
                    }}
                  />
                  <div className="rounded-md border border-dashed border-border bg-surface/50 p-6 text-center">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={loading}
                      className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-bold shadow"
                      style={{ backgroundColor: GOLD, color: NAVY }}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading {fileName}…
                        </>
                      ) : (
                        <>
                          <Upload className="h-3.5 w-3.5" /> Choose file
                        </>
                      )}
                    </button>
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      PDF · DOCX · TXT · image · max 12 MB · {fields.length} fields on this step
                    </div>
                  </div>

                </>
              )}

              {suggestions && (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <FileText className="h-3 w-3" /> {fileName}
                    </div>
                    <div className="text-muted-foreground">
                      {suggestions.length} proposal{suggestions.length === 1 ? "" : "s"}
                    </div>
                  </div>

                  {suggestions.length === 0 ? (
                    <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-400" />
                      <div>
                        IRIS couldn't extract any fields on this step from this document. Try a more
                        focused doc (e.g. the RFP cover page for mission basics).
                      </div>
                    </div>
                  ) : (
                    <div className="max-h-[420px] overflow-auto rounded-md border border-border">
                      <table className="w-full text-[11px]">
                        <thead className="sticky top-0 bg-surface-hover text-[10px] uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="px-2 py-1.5 w-8"></th>
                            <th className="px-2 py-1.5 text-left">Field</th>
                            <th className="px-2 py-1.5 text-left">Current</th>
                            <th className="px-2 py-1.5 text-left">Proposed</th>
                            <th className="px-2 py-1.5 text-left">Source · Confidence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {suggestions.map((s) => {
                            const f = fieldByKey.get(s.key);
                            const proposed = Array.isArray(s.value)
                              ? s.value.join(", ")
                              : String(s.value ?? "");
                            const current = (f?.currentValue || "").trim();
                            const conflict = current && current !== proposed;
                            return (
                              <tr key={s.key} className="border-t border-border/40 align-top">
                                <td className="px-2 py-1.5">
                                  <input
                                    type="checkbox"
                                    checked={!!accepted[s.key]}
                                    onChange={(e) =>
                                      setAccepted((a) => ({ ...a, [s.key]: e.target.checked }))
                                    }
                                  />
                                </td>
                                <td className="px-2 py-1.5 font-medium">{f?.label ?? s.key}</td>
                                <td
                                  className="px-2 py-1.5 max-w-[140px] truncate text-muted-foreground"
                                  title={current || "—"}
                                >
                                  {current || <span className="italic opacity-60">empty</span>}
                                </td>
                                <td
                                  className={`px-2 py-1.5 max-w-[200px] ${
                                    conflict ? "text-amber-400" : "text-foreground"
                                  }`}
                                >
                                  <div className="truncate" title={proposed}>
                                    {proposed || <span className="italic opacity-60">—</span>}
                                  </div>
                                  {conflict && (
                                    <div className="text-[10px] text-amber-400/80">
                                      will overwrite existing
                                    </div>
                                  )}
                                </td>
                                <td className="px-2 py-1.5 text-muted-foreground">
                                  <div className="truncate max-w-[180px]" title={s.source}>
                                    {s.source}
                                  </div>
                                  <ConfidencePill level={s.confidence} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <button
                onClick={close}
                disabled={loading}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-surface-hover disabled:opacity-50"
              >
                Cancel
              </button>
              {suggestions && suggestions.length > 0 && (
                <>
                  <button
                    onClick={reset}
                    disabled={loading}
                    className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-surface-hover disabled:opacity-50"
                  >
                    Try another file
                  </button>
                  <button
                    onClick={apply}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-bold shadow disabled:opacity-50"
                    style={{ backgroundColor: GOLD, color: NAVY }}
                  >
                    Apply selected ({Object.values(accepted).filter(Boolean).length})
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ConfidencePill({ level }: { level: "high" | "medium" | "low" }) {
  const color =
    level === "high"
      ? "bg-emerald-500/15 text-emerald-400"
      : level === "medium"
        ? "bg-amber-500/15 text-amber-400"
        : "bg-rose-500/15 text-rose-400";
  return (
    <span
      className={`mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${color}`}
    >
      {level}
    </span>
  );
}
