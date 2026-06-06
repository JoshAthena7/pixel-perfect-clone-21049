/**
 * The Wisdom Engine — a shared pool of IRIS/Collective lines used across
 * atmospheric moments (closing frame, idle states, ambient ticker, etc.).
 * Single source of truth so tone stays consistent across the platform.
 */

export type WisdomTone = "closing" | "ambient" | "support";

const CLOSING = [
  "The Collective is still here.",
  "The room stays lit.",
  "Your work continues, even in your absence.",
  "Return when you're ready. We'll be here.",
  "The signal holds.",
];

const AMBIENT = [
  "Before there were platforms, there were rooms.",
  "Every question is a door. Walk through it.",
  "The mission is the work. The work is the mission.",
  "You are not alone in this room.",
  "Quiet hands. Steady minds. Better answers.",
  "What matters gets written down.",
  "A draft is a beginning, not a verdict.",
  "Read the question twice. Then write.",
  "The best signal is the one you almost missed.",
  "Slow is smooth. Smooth is sharp.",
  "Help is one click away. Always.",
  "Hold the line. We'll hold it with you.",
  "The Collective remembers what one person cannot.",
];

const SUPPORT = [
  "Asking is a strength, not a tax.",
  "Someone here has answered this before.",
  "You don't have to carry it alone.",
];

const POOLS: Record<WisdomTone, string[]> = {
  closing: CLOSING,
  ambient: AMBIENT,
  support: SUPPORT,
};

/** Random line from a pool. */
export function wisdomLine(tone: WisdomTone = "ambient"): string {
  const pool = POOLS[tone];
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Deterministic daily line — same line all day for a given pool, rotates
 * once per UTC day. Stable for screenshots, predictable for users.
 */
export function dailyWisdomLine(tone: WisdomTone = "ambient"): string {
  const pool = POOLS[tone];
  const day = Math.floor(Date.now() / 86_400_000);
  return pool[day % pool.length];
}
