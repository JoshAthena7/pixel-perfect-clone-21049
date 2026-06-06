# Response Template Feature — Build Plan

This is a large, multi-surface feature (setup wizard step, vault, studio scaffold editor, IRIS compliance, submission gating, mission overview). I'll deliver it in the build order you specified, but want to confirm scope and a few decisions before writing ~2k lines across 10+ files.

## Data model (1 migration)

New tables:
- `mission_response_templates` — one row per mission. Columns: `mission_id` (unique), `status` ('active' | 'skipped'), `source` ('upload' | 'manual'), `source_file_path` (Vault doc ref, nullable), `iris_confidence`, `iris_source_citation`, `confirmed_by`, `confirmed_at`, `version` (int, bumped on edit).
- `mission_response_template_elements` — ordered elements. Columns: `template_id`, `parent_id` (nullable, for sub-sections under headers), `order_index`, `element_type` ('header' | 'subsection' | 'field' | 'table' | 'word_limit'), `label`, `word_limit` (int, nullable), `table_columns` (jsonb, nullable).
- `mission_section_template_progress` — per-section compliance state. Columns: `section_id`, `element_id`, `content` (text), `word_count`, `is_complete` (bool). Drives the Studio scaffold + compliance panel + submission checklist.
- `mission_response_template_versions` — snapshot of elements at each version, used for the post-edit diff and to flag affected sections.

RLS: mission members read; PM role writes. Standard public-schema GRANTs.

## Server functions (`src/lib/response-template.functions.ts`)

- `getResponseTemplate({ missionId })` — template + ordered elements.
- `parseTemplateFile({ missionId, vaultDocId })` — **stub IRIS parser** that returns a plausible structure from the filename/text. Real LLM parsing is out of scope for this turn; I'll wire a `// TODO: replace with Lovable AI call` and use a heuristic parser so the UX is fully functional end-to-end.
- `saveResponseTemplate({ missionId, elements, source, sourceFilePath })` — upsert + version bump + diff vs previous version (returned to caller).
- `skipResponseTemplate({ missionId })`.
- `updateSectionTemplateProgress({ sectionId, elementId, content })` — recomputes word_count + is_complete.
- `getMissionTemplateCompliance({ missionId })` — aggregate for submission checklist + overview indicator.

## UI surfaces

1. **Mission Setup Step 5** — new step inserted into `MissionActivationWizard.tsx` between Key Dates and Review. Upload path (drops into Vault → calls parser), Manual builder (inline element list with type dropdown), skip option. IRIS parser output rendered inline (no modal) with editable element list (drag-reorder, rename, delete, add).
2. **Step 6 summary row** — Response Template row in the existing Review & Activate summary in the same wizard.
3. **Vault category** — pinned "Response Template" category at the top of `vault.tsx` sidebar with indigo treatment, read-only entry.
4. **Studio Scaffold Editor** — new `<ScaffoldEditor>` component used wherever the section editor renders. Locked headers with indigo left border + lock icon, content zones per element, live word counters, ✓/○ indicators, optional free-form zone at the bottom. Will replace the editor in the existing section workspace (need to confirm which file — see questions).
5. **IRIS Template Compliance panel** — new section in the Studio right rail.
6. **Status advancement gate** — disable "In Review" / "Approved" transitions when any required element is empty; inline IRIS warning dialog.
7. **Reviewer view** — same scaffold rendered read-only.
8. **Submission checklist** — Template Compliance row added to the existing checklist; blocks "Mark as Ready to Submit" unless Engagement Lead overrides with a reason (stored on the override).
9. **IRIS pre-submission report** — new Template Compliance Summary section.
10. **Mission Overview indicator** — Response Template health row in `overview.tsx`.
11. **Post-activation edit flow** — edit from Mission Overview, diff modal, flag affected approved/draft-done sections for re-review, in-Studio notice.

## Questions before I build

1. **Which file is "the Studio section workspace" editor?** I see `src/routes/_authenticated/missions/$missionId/questions/index.tsx` and several v2 components. I'll grep and pick the section editor, but if you have a specific file in mind, name it.
2. **Real IRIS parsing vs stub.** Wiring Lovable AI (`google/gemini-2.5-flash`) to parse uploaded .docx/.pdf adds a server-side document parse step. OK to ship a deterministic heuristic stub now (returns a sensible default structure + lets the PM edit it inline) and add real AI parsing in a follow-up?
3. **.pdf/.docx text extraction on the Worker runtime is constrained.** I'll accept the upload, store it in the Vault, and run the stub parser on filename + any extracted text we already have. Confirm that's acceptable for v1.

If you say "go", I'll proceed with the plan above and implement build steps 1–11 in order across roughly: 1 migration, 1 server-functions file, edits to `MissionActivationWizard.tsx`, `vault.tsx`, `overview.tsx`, the section workspace, and ~4 new components (`ScaffoldEditor`, `TemplateComplianceP anel`, `TemplateBuilder`, `TemplateDiffModal`).
