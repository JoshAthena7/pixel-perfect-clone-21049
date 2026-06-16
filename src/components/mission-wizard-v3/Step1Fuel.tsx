/**
 * Step 1 — Fuel IRIS. Mission name + multi-file upload + "Analyze with IRIS".
 * Reuses the existing mission_documents upload pipeline.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, FileText, Loader2, Plus, Sparkles, UploadCloud, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { analyzeMissionStep } from "@/lib/iris-mission-analysis.functions";
import { runIrisRfpExtraction } from "@/lib/run-iris-rfp.browser";
import { extractRFPText } from "@/lib/extract-rfp-text.browser";
import { Input } from "@/components/ui/input";
import { WizardStepHeading, WizardFooter } from "./WizardShellV3";
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
];

const BASICS_FIELDS = [
  { key: "client_agency", label: "Client / Agency" },
  { key: "opportunity_title", label: "Opportunity Title" },
  { key: "solicitation_number", label: "Solicitation Number" },
  { key: "state_location", label: "State / Location" },
  { key: "program_type", label: "Program Type / Classification" },
  { key: "mission_type", label: "Mission Type (rfp, rfq, csa, sole_source, recompete)" },
  { key: "prime_or_sub", label: "Prime or Sub" },
  { key: "contract_value", label: "Contract Value" },
  { key: "period_of_performance", label: "Period of Performance" },
  { key: "rfp_release_date", label: "RFP Release Date" },
  { key: "proposal_due_date", label: "Proposal Due Date" },
  { key: "page_limit", label: "Page Limit" },
  { key: "submission_method", label: "Submission Method" },
];

import type { DocumentPurpose } from "@/lib/oracle/types";

const PURPOSE_OPTIONS: { value: DocumentPurpose; label: string; desc: string }[] = [
  { value: "procurement", label: "Procurement", desc: "IRIS extracts requirements, evaluation criteria, and compliance obligations." },
  { value: "competitive_intel", label: "Comp Intel", desc: "IRIS maps incumbent advantages and prior win patterns." },
  { value: "writing_standards", label: "Writing Guide", desc: "IRIS conditions all content generation on this voice and tone." },
  { value: "client_strategy", label: "Client Strategy", desc: "IRIS extracts client-stated priorities as high-authority inputs." },
  { value: "reference", label: "Reference", desc: "IRIS uses for background context only." },
];

function guessPurpose(name: string): DocumentPurpose {
  const n = name.toLowerCase();
  if (/rfp|rfq|solicitation|amendment|sow|contract/.test(n)) return "procurement";
  if (/style|guide|voice|tone|brand|writing/.test(n)) return "writing_standards";
  if (/strategy|overview|deck|brief|positioning/.test(n)) return "client_strategy";
  if (/incumbent|prior|former|response|competitor/.test(n)) return "competitive_intel";
  return "reference";
}

type Row = {
  uid: string;
  name: string;
  size: number;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  documentId?: string;
  error?: string;
  purpose?: DocumentPurpose;
  isStyleGuide?: boolean;
};

async function extractTextFromBlob(blob: Blob, fileName: string): Promise<string> {
  const lower = fileName.toLowerCase();
  if (
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".csv") ||
    lower.endsWith(".rtf")
  ) {
    return blob.text();
  }
  const file = new File([blob], fileName, { type: blob.type });
  return extractRFPText(file);
}

export function Step1Fuel({
  missionId,
  missionName,
  onMissionNameChange,
  onAdvance,
  onBack,
}: {
  missionId: string;
  missionName: string;
  onMissionNameChange: (s: string) => void;
  onAdvance: () => void;
  onBack: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const analyzeFn = useServerFn(analyzeMissionStep);
  // Pass 2 (per-section question extraction) is orchestrated client-side
  // via runIrisRfpExtraction so we don't need a direct server fn wrapper here.
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState(missionName);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setName(missionName), [missionName]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("mission_documents")
        .select("id, title, file_url, document_purpose, is_style_guide")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: true });
      if (!data) return;
      setRows((cur) =>
        cur.length
          ? cur
          : data.map((d) => ({
              uid: d.id,
              name: d.title ?? "Document",
              size: 0,
              progress: 100,
              status: "done" as const,
              documentId: d.id,
              purpose: (d.document_purpose as DocumentPurpose | null) ?? guessPurpose(d.title ?? ""),
              isStyleGuide: !!d.is_style_guide,
            })),
      );
    })();
  }, [missionId]);

  const hasAnyDone = rows.some((r) => r.status === "done");
  const canAnalyze = name.trim().length > 0 && hasAnyDone && !analyzing;

  const saveName = async (v: string) => {
    setName(v);
    onMissionNameChange(v);
    await supabase
      .from("missions")
      .update({ name: v.trim() || "Untitled Mission" })
      .eq("id", missionId);
  };

  // Fire-and-forget purpose update. Style guide is single-select per mission.
  function setRowPurpose(uid: string, purpose: DocumentPurpose) {
    setRows((cur) => cur.map((r) => (r.uid === uid ? { ...r, purpose } : r)));
    const r = rows.find((x) => x.uid === uid);
    if (r?.documentId) {
      void supabase
        .from("mission_documents")
        .update({ document_purpose: purpose })
        .eq("id", r.documentId);
    }
  }
  function setRowStyleGuide(uid: string, isStyleGuide: boolean) {
    setRows((cur) =>
      cur.map((r) => {
        if (r.uid === uid) return { ...r, isStyleGuide };
        if (isStyleGuide && r.isStyleGuide) return { ...r, isStyleGuide: false };
        return r;
      }),
    );
    const target = rows.find((x) => x.uid === uid);
    if (isStyleGuide) {
      // Unset all others first
      const others = rows.filter((x) => x.isStyleGuide && x.uid !== uid && x.documentId);
      others.forEach((o) => {
        void supabase.from("mission_documents").update({ is_style_guide: false }).eq("id", o.documentId!);
      });
    }
    if (target?.documentId) {
      void supabase
        .from("mission_documents")
        .update({ is_style_guide: isStyleGuide })
        .eq("id", target.documentId);
    }
  }


  async function uploadRow(initial: Row, file: File) {
    setRows((cur) =>
      cur.map((r) => (r.uid === initial.uid ? { ...r, status: "uploading", progress: 10 } : r)),
    );
    try {
      const path = `${missionId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: userData } = await supabase.auth.getUser();
      const guessedPurpose = guessPurpose(file.name);
      const { data: doc, error: insErr } = await supabase
        .from("mission_documents")
        .insert({
          mission_id: missionId,
          document_type:
            rows.length === 0 && file.name.toLowerCase().match(/rfp|sow|solicit/)
              ? "primary_rfp"
              : "other",
          document_purpose: guessedPurpose,
          title: file.name.replace(/\.[^.]+$/, "").slice(0, 200),
          file_url: path,
          uploaded_by: userData.user?.id ?? null,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      setRows((cur) =>
        cur.map((r) =>
          r.uid === initial.uid ? { ...r, status: "done", progress: 100, documentId: doc.id, purpose: guessedPurpose } : r,
        ),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setRows((cur) =>
        cur.map((r) => (r.uid === initial.uid ? { ...r, status: "error", error: msg } : r)),
      );
    }
  }

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      setError(null);
      for (const f of Array.from(files)) {
        if (!ALLOWED_EXT.some((e) => f.name.toLowerCase().endsWith(e))) {
          setError(`Unsupported file type: ${f.name}`);
          continue;
        }
        if (f.size > MAX_BYTES) {
          setError(`${f.name} is too large (max 100MB).`);
          continue;
        }
        const row: Row = {
          uid: crypto.randomUUID(),
          name: f.name,
          size: f.size,
          progress: 0,
          status: "queued",
        };
        setRows((cur) => [...cur, row]);
        void uploadRow(row, f);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [missionId, rows.length],
  );

  async function analyze() {
    setAnalyzing(true);
    setAnalyzeResult(null);
    try {
      // runIrisRfpExtraction reads documents, runs Pass 1 (structure) as a
      // single short server call, then drives Pass 2 (per-section questions)
      // from the browser with bounded concurrency — no long single-shot
      // server request, so the Worker can't time out and bounce the wizard.
      const [rfp, basics] = await Promise.all([
        runIrisRfpExtraction(missionId),
        analyzeFn({ data: { missionId, wizardStep: 2, fields: BASICS_FIELDS } }),
      ]);
      const basicsCount = basics.extractions?.length ?? 0;
      const qCount = rfp?.counts?.questions ?? 0;
      const sCount = rfp?.counts?.sections ?? 0;
      const cCount = rfp?.counts?.compliance ?? 0;
      const parts = [
        `${basicsCount} basics fields`,
        rfp ? `${qCount} questions` : null,
        rfp ? `${sCount} sections` : null,
        rfp ? `${cCount} compliance items` : null,
      ].filter(Boolean);
      setAnalyzeResult(
        `IRIS extracted ${parts.join(", ")} from ${basics.document_count ?? 0} documents. Steps 3–7 will refine as you visit them.`,
      );
    } catch (e) {
      setAnalyzeResult(`Analysis failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div>
      <WizardStepHeading
        title="Fuel IRIS."
        subtitle="Upload everything. IRIS will read it all and pre-populate your entire mission setup."
      />

      <div className="space-y-6">
        <div>
          <label className="text-[12px] uppercase tracking-[0.14em] text-white/55 mb-2 block">
            Mission Name *
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={(e) => saveName(e.target.value)}
            placeholder="e.g. NJ FamilyCare MLTSS Recompete 2026"
            className="bg-white/5 border-white/15 text-white"
          />
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
          }}
          className="w-full rounded-2xl py-12 px-6 flex flex-col items-center gap-3 text-center transition-all hover:bg-white/5"
          style={{
            background: "rgba(255,255,255,0.025)",
            border: "2px dashed rgba(201,168,76,0.4)",
          }}
        >
          <UploadCloud className="h-10 w-10" style={{ color: "#c9a84c" }} strokeWidth={1.4} />
          <div>
            <p className="text-[15px] font-medium text-white">Drop documents here</p>
            <p className="text-[12.5px] text-white/45 mt-0.5">
              RFP · Addenda · Past proposals · State plans · Win/loss reviews · Anything relevant
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ALLOWED_EXT.join(",")}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </button>

        {error && (
          <div className="flex items-center gap-2 text-[13px] text-amber-400">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}

        {rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((r) => {
              const purpose = r.purpose ?? guessPurpose(r.name);
              const purposeDesc = PURPOSE_OPTIONS.find((p) => p.value === purpose)?.desc;
              return (
                <div
                  key={r.uid}
                  className="rounded-lg px-3 py-2.5 border border-white/10 bg-white/[0.03]"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-white/45 shrink-0" />
                    <span className="text-[13.5px] text-white truncate flex-1">{r.name}</span>
                    {r.status === "uploading" && (
                      <span className="text-[11px] text-white/45">Uploading {r.progress}%</span>
                    )}
                    {r.status === "done" && <span className="text-[11px] text-emerald-400">Ready</span>}
                    {r.status === "error" && (
                      <span className="text-[11px] text-red-400">{r.error}</span>
                    )}
                  </div>
                  {r.status === "done" && (
                    <div className="mt-2.5 pl-7">
                      <div className="flex flex-wrap gap-1.5">
                        {PURPOSE_OPTIONS.map((opt) => {
                          const selected = purpose === opt.value;
                          return (
                            <button
                              key={opt.value}
                              onClick={() => setRowPurpose(r.uid, opt.value)}
                              className="px-2 py-0.5 rounded-full text-[11px] transition-colors"
                              style={{
                                border: selected ? "1px solid #C49A2B" : "1px solid rgba(255,255,255,0.08)",
                                color: selected ? "#fff" : "rgba(255,255,255,0.45)",
                                background: selected ? "rgba(196,154,43,0.08)" : "transparent",
                              }}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      {purposeDesc && (
                        <p className="mt-1.5 text-[11px] text-white/45">{purposeDesc}</p>
                      )}
                      {purpose === "writing_standards" && (
                        <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-white/65 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!r.isStyleGuide}
                            onChange={(e) => setRowStyleGuide(r.uid, e.target.checked)}
                            className="h-3 w-3 accent-amber-500"
                          />
                          <span>★ Mark as primary style guide</span>
                        </label>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <button
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 text-[12px] text-white/55 hover:text-white px-3 py-1.5 rounded-md border border-white/10"
            >
              <Plus className="h-3.5 w-3.5" /> Add more
            </button>
          </div>
        )}

        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{ background: "rgba(196,154,43,0.06)", border: "1px solid rgba(196,154,43,0.25)" }}
        >
          <Sparkles className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#C49A2B" }} />
          <div className="flex-1">
            <p className="text-[13.5px] text-white">
              {analyzing
                ? "IRIS is reading your documents…"
                : (analyzeResult ??
                  "When you click Analyze, IRIS reads every uploaded document and pre-populates Mission Basics. Steps 3–7 generate when you land on them.")}
            </p>
            <button
              disabled={!canAnalyze}
              onClick={analyze}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-medium disabled:opacity-40"
              style={{ background: "#C49A2B", color: "#0D1B3E" }}
            >
              {analyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {analyzing ? "Analyzing…" : analyzeResult ? "Re-analyze" : "Analyze with IRIS"}
            </button>
          </div>
        </div>
      </div>

      <WizardFooter
        step={1}
        onBack={onBack}
        onContinue={async () => {
          if (!analyzeResult && hasAnyDone && !analyzing) {
            await analyze();
          }
          onAdvance();
        }}
        continueDisabled={!hasAnyDone || !name.trim() || analyzing}
        continueHint={
          !hasAnyDone
            ? "Upload at least one document to continue"
            : !analyzeResult
              ? "Continue will run IRIS analysis automatically"
              : undefined
        }
      />

    </div>
  );
}
