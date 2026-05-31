// Gracefully handle "Failed to fetch dynamically imported module" errors.
// Dedupes failures into a single toast and, on Reload, first attempts a
// soft retry via the router (re-invalidate + re-navigate). If the chunk
// is still missing after N soft retries, falls back to a hard reload so
// the user never gets stuck in an infinite retry loop.

import { toast } from "sonner";
import type { Router } from "@tanstack/react-router";

const CHUNK_ERROR_PATTERNS = [
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "error loading dynamically imported module",
  "Unable to preload CSS",
];

const TOAST_ID = "chunk-reload-prompt";

// Maximum number of soft retries before we give up and hard-reload the page.
// Override via VITE_CHUNK_RELOAD_MAX_RETRIES (build-time) or
// window.__CHUNK_RELOAD_MAX_RETRIES (runtime, for tests/debugging).
const DEFAULT_MAX_RETRIES = 3;

function resolveMaxRetries(): number {
  const runtime =
    typeof window !== "undefined"
      ? (window as unknown as { __CHUNK_RELOAD_MAX_RETRIES?: number })
          .__CHUNK_RELOAD_MAX_RETRIES
      : undefined;
  const envRaw = import.meta.env?.VITE_CHUNK_RELOAD_MAX_RETRIES;
  const envNum = envRaw != null ? Number(envRaw) : NaN;
  const candidate = runtime ?? (Number.isFinite(envNum) ? envNum : NaN);
  return Number.isFinite(candidate) && candidate >= 0
    ? Math.floor(candidate as number)
    : DEFAULT_MAX_RETRIES;
}

let maxRetries = DEFAULT_MAX_RETRIES;
let retryCount = 0;
let prompted = false;
let routerRef: Router<any, any> | null = null;

function isChunkLoadError(reason: unknown): boolean {
  const msg =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : "";
  return CHUNK_ERROR_PATTERNS.some((p) => msg.includes(p));
}

async function softRetry(): Promise<boolean> {
  if (!routerRef) return false;
  try {
    await routerRef.invalidate();
    const { href } = window.location;
    await routerRef.navigate({ to: href, replace: true, reloadDocument: false });
    return true;
  } catch {
    return false;
  }
}

function hardReload() {
  // Reset so a post-reload session can prompt again from scratch.
  retryCount = 0;
  prompted = false;
  window.location.reload();
}

function promptReload() {
  if (prompted) return;
  prompted = true;

  const remaining = Math.max(0, maxRetries - retryCount);
  const description =
    remaining > 0
      ? `Click reload to retry loading this page. (${remaining} ${
          remaining === 1 ? "retry" : "retries"
        } left before a full refresh.)`
      : "Click reload to fully refresh the page.";

  toast.error("A new version is available", {
    id: TOAST_ID,
    description,
    duration: Infinity,
    action: {
      label: "Reload",
      onClick: async () => {
        // Out of soft retries → hard reload immediately.
        if (retryCount >= maxRetries) {
          toast.loading("Refreshing…", { id: TOAST_ID });
          hardReload();
          return;
        }

        retryCount += 1;
        toast.loading("Retrying…", { id: TOAST_ID });
        const ok = await softRetry();
        if (ok) {
          retryCount = 0;
          prompted = false;
          toast.success("Reloaded", { id: TOAST_ID, duration: 2000 });
        } else if (retryCount >= maxRetries) {
          // Hit the cap on this attempt — hard reload as the final fallback.
          hardReload();
        } else {
          // Allow another prompt with an updated "retries left" count.
          prompted = false;
          promptReload();
        }
      },
    },
  });
}

let installed = false;
export function installChunkReloadHandler(router?: Router<any, any>) {
  if (router) routerRef = router;
  if (installed || typeof window === "undefined") return;
  installed = true;
  maxRetries = resolveMaxRetries();

  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadError(event.reason)) {
      event.preventDefault();
      promptReload();
    }
  });

  window.addEventListener("error", (event) => {
    if (isChunkLoadError(event.error ?? event.message)) {
      event.preventDefault();
      promptReload();
    }
  });

  // Vite emits this specifically for failed dynamic-import preloads.
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    promptReload();
  });
}
