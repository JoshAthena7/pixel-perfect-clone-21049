# IRIS Intelligence Pipeline — Phase 1

Additive build. No existing IRIS, vault, or mission routes are modified.

## Important deviations from the spec (need confirmation)

1. **No Supabase Edge Function.** This stack is TanStack Start; the project's standing instruction is *"Do NOT use Supabase Edge Functions. Use TanStack Start's built-in server capabilities."* All existing IRIS work in this codebase is `createServerFn`. I'll build `iris-intelligence` as `src/lib/iris-intelligence.functions.ts` with `requireSupabaseAuth` middleware. Same input/output contract, same prompts — just called via `useServerFn` from the UI instead of `supabase.functions.invoke`.

2. **AI call uses existing `callIris(system, user)` helper** (`src/lib/iris-prompts.ts`) — the canonical IRIS gateway path already used by `iris-mission-brief`, the extractors, etc. Layer-specific system prompts come straight from your spec.

3. **PDF/DOCX text extraction.** Cloudflare Worker runtime can't run `pdf-parse` (Node-only). I'll use `unpdf` (PDF, Worker-compatible) and `mammoth` (DOCX). TXT is read directly. Scanned PDFs left as `// TODO: Add OCR pipeline for scanned documents` per spec.

4. **Vault placement.** The existing `vault.tsx` page is dense and tied to `mission_vault_documents`. Per your "do not replace" constraint I'll add a **new** sibling tab/route `/_authenticated/missions/$missionId/intel-upload` that hosts `IntelligenceVault`. The existing vault is untouched.

If any of the above is wrong, say so before I implement.

## Part 1 — Schema (one migration)

`public.mission_documents`
- `id uuid pk`, `mission_id uuid → missions.id`, `file_name text`, `file_path text`
- `document_type text` (enum-checked: RFP, Amendment, Model Contract, Regulation, Waiver, Legislative, Stakeholder Report, Advocacy, Research, News, Provider Materials, Incumbent Report, Other)
- `processing_status text` default `'pending'` (pending|processing|complete|error)
- `extracted_text text`, `page_count int`, `uploaded_by uuid → profiles.id`
- `processed_at timestamptz`, `created_at`, `updated_at`

`public.mission_intelligence`
- `id uuid pk`, `mission_id uuid → missions.id`
- `layer text` (`mission_brief` | `strategic_assessment`)
- `content jsonb`, `version int default 1`, `generated_at timestamptz`
- `source_document_ids uuid[]`, `iris_notes text`
- `created_at`, `updated_at`
- Unique `(mission_id, layer)` — server fn bumps `version` + updates in place

GRANTs to `authenticated` + `service_role`. RLS uses existing `public.is_mission_member(mission_id, auth.uid())` helper — read/write allowed if member. Admin bypass via `has_role(auth.uid(), 'admin')`.

Storage bucket: `mission-documents` (private). RLS on `storage.objects` scoped to mission membership via path prefix `{mission_id}/`.

## Part 2 — `iris-intelligence` server function

`src/lib/iris-intelligence.functions.ts`

```ts
generateIrisIntelligence({ mission_id, document_ids, layer })
```

1. `requireSupabaseAuth` → mission membership check.
2. Load `mission_documents` where id IN document_ids AND status='complete'.
3. Build corpus: `[DOCUMENT: {file_name} | TYPE: {document_type}]\n{extracted_text}\n\n` joined.
4. Pick system prompt by `layer` (your two prompts verbatim in `src/lib/iris-intelligence-prompts.ts`).
5. `callIris(systemPrompt, corpus)` → parse JSON. On parse failure return `{ success: false, error: 'malformed_json' }` (UI shows the spec error card).
6. Upsert into `mission_intelligence` on `(mission_id, layer)`; bump `version`, set `generated_at`, `source_document_ids`.
7. Return `{ success: true, intelligence_id, layer, version }`.

Companion read fns: `getMissionIntelligence({ mission_id, layer })`, `listMissionDocuments({ mission_id })`, `markDocumentProcessed({ id, extracted_text, page_count })`.

## Part 3 — `IntelligenceVault` upload UI

New route: `src/routes/_authenticated/missions/$missionId/intel-upload.tsx` (linked from the existing mission tab strip — additive entry, no replacement).

Component: `src/components/intelligence/IntelligenceVault.tsx`
- Multi-file drop (PDF/DOCX/TXT), per-file `document_type` selector (12 options + Other).
- Upload to `mission-documents/{mission_id}/{uuid}-{file_name}` → insert `mission_documents` row (`pending`).
- After upload, client-side text extraction (`unpdf` for PDF, `mammoth` for DOCX, raw for TXT) → call `markDocumentProcessed` → status `complete`. Failures → `error` with toast.
- Document list with status pill badges (Pending gray, Processing amber pulsing, Complete green, Error red).
- `Generate IRIS Intelligence` button — disabled until ≥1 complete. Opens modal with **Mission Brief** / **Strategic Assessment** choice + note "Processing time: approximately 60–90 seconds".
- Calls `generateIrisIntelligence`, shows spinner, on success deep-links to the matching display tab.

## Part 4 — `MissionBriefView`

Route: `src/routes/_authenticated/missions/$missionId/iris-brief.tsx`
Component: `src/components/intelligence/MissionBriefView.tsx`

Sections exactly as spec:
1. IRIS Assessment Banner — gold left border, large headline, confidence badge (Pursue=green / Caution=amber / More Analysis=red), `Watch:` bullets.
2. Procurement Overview info grid (responsive 2–3 col).
3. Two-col: Key Risks (severity badges) | Key Opportunities (strength badges).
4. Win Themes card grid.
5. Key Deadlines table.
6. Source References (Collapsible, label "IRIS Intelligence Sources", tagline "All intelligence is traceable to source documents").
7. Footer: `Generated by IRIS™ | Version {version} | {generated_at}` + Regenerate button.

ATLAS palette via existing tokens; literal hexes (#1F3864 navy, #C9A84C gold, #0a0e1a bg) used inline where the spec calls for them. Skeleton loader matches existing IRIS components. Malformed-content card per spec.

## Part 5 — `StrategicAssessmentView`

Route: `src/routes/_authenticated/missions/$missionId/iris-strategic.tsx`
Component: `src/components/intelligence/StrategicAssessmentView.tsx`

Sections 1–8 exactly as spec, including stakeholder position color map (Supportive=green / Neutral=gray / Cautious=amber / Unknown=blue) and collapsed source references.

## File map

**Created**
- `supabase/migrations/<ts>_iris_intelligence_phase1.sql`
- `src/lib/iris-intelligence-prompts.ts`
- `src/lib/iris-intelligence.functions.ts`
- `src/components/intelligence/IntelligenceVault.tsx`
- `src/components/intelligence/MissionBriefView.tsx`
- `src/components/intelligence/StrategicAssessmentView.tsx`
- `src/components/intelligence/IntelligenceSkeleton.tsx`
- `src/routes/_authenticated/missions/$missionId/intel-upload.tsx`
- `src/routes/_authenticated/missions/$missionId/iris-brief.tsx`
- `src/routes/_authenticated/missions/$missionId/iris-strategic.tsx`

**Touched (link additions only, no behavior changes)**
- Existing mission tab strip — add three new tabs (Intel Upload / IRIS Brief / IRIS Strategic). If you'd rather keep the tab bar untouched and reach these only via deep links from the upload button, I'll skip this.

**Dependencies added**
- `unpdf`, `mammoth`

## Open questions

1. Confirm `createServerFn` instead of Supabase Edge Function (per stack mandate).
2. Confirm new `mission_documents` table is correct — existing `mission_vault_documents` is a different surface I should not touch, right?
3. Confirm new route + new tab entries (vs. deep link only).

Reply "go" + answers to the 3 questions and I'll build it end-to-end.
