// Shared countdown rendering for Pens Down dates and submission deadlines.
import type { CSSProperties } from "react";

export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  // Treat YYYY-MM-DD as local-midnight to avoid off-by-one
  const iso = dateStr.length === 10 ? dateStr + "T00:00:00" : dateStr;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function fullDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const iso = dateStr.length === 10 ? dateStr + "T00:00:00" : dateStr;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Pens Down countdown pill: > 14d muted, 7–14 yellow, < 7 red+bold, 0 = Today, negative = Overdue. */
export function PensDownCountdown({
  date,
  className = "",
}: {
  date: string | null | undefined;
  className?: string;
}) {
  const days = daysUntil(date);
  if (days === null) {
    return <span className={`text-muted-foreground text-xs ${className}`}>—</span>;
  }

  let label: string;
  const style: CSSProperties = {};
  let weight = "";

  if (days < 0) {
    label = "Overdue";
    style.color = "var(--red)";
    weight = "font-semibold";
  } else if (days === 0) {
    label = "Today";
    style.color = "var(--red)";
    weight = "font-semibold";
  } else if (days < 7) {
    label = `${days} day${days === 1 ? "" : "s"}`;
    style.color = "var(--red)";
    weight = "font-semibold";
  } else if (days <= 14) {
    label = `${days} days`;
    style.color = "var(--yellow)";
  } else {
    label = `${days} days`;
    style.color = "var(--text-secondary, hsl(var(--muted-foreground)))";
  }

  return (
    <span
      title={`Pens Down: ${fullDate(date)}`}
      className={`text-xs tabular-nums ${weight} ${className}`}
      style={style}
    >
      {label}
    </span>
  );
}

/** Submission countdown for the health strip — color rules differ from Pens Down. */
export function SubmissionCountdown({ date }: { date: string | null | undefined }) {
  const days = daysUntil(date);
  if (days === null) return null;

  const style: CSSProperties = {};
  let weight = "";
  let pulse = false;

  if (days < 0) {
    style.color = "var(--red)";
    weight = "font-semibold";
    pulse = true;
  } else if (days < 7) {
    style.color = "var(--red)";
    weight = "font-semibold";
    pulse = true;
  } else if (days < 15) {
    style.color = "var(--red)";
    weight = "font-semibold";
  } else if (days <= 30) {
    style.color = "var(--yellow)";
  } else {
    style.color = "var(--text-secondary, hsl(var(--muted-foreground)))";
  }

  const label =
    days < 0
      ? `Submission ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`
      : days === 0
      ? "Submission today"
      : `Submission in ${days} day${days === 1 ? "" : "s"}`;

  return (
    <span
      title={`Submission: ${fullDate(date)}`}
      className={`text-xs tabular-nums ${weight} ${pulse ? "animate-pulse" : ""}`}
      style={style}
    >
      {label}
    </span>
  );
}
