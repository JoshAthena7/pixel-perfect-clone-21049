import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLE_TYPES = [
  "stakeholder",
  "evaluator",
  "influencer",
  "champion",
  "expert",
  "adversary",
  "contact",
  "decision_maker",
  "advocate",
  "legislator",
  "media",
] as const;

const Input = z.object({
  mission_id: z.string().uuid(),
  name: z.string().trim().min(1).max(280),
  role_type: z.enum(ROLE_TYPES).default("contact"),
  title: z.string().max(280).optional().nullable(),
  organization: z.string().max(280).optional().nullable(),
  email: z.string().email().max(280).optional().nullable(),
  phone: z.string().max(80).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  influence_level: z.enum(["high", "medium", "low"]).optional().nullable(),
  relationship_stance: z.enum(["ally", "neutral", "unknown", "hostile"]).optional().nullable(),
});

/**
 * Canonical upsert for any contact/stakeholder/person across the app.
 *
 * intel_people is the single source of truth. The upsert key is:
 *   - (mission_id, lower(email))                              if email present
 *   - (mission_id, lower(name), lower(organization ?? ''))    otherwise
 */
export const upsertIntelPerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const payload = {
      mission_id: data.mission_id,
      name: data.name.trim(),
      role_type: data.role_type,
      title: data.title?.trim() || null,
      organization: data.organization?.trim() || null,
      email: data.email?.trim().toLowerCase() || null,
      phone: data.phone?.trim() || null,
      notes: data.notes?.trim() || null,
      influence_level: data.influence_level ?? null,
      relationship_stance: data.relationship_stance ?? null,
    };

    // Try to find an existing row by either upsert key.
    let existingId: string | null = null;
    if (payload.email) {
      const { data: hit } = await supabase
        .from("intel_people" as any)
        .select("id")
        .eq("mission_id", payload.mission_id)
        .ilike("email", payload.email)
        .limit(1)
        .maybeSingle();
      existingId = (hit as { id?: string } | null)?.id ?? null;
    }
    if (!existingId) {
      const { data: hit } = await supabase
        .from("intel_people" as any)
        .select("id")
        .eq("mission_id", payload.mission_id)
        .ilike("name", payload.name)
        .ilike("organization", payload.organization ?? "")
        .limit(1)
        .maybeSingle();
      existingId = (hit as { id?: string } | null)?.id ?? null;
    }

    if (existingId) {
      const { error } = await supabase
        .from("intel_people" as any)
        .update(payload)
        .eq("id", existingId);
      if (error) throw new Error(error.message);
      return { id: existingId, created: false };
    }

    const { data: row, error } = await supabase
      .from("intel_people" as any)
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as unknown as { id: string }).id, created: true };
  });
