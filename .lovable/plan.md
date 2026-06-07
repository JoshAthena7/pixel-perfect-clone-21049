
## What already exists (do NOT rebuild)

After auditing the codebase, ~70% of what you described is already shipped:

- **Upload + AI extraction**: `UploadMatrixModal.tsx` + `matrix-extract.server.ts` + `extractMissionMatrixFromUpload` already accept XLSX, CSV, PDF, DOCX, parse them with Gemini, and let an admin review + commit.
- **Question records table**: `question_records` already has question_number, title, section, parent, writer, SME, page_limit, weight, pens_down_date, scoring_criteria, status, **health** (auto-calculated by `calculate_question_health` DB function — green/yellow/red based on SME, writer, score, days-to-pens-down), confidence, etc.
- **Auto health engine**: trigger `trg_refresh_question_health` already runs on every write.
- **Writer cockpit / flight deck**: `flight-deck.tsx`, `sections/index.tsx`, `sections/$questionId.tsx` already filter to the writer's assigned questions.
- **SME interview engine**: `iris-question-brief.functions.ts` + `interviews.tsx` already generate interview objectives, suggested questions, gaps, follow-ups per question.
- **Mission health dashboard**: `MissionHealthAndThemes.tsx`, `MissionPulse.tsx`, `MissionReadinessPanel.tsx` already aggregate.

## Real gaps in the current import flow

What the spec asks for that we *don't* have:

1. **Field mapping preview step** — today the AI just parses and shows you the result. There is no "Question Number → Question_ID" column-mapping confirm screen with a header-row preview. Pure-spreadsheet uploads should let the admin reassign columns before commit.
2. **"Strategic Owner" and "Support SMEs"** — schema has one `assigned_writer_id` and one `assigned_sme_id`. No strategic owner. No multi-SME support. These columns from the matrix get dropped on the floor today.
3. **SME meeting status fields** — no `sme_meeting_status` / `sme_meeting_date` columns. Today this lives implicitly in interview records, not on the question.
4. **Default status normalization** — extractor doesn't force the spec's defaults (Not Scheduled / Not Started / Not Started / Green) for new records explicitly.
5. **IRIS staffing summary after import** — `iris_staffing_recommendations` table exists but nothing writes to it on commit. No "unassigned questions / overloaded writers / sections with no owner" report is generated at the end of import.
6. **Notes / Comments column** — matrix has a Comments column; we don't store it.

## Plan — focused, surgical additions

### Step 1 — Schema additions (one migration)
Add to `question_records`:
- `strategic_owner_id uuid` (profile reference, nullable)
- `support_sme_ids uuid[]` (default `'{}'`)
- `sme_meeting_status text` (default `'not_scheduled'`)
- `sme_meeting_date timestamptz`
- `import_notes text` (the Comments column)

Add `mission_staffing_summary` table — one row per mission, JSON payload with unassigned_questions, overloaded_writers, sections_without_owner, high_risk_areas, last_generated_at. RLS: mission members read, leads/admins write.

### Step 2 — Spreadsheet field-mapping UI (the headline new feature)
For XLSX/CSV uploads only (PDF/DOCX keep AI-extraction path):
- Server fn `previewMatrixHeaders` — returns the first sheet's header row + first 5 data rows + IRIS auto-guessed mapping (Question Number → question_number, Writer → assigned_writer_name, etc.).
- New step in `UploadMatrixModal`: column-mapping table. Each source column gets a dropdown of target fields (Question_ID, Question_Title, Athena_Writer, Lead_SME, Support_SME, Strategic_Owner, Comments, Volume, Pens-Down Date, Page Limit, Weight, Skip).
- Admin confirms → server fn applies mapping → produces the same `SuggestedQuestion[]` shape that the existing commit pipeline uses.

### Step 3 — Extend extractor + commit
- `matrix-extract.server.ts`: AI prompt also captures `strategic_owner_name`, `support_sme_names[]`, `notes`.
- `matrix-import.functions.ts` `commitMissionMatrix`: resolve those names through the same profile-matching path, write new columns, force the spec's defaults on every inserted row.

### Step 4 — Post-import IRIS staffing summary
New server fn `generateMissionStaffingSummary(missionId)` runs automatically after commit:
- Unassigned: rows missing writer/SME/owner.
- Overloaded writers: writers with > N assigned questions OR > X total page_limit.
- Sections with no strategic owner.
- High-risk areas: count of red health.
Stores into `mission_staffing_summary`. Show as a banner at the top of the mission setup page after import completes.

### Step 5 — Surface new fields in existing views
- Writer cockpit (`sections/$questionId.tsx` + flight-deck question card): show Strategic Owner, Support SMEs, SME meeting status/date.
- Mission setup question list: same columns visible.
- (Optional, deferred) edit controls — for now read-only from import; existing inline editors stay as-is.

## Out of scope (intentionally not in this build)
- Rebuilding writer cockpit / SME tracker / leadership briefing — those exist; we're just feeding richer data into them.
- New "Assignment Dashboard" page — the existing mission setup question list IS this; we'll just light up the new columns.
- SOS button / interview flight plan button — already implemented elsewhere.

## Files touched
- `supabase/migrations/<new>.sql` (schema)
- `src/lib/matrix-extract.server.ts` (extend AI prompt)
- `src/lib/matrix-import.functions.ts` (new fields, defaults, staffing summary, preview fn)
- `src/components/questions/UploadMatrixModal.tsx` (field-mapping step for spreadsheets)
- `src/lib/mission-staffing.functions.ts` (new — summary generator + reader)
- `src/components/admin/MissionStaffingBanner.tsx` (new — small)
- `src/routes/_authenticated/admin/missions.$missionId.setup.tsx` (wire banner)
- `src/routes/_authenticated/missions/$missionId/sections/$questionId.tsx` (display new fields)

This is roughly 1 migration + ~600 lines of focused code, not a rewrite. **Approve and I'll start with the migration.**
