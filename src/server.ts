// SSR Worker entry. Wraps the TanStack server entry to apply L1 security
// headers (CSP, Permissions-Policy, X-Frame-Options, X-Content-Type-Options)
// to every response.
import "./lib/server-functions.preload";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// L1: baseline CSP. Allows React inline scripts/styles, Lovable AI Gateway,
// Supabase REST/Realtime/Storage. Tighten further once we measure violations.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  "connect-src 'self' https://ai.gateway.lovable.dev https://*.supabase.co wss://*.supabase.co https://*.lovable.app https://*.lovable.dev",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const PERMISSIONS_POLICY =
  "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()";

function applySecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("Content-Security-Policy", CSP);
  headers.set("Permissions-Policy", PERMISSIONS_POLICY);
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const handler = await getServerEntry();
    const res = await handler.fetch(request, env, ctx);
    return applySecurityHeaders(res);
  },
};
