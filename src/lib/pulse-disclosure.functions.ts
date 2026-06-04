// H7: Pulse disclosure status (writer-side).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getPulseDisclosureStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("profiles")
      .select("pulse_acknowledged_at")
      .eq("id", userId)
      .maybeSingle();
    return { acknowledged: !!(data as any)?.pulse_acknowledged_at };
  });

export const acknowledgePulseDisclosure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ pulse_acknowledged_at: new Date().toISOString() } as never)
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
