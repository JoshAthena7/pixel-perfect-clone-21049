import { createCsrfMiddleware, createStart, createMiddleware } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next();
  if (!(result instanceof Response)) return result;
  // Mutate headers in place when possible. Rewrapping the Response can drop the
  // content-type that the TanStack serverFn client requires (Invariant failed:
  // expected content-type header to be set).
  try {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      if (!result.headers.has(k)) result.headers.set(k, v);
    }
    return result;
  } catch {
    const headers = new Headers(result.headers);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      if (!headers.has(k)) headers.set(k, v);
    }
    const ct = result.headers.get("content-type");
    if (ct && !headers.has("content-type")) headers.set("content-type", ct);
    return new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
      headers,
    });
  }
});

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, securityHeadersMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
