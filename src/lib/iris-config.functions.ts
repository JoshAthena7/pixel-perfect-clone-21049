// Server fns for mission IRIS Studio configuration (mission_iris_config).
// Auth-gated; RLS enforces team membership.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  DEFAULT_PERSON_FIRST_PAIRS,
  DEFAULT_NJ_STATE_TERMINOLOGY,
} from "@/lib/iris/default-person-first";

const MissionIdInput = z.object({ missionId: z.string().uuid() });

const PersonFirstPairSchema = z.object({
  term: z.string().min(1),
  replacement: z.string().min(1),
  category: z.string().min(1),
  active: z.boolean(),
});

const StateTermSchema = z.object({
  term: z.string().min(1),
  preferred: z.string().min(1),
  context: z.string().nullish(),
});

const UpdateInput = z.object({
  missionId: z.string().uuid(),
  patch: z.object({
    elevenlabs_voice_id: z.string().min(1).optional(),
    elevenlabs_model_id: z.enum([
      "eleven_multilingual_v2",
      "eleven_turbo_v2_5",
      "eleven_flash_v2_5",
      "eleven_monolingual_v1",
    ]).optional(),
    elevenlabs_stability: z.number().min(0).max(1).optional(),
    elevenlabs_similarity_boost: z.number().min(0).max(1).optional(),
    elevenlabs_style: z.number().min(0).max(1).optional(),
    elevenlabs_use_speaker_boost: z.boolean().optional(),
    elevenlabs_speed: z.number().min(0.25).max(4.0).optional(),
    elevenlabs_streaming: z.boolean().optional(),
    person_first_pairs: z.array(PersonFirstPairSchema).optional(),
    cultural_standards: z.array(z.string()).optional(),
    state_terminology: z.array(StateTermSchema).optional(),
    language_audit_enabled: z.boolean().optional(),
    brief_tone: z.string().optional(),
    brief_length_cap: z.number().int().min(100).max(10000).optional(),
    brief_citation_density: z.string().optional(),
    evaluator_persona_name: z.string().optional(),
    evaluator_lens: z.string().optional(),
    evaluator_priorities: z.array(z.string()).optional(),
    personality_tone: z.number().min(0).max(1).optional(),
    personality_formality: z.number().min(0).max(1).optional(),
  }),
});

function defaultRow(missionId: string) {
  return {
    mission_id: missionId,
    elevenlabs_voice_id: "EXAVITQu4vr4xnSDxMaL",
    elevenlabs_model_id: "eleven_multilingual_v2" as const,
    elevenlabs_stability: 0.55,
    elevenlabs_similarity_boost: 0.75,
    elevenlabs_style: 0.2,
    elevenlabs_use_speaker_boost: true,
    elevenlabs_speed: 1.0,
    elevenlabs_streaming: true,
    person_first_pairs: DEFAULT_PERSON_FIRST_PAIRS,
    cultural_standards: [
      "community_names",
      "avoid_deficit_framing",
      "experienced_not_suffered",
      "acknowledge_systemic_factors",
      "community_owned_language",
      "avoid_medical_model",
      "engagement_not_compliance",
      "family_as_partners",
    ],
    state_terminology: DEFAULT_NJ_STATE_TERMINOLOGY,
    language_audit_enabled: true,
    brief_tone: "analytical",
    brief_length_cap: 1200,
    brief_citation_density: "balanced",
    evaluator_persona_name: "State CSOC Reviewer",
    evaluator_lens: "service coordination specificity",
    evaluator_priorities: ["youth and family voice", "community-based services", "measurable outcomes"],
    personality_tone: 0.5,
    personality_formality: 0.6,
  };
}

/** Get the IRIS config for a mission. If missing, returns the in-memory defaults (without writing). */
export const getIrisConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => MissionIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await (supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (k: string, v: string) => {
            maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
          };
        };
      };
    })
      .from("mission_iris_config")
      .select("*")
      .eq("mission_id", data.missionId)
      .maybeSingle();
    if (error) throw new Error(String((error as { message?: string }).message || "config read failed"));
    return (row as object | null) ?? defaultRow(data.missionId);
  });

/** Upsert a patch of fields. Seeds defaults on first write. */
export const updateIrisConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UpdateInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const row = { ...defaultRow(data.missionId), ...data.patch };
    const { data: saved, error } = await (supabase as unknown as {
      from: (t: string) => {
        upsert: (v: unknown, opts: unknown) => {
          select: () => { single: () => Promise<{ data: unknown; error: unknown }> };
        };
      };
    })
      .from("mission_iris_config")
      .upsert(row, { onConflict: "mission_id" })
      .select()
      .single();
    if (error) throw new Error(String((error as { message?: string }).message || "config save failed"));
    return saved as object;
  });
