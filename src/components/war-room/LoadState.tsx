import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2 } from "lucide-react";

/**
 * Inline skeleton shown while initial data loads.
 */
export function LoadingSkeleton({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-md border border-border bg-surface/40 px-4 py-6 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

/**
 * Inline error banner with retry — render above content when a query fails.
 */
export function ErrorBanner({
  error,
  onRetry,
  label = "Something went wrong loading this view.",
}: {
  error: string | Error | null;
  onRetry?: () => void;
  label?: string;
}) {
  if (!error) return null;
  const msg = typeof error === "string" ? error : error.message;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-md border border-[color:var(--red)]/40 bg-[color:var(--red)]/10 px-4 py-3 text-sm"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-[color:var(--red)]" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-[color:var(--red)]">{label}</div>
        <div className="mt-0.5 text-xs text-muted-foreground break-words">{msg}</div>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
