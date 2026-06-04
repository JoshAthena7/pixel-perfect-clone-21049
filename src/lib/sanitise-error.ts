// M3: Sanitised error logging.
//
// Use this at EVERY error logging site in the Score Me / IRIS pipelines.
// Error objects often serialise the originating request body (incl. draft
// text). If a log aggregator (Sentry, Datadog, Cloudflare Logpush) is ever
// attached, naive `console.warn(error)` calls would leak PHI / draft content
// into the log stream.
//
// NEVER log:
//   - error.cause (often the original Request/Response with body)
//   - error.config / error.request (axios / supabase shapes that embed body)
//   - the original input variable
//
// Always log only the four safe fields below.

export interface SafeErrorLog {
  errorType: string;
  message: string;
  fn: string;
  timestamp: string;
}

const MAX_MESSAGE_LEN = 240;

function safeMessage(e: unknown): string {
  let msg: string;
  if (e instanceof Error) msg = e.message ?? e.name ?? "unknown";
  else if (typeof e === "string") msg = e;
  else msg = "non-error thrown";
  // Hard cap so an accidentally-long message can't carry draft content
  // verbatim into logs.
  if (msg.length > MAX_MESSAGE_LEN) msg = msg.slice(0, MAX_MESSAGE_LEN) + "…";
  // Strip anything that looks like a PHI marker pattern we already detect.
  msg = msg.replace(/\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g, "[redacted]");
  return msg;
}

export function sanitiseError(error: unknown, fn: string): SafeErrorLog {
  const errorType =
    error instanceof Error ? error.constructor.name : typeof error;
  return {
    errorType,
    message: safeMessage(error),
    fn,
    timestamp: new Date().toISOString(),
  };
}

/** Convenience: log a sanitised warning. */
export function logSafeWarn(fn: string, error: unknown): void {
  // eslint-disable-next-line no-console
  console.warn("[atlas-safe]", sanitiseError(error, fn));
}
