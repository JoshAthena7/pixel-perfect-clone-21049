import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, FileText, Plus, UploadCloud, X, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { IrisMark } from "@/components/iris/IrisMark";
import { MissionAnalysisAnimation } from "@/components/mission-wizard/MissionAnalysisAnimation";
import { MissionAnalysisResults } from "@/components/mission-wizard/MissionAnalysisResults";
import { MissionMemoryChat } from "@/components/mission-wizard/MissionMemoryChat";
import { MissionIntelDropScreen } from "@/components/mission-wizard/MissionIntelDropScreen";
import { MissionTeamAssignScreen } from "@/components/mission-wizard/MissionTeamAssignScreen";
import { MissionBrainScreen } from "@/components/mission-wizard/MissionBrainScreen";
import { AthenaInsightsScreen } from "@/components/mission-wizard/AthenaInsightsScreen";
import { MissionLaunchScreen } from "@/components/mission-wizard/MissionLaunchScreen";
import { cn } from "@/lib/utils";

const BUCKET = "atlas-rfp-documents";
const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXT = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".csv",
  ".txt",
  ".md",
  ".rtf",
  ".eml",
  ".msg",
];

type Classification = {
  documentType: string; // db enum value
  label: string; // display label
};

function classifyFile(name: string, isFirst: boolean): Classification {
  const n = name.toLowerCase();
  if (/addend|amend/.test(n)) return { documentType: "amendment", label: "Addendum" };
  if (/q.?&.?a|question/.test(n)) return { documentType: "prior_qa", label: "Q&A" };
  if (/scor|eval(?!uat)|criteria/.test(n))
    return { documentType: "scoring_criteria", label: "Scoring Criteria" };
  if (/(prior|past|sample).*(proposal|response)|proposal.*(prior|past|sample)|winning.proposal/.test(n))
    return { documentType: "other", label: "Prior Proposal" };
  if (/attach|appendix|exhibit/.test(n))
    return { documentType: "attachment", label: "Attachment" };
  if (/meeting|minutes|notes/.test(n))
    return { documentType: "other", label: "Meeting Notes" };
  if (/\.eml$|\.msg$|email/.test(n))
    return { documentType: "other", label: "Email" };
  if (/\.xlsx?$|\.csv$/.test(n))
    return { documentType: "other", label: "Spreadsheet" };
  if (/\.pptx?$/.test(n))
    return { documentType: "other", label: "Presentation" };
  if (/rfp|sow|solicitation|rfq/.test(n))
    return { documentType: "primary_rfp", label: "RFP" };
  return isFirst
    ? { documentType: "primary_rfp", label: "RFP" }
    : { documentType: "other", label: "Document" };
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

type Row = {
  uid: string;
  file: File;
  documentType: string;
  label: string;
  progress: number;
  status: "queued" | "uploading" | "classifying" | "done" | "error";
  storagePath?: string;
  documentId?: string;
  error?: string;
};

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
  const [phase, setPhase] = useState<"upload" | "analyzing" | "results" | "memory" | "intel" | "team" | "brain" | "insights" | "launch">("upload");

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
        return data.map((d) => {
          const c = classifyFile(d.title ?? "", false);
          return {
            uid: d.id,
            file: new File([], `${d.title}.pdf`),
            documentType: d.document_type ?? c.documentType,
            label:
              d.document_type === "primary_rfp"
                ? "RFP"
                : d.document_type === "amendment"
                  ? "Addendum"
                  : d.document_type === "prior_qa"
                    ? "Q&A"
                    : d.document_type === "scoring_criteria"
                      ? "Scoring Criteria"
                      : d.document_type === "attachment"
                        ? "Attachment"
                        : c.label,
            progress: 100,
            status: "done" as const,
            storagePath: d.file_url ?? undefined,
            documentId: d.id,
          };
        });
      });
    })();
  }, [missionId]);

  const hasAnyDone = rows.some((r) => r.status === "done");

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      setError(null);
      const accepted: Row[] = [];
      const existingHasRfp = rows.some((r) => r.documentType === "primary_rfp");
      let firstAssigned = existingHasRfp;
      for (const f of Array.from(files)) {
        if (!extOk(f)) {
          setError(`Unsupported file type: ${f.name}`);
          continue;
        }
        if (f.size > MAX_BYTES) {
          setError(`${f.name} is too large (max 100MB).`);
          continue;
        }
        const c = classifyFile(f.name, !firstAssigned);
        if (c.documentType === "primary_rfp") firstAssigned = true;
        accepted.push({
          uid: crypto.randomUUID(),
          file: f,
          documentType: c.documentType,
          label: c.label,
          progress: 0,
          status: "queued",
        });
      }
      if (accepted.length === 0) return;
      setRows((cur) => [...cur, ...accepted]);
      for (const r of accepted) void uploadRow(r);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [missionId, rows.length],
  );

  async function uploadRow(initial: Row) {
    const uid = initial.uid;
    setRows((cur) =>
      cur.map((r) => (r.uid === uid ? { ...r, status: "uploading", progress: 5 } : r)),
    );
    try {
      const path = `${missionId}/${Date.now()}-${initial.file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
      const ticker = setInterval(() => {
        setRows((cur) =>
          cur.map((r) =>
            r.uid === uid && r.status === "uploading" && r.progress < 90
              ? { ...r, progress: Math.min(90, r.progress + 8) }
              : r,
          ),
        );
      }, 220);
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, initial.file, {
          cacheControl: "3600",
          upsert: false,
          contentType: initial.file.type || undefined,
        });
      clearInterval(ticker);
      if (upErr) throw upErr;

      // Flip to "classifying" briefly to give IRIS a moment of presence
      setRows((cur) =>
        cur.map((r) =>
          r.uid === uid ? { ...r, status: "classifying", progress: 100 } : r,
        ),
      );

      const { data: userData } = await supabase.auth.getUser();
      const title = initial.file.name.replace(/\.[^.]+$/, "").slice(0, 200);
      const { data: docRow, error: insErr } = await supabase
        .from("mission_documents")
        .insert({
          mission_id: missionId,
          document_type: initial.documentType,
          title,
          file_url: path,
          uploaded_by: userData.user?.id ?? null,
          is_amendment: initial.documentType === "amendment",
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      // Hold the classifying state long enough to feel intentional
      await new Promise((res) => setTimeout(res, 900));

      setRows((cur) =>
        cur.map((r) =>
          r.uid === uid
            ? {
                ...r,
                status: "done",
                progress: 100,
                storagePath: path,
                documentId: docRow!.id,
              }
            : r,
        ),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      console.error("upload failed", e);
      setRows((cur) =>
        cur.map((r) => (r.uid === uid ? { ...r, status: "error", error: msg } : r)),
      );
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

  if (phase === "analyzing") {
    return <MissionAnalysisAnimation onComplete={() => setPhase("results")} />;
  }
  if (phase === "results") {
    return <MissionAnalysisResults missionId={missionId} onContinue={() => setPhase("memory")} />;
  }
  if (phase === "memory") {
    return <MissionMemoryChat missionId={missionId} onContinue={() => setPhase("intel")} />;
  }
  if (phase === "intel") {
    return <MissionIntelDropScreen missionId={missionId} onContinue={() => setPhase("team")} />;
  }
  if (phase === "team") {
    return <MissionTeamAssignScreen missionId={missionId} onContinue={() => setPhase("brain")} />;
  }
  if (phase === "brain") {
    return (
      <MissionBrainScreen
        missionId={missionId}
        onContinue={() => setPhase("insights")}
        onJumpToPhase={(p) => setPhase(p as typeof phase)}
      />
    );
  }
  if (phase === "insights") {
    return <AthenaInsightsScreen missionId={missionId} onContinue={() => setPhase("launch")} />;
  }
  if (phase === "launch") {
    return (
      <MissionLaunchScreen
        missionId={missionId}
        onLaunched={onAdvance}
        onJumpToPhase={(p) => setPhase(p as typeof phase)}
      />
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col px-4 py-10"
      style={{ background: "#0A1628", color: "white" }}
    >
      <style>{`
        @keyframes feed-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      <div className="w-full max-w-[760px] mx-auto">
        {/* IRIS header */}
        <div className="flex items-start gap-4 mb-8">
          <div
            className="shrink-0 rounded-full flex items-center justify-center"
            style={{
              width: 56,
              height: 56,
              background: "rgba(127,119,221,0.12)",
              border: "1px solid rgba(167,139,250,0.35)",
              boxShadow: "0 0 24px rgba(167,139,250,0.25)",
            }}
          >
            <IrisMark size={32} glow />
          </div>
          <div className="pt-1 flex-1">
            <div
              className="text-[11px] uppercase tracking-[0.22em]"
              style={{ color: "#C49A2B" }}
            >
              IRIS · Mission Intelligence Officer
            </div>
            <div className="text-white text-[18px] mt-1 leading-snug">
              Drop everything here.{" "}
              <span className="text-white/55">I'll organize it.</span>
            </div>
          </div>
        </div>

        {/* Drop zone */}
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
            "w-full rounded-2xl transition-all py-20 px-6 flex flex-col items-center gap-4 text-center",
          )}
          style={{
            background: dragging
              ? "rgba(196,154,43,0.08)"
              : "rgba(255,255,255,0.025)",
            border: `2px dashed ${dragging ? "#C49A2B" : "rgba(196,154,43,0.4)"}`,
            boxShadow: dragging
              ? "inset 0 0 0 1px rgba(196,154,43,0.35), 0 0 40px -10px rgba(196,154,43,0.35)"
              : "inset 0 1px 0 rgba(255,255,255,0.03)",
          }}
        >
          <UploadCloud
            className="h-12 w-12"
            style={{ color: "#C49A2B" }}
            strokeWidth={1.4}
          />
          <div className="space-y-1.5">
            <p className="text-[18px] font-medium text-white">
              Drop documents here
            </p>
            <p className="text-[13px] text-white/45">
              or click to browse · PDF, Word, Excel, PowerPoint, CSV, text, email
              exports, meeting notes
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ALLOWED_EXT.join(",")}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </button>

        {error && (
          <div className="mt-4 flex items-center gap-2 text-[13px] text-amber-400">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* File list */}
        {rows.length > 0 && (
          <div className="mt-8 space-y-2">
            {rows.map((r) => (
              <FileRow key={r.uid} row={r} onRemove={() => removeRow(r.uid)} />
            ))}
          </div>
        )}

        {/* Add more */}
        {rows.length > 0 && (
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 text-[13px] text-white/55 hover:text-white transition-colors px-3 py-2 rounded-md border border-white/10 hover:border-white/25"
            >
              <Plus className="h-3.5 w-3.5" />
              Add more
            </button>
          </div>
        )}

        {/* Continue */}
        <div className="mt-12 flex justify-end">
          <button
            onClick={() => setPhase("analyzing")}
            disabled={!hasAnyDone}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-6 py-3 text-[14px] font-medium transition-all",
              !hasAnyDone && "opacity-40 cursor-not-allowed",
            )}
            style={{
              background: "#C49A2B",
              color: "#0A1628",
              boxShadow: hasAnyDone
                ? "0 8px 24px -8px rgba(196,154,43,0.55)"
                : "none",
            }}
          >
            Continue →
          </button>
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate({ to: "/olympus/missions" })}
            className="text-[12px] text-white/40 hover:text-white/70 transition-colors"
          >
            ← Back to missions
          </button>
        </div>
      </div>
    </div>
  );
}

function FileRow({ row, onRemove }: { row: Row; onRemove: () => void }) {
  return (
    <div
      className="rounded-lg flex items-center gap-3 px-4 py-3"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <FileText className="h-4 w-4 text-white/45 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[14px] text-white truncate">{row.file.name}</p>
          {row.file.size > 0 && (
            <span className="text-[11px] text-white/35 shrink-0">
              {formatSize(row.file.size)}
            </span>
          )}
        </div>
        {row.status === "uploading" && (
          <div className="mt-1.5 h-[3px] w-full rounded-full overflow-hidden bg-white/8">
            <div
              className="h-full transition-all duration-200"
              style={{ width: `${row.progress}%`, background: "#C49A2B" }}
            />
          </div>
        )}
        {row.status === "error" && (
          <p className="text-[11px] text-red-400 mt-0.5">
            {row.error ?? "Upload failed"}
          </p>
        )}
      </div>

      {/* Status / classification chip */}
      {row.status === "uploading" && (
        <span className="text-[11px] text-white/45 shrink-0">Uploading…</span>
      )}
      {row.status === "classifying" && (
        <span
          className="text-[11px] shrink-0 px-2.5 py-1 rounded-full"
          style={{
            color: "rgba(200,195,255,0.95)",
            background:
              "linear-gradient(90deg, rgba(127,119,221,0.15) 0%, rgba(167,139,250,0.35) 50%, rgba(127,119,221,0.15) 100%)",
            backgroundSize: "200% 100%",
            border: "1px solid rgba(167,139,250,0.4)",
            animation: "feed-shimmer 1.6s linear infinite",
          }}
        >
          Classifying…
        </span>
      )}
      {row.status === "done" && (
        <>
          <span
            className="text-[11px] shrink-0 px-2.5 py-1 rounded-full font-medium"
            style={{
              color: "#0A1628",
              background: "#C49A2B",
            }}
          >
            {row.label}
          </span>
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
        </>
      )}
      <button
        onClick={onRemove}
        className="text-white/35 hover:text-red-400 transition-colors shrink-0"
        aria-label="Remove file"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
