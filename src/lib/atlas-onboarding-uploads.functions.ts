/**
 * Atlas onboarding — server functions for the Photo (Step 3) and Resume
 * (Step 4) upload screens.
 *
 *   completeAtlasPhotoStep   → store avatar URL, stamp step 3, log
 *   parseAtlasResume         → call Lovable AI gateway to extract structured
 *                              info from resume text
 *   completeAtlasResumeStep  → store resume URL, merge skills, stamp step 4, log
 *
 * The browser does the actual file upload to Supabase Storage (buckets
 * `atlas-avatars` / `atlas-resumes`) using the authenticated user's session;
 * these server functions only handle DB writes + AI parsing because RLS on
 * `atlas_team_members` is admin-only.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function loadMemberByEmail(email: string) {
  const { data, error } = await supabaseAdmin
    .from("atlas_team_members")
    .select(
      "id,email,first_name,skills,onboarding_step_completed,is_removed",
    )
    .ilike("email", email)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

function emailFromCtx(ctx: any): string {
  const email = (ctx.claims?.email as string | undefined) ?? "";
  if (!email) throw new Error("No email on session.");
  return email;
}

/* ─────────────────────────── Step 3 — Photo ─────────────────────────── */

export const completeAtlasPhotoStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        avatarUrl: z.string().url().max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const member = await loadMemberByEmail(emailFromCtx(context));
    if (!member || member.is_removed) {
      throw new Error("No team-member record found for this user.");
    }
    const { error } = await supabaseAdmin
      .from("atlas_team_members")
      .update({
        avatar_url: data.avatarUrl,
        onboarding_step_completed: Math.max(
          member.onboarding_step_completed ?? 0,
          3,
        ),
      })
      .eq("id", member.id);
    if (error) throw new Error(error.message);

    try {
      await supabaseAdmin.from("atlas_activity_log").insert({
        member_id: member.id,
        action: "Onboarding Step 3 completed — profile photo uploaded",
        performed_by: member.email,
        metadata: { step: 3 },
      });
    } catch (e) {
      console.error("[atlas-onboarding] activity log write failed", e);
    }
    return { ok: true, memberId: member.id };
  });

/** Skip step 3 without uploading. */
export const skipAtlasPhotoStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const member = await loadMemberByEmail(emailFromCtx(context));
    if (!member || member.is_removed) {
      throw new Error("No team-member record found for this user.");
    }
    const { error } = await supabaseAdmin
      .from("atlas_team_members")
      .update({
        onboarding_step_completed: Math.max(
          member.onboarding_step_completed ?? 0,
          3,
        ),
      })
      .eq("id", member.id);
    if (error) throw new Error(error.message);
    try {
      await supabaseAdmin.from("atlas_activity_log").insert({
        member_id: member.id,
        action: "Onboarding Step 3 skipped — no profile photo uploaded",
        performed_by: member.email,
        metadata: { step: 3, skipped: true },
      });
    } catch (e) {
      console.error("[atlas-onboarding] activity log write failed", e);
    }
    return { ok: true };
  });

/* Returns the member's id for path-prefixing storage uploads. */
export const getAtlasOnboardingMemberId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const member = await loadMemberByEmail(emailFromCtx(context));
    if (!member || member.is_removed) {
      throw new Error("No team-member record found for this user.");
    }
    return { memberId: member.id };
  });

/* ─────────────────────────── Step 4 — Resume ─────────────────────────── */

const ResumeParseSchema = z.object({
  skills: z.array(z.string()).default([]),
  credentials: z.array(z.string()).default([]),
  years_of_experience: z.number().nullable().default(null),
  healthcare_specialties: z.array(z.string()).default([]),
});

export type ResumeParseResult = z.infer<typeof ResumeParseSchema>;

export const parseAtlasResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        // Plain text extracted client-side from the PDF/DOCX. We cap at
        // ~80k chars to keep the AI prompt within practical limits.
        resumeText: z.string().min(20).max(80000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      console.error("[atlas-onboarding] LOVABLE_API_KEY not configured");
      return {
        ok: false as const,
        reason: "ai_unavailable",
        parsed: null,
      };
    }

    const systemPrompt =
      "You are an expert resume parser for a healthcare strategy consultancy. " +
      "Extract structured information and return ONLY a JSON object — no prose, " +
      "no code fences. Schema: {skills: string[], credentials: string[], " +
      "years_of_experience: number|null, healthcare_specialties: string[]}. " +
      "Skills are concrete technical/domain skills (e.g. 'Medicaid managed care', " +
      "'proposal writing'). Credentials are degrees, licenses, or certifications " +
      "(e.g. 'MPH', 'RN', 'PMP'). Healthcare specialties are clinical or " +
      "programmatic focus areas (e.g. 'behavioral health', 'long-term services " +
      "and supports'). Return up to 20 items per array. If something is unknown, " +
      "return an empty array or null.";

    const userPrompt = `Resume text:\n\n${data.resumeText}`;

    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!r.ok) {
        const txt = await r.text();
        console.error(
          "[atlas-onboarding] resume parse gateway error",
          r.status,
          txt.slice(0, 200),
        );
        if (r.status === 429) {
          return { ok: false as const, reason: "rate_limited", parsed: null };
        }
        if (r.status === 402) {
          return { ok: false as const, reason: "credits_exhausted", parsed: null };
        }
        return { ok: false as const, reason: "ai_error", parsed: null };
      }

      const j = await r.json();
      const raw = j.choices?.[0]?.message?.content ?? "{}";
      let obj: unknown = {};
      try {
        obj = JSON.parse(raw);
      } catch {
        obj = {};
      }
      const parsed = ResumeParseSchema.safeParse(obj);
      if (!parsed.success) {
        return { ok: false as const, reason: "ai_invalid_shape", parsed: null };
      }
      // Clean: trim, drop empties, dedupe.
      const dedup = (arr: string[]) =>
        Array.from(
          new Set(
            arr
              .map((s) => (typeof s === "string" ? s.trim() : ""))
              .filter((s) => s.length > 0),
          ),
        );
      const cleaned: ResumeParseResult = {
        skills: dedup(parsed.data.skills).slice(0, 20),
        credentials: dedup(parsed.data.credentials).slice(0, 20),
        years_of_experience:
          typeof parsed.data.years_of_experience === "number" &&
          parsed.data.years_of_experience >= 0 &&
          parsed.data.years_of_experience < 80
            ? parsed.data.years_of_experience
            : null,
        healthcare_specialties: dedup(parsed.data.healthcare_specialties).slice(
          0,
          20,
        ),
      };
      return { ok: true as const, parsed: cleaned };
    } catch (e) {
      console.error("[atlas-onboarding] resume parse failed", e);
      return { ok: false as const, reason: "ai_exception", parsed: null };
    }
  });

export const completeAtlasResumeStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        resumeUrl: z.string().url().max(2000),
        extractedSkills: z.array(z.string().max(120)).max(40).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const member = await loadMemberByEmail(emailFromCtx(context));
    if (!member || member.is_removed) {
      throw new Error("No team-member record found for this user.");
    }

    // Union-merge skills (case-insensitive dedupe, preserve existing casing).
    const existing = Array.isArray(member.skills) ? member.skills : [];
    const seen = new Map<string, string>();
    for (const s of existing) {
      const t = (s ?? "").trim();
      if (t) seen.set(t.toLowerCase(), t);
    }
    for (const s of data.extractedSkills) {
      const t = (s ?? "").trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (!seen.has(key)) seen.set(key, t);
    }
    const merged = Array.from(seen.values());

    const { error } = await supabaseAdmin
      .from("atlas_team_members")
      .update({
        atlas_resume_url: data.resumeUrl,
        skills: merged,
        onboarding_step_completed: Math.max(
          member.onboarding_step_completed ?? 0,
          4,
        ),
      })
      .eq("id", member.id);
    if (error) throw new Error(error.message);

    try {
      await supabaseAdmin.from("atlas_activity_log").insert({
        member_id: member.id,
        action:
          "Onboarding Step 4 completed — resume uploaded and parsed by IRIS",
        performed_by: member.email,
        metadata: {
          step: 4,
          extracted_skills: data.extractedSkills.length,
          total_skills: merged.length,
        },
      });
    } catch (e) {
      console.error("[atlas-onboarding] activity log write failed", e);
    }
    return { ok: true };
  });

/** Skip step 4 without uploading a resume. */
export const skipAtlasResumeStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const member = await loadMemberByEmail(emailFromCtx(context));
    if (!member || member.is_removed) {
      throw new Error("No team-member record found for this user.");
    }
    const { error } = await supabaseAdmin
      .from("atlas_team_members")
      .update({
        onboarding_step_completed: Math.max(
          member.onboarding_step_completed ?? 0,
          4,
        ),
      })
      .eq("id", member.id);
    if (error) throw new Error(error.message);
    try {
      await supabaseAdmin.from("atlas_activity_log").insert({
        member_id: member.id,
        action: "Onboarding Step 4 skipped — no resume uploaded",
        performed_by: member.email,
        metadata: { step: 4, skipped: true },
      });
    } catch (e) {
      console.error("[atlas-onboarding] activity log write failed", e);
    }
    return { ok: true };
  });
