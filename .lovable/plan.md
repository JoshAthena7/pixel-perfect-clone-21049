# Resume Upload → Auto-Populate Expertise

Add a resume-upload step to onboarding. IRIS parses the file, extracts expertise, the user reviews/edits, and only the structured fields are persisted. The raw resume text is never written to any table or to storage.

## Reuse vs. add (important)

The `profiles` table already has several fields that overlap the spec — reuse them rather than create duplicates:

| Spec field | Existing column to reuse | Action |
| --- | --- | --- |
| `areas_of_expertise text[]` | `expertise_areas text[]` | reuse |
| `expertise_summary text` | `expert_bio text` | reuse |
| `years_of_experience int` | — | add `years_of_experience int` |
| `certifications text[]` | — | add `certifications text[] default '{}'` |
| `expertise_source text` | — | add `expertise_source text` ('resume_upload' \| 'manual') |
| `expertise_updated_at timestamptz` | — | add `expertise_updated_at timestamptz` |

One migration, additive only. No RLS or grant changes (profiles already configured).

## Server: TanStack server function, not an Edge Function

This project is TanStack Start. Per the stack rules, app-internal AI logic goes in `createServerFn` calling Lovable AI, not a Supabase Edge Function. The spec's `iris-parse-resume` edge function becomes:

- `src/lib/iris-parse-resume.functions.ts` — `parseResumeWithIris(resumeText)` server fn
  - guarded by `requireSupabaseAuth`
  - validates `resume_text` length (50 – 60,000 chars) with zod
  - calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with the spec's system prompt + structured `Output.object` schema
  - returns `{ areas_of_expertise, expertise_summary, years_of_experience, certifications }`
  - **never persists** `resume_text`, never writes to the DB itself
- `src/lib/iris-parse-resume.server.ts` — gateway client helper (re-uses existing `ai-gateway.server.ts` if present)
- `src/lib/profile-expertise.functions.ts` — `saveExpertise(input)` server fn that writes only the parsed fields + `expertise_source='resume_upload'` + `expertise_updated_at=now()` to the caller's own profile row

The user picks the file in the browser; we extract text client-side with `pdfjs-dist` (PDF) and `mammoth` (DOCX), then POST just the text to the server fn. This guarantees the raw file bytes never touch the server or storage.

## Onboarding UI

New step inserted into the existing onboarding flow after account creation, before the existing profile completion step. Do not redesign the steps that already work.

- `src/components/onboarding/ResumeExpertiseStep.tsx`
  - Headline: "Let IRIS learn your expertise"
  - Subhead: "Upload your resume and IRIS will identify your areas of expertise. You can review and edit before saving."
  - Drop zone — accepts `.pdf` and `.docx`, max 5MB, single file
  - "Skip for now" link → advances to next onboarding step with no DB write
  - States: idle → reading file → "IRIS is reading your resume…" → review
- `src/components/onboarding/ExpertiseReviewForm.tsx`
  - Removable chips for `areas_of_expertise` + "Add tag" input
  - Editable textarea for `expertise_summary`
  - Number input for `years_of_experience`
  - Removable chips for `certifications` + "Add cert" input
  - "Looks good — save my profile" → calls `saveExpertise` → advances to next step
- `src/lib/extract-resume-text.client.ts` — browser-only text extraction (lazy-imported so SSR doesn't pull in `pdfjs-dist`)

## Profile settings page

New "Expertise" card on the existing profile/settings page:

- Shows current tags, summary, years, certifications
- "Edit" → inline form using the same `ExpertiseReviewForm`
- "Re-upload resume" → opens the resume drop zone in a modal; on save, confirmation dialog ("This will overwrite your current expertise. Continue?") then writes via `saveExpertise`

## Privacy guarantees (enforced, not just stated)

- No new Supabase Storage bucket
- No new table for resumes
- `parseResumeWithIris` accepts `resume_text` but discards it after the model call; nothing in either server fn writes the raw text anywhere
- `saveExpertise` whitelists exactly the 6 fields it writes — extra fields in the payload are ignored

## Out of scope (noted for later)

- SME Interview Flight Plan pre-fill from expertise tags — flagged as V4 roadmap, not built now
- Existing mission/IRIS functionality is untouched

## Files

New:
- `supabase/migrations/<ts>_add_profile_expertise_fields.sql`
- `src/lib/iris-parse-resume.functions.ts`
- `src/lib/iris-parse-resume.server.ts` (only if no shared gateway helper exists)
- `src/lib/profile-expertise.functions.ts`
- `src/lib/extract-resume-text.client.ts`
- `src/components/onboarding/ResumeExpertiseStep.tsx`
- `src/components/onboarding/ExpertiseReviewForm.tsx`
- `src/components/profile/ExpertiseCard.tsx`

Edited:
- Onboarding flow controller (whichever component owns step order) — insert the new step
- Profile/settings page — mount `ExpertiseCard`
- `package.json` — add `pdfjs-dist`, `mammoth`

## Question before I build

The onboarding flow already has steps. Where should the resume step land?
1. Right after sign-up, before the existing profile-completion step (recommended — IRIS pre-fills the profile)
2. As the last onboarding step
3. Replace an existing manual-expertise step entirely

Default if you don't answer: option **1**.
