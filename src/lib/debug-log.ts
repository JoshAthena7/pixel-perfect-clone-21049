// Dev-only debug logger. Use for informational ORACLE/IRIS/pipeline traces.
// Real error logs should keep using console.error directly so they surface in prod.
const isDev =
  (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") ||
  (typeof import.meta !== "undefined" && (import.meta as any).env?.DEV === true);

export const debugLog = {
  log: (...args: unknown[]) => {
    if (isDev) console.log(...args);
  },
  warn: (...args: unknown[]) => {
    if (isDev) console.warn(...args);
  },
};
