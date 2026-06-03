import { useEffect, useMemo, useState } from "react";
import { Sparkles, X } from "lucide-react";
import {
  applyPersonFirstReplacement,
  scanForPersonFirstFlags,
  type PersonFirstFlag,
} from "@/lib/person-first";

type Props = {
  value: string;
  onChange: (next: string) => void;
  /** Debounce delay in ms. Default 1500 (≈ 2 seconds of no typing). */
  debounceMs?: number;
  /** Optional className for the container. */
  className?: string;
};

// Gentle IRIS coaching hint that appears under a textarea when a writer types
// non-person-first language. Never blocks submission. Never shows as an error.
export function PersonFirstHint({ value, onChange, debounceMs = 1500, className }: Props) {
  const [scanned, setScanned] = useState("");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Debounce the scan input.
  useEffect(() => {
    const t = setTimeout(() => setScanned(value), debounceMs);
    return () => clearTimeout(t);
  }, [value, debounceMs]);

  const flags = useMemo(() => scanForPersonFirstFlags(scanned), [scanned]);

  // Reset dismissed set when text changes substantially (different length).
  useEffect(() => {
    if (!scanned) setDismissed(new Set());
  }, [scanned]);

  // Show flags one at a time, in order, skipping any the writer dismissed.
  const active = flags.find((f) => !dismissed.has(flagKey(f)));
  if (!active) return null;

  const apply = () => {
    // Re-scan against the *current* value (not the snapshotted one) so we
    // operate on what the user actually sees in the textarea right now.
    const fresh = scanForPersonFirstFlags(value);
    const live =
      fresh.find((f) => f.pattern === active.pattern && f.match.toLowerCase() === active.match.toLowerCase()) ??
      fresh[0];
    if (!live) return;
    onChange(applyPersonFirstReplacement(value, live));
  };

  const dismiss = () => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(flagKey(active));
      return next;
    });
  };

  const remaining = flags.filter((f) => !dismissed.has(flagKey(f))).length;

  return (
    <div
      className={
        "mt-2 rounded-lg border border-teal-500/30 bg-teal-500/[0.06] px-3 py-2 text-sm text-teal-100 " +
        (className ?? "")
      }
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-teal-300">
            IRIS — Person-first suggestion
            {remaining > 1 ? (
              <span className="ml-2 rounded bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-medium text-teal-200">
                {remaining} flagged
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-foreground/90">
            <span className="line-through opacity-60">{active.match}</span>
            <span className="mx-2 text-teal-300">→</span>
            <span className="font-medium text-teal-100">{active.replacement}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={apply}
              className="rounded-md bg-teal-500/20 px-2.5 py-1 text-xs font-semibold text-teal-100 hover:bg-teal-500/30"
            >
              Apply suggestion
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-teal-200/80 hover:text-teal-100"
            >
              <X className="h-3 w-3" /> Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function flagKey(f: PersonFirstFlag): string {
  return `${f.pattern}@${f.start}`;
}
