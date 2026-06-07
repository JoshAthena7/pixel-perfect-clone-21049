import { createFileRoute } from "@tanstack/react-router";

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export const Route = createFileRoute("/api/iris")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return jsonError("Sign in to view IRIS.", 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { getIrisPayload } = await import("@/lib/iris-read.server");
        const { data: auth, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !auth.user) return jsonError("Sign in to view IRIS.", 401);

        const url = new URL(request.url);
        const missionId = url.searchParams.get("missionId") ?? undefined;
        const payload = await getIrisPayload(missionId, auth.user.id);
        if ("error" in payload) {
          return jsonError(payload.error, 403);
        }
        return Response.json(payload);
      },
    },
  },
});
