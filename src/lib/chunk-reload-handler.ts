// Gracefully handle "Failed to fetch dynamically imported module" errors.
// These occur when the Vite dev server restarts or a deployment ships new
// chunk hashes while the page is still open. Without a guard, every lazy
// route navigation rejects and stacks up toasts. We dedupe to a single
// notification and offer a reload.

import { toast } from "sonner";

const CHUNK_ERROR_PATTERNS = [
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "error loading dynamically imported module",
  "Unable to preload CSS",
];

const TOAST_ID = "chunk-reload-prompt";
let prompted = false;

function isChunkLoadError(reason: unknown): boolean {
  const msg =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : "";
  return CHUNK_ERROR_PATTERNS.some((p) => msg.includes(p));
}

function promptReload() {
  if (prompted) return;
  prompted = true;
  toast.error("A new version is available", {
    id: TOAST_ID,
    description: "Reload the page to continue.",
    duration: Infinity,
    action: {
      label: "Reload",
      onClick: () => window.location.reload(),
    },
  });
}

let installed = false;
export function installChunkReloadHandler() {
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
}
