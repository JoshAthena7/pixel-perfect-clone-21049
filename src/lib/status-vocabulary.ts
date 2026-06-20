/**
 * Centralized status vocabulary for ATLAS.
 *
 * Replaces ad-hoc strings like "in_progress", "INPROGRESS", "IN PROGRESS",
 * "draft_v2", "needs_review", etc. with a single canonical display label
 * and tone (color family).
 *
 * Usage:
 *   import { statusLabel, statusTone } from "@/lib/status-vocabulary";
 *   <span style={{ color: statusTone(s).color }}>{statusLabel(s)}</span>
 */

export type StatusTone = "neutral" | "info" | "progress" | "success" | "warning" | "danger" | "muted";

const TONE_COLORS: Record<StatusTone, { color: string; bg: string; border: string }> = {
  neutral:  { color: "rgba(255,255,255,0.85)", bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.12)" },
  info:     { color: "#7aa7ff",                bg: "rgba(122,167,255,0.10)", border: "rgba(122,167,255,0.25)" },
  progress: { color: "#c9a84c",                bg: "rgba(201,168,76,0.10)",  border: "rgba(201,168,76,0.30)"  },
  success:  { color: "#4ade80",                bg: "rgba(74,222,128,0.10)",  border: "rgba(74,222,128,0.25)"  },
  warning:  { color: "#fbbf24",                bg: "rgba(251,191,36,0.10)",  border: "rgba(251,191,36,0.30)"  },
  danger:   { color: "#f87171",                bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.30)" },
  muted:    { color: "rgba(255,255,255,0.45)", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)" },
};

/** Canonical label + tone for any known status string. */
const MAP: Record<string, { label: string; tone: StatusTone }> = {
  // Lifecycle
  not_started:    { label: "Not started",   tone: "muted"    },
  notstarted:     { label: "Not started",   tone: "muted"    },
  draft:          { label: "Draft",         tone: "neutral"  },
  in_progress:    { label: "In progress",   tone: "progress" },
  inprogress:     { label: "In progress",   tone: "progress" },
  active:         { label: "Active",        tone: "progress" },
  pending:        { label: "Pending",       tone: "info"     },
  queued:         { label: "Queued",        tone: "info"     },
  processing:     { label: "Processing",    tone: "progress" },

  // Review
  needs_review:   { label: "Needs review",  tone: "warning"  },
  in_review:      { label: "In review",     tone: "info"     },
  needs_sme:      { label: "Needs SME",     tone: "warning"  },
  ready_for_review: { label: "Ready for review", tone: "info" },

  // Resolution
  approved:       { label: "Approved",      tone: "success"  },
  complete:       { label: "Complete",      tone: "success"  },
  completed:      { label: "Complete",      tone: "success"  },
  done:           { label: "Done",          tone: "success"  },
  resolved:       { label: "Resolved",      tone: "success"  },
  submitted:      { label: "Submitted",     tone: "success"  },
  published:      { label: "Published",     tone: "success"  },

  // Negative
  blocked:        { label: "Blocked",       tone: "danger"   },
  at_risk:        { label: "At risk",       tone: "warning"  },
  stale:          { label: "Stale",         tone: "warning"  },
  failed:         { label: "Failed",        tone: "danger"   },
  error:          { label: "Error",         tone: "danger"   },
  rejected:       { label: "Rejected",      tone: "danger"   },
  dismissed:      { label: "Dismissed",     tone: "muted"    },
  archived:       { label: "Archived",      tone: "muted"    },
  cancelled:      { label: "Cancelled",     tone: "muted"    },
  canceled:       { label: "Cancelled",     tone: "muted"    },

  // Mission health
  on_track:       { label: "On track",      tone: "success"  },
  ontrack:        { label: "On track",      tone: "success"  },
  off_track:      { label: "Off track",     tone: "danger"   },

  // Assignment
  unassigned:     { label: "Unassigned",    tone: "muted"    },
  assigned:       { label: "Assigned",      tone: "info"     },
};

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function statusLabel(raw: string | null | undefined, fallback = "—"): string {
  if (!raw) return fallback;
  const k = normalizeKey(String(raw));
  if (MAP[k]) return MAP[k].label;
  // Generic prettify: snake_case -> Sentence case
  return k
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/(\b[A-Z])(\w*)/g, (_, a, b) => a + b.toLowerCase());
}

export function statusTone(raw: string | null | undefined): { color: string; bg: string; border: string; tone: StatusTone } {
  const k = raw ? normalizeKey(String(raw)) : "";
  const tone: StatusTone = MAP[k]?.tone ?? "neutral";
  return { ...TONE_COLORS[tone], tone };
}

/** Convenience component-ready inline style for a status pill. */
export function statusPillStyle(raw: string | null | undefined): React.CSSProperties {
  const t = statusTone(raw);
  return {
    color: t.color,
    background: t.bg,
    border: `1px solid ${t.border}`,
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
    display: "inline-block",
  };
}
