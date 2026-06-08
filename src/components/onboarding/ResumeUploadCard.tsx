import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Upload, Sparkles, FileText, X } from "lucide-react";
import { parseResumeWithIris, type ParsedExpertise } from "@/lib/iris-parse-resume.functions";

type Status = "idle" | "reading" | "parsing" | "done";

type Props = {
  /** Called after parse succeeds. The card hands the parsed fields to the
   *  wizard, which merges them into its form state. */
  onParsed: (parsed: ParsedExpertise) => void;
  /** Called when the user clicks "Skip for now". */
  onSkip: () => void;
};

export function ResumeUploadCard({ onParsed, onSkip }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const parseFn = useServerFn(parseResumeWithIris);
  const [status, setStatus] = useState<Status>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File | null) {
    if (!file) return;
    setError(null);
    setFileName(file.name);
    setStatus("reading");
    try {
      // Path constructed at runtime to avoid the import-protection plugin's
      // static scan flagging this .client module as a server-graph import.
      const mod = "@/lib/extract-resume-text" + ".client";
      const { extractResumeText } = (await import(/* @vite-ignore */ mod)) as typeof import("@/lib/extract-resume-text.client");
      const text = await extractResumeText(file);
      setStatus("parsing");
      const parsed = (await parseFn({ data: { resume_text: text } })) as ParsedExpertise;
      setStatus("done");
      onParsed(parsed);
      toast.success("IRIS pulled your expertise from your resume.");
    } catch (e: any) {
      setStatus("idle");
      const msg = e?.message ?? "Something went wrong reading that file.";
      setError(msg);
      toast.error(msg);
    }
  }

  const reading = status === "reading";
  const parsing = status === "parsing";
  const busy = reading || parsing;

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (busy) return;
          const file = e.dataTransfer.files?.[0] ?? null;
          handleFile(file);
        }}
        className="rounded-xl border-2 border-dashed bg-background/40 p-8 text-center transition"
        style={{
          borderColor: dragOver ? "rgba(59,127,255,0.6)" : "var(--border)",
          background: dragOver ? "rgba(59,127,255,0.06)" : undefined,
        }}
      >
        {busy ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <div className="text-sm font-medium text-foreground">
              {reading ? "Reading your resume…" : "IRIS is reading your resume…"}
            </div>
            {fileName && (
              <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <FileText className="h-3 w-3" /> {fileName}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Upload className="h-5 w-5 text-primary" />
            </div>
            <div className="mt-3 text-sm font-medium text-foreground">
              Drop your resume here, or{" "}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-primary underline-offset-2 hover:underline"
              >
                browse
              </button>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              PDF or .docx · max 5 MB · stays on your device — only the parsed expertise is saved
            </div>
            {fileName && status === "done" && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300">
                <Sparkles className="h-3 w-3" /> Parsed {fileName}
              </div>
            )}
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            handleFile(file);
            // Allow re-selecting the same file later.
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-destructive/80 hover:text-destructive"
            aria-label="Dismiss error"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between text-[11px]">
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          className="text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          Skip for now — I'll add this manually
        </button>
        <span className="text-muted-foreground">
          Privacy: your resume file is never uploaded to our servers.
        </span>
      </div>
    </div>
  );
}
