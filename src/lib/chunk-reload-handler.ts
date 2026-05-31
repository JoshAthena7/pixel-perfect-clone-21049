// Gracefully handle "Failed to fetch dynamically imported module" errors.
// Dedupes failures into a single toast and, on Reload, first attempts a
// soft retry via the router (re-invalidate + re-navigate). If the chunk
// is still missing after a soft retry, falls back to a hard reload.

import { toast } from "sonner";
import type { Router } from "@tanstack/react-router";

const CHUNK_ERROR_PATTERNS = [
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "error loading dynamically imported module",
  "Unable to preload CSS",
];

const TOAST_ID = "chunk-reload-prompt";
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
  } catch (err) {
    if (isChunkLoadError(err)) return false;
    // Some other error — surface it via fallthrough to hard reload.
    return false;
  }
}

function promptReload() {
  if (prompted) return;
  prompted = true;
  toast.error("A new version is available", {
    id: TOAST_ID,
    description: "Click reload to retry loading this page.",
    duration: Infinity,
    action: {
      label: "Reload",
      onClick: async () => {
        toast.loading("Retrying…", { id: TOAST_ID });
        const ok = await softRetry();
        if (ok) {
          prompted = false;
          toast.success("Reloaded", { id: TOAST_ID, duration: 2000 });
        } else {
          // Soft retry failed — hard reload as fallback.
          window.location.reload();
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
