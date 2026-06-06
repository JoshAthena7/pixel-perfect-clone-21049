import { createStart, createMiddleware } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function withSecurityHeaders(response: Response): Response {
  try {
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      if (!headers.has(k)) headers.set(k, v);
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch {
    return response;
  }
}

const securityHeadersMiddleware = createMiddleware().server(async ({ next, request }) => {
  const result = await next();
  if (!(result instanceof Response)) return result;
  // Don't rewrap serverFn responses — recreating the Response can drop the
  // content-type the TanStack serverFn client requires.
  try {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/_serverFn")) {
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
        if (!result.headers.has(k)) {
          try { result.headers.set(k, v); } catch { /* immutable, skip */ }
        }
      }
      return result;
    }
  } catch { /* fall through to wrap */ }
  return withSecurityHeaders(result);
});

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeadersMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
