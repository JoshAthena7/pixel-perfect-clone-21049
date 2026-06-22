/**
 * Admin server functions for the IRIS morning briefs pipeline:
 *
 *  - generateMorningBriefs(): manually fan-out brief generation across every
 *    active mission. Writes one row per mission to `atlas_notifications`
 *    (recipient_role='admin', type='morning_brief'). Admin only.
 *  - getLastMorningBriefAt(): returns the most recent `created_at` from
 *    `atlas_notifications` where type='morning_brief'. Admin only.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const [{ data: prof }, { data: role }] = await Promise.all([
    context.supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", context.userId)
      .maybeSingle(),
    context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle(),
  ]);
  if (!prof?.is_platform_admin && !role) throw new Error("Forbidden — admin only.");
}

export const generateMorningBriefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runMorningBriefs } = await import("@/lib/iris-morning-briefs.server");
    return await runMorningBriefs(supabaseAdmin as any, apiKey);
  });

export const getLastMorningBriefAt = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("atlas_notifications")
      .select("created_at")
      .eq("type", "morning_brief")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { last_generated_at: data?.created_at ?? null };
  });
