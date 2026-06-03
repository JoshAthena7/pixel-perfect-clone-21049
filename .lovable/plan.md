# Mission Activation Flow + Document Intelligence Pipeline

This is a substantial feature spanning DB, server functions, and UI. I want to confirm the architecture before building so we don't churn.

## 1. Database (one migration)

New table `public.document_extractions`:
- `document_id uuid` (FK → `mission_library.id`, ON DELETE CASCADE, UNIQUE)
- `mission_id uuid` (FK → `missions.id`, ON DELETE CASCADE)
- `extracted_text text`
- `key_themes text[]`
- `key_entities text[]`
- `processed_at timestamptz`, `created_at`, `updated_at`
- GRANT to `authenticated` + `service_role`; RLS scoped via `is_mission_member(mission_id, auth.uid())`.
- Index on `mission_id`.

No other schema changes — `mission_library`, `question_records`, `briefing_book_sections`, `signals`, `win_themes`, `mission_risks`, `mission_decisions`, `mission_assumptions`, `alignment_conflicts` already exist.

## 2. Server functions (new file: `src/lib/mission-activation.functions.ts`)

All `createServerFn` + `requireSupabaseAuth`:

- `extractDocumentIntelligence({ documentId })` — pulls the file from storage via `rfp-text.server` helpers, runs Lovable AI Gateway (Gemini 3 Flash) with a JSON schema → `{ extracted_text, key_themes, key_entities }`, upserts to `document_extractions`, writes a `document_indexed` signal.
- `reindexMissionDocuments({ missionId })` — fan-out wrapper that re-runs extraction for every doc missing/stale `document_extractions`.
- `regenerateBriefingBook({ missionId })` — aggregates: docs + extractions + questions summary + win themes + risks + decisions + assumptions + conflicts + top 20 signals → calls existing `irisGenerateBriefingSection` for each section key.
- `getLibraryIndexStatus({ missionId })` — returns `{ indexed, total, lastIndexedAt }` for the status bar.

Triggers (called from UI, not DB triggers, to keep it controllable):
- Upload handler calls `extractDocumentIntelligence` after a successful insert into `mission_library`.
- If `is_rfp=true OR category='RFP'`: also call existing `parseRfp` server fn → on success, write a signal and surface "N questions created".
- After extraction completes for any doc: call `regenerateBriefingBook` (debounced via React Query mutation chain, not server-side).

## 3. UI changes

### Mission Activation Wizard (`src/components/v2/MissionActivationWizard.tsx`)
Three-step modal replacing the current `NewMissionModal` in `src/routes/_authenticated/olympus/index.tsx`. Also reachable from "Activate Mission" button on a Draft mission card.

- **Step 1 — Setup**: name, client, state, submission_date, description, slack_webhook. Reuses existing form logic; on Continue inserts the mission row (status='Draft') and advances.
- **Step 2 — Upload Core Documents**:
  - Drag-and-drop zone (reuses Vault upload code path).
  - Checklist of 9 categories with required vs optional indicators; checks turn green as files land in that category.
  - Per-file row: filename, category badge, progress bar → "✓ Processed by IRIS" once extraction returns. RFP rows also show "N questions created".
  - "Skip for now" link and "Activate Mission →" primary action.
- **Step 3 — IRIS Activation**: animated 4-line progress (reading → questions → briefing → ready), then a summary card with counts, then "Enter Mission →" → `/missions/$missionId/overview`. Sets `missions.status='Active'`.

### Library page (`src/routes/_authenticated/missions/$missionId/library.tsx`)
- Add `LibraryIntelligenceStatusBar` at top: "IRIS has indexed N of M documents · Last indexed: X ago · [Re-index All]".
- Each document row: "Indexed by IRIS ✓" or "Pending IRIS indexing…" badge based on `document_extractions` presence.
- Re-index button calls `reindexMissionDocuments`.

### Briefing Book page (`src/routes/_authenticated/missions/$missionId/briefing.tsx`)
- Per-section: "Last updated X ago" + "Regenerate" button (already partially exists — wire to new `regenerateBriefingBook`).
- Page-level "Regenerate Briefing Book" button.

## 4. What I'm NOT touching
- Existing `iris-rfp-parser` flow stays as-is; the wizard just calls it.
- Existing `briefing_book_sections` schema/section keys are unchanged; I'm just adding a richer aggregation context.
- No DB triggers — all pipeline orchestration lives in server fns called from the UI, so it's debuggable and re-runnable.
- Auto-regeneration on every signal/risk/decision change: I'll add it as a manual "Regenerate" button + auto-call after document uploads, but NOT a background job per change (would burn AI credits unpredictably). If you want fully automatic regeneration on every conflict/risk/decision change, say so and I'll add a debounced mutation hook.

## Open questions before I build
1. **Wizard entry points** — confirm: (a) replace the existing "Create New Mission" modal in Olympus with the wizard, (b) add "Activate Mission" button on Draft mission cards that opens the wizard at Step 2. Anything else?
2. **AI model for extraction** — default to `google/gemini-3-flash-preview` (cheap, fast, JSON-capable) for the per-document extraction. OK?
3. **Auto-regen scope** — confirm: regenerate Briefing Book automatically after document uploads only; everything else (new question, conflict, risk) shows a "Stale" indicator + manual Regenerate button. OK or do you want full auto?