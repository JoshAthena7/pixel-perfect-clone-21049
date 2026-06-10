import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Shimmer skeleton block — 1.5s left-to-right light sweep.
 * Base #E8EDF2, highlight #F4F7FA. Use instead of plain spinners.
 */
export function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-[#E8EDF2]",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:animate-[atlas-shimmer_1.5s_ease-in-out_infinite]",
        "before:bg-gradient-to-r before:from-transparent before:via-[#F4F7FA] before:to-transparent",
        className,
      )}
    />
  );
}

export function SkeletonRows({ rows = 5, height = "h-12" }: { rows?: number; height?: string }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Shimmer key={i} className={cn("w-full", height)} />
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 4, height = "h-32" }: { count?: number; height?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Shimmer key={i} className={cn("w-full", height)} />
      ))}
    </div>
  );
}

/**
 * Standardised error state with retry. Use on every tab data fetch.
 */
export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-white p-10 text-center",
        className,
      )}
    >
      <AlertTriangle className="h-10 w-10 text-slate-400" aria-hidden />
      <p className="mt-4 max-w-md text-sm text-slate-600">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" className="mt-5">
          Try Again
        </Button>
      )}
    </div>
  );
}

/**
 * Standardised empty state with optional action.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  variant = "neutral",
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  variant?: "neutral" | "success";
  className?: string;
}) {
  const Icon = variant === "success" ? CheckCircle2 : null;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 p-10 text-center",
        className,
      )}
    >
      {icon ??
        (Icon ? (
          <Icon className="h-10 w-10 text-emerald-500" aria-hidden />
        ) : (
          <div className="h-10 w-10 rounded-full bg-slate-200" aria-hidden />
        ))}
      <p className="mt-4 text-sm font-medium text-slate-800">{title}</p>
      {description && <p className="mt-2 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * AI failure inline banner (amber) with manual fallback + retry.
 */
export function AiFailureBanner({
  message = "IRIS was unable to generate this content. You can fill it in manually.",
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="flex-1">{message}</div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded border border-amber-400 px-2 py-1 text-xs font-medium hover:bg-amber-100"
        >
          Retry IRIS
        </button>
      )}
    </div>
  );
}
