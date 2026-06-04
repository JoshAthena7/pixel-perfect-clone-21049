import { ShieldAlert } from "lucide-react";
import type { PHIErrorPayload } from "@/lib/phi-detection";

/**
 * C2: Non-dismissible PHI rejection warning.
 *
 * Surfaced whenever a server-side ingestion path returns a PHI_DETECTED error.
 * Writer must acknowledge (click "I understand — let me edit") before they
 * can edit the offending content and resubmit. No override path.
 */
export function PHIRejectionWarning({
  payload,
  onAcknowledge,
}: {
  payload: PHIErrorPayload;
  onAcknowledge: () => void;
}) {
  const patterns = payload.patterns?.length ? payload.patterns.join(", ") : "PHI-like content";
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="phi-warning-title"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-6"
    >
      <div
        className="max-w-xl w-full rounded-2xl border border-red-500/40 bg-[#0b0f17] p-7 shadow-2xl"
        style={{ boxShadow: "0 0 0 1px rgba(239,68,68,0.25), 0 30px 80px rgba(0,0,0,0.6)" }}
      >
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-red-500/15 p-3">
            <ShieldAlert className="h-7 w-7 text-red-400" aria-hidden />
          </div>
          <div className="flex-1">
            <h2 id="phi-warning-title" className="text-lg font-semibold text-red-100">
              Submission blocked — possible PHI detected
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-200">
              {payload.message}
            </p>
            <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs">
              <div className="font-medium text-red-200">Patterns flagged</div>
              <div className="mt-1 text-red-100/90">{patterns}</div>
              <div className="mt-1 text-red-100/60">
                Atlas does not record the matched values — only the pattern types.
              </div>
            </div>
            <p className="mt-4 text-xs text-zinc-400">{payload.support}</p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={onAcknowledge}
                className="rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-400 focus:outline-none focus:ring-2 focus:ring-red-300"
              >
                I understand — let me edit
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
