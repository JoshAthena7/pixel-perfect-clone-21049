// Athena Standard Journey Template — pure helpers (client-safe).
// All dates calculated backwards from submission_deadline.

export type TemplatePhaseKey =
  | "writers_write"
  | "red_team"
  | "mock_score"
  | "writer_recovery"
  | "gold_team"
  | "final_drafts"
  | "quality_control"
  | "executive_review"
  | "pens_down";

export type TemplatePhaseKind = "drafting" | "review" | "gate" | "pens_down";

export type TemplatePhaseSpec = {
  key: TemplatePhaseKey;
  name: string;
  kind: TemplatePhaseKind;
  description: string;
};

// Order index = position in this array (0 = Writers Write, 8 = Pens Down)
export const TEMPLATE_PHASES: TemplatePhaseSpec[] = [
  {
    key: "writers_write",
    name: "Writers Write",
    kind: "drafting",
    description:
      "First draft period. Writers work on all assigned sections. All assignments must be accepted before this phase begins.",
  },
  {
    key: "red_team",
    name: "Red Team Draft Due",
    kind: "gate",
    description:
      "All first drafts must be submitted to the shared workspace by the end of this phase. Hard deadline.",
  },
  {
    key: "mock_score",
    name: "Mock Score",
    kind: "review",
    description:
      "IRIS scores all submitted sections against RFP evaluation criteria. Gaps report distributed to all writers and the Engagement Lead.",
  },
  {
    key: "writer_recovery",
    name: "Writer Recovery",
    kind: "drafting",
    description:
      "Writers address red team feedback and Score Me gaps. Final opportunity for significant content changes.",
  },
  {
    key: "gold_team",
    name: "Gold Team",
    kind: "review",
    description:
      "Senior strategic review. Engagement Lead and executive reviewers assess strategic alignment, win theme consistency, and overall proposal quality.",
  },
  {
    key: "final_drafts",
    name: "Final Drafts",
    kind: "gate",
    description:
      "All sections finalized. Content locked. No substantive changes after this phase.",
  },
  {
    key: "quality_control",
    name: "Quality Control",
    kind: "review",
    description:
      "Compliance matrix verification. Submission package assembly. Formatting review. No content changes.",
  },
  {
    key: "executive_review",
    name: "Executive Review",
    kind: "review",
    description:
      "Final executive sign-off before submission. Last opportunity to raise critical concerns.",
  },
  {
    key: "pens_down",
    name: "Pens Down",
    kind: "pens_down",
    description: "Client deadline. Proposal submitted. Writing stops.",
  },
];

// Fixed durations (in days) for every phase except Writers Write, which absorbs
// the remaining timeline between today and the start of Red Team.
export const DEFAULT_DURATIONS: Record<Exclude<TemplatePhaseKey, "writers_write">, number> = {
  red_team: 7,
  mock_score: 2,
  writer_recovery: 7,
  gold_team: 5,
  final_drafts: 5,
  quality_control: 3,
  executive_review: 2,
  pens_down: 1,
};

// Minimum durations for compress operations.
export const MIN_DURATIONS: Partial<Record<TemplatePhaseKey, number>> = {
  pens_down: 1,
  executive_review: 1,
  quality_control: 1,
};

const DAY_MS = 86_400_000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

export type ComputedPhase = {
  key: TemplatePhaseKey;
  name: string;
  kind: TemplatePhaseKind;
  start: Date;
  end: Date;
  duration: number; // days, inclusive of end-exclusive => (end - start) in days
};

// Compute phases by chaining backwards from the deadline using a duration map.
// writersWriteDuration: optional explicit value; otherwise computed to fill from "today".
export function computePhasesFromDurations(
  deadlineISO: string,
  durations: Record<TemplatePhaseKey, number>,
  startReference: Date = new Date(),
): ComputedPhase[] {
  const deadline = startOfDay(new Date(deadlineISO));
  const today = startOfDay(startReference);

  // Build end->start chain from Pens Down backwards.
  const reverseOrder: TemplatePhaseKey[] = [
    "pens_down",
    "executive_review",
    "quality_control",
    "final_drafts",
    "gold_team",
    "writer_recovery",
    "mock_score",
    "red_team",
    "writers_write",
  ];

  const out: Record<TemplatePhaseKey, ComputedPhase> = {} as Record<
    TemplatePhaseKey,
    ComputedPhase
  >;

  let cursor = deadline; // running "end" date for next phase
  for (const key of reverseOrder) {
    const spec = TEMPLATE_PHASES.find((p) => p.key === key)!;
    const dur = Math.max(1, durations[key] ?? 1);
    const end = cursor;
    const start = addDays(end, -dur);
    out[key] = { key, name: spec.name, kind: spec.kind, start, end, duration: dur };
    cursor = start;
  }

  // If writers_write start is after today, fine. If before today and the caller
  // wanted "fill to today", caller should pass an explicit large writers_write
  // duration. The default template helper below handles that.
  // Ensure writers_write start is not after today by extending it if needed only
  // when caller invokes the default-template helper.
  return TEMPLATE_PHASES.map((p) => out[p.key]);
}

// Build the initial Athena Standard durations map. Writers Write fills the gap
// between today and the start of Red Team (deadline - 32 days).
export function defaultDurations(
  deadlineISO: string,
  startReference: Date = new Date(),
): Record<TemplatePhaseKey, number> {
  const deadline = startOfDay(new Date(deadlineISO));
  const today = startOfDay(startReference);

  // Sum of fixed phases between Red Team start and deadline = 32 days
  // (red_team 7 + mock 2 + recovery 7 + gold 5 + final 5 + qc 3 + exec 2 + pens 1).
  const fixedTail = 32;
  const redTeamStart = addDays(deadline, -fixedTail);
  const writersWriteDur = Math.max(1, diffDays(today, redTeamStart));

  return {
    writers_write: writersWriteDur,
    ...DEFAULT_DURATIONS,
  };
}

// Convert a Date to ISO at noon UTC so date-only inputs round-trip cleanly.
export function dateToISO(d: Date): string {
  const x = startOfDay(d);
  return new Date(x.getTime() + 12 * 3_600_000).toISOString();
}

// Apply a compression (positive number) or expansion (negative number) of N days
// across all phases except Pens Down, weighted by current duration.
// Writers Write absorbs the most because it is the longest. Executive Review
// and Quality Control are clamped to MIN_DURATIONS.
export function adjustDurations(
  current: Record<TemplatePhaseKey, number>,
  deltaDays: number, // positive = compress (subtract), negative = expand (add)
): Record<TemplatePhaseKey, number> {
  if (deltaDays === 0) return { ...current };

  // Phases that can change (all except pens_down)
  const adjustable: TemplatePhaseKey[] = [
    "writers_write",
    "red_team",
    "mock_score",
    "writer_recovery",
    "gold_team",
    "final_drafts",
    "quality_control",
    "executive_review",
  ];

  const next: Record<TemplatePhaseKey, number> = { ...current };

  if (deltaDays > 0) {
    // Compress: distribute reduction proportionally
    let remaining = deltaDays;
    // iterate up to N times to absorb rounding/min-clamps
    for (let iter = 0; iter < 20 && remaining > 0; iter++) {
      const totalAdjustable = adjustable.reduce((s, k) => {
        const min = MIN_DURATIONS[k] ?? 1;
        return s + Math.max(0, next[k] - min);
      }, 0);
      if (totalAdjustable <= 0) break;

      let appliedThisRound = 0;
      // Sort by duration descending so longest absorbs first
      const byLongest = [...adjustable].sort((a, b) => next[b] - next[a]);
      for (const k of byLongest) {
        const min = MIN_DURATIONS[k] ?? 1;
        const available = Math.max(0, next[k] - min);
        if (available <= 0) continue;
        const share = (next[k] / totalAdjustable) * remaining;
        let take = Math.min(available, Math.max(1, Math.round(share)));
        if (take > remaining - appliedThisRound) take = remaining - appliedThisRound;
        if (take <= 0) continue;
        next[k] -= take;
        appliedThisRound += take;
        if (appliedThisRound >= remaining) break;
      }
      if (appliedThisRound === 0) break;
      remaining -= appliedThisRound;
    }
  } else {
    // Expand: distribute addition proportionally; weight by current duration
    const addDays = -deltaDays;
    const total = adjustable.reduce((s, k) => s + next[k], 0) || 1;
    let added = 0;
    const byLongest = [...adjustable].sort((a, b) => next[b] - next[a]);
    for (const k of byLongest) {
      const share = (next[k] / total) * addDays;
      const give = Math.max(1, Math.round(share));
      next[k] += give;
      added += give;
      if (added >= addDays) break;
    }
    // If overshoot, trim from writers_write
    if (added > addDays) {
      const over = added - addDays;
      next.writers_write = Math.max(1, next.writers_write - over);
    } else if (added < addDays) {
      next.writers_write += addDays - added;
    }
  }

  return next;
}

export function durationsFromPhases(
  phases: Array<{ kind: string; name: string; start_date: string; end_date: string }>,
): Record<TemplatePhaseKey, number> | null {
  const out: Partial<Record<TemplatePhaseKey, number>> = {};
  for (const p of phases) {
    const spec = TEMPLATE_PHASES.find(
      (s) => s.name.toLowerCase() === (p.name ?? "").toLowerCase(),
    );
    if (!spec) continue;
    const dur = Math.max(
      1,
      Math.round(
        (new Date(p.end_date).getTime() - new Date(p.start_date).getTime()) / DAY_MS,
      ),
    );
    out[spec.key] = dur;
  }
  // Need all keys present
  const keys = TEMPLATE_PHASES.map((p) => p.key);
  for (const k of keys) if (out[k] == null) return null;
  return out as Record<TemplatePhaseKey, number>;
}
