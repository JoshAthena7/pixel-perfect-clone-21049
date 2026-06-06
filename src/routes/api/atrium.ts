import { createFileRoute } from "@tanstack/react-router";

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export const Route = createFileRoute("/api/atrium")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return jsonError("Sign in to view the Atrium.", 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { getAtriumPayload } = await import("@/lib/atrium.server");
        const { data: auth, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !auth.user) return jsonError("Sign in to view the Atrium.", 401);

        return Response.json(await getAtriumPayload(auth.user.id));
      },
    },
  },
});