import { useState } from "react";
import { Zap, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  approveIrisSetupSuggestions,
  dismissIrisSetupSuggestions,
} from "@/lib/iris-setup-autofill.functions";

export function IrisAutofillBanner({
  missionId,
  status,
  written,
  onChange,
}: {
  missionId: string;
  status: string | null | undefined;
  written?: number;
  onChange: () => void;
}) {
  const approveFn = useServerFn(approveIrisSetupSuggestions);
  const dismissFn = useServerFn(dismissIrisSetupSuggestions);
  const [busy, setBusy] = useState<"approve" | "dismiss" | null>(null);

  if (status !== "suggested") return null;

  async function approve() {
    setBusy("approve");
    try {
      await approveFn({ data: { missionId } });
      toast.success("Suggestions approved");
      onChange();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function dismiss() {
    setBusy("dismiss");
    try {
      await dismissFn({ data: { missionId } });
      onChange();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-md border border-[#C49A22]/40 bg-[#C49A22]/5 px-5 py-4">
      <div className="flex items-start gap-3">
        <Zap className="h-4 w-4 text-[#C49A22] shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-foreground">
            IRIS pre-filled this record from your uploaded documents
            {typeof written === "number" && written > 0 ? ` (${written} field${written === 1 ? "" : "s"})` : ""}.
          </div>
          <div className="mt-0.5 text-[12px] text-muted-foreground">
            Review each field — suggested values are marked <span className="inline-flex items-center gap-1 text-[#C49A22]"><Zap className="h-2.5 w-2.5" />IRIS</span>.
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={approve}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#C49A22] px-3 py-1.5 text-[12px] font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50 transition"
          >
            {busy === "approve" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Looks good — approve all
          </button>
          <button
            onClick={dismiss}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-surface-hover disabled:opacity-50 transition"
          >
            {busy === "dismiss" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            I'll review manually
          </button>
        </div>
      </div>
    </div>
  );
}

export function IrisSuggestedBadge({ source = "IRIS" }: { source?: string }) {
  return (
    <span
      title={`${source} suggested this from your uploaded documents. Edit to override.`}
      className="inline-flex items-center gap-1 rounded-full bg-[#C49A22]/10 border border-[#C49A22]/40 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.1em] text-[#C49A22]"
    >
      <Zap className="h-2.5 w-2.5" />
      IRIS
    </span>
  );
}
