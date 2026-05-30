
# RFP Sizing Engine & Services Checklist

A new "Step 2B — Size the Opportunity" between intake Steps 2 and 3, revisitable at `/engagement/:id/sizing`. Drives writer staffing, surfaces evaluation weights through the heatmap and writer views, and captures the full services scope.

## Part 1 — Extract from RFP

Extend `extractRfpQuestionsFromOpportunity` (and the underlying extraction prompt in `src/lib/ai/*`) to additionally return:

- `total_page_limit: number`
- `total_questions: number`
- `sections[]`: `{ name, page_limit, evaluation_weight_pct, questions[] }`
- `questions[]` (per section): `{ question_number, question_text, page_limit, evaluation_weight_pct }`
- `ai_estimated: boolean` per weight when weights aren't explicit in RFP (estimate from length, question count, scoring language)

Persist to `engagement_config.sizing_data` (new jsonb column). Compute `submission_days_remaining` from today → `engagements.submission_date` and store alongside.

## Part 2 — Sizing assumptions

New jsonb `engagement_config.sizing_assumptions`:
- `baseline`: weak (50) | moderate (70) | solid (90) pages-per-writer
- `turnaround_override`: auto-set to 30 when `submission_days_remaining < 90`, displayed with warning banner; locks capacity at 30
- `complexity`: standard (0) | high LTSS/HCBS/IDD/Dual (-10)

Effective `writer_capacity = max(turnaround_override ?? baseline + complexity_mod, 10)`.

## Part 3 — Calculations & UI

`/engagement/:id/sizing` route (also embedded as Step 2B in `IntakeWizard`):

- Summary strip: total pages, sections, questions, writer_capacity, writers_needed, recommended_team_size (`writers_needed + (any section weight > 30 ? 1 : 0)`).
- Section table sorted by weight desc with: health dot (placeholder), name, weight%, weight bar, page limit, question count, writers-for-section, HIGH/MED weight badges.
- Expandable section rows showing per-question rows with weight color coding (red >10, amber 5-10, gray <5) and "Assign" button.
- Writer load panel: per assigned writer load bar (green/amber/red), question list, OVER CAPACITY badge. Unassigned box with totals.

Question assignments stored on `rfp_questions.assigned_to` (uuid → engagement_members.id, nullable). Add column if missing.

### Heatmap & writer integration
- New column `heatmap_sections.evaluation_weight_pct numeric`. Populate from `sizing_data` on save.
- `heatmap.tsx`: show weight% badge on section header; default sort by weight desc.
- `/writer/my-sections` (and the editor's question card): show question's `evaluation_weight_pct` prominently.

## Part 4 — Services checklist

New jsonb `engagement_config.services_checklist`:
```
{
  categories: {
    pre_writing: { items: [{key, label, checked, notes, estimated_hours}], category_hours },
    writing: {...}, sme: {...}, creative: {...}, qa: {...}, post_submission: {...}
  },
  total_estimated_hours: number
}
```

Hard-coded item list matches the prompt verbatim. UI: collapsible categories, per-item checkbox + notes textarea + hours input, category subtotal, grand total at bottom.

### Surfacing
- Admin dashboard engagement card: chips for checked high-signal services (Graphic Design, Oral Prep, Red Team, BAFO).
- Executive dashboard: same chips + total estimated hours.
- War Room command page: compact strip "X writers · Y services · Z est. hours" linking to `/engagement/:id/sizing`.

## Technical layout

**Migration** (`supabase/migrations/...`):
- `ALTER TABLE engagement_config ADD COLUMN sizing_data jsonb, sizing_assumptions jsonb, services_checklist jsonb, submission_days_remaining int;`
- `ALTER TABLE heatmap_sections ADD COLUMN evaluation_weight_pct numeric;`
- `ALTER TABLE rfp_questions ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES engagement_members(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS evaluation_weight_pct numeric, ADD COLUMN IF NOT EXISTS page_limit numeric;`

**Server functions** (`src/lib/ai/sizing.functions.ts`):
- `extractSizingData(engagementId)` — calls Gemini with extraction prompt over RFP text, writes sizing_data + heatmap weights.
- `saveSizingAssumptions(engagementId, assumptions)`
- `saveServicesChecklist(engagementId, checklist)`
- `assignQuestionToWriter(questionId, memberId | null)`

**Components**:
- `src/components/sizing/SizingEngine.tsx` (main, used by route + wizard step)
- `src/components/sizing/AssumptionsPanel.tsx`
- `src/components/sizing/SectionWeightTable.tsx`
- `src/components/sizing/WriterLoadPanel.tsx`
- `src/components/sizing/ServicesChecklist.tsx`
- `src/components/sizing/SizingSummaryStrip.tsx` (war room)

**Routes**:
- `src/routes/_authenticated/engagement.$id.sizing.tsx`
- Insert Step 2B in `IntakeWizard` (find existing wizard file).

**Wizard integration**: locate current intake wizard, add step `size` between review and warroom. Runs `extractSizingData` on mount if `sizing_data` is null.

## Out of scope (note to user)
- I won't rewrite the entire heatmap re-sort behavior — just add the weight badge + default sort key.
- "Health color dot" in section table uses existing `heatmap_sections.status` color; placeholder gray if section not yet in heatmap.
- Real-time recompute on every keystroke is debounced (500ms).

Ready to build — confirm and I'll execute the migration + code in one pass.
