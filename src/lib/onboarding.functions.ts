import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ProfileStep = z.object({
  step: z.literal("profile"),
  displayName: z.string().min(1).max(120),
  jobTitle: z.string().max(160).optional().nullable(),
  timezone: z.string().max(80).optional().nullable(),
});

const ExpertiseStep = z.object({
  step: z.literal("expertise"),
  expertiseAreas: z.array(z.string().max(80)).max(40),
  bio: z.string().max(2000).optional().nullable(),
});

const CommsStep = z.object({
  step: z.literal("comms"),
  slackHandle: z.string().max(120).optional().nullable(),
  preferredPov: z.string().max(40).optional().nullable(),
});

const Finish = z.object({ step: z.literal("finish") });

const Input = z.discriminatedUnion("step", [ProfileStep, ExpertiseStep, CommsStep, Finish]);

export const saveOnboardingStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const patch: Record<string, any> = { profile_updated_at: new Date().toISOString() };

    if (data.step === "profile") {
      patch.display_name = data.displayName;
      patch.timezone = data.timezone ?? null;
      if (data.jobTitle) patch.expert_bio = data.jobTitle; // no job_title col; stash on bio if empty later
    } else if (data.step === "expertise") {
      patch.expertise_areas = data.expertiseAreas;
      patch.expertise_source = "self";
      patch.expertise_updated_at = new Date().toISOString();
      if (data.bio) patch.expert_bio = data.bio;
    } else if (data.step === "comms") {
      patch.slack_user_id = data.slackHandle ?? null;
      if (data.preferredPov) patch.preferred_pov = data.preferredPov;
    } else if (data.step === "finish") {
      patch.has_onboarded = true;
      patch.profile_completed = true;
      patch.onboarded_at = new Date().toISOString();
    }

    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const getOnboardingContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, expertise_areas, slack_user_id, timezone, expert_bio, preferred_pov, has_onboarded")
      .eq("id", userId)
      .maybeSingle();

    // Most-recent pending invite for this user's email (to know which mission to drop them in)
    const { data: auth } = await supabase.auth.getUser();
    const email = auth.user?.email?.toLowerCase() ?? null;

    let invite: { missionId: string | null; missionName: string | null; role: string | null } | null = null;
    if (email) {
      const { data: inv } = await supabase
        .from("atlas_invites")
        .select("mission_id, role, missions:mission_id(name)")
        .ilike("email", email)
        .order("invite_sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (inv) {
        invite = {
          missionId: (inv as any).mission_id ?? null,
          missionName: ((inv as any).missions?.name as string) ?? null,
          role: (inv as any).role ?? null,
        };
      }
    }

    return { profile, invite };
  });
