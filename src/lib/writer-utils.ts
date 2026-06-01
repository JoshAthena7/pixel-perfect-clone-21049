// Shared utilities for the Writer experience (WRITER-1..14).

export type PensDownInfo = {
  date: Date;
  days: number;
  tone: "red" | "yellow" | "green";
  short: string; // "Jun 12"
  long: string;  // "June 12 · 11 days"
  urgent: boolean;
};

export function pensDownInfo(iso?: string | null): PensDownInfo | null {
  if (!iso) return null;
  const date = new Date(iso);
  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  const tone: PensDownInfo["tone"] =
    days < 7 ? "red" : days <= 14 ? "yellow" : "green";
  const short = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const long =
    date.toLocaleDateString("en-US", { month: "long", day: "numeric" }) +
    ` · ${days < 0 ? `${Math.abs(days)}d overdue` : `${days} day${days === 1 ? "" : "s"}`}`;
  return { date, days, tone, short, long, urgent: days < 7 };
}

export function pensDownPillClass(tone: PensDownInfo["tone"]) {
  if (tone === "red") return "bg-red/15 text-red border-red/30";
  if (tone === "yellow") return "bg-yellow/15 text-yellow border-yellow/30";
  return "bg-green/15 text-green border-green/30";
}

// ---------- Write Mode (WRITER-1) ----------
const WRITE_MODE_KEY = "studio:write-mode";

export function getWriteMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(WRITE_MODE_KEY) === "on";
}

export function applyWriteMode(on: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.writeMode = on ? "on" : "off";
  try { window.localStorage.setItem(WRITE_MODE_KEY, on ? "on" : "off"); } catch { /* ignore */ }
}

// ---------- Per-question last-visit tracking (WRITER-5) ----------
const VISIT_KEY = (qid: string) => `q:last-visit:${qid}`;

export function getLastQuestionVisit(qid: string): number {
  if (typeof window === "undefined") return 0;
  const v = window.localStorage.getItem(VISIT_KEY(qid));
  return v ? Number(v) : 0;
}

export function markQuestionVisited(qid: string) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(VISIT_KEY(qid), String(Date.now())); } catch { /* ignore */ }
}

// ---------- Status labels (WRITER-3) ----------
export const STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  in_review: "In Review",
  complete: "Complete",
};

export const STATUS_ORDER = ["not_started", "in_progress", "in_review", "complete"] as const;

export function statusBadgeClass(status: string) {
  switch (status) {
    case "complete":    return "bg-green/15 text-green border-green/30";
    case "in_review":   return "bg-primary/15 text-primary border-primary/30";
    case "in_progress": return "bg-yellow/15 text-yellow border-yellow/30";
    default:            return "bg-surface-hover text-muted-foreground border-border";
  }
}
