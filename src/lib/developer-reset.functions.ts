// Developer Reset — wipes ALL mission data while preserving auth, profiles,
// roles, and reference tables. Admin-only.
//
// Delegates to the SECURITY DEFINER SQL function
// `public.developer_reset_all_mission_data()` which deletes from every
// mission-linked table in FK-safe order and returns a JSON report.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ResetReportEntry = {
  table: string;
  deleted?: number;
  skipped?: string;
  error?: string;
};

export const resetAllMissionData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ confirm: z.literal("RESET") }).parse(d),
  )
  .handler(async ({ context }) => {
    const { userId } = context;

    // Admin gate — also enforced inside the SQL function, but fail fast here
    // so we never even reach the RPC for non-admins.
    const { data: roles, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin");
    if (roleErr) throw new Error(`Auth check failed: ${roleErr.message}`);
    if (!roles || roles.length === 0) {
      throw new Error("Only platform admins can run the developer reset.");
    }

    // Service-role client to invoke the admin RPC (function is granted only
    // to service_role; the user's bearer token can't call it directly).
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { data, error } = await supabaseAdmin.rpc(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "developer_reset_all_mission_data" as any,
    );
    if (error) throw new Error(`Reset failed: ${error.message}`);

    const payload = (data ?? {}) as {
      ok?: boolean;
      total_deleted?: number;
      results?: ResetReportEntry[];
    };

    return {
      ok: true as const,
      totalDeleted: payload.total_deleted ?? 0,
      results: payload.results ?? [],
    };
  });
