/**
 * Intel Setup Wizard — full-screen 4-step overlay that consolidates every
 * intel-loading entry point into one guided flow.
 *
 *   Step 1 — Upload Your Documents   (wraps DocumentsTab)
 *   Step 2 — Review Extracted Signals (wraps IntelReviewQueue)
 *   Step 3 — Approve What's Relevant  (offers optional Scan for new intel)
 *   Step 4 — Intel Is Ready           (summary + navigation)
 */
import { useEffect, useMemo, useState } from "react";
import { X, Check, ArrowRight, Loader2, Zap } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DocumentsTab } from "@/components/mission-command/oracle/feed/DocumentsTab";
import { IntelReviewQueue } from "@/components/olympus/IntelReviewQueue";
import { runOracleStage } from "@/lib/oracle-pipeline.functions";
import {
  REQUIRED_DOCUMENTS,
  matchDocumentToChecklist,
} from "@/components/mission-command/oracle/checklist/oracle-checklist-spec";

const GOLD = "#C49A2B";

type Step = 1 | 2 | 3 | 4;

export function IntelSetupWizard({
  open,
  onOpenChange,
  missionId,
  initialStep = 1,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  missionId: string;
  initialStep?: Step;
}) {
  const [step, setStep] = useState<Step>(initialStep);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) setStep(initialStep);
  }, [open, initialStep]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // -- Data: documents for Step 1 progress
  const docsQ = useQuery({
    queryKey: ["intel-wizard-docs", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_documents")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id,title,document_checklist_category,processing_status" as any)
        .eq("mission_id", missionId);
      return (data ?? []) as Array<{
        id: string;
        title: string | null;
        document_checklist_category: string | null;
        processing_status: string | null;
      }>;
    },
    refetchInterval: open ? 5_000 : false,
    enabled: open && !!missionId,
  });

  const requiredStatus = useMemo(() => {
    const docs = docsQ.data ?? [];
    return REQUIRED_DOCUMENTS.map((req) => {
      const match = docs.find((d) => {
        const cat = d.document_checklist_category ?? matchDocumentToChecklist(d.title);
        return cat === req.id;
      });
      return { req, match };
    });
  }, [docsQ.data]);

  const uploadedRequiredCount = requiredStatus.filter((r) => !!r.match).length;
  const totalRequired = REQUIRED_DOCUMENTS.length;

  // -- Data: signal counts for Step 2 progress
  const signalsQ = useQuery({
    queryKey: ["intel-wizard-signals", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("oracle_signals")
        .select("id,status")
        .or(`mission_id.eq.${missionId},tier.in.(platform,state)`);
      const list = (data ?? []) as Array<{ id: string; status: string | null }>;
      return {
        total: list.length,
        approved: list.filter((s) => s.status === "approved" || s.status === "pushed").length,
        pending: list.filter((s) => s.status === "needs_review" || s.status === "pending_review").length,
      };
    },
    refetchInterval: open ? 8_000 : false,
    enabled: open && !!missionId,
  });

  const runStage = useServerFn(runOracleStage);
  const scan = useMutation({
    mutationFn: async () => {
      for (const stage of ["scraper", "classifier", "promoter"] as const) {
        await runStage({ data: { stage } });
      }
    },
    onSuccess: () => {
      toast.success("Scan complete — new signals added to the review queue");
      signalsQ.refetch();
    },
    onError: (e: Error) => toast.error(e.message || "Scan failed"),
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-stretch justify-center"
      style={{ background: "rgba(2,6,15,0.85)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="w-full max-w-[920px] mx-auto my-6 flex flex-col rounded-lg overflow-hidden"
        style={{
          background: "#0a121f",
          border: `1px solid rgba(196,154,43,0.35)`,
          boxShadow: "0 24px 60px -10px rgba(0,0,0,0.7)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5"
          style={{ height: 56, borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span style={{ color: GOLD, fontWeight: 600, fontSize: 13, letterSpacing: "0.08em" }}>
              INTEL SETUP
            </span>
            <span className="text-white/30">·</span>
            <span className="text-white/70 text-[12px]">
              Step {step} of 4 — {STEP_TITLES[step - 1]}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-white/40 hover:text-white/80"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress dots */}
        <div className="flex items-center gap-2 px-5 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-[3px] flex-1 rounded-full"
              style={{ background: n <= step ? GOLD : "rgba(255,255,255,0.08)" }}
            />
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {step === 1 && (
            <StepUpload
              missionId={missionId}
              uploadedRequiredCount={uploadedRequiredCount}
              totalRequired={totalRequired}
            />
          )}
          {step === 2 && (
            <StepReview
              missionId={missionId}
              approved={signalsQ.data?.approved ?? 0}
              total={signalsQ.data?.total ?? 0}
              loading={signalsQ.isLoading}
            />
          )}
          {step === 3 && (
            <StepApprove
              approved={signalsQ.data?.approved ?? 0}
              onScan={() => scan.mutate()}
              scanning={scan.isPending}
            />
          )}
          {step === 4 && (
            <StepDone
              approved={signalsQ.data?.approved ?? 0}
              uploaded={docsQ.data?.length ?? 0}
              onGoReview={() => {
                onOpenChange(false);
                navigate({ to: "/missions/$missionId/olympus", params: { missionId } });
              }}
              onGoBriefing={() => {
                onOpenChange(false);
                navigate({ to: "/missions/$missionId/briefing", params: { missionId } });
              }}
            />
          )}
        </div>

        {/* Footer nav */}
        <div
          className="flex items-center justify-between px-5"
          style={{ height: 56, borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-[11px] text-white/40 hover:text-white/70"
          >
            Skip for now →
          </button>
          <div className="flex items-center gap-2">
            {step > 1 && step < 4 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as Step)}
                className="px-3 py-1.5 rounded border border-white/15 text-[12px] text-white/70 hover:bg-white/5"
              >
                ← Back
              </button>
            )}
            {step < 4 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s + 1) as Step)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded text-[12px] font-medium"
                style={{ background: GOLD, color: "#070f1c" }}
              >
                Continue <ArrowRight className="h-3 w-3" />
              </button>
            )}
            {step === 4 && (
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded text-[12px] font-medium"
                style={{ background: GOLD, color: "#070f1c" }}
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const STEP_TITLES = [
  "Upload Your Documents",
  "Review Extracted Signals",
  "Approve What's Relevant",
  "Intel Is Ready",
];

function StepUpload({
  missionId,
  uploadedRequiredCount,
  totalRequired,
}: {
  missionId: string;
  uploadedRequiredCount: number;
  totalRequired: number;
}) {
  return (
    <div>
      <p className="text-[12px] text-white/60 mb-4">
        IRIS reads every document you upload and extracts intel for your team.
      </p>
      <div
        className="text-[11px] mb-4 inline-block px-2 py-1 rounded"
        style={{
          background: uploadedRequiredCount === totalRequired ? "rgba(34,197,94,0.1)" : "rgba(196,154,43,0.1)",
          color: uploadedRequiredCount === totalRequired ? "#22c55e" : GOLD,
          border: `1px solid ${uploadedRequiredCount === totalRequired ? "rgba(34,197,94,0.25)" : "rgba(196,154,43,0.25)"}`,
        }}
      >
        {uploadedRequiredCount} of {totalRequired} required documents uploaded
      </div>
      <DocumentsTab missionId={missionId} />
    </div>
  );
}

function StepReview({
  missionId,
  approved,
  total,
  loading,
}: {
  missionId: string;
  approved: number;
  total: number;
  loading: boolean;
}) {
  return (
    <div>
      <p className="text-[12px] text-white/60 mb-3">
        IRIS read your documents and found{" "}
        <span className="text-white/85 font-medium">{total}</span> pieces of intelligence.
        Approve what's accurate — approved signals power every writer's brief.
      </p>
      {loading ? (
        <div className="text-[11px] text-white/40 py-8 text-center">Loading signals…</div>
      ) : total === 0 ? (
        <div
          className="rounded p-6 text-center"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)" }}
        >
          <Loader2 className="h-5 w-5 mx-auto animate-spin text-white/40 mb-3" />
          <div className="text-[12px] text-white/70">IRIS is still reading your documents.</div>
          <div className="text-[11px] text-white/40 mt-1">This usually takes 2–3 minutes.</div>
        </div>
      ) : (
        <>
          <div className="text-[11px] text-white/50 mb-2">
            {approved} of {total} reviewed
          </div>
          <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
            <IntelReviewQueue missionId={missionId} taxonomyNodeId={null} />
          </div>
        </>
      )}
    </div>
  );
}

function StepApprove({
  approved,
  onScan,
  scanning,
}: {
  approved: number;
  onScan: () => void;
  scanning: boolean;
}) {
  return (
    <div>
      <p className="text-[12px] text-white/60 mb-5">
        You've approved <span className="text-white/85 font-medium">{approved}</span> signals.
        IRIS will use these to brief your writers.
      </p>
      <div
        className="rounded p-4 mb-5"
        style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)" }}
      >
        <div className="flex items-center gap-2 text-[12px] text-white/85 mb-1">
          <Check className="h-3.5 w-3.5 text-green-400" /> {approved} signals approved
        </div>
        <div className="text-[11px] text-white/55">
          ◈ Grounding IRIS briefs · ⚡ Writers will see intel-backed briefs when they open questions
        </div>
      </div>
      <div
        className="rounded p-4"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="text-[12px] text-white/85 mb-1">Scan for new intel (optional)</div>
        <div className="text-[11px] text-white/55 mb-3">
          IRIS can scan external sources for intel about this procurement. This takes a few minutes
          and adds more signals to review.
        </div>
        <button
          type="button"
          onClick={onScan}
          disabled={scanning}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-[12px] text-white/85 hover:bg-white/5 disabled:opacity-50"
          style={{ borderColor: GOLD }}
        >
          {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" style={{ color: GOLD }} />}
          Scan for new intel
        </button>
      </div>
    </div>
  );
}

function StepDone({
  approved,
  uploaded,
  onGoReview,
  onGoBriefing,
}: {
  approved: number;
  uploaded: number;
  onGoReview: () => void;
  onGoBriefing: () => void;
}) {
  return (
    <div className="text-center py-4">
      <div className="text-[18px] text-white font-medium mb-4">Your intel is ready.</div>
      <ul className="inline-block text-left space-y-1.5 text-[12px] text-white/80 mb-6">
        <li><Check className="inline h-3.5 w-3.5 text-green-400 mr-2" />{uploaded} documents uploaded</li>
        <li><Check className="inline h-3.5 w-3.5 text-green-400 mr-2" />{approved} signals approved</li>
        <li><Check className="inline h-3.5 w-3.5 text-green-400 mr-2" />IRIS is briefing your team</li>
      </ul>
      <p className="text-[11px] text-white/55 max-w-md mx-auto mb-6 leading-relaxed">
        Writers who open their questions will see IRIS briefs grounded in your approved signals.
        New signals will appear in Signal Review as IRIS finds more intel.
      </p>
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={onGoReview}
          className="px-4 py-2 rounded border border-white/15 text-[12px] text-white/85 hover:bg-white/5"
        >
          Go to Signal Review →
        </button>
        <button
          type="button"
          onClick={onGoBriefing}
          className="px-4 py-2 rounded text-[12px] font-medium"
          style={{ background: GOLD, color: "#070f1c" }}
        >
          Go to Mission Briefing →
        </button>
      </div>
      <div className="text-[10px] text-white/35 mt-6">
        IRIS will continue finding new signals. Check Signal Review regularly.
      </div>
    </div>
  );
}
