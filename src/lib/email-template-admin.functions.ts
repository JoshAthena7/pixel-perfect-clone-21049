import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KeyInput = z.object({ templateKey: z.string().min(1) });

const SaveInput = z.object({
  templateKey: z.string().min(1),
  subject: z.string().min(1).max(300),
  intro: z.string().max(2000),
  body: z.string().max(10000),
  cta_label: z.string().max(120),
  signoff: z.string().max(500),
});

async function assertAdmin(supabase: any, userId: string) {
  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (role) return;
  const { data: prof } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!prof?.is_platform_admin) throw new Error("Admin only");
}

export const getEmailTemplateOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => KeyInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { data: row, error } = await supabase
      .from("email_template_overrides")
      .select("*")
      .eq("template_key", data.templateKey)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { override: row };
  });

export const saveEmailTemplateOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { error } = await supabase.from("email_template_overrides").upsert(
      {
        template_key: data.templateKey,
        subject: data.subject,
        intro: data.intro,
        body: data.body,
        cta_label: data.cta_label,
        signoff: data.signoff,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      },
      { onConflict: "template_key" }
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
