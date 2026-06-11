import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, FileText, UploadCloud, X, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const BUCKET = "atlas-rfp-documents";
const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXT = [".pdf", ".doc", ".docx"];

const DOC_TYPES = [
  { v: "primary_rfp", l: "Primary RFP" },
  { v: "amendment", l: "Amendment" },
  { v: "attachment", l: "Attachment/Appendix" },
  { v: "scoring_criteria", l: "Scoring Criteria" },
  { v: "prior_qa", l: "Prior Q&A" },
  { v: "other", l: "Other" },
];

type Row = {
  uid: string;
  file: File;
  documentType: string;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  storagePath?: string;
  documentId?: string;
  error?: string;
};

function fileTooLarge(f: File) {
  return f.size > MAX_BYTES;
}
function extOk(f: File) {
  const n = f.name.toLowerCase();
  return ALLOWED_EXT.some((e) => n.endsWith(e));
}
function formatSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function Step1BUpload({
  missionId,
  onAdvance,
}: {
  missionId: string;
  onAdvance: () => void;
}) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate existing uploads
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("mission_documents")
        .select("id, title, document_type, file_url")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: true });
      if (!data) return;
      setRows((cur) => {
        if (cur.length > 0) return cur;
        return data.map((d) => ({
          uid: d.id,
          file: new File([], `${d.title}.pdf`),
          documentType: d.document_type ?? "other",
          progress: 100,
          status: "done" as const,
          storagePath: d.file_url ?? undefined,
          documentId: d.id,
        }));
      });
    })();
  }, [missionId]);

  const hasPrimary = rows.some((r) => r.status === "done" && r.documentType === "primary_rfp");

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      setError(null);
      const accepted: Row[] = [];
      for (const f of Array.from(files)) {
        if (!extOk(f)) {
          setError("Only PDF and Word documents are accepted.");
          continue;
        }
        if (fileTooLarge(f)) {
          setError("File too large. Maximum size is 100MB per file.");
          continue;
        }
        accepted.push({
          uid: crypto.randomUUID(),
          file: f,
          documentType: "other",
          progress: 0,
          status: "queued",
        });
      }
      if (accepted.length === 0) return;
      setRows((cur) => {
        const hasExistingPrimary = cur.some((r) => r.documentType === "primary_rfp");
        const next = [...cur];
        for (let i = 0; i < accepted.length; i++) {
          // First new file becomes Primary RFP if no primary anywhere yet
          if (!hasExistingPrimary && i === 0 && next.every((r) => r.documentType !== "primary_rfp")) {
            accepted[i].documentType = "primary_rfp";
          }
          next.push(accepted[i]);
        }
        return next;
      });
      // Kick off uploads
      for (const r of accepted) void uploadRow(r.uid, r.file);
    },
    [missionId],
  );

  async function uploadRow(uid: string, file: File) {
    setRows((cur) => cur.map((r) => (r.uid === uid ? { ...r, status: "uploading", progress: 5 } : r)));
    try {
      const path = `${missionId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
      // Fake-progress shimmer since supabase-js doesn't expose progress events
      const ticker = setInterval(() => {
        setRows((cur) =>
          cur.map((r) =>
            r.uid === uid && r.status === "uploading" && r.progress < 90
              ? { ...r, progress: Math.min(90, r.progress + 8) }
              : r,
          ),
        );
      }, 250);
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });
      clearInterval(ticker);
      if (upErr) throw upErr;

      const currentType =
        (await new Promise<string>((resolve) => {
          setRows((cur) => {
            const r = cur.find((x) => x.uid === uid);
            resolve(r?.documentType ?? "other");
            return cur;
          });
        })) || "other";

      const { data: userData } = await supabase.auth.getUser();
      const title = file.name.replace(/\.[^.]+$/, "").slice(0, 200);
      const { data: docRow, error: insErr } = await supabase
        .from("mission_documents")
        .insert({
          mission_id: missionId,
          document_type: currentType,
          title,
          file_url: path,
          uploaded_by: userData.user?.id ?? null,
          is_amendment: currentType === "amendment",
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      setRows((cur) =>
        cur.map((r) =>
          r.uid === uid
            ? { ...r, status: "done", progress: 100, storagePath: path, documentId: docRow!.id }
            : r,
        ),
      );
    } catch (e: any) {
      console.error("upload failed", e);
      setRows((cur) =>
        cur.map((r) => (r.uid === uid ? { ...r, status: "error", error: e?.message ?? "Upload failed" } : r)),
      );
    }
  }

  async function changeType(uid: string, newType: string) {
    setRows((cur) => cur.map((r) => (r.uid === uid ? { ...r, documentType: newType } : r)));
    const row = rows.find((r) => r.uid === uid);
    if (row?.documentId) {
      await supabase
        .from("mission_documents")
        .update({ document_type: newType, is_amendment: newType === "amendment" })
        .eq("id", row.documentId);
    }
  }

  async function removeRow(uid: string) {
    const row = rows.find((r) => r.uid === uid);
    setRows((cur) => cur.filter((r) => r.uid !== uid));
    if (row?.documentId) {
      await supabase.from("mission_documents").delete().eq("id", row.documentId);
    }
    if (row?.storagePath) {
      await supabase.storage.from(BUCKET).remove([row.storagePath]);
    }
  }

  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Feed IRIS your intelligence.</h1>
        <StepMetaIndicator irisCount={3} youCount={4} />
      </div>

      <div className="rounded-lg border-l-4 border-l-[var(--athena-gold)] border border-border bg-[var(--athena-navy-light)]/10 p-4 flex gap-3">
        <Sparkles className="h-5 w-5 text-[var(--athena-gold)] shrink-0 mt-0.5" />
        <p className="text-sm text-foreground/90 leading-relaxed">
          Upload the RFP and any supporting documents — amendments, attachments, scoring criteria, prior Q&amp;A.
          The more I have, the better I can build this mission. I will read everything.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] uppercase tracking-wider text-[var(--athena-gold)] font-medium">
          RFP Document
        </span>
        <InputSourceBadge source="you" />
      </div>
      {rows.length === 0 && (
        <p className="-mt-5 text-[11px] italic text-muted-foreground hidden md:block">
          Upload the PDF or Word file. IRIS reads it automatically after upload.
        </p>
      )}


      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "w-full rounded-xl border-2 border-dashed transition-colors py-12 px-6 flex flex-col items-center gap-3 text-center",
          "bg-[var(--athena-navy-dark)]/40 border-[var(--athena-gold)]/60 hover:border-[var(--athena-gold)] hover:bg-[var(--athena-navy-dark)]/60",
          dragging && "border-[var(--athena-gold)] bg-[var(--athena-gold)]/10",
        )}
      >
        <UploadCloud className="h-10 w-10 text-[var(--athena-gold)]" />
        <p className="text-base font-medium text-foreground">Drop your RFP documents here or click to browse</p>
        <p className="text-xs text-muted-foreground">PDF and Word documents only · Multiple files accepted</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </button>

      {error && <p className="text-sm text-amber-400 -mt-3">{error}</p>}

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.uid}
              className="rounded-lg border border-border bg-surface/60 p-3 flex items-center gap-3"
            >
              <Select value={r.documentType} onValueChange={(v) => changeType(r.uid, v)}>
                <SelectTrigger className="w-[170px] shrink-0 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t.v} value={t.v}>
                      {t.l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground truncate">{r.file.name}</p>
                {r.status === "uploading" && (
                  <div className="mt-1.5">
                    <Progress value={r.progress} className="h-1" />
                  </div>
                )}
                {r.status === "error" && (
                  <p className="text-xs text-destructive mt-0.5">{r.error ?? "Upload failed"}</p>
                )}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {r.file.size > 0 ? formatSize(r.file.size) : ""}
              </span>
              {r.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
              <button
                onClick={() => removeRow(r.uid)}
                className="text-muted-foreground hover:text-destructive shrink-0"
                aria-label="Remove file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && !hasPrimary && (
        <p className="text-sm text-amber-400">
          Please designate at least one document as Primary RFP to continue.
        </p>
      )}

      <div className="flex justify-center pt-2">
        <Button
          onClick={onAdvance}
          disabled={!hasPrimary}
          className={cn(
            "w-full sm:w-auto sm:min-w-[260px] bg-[var(--athena-gold)] text-[var(--athena-navy-dark)] hover:bg-[var(--athena-gold-light)]",
            !hasPrimary && "opacity-40",
          )}
        >
          Feed IRIS →
        </Button>
      </div>

      <div className="text-center">
        <button
          onClick={() =>
            navigate({
              to: "/olympus/missions/$missionId/wizard",
              params: { missionId },
              search: { step: 1 },
            })
          }
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back to basics
        </button>
      </div>
    </div>
  );
}
