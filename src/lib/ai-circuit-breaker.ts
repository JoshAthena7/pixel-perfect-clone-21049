// L4: Lightweight in-memory circuit breaker for AI Gateway calls.
//
// Wraps any AI Gateway fetch. If the gateway has 3 consecutive failures
// within 60s, the breaker OPENS for 30s — every call during that window
// returns immediately with a structured `AICircuitOpenError`. After 30s the
// breaker goes HALF-OPEN: the next call is allowed through; success closes,
// failure re-opens for another 30s.
//
// State is process-local (per Worker isolate). That is acceptable: each
// isolate independently learns about gateway health within ~3 calls.

const FAIL_THRESHOLD = 3;
const FAIL_WINDOW_MS = 60_000;
const OPEN_DURATION_MS = 30_000;

type State = "closed" | "open" | "half-open";

interface Breaker {
  state: State;
  failures: number[]; // timestamps of recent failures
  openedAt: number | null;
}

const breaker: Breaker = { state: "closed", failures: [], openedAt: null };

export const AI_CIRCUIT_OPEN_MESSAGE =
  "IRIS is temporarily unavailable. Your draft has not been submitted. Please try again in a moment.";

export class AICircuitOpenError extends Error {
  constructor() {
    super(AI_CIRCUIT_OPEN_MESSAGE);
    this.name = "AICircuitOpenError";
  }
}

function trimWindow(now: number) {
  breaker.failures = breaker.failures.filter((t) => now - t < FAIL_WINDOW_MS);
}

function recordSuccess() {
  breaker.failures = [];
  breaker.state = "closed";
  breaker.openedAt = null;
}

function recordFailure() {
  const now = Date.now();
  trimWindow(now);
  breaker.failures.push(now);
  if (breaker.failures.length >= FAIL_THRESHOLD) {
    breaker.state = "open";
    breaker.openedAt = now;
  }
}

function tick(): State {
  if (breaker.state === "open" && breaker.openedAt !== null) {
    if (Date.now() - breaker.openedAt >= OPEN_DURATION_MS) {
      breaker.state = "half-open";
    }
  }
  return breaker.state;
}

/**
 * Wrap an AI Gateway call. The provided fn is what would normally happen
 * (e.g. `fetch(gateway, ...)` followed by status checks).
 *
 * The wrapped fn MUST throw on logical AI failure (non-2xx, empty body)
 * so the breaker can count it; resolving normally counts as success.
 */
export async function withAICircuit<T>(fn: () => Promise<T>): Promise<T> {
  const state = tick();
  if (state === "open") throw new AICircuitOpenError();
  try {
    const result = await fn();
    recordSuccess();
    return result;
  } catch (e) {
    recordFailure();
    throw e;
  }
}

/** For diagnostics / Olympus dashboard later. */
export function getCircuitState(): { state: State; failures: number; openedAt: number | null } {
  tick();
  return {
    state: breaker.state,
    failures: breaker.failures.length,
    openedAt: breaker.openedAt,
  };
}

/** Force-close the breaker (Olympus "Refresh IRIS" button). */
export function resetCircuit() {
  breaker.state = "closed";
  breaker.failures = [];
  breaker.openedAt = null;
}
