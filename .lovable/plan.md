
# ATLAS Expertise Profile Redesign — Build Plan

## Scope confirmed
- Full vertical slice (UI + persistence + IRIS schema stubs) in one pass.
- Replace `expertise_options` and `mission_member_expertise` tables.
- Profile editor lives at the existing `/profile/expertise` route (replaces just the expertise UI inside `ExpertiseProfileEditor`; states/programs/wins/availability untouched).

## Database changes (single migration)

**New tables**
- `expertise_library` — seeded master list (id, label, category, sort_order). 4 categories, ~58 items per spec.
- `user_expertise` — per-user rows: `(user_id, expertise_id NULL, custom_label NULL, is_primary, display_order, added_at)`. Either `expertise_id` OR `custom_label` set, never both. Unique on `(user_id, expertise_id)` and `(user_id, lower(custom_label))`.
- `mission_expertise_signals` — `(mission_id, expertise_id, source text, weight)`. Replaces `mission_member_expertise`.
- `iris_staffing_recommendations` — schema-only stub per spec 8C.
- `iris_expertise_coverage` — daily snapshot per spec 8D.

**Replaced**
- DROP `expertise_options`, `mission_member_expertise` (user chose Replace).
- DROP `profiles.expertise_areas`, `profiles.question_types` columns (free-text arrays now superseded). Keep `expert_bio`, `expertise_embedding`.

**Search index**
- A real Postgres view `expertise_user_index` over `user_expertise` (queryable as `SELECT user_id FROM expertise_user_index WHERE expertise_id IN (...)`). Simpler and always-fresh vs. maintaining an index table via triggers.

**Seed**
- All 58 library items inserted with stable string IDs matching the spec (`ltss`, `mltss`, etc.).

**RLS**
- `expertise_library`: readable by all authenticated. Admin-only writes.
- `user_expertise`: user can CRUD their own rows; everyone authenticated can read (powers expertise discovery).
- `mission_expertise_signals`: mission members read; mission admin/lead writes.
- IRIS stub tables: service_role only for now.

## Server functions (`src/lib/expertise.functions.ts` — replace)

- `getExpertiseLibrary()` — returns full library grouped by category.
- `getUserExpertise(userId)` — returns structured + custom arrays, primary list, ordered.
- `setUserExpertise({ structuredIds, customLabels, primary, order })` — single upsert/delete to reconcile state. Enforces max 5 primary.
- `searchUsersByExpertise(ids[])` — intersection query for future discovery view.
- `getMissionExpertiseSignals(missionId)` — for future IRIS staffing.

## UI components (`src/components/expertise/`)

1. `ExpertiseLibraryProvider` — caches library via React Query.
2. `ExpertiseSelector` — searchable dropdown with browse/search states, category collapse, full library per spec Section 1.
3. `ExpertiseChips` — chip row with category dot, primary toggle (click dot), ×, drag-reorder via `@dnd-kit/sortable` (already in deps? will check; if not, add).
4. `CustomExpertiseInput` — Enter/comma to add, duplicate detection against library.
5. `ExpertiseCompletenessBar` — Section 9 indicator.
6. `ExpertiseSection` — assembles the above; this is what gets dropped into `ExpertiseProfileEditor` replacing the current expertise-areas + question-types blocks.

## Read-only view
- `ExpertiseChipsReadOnly` — used on other users' profiles. Clicking a chip navigates to `/profile/discover?expertise=<id>` (route stub — search results page is out of scope, but the link target is reserved).

## What I am NOT building this pass (called out so you know)
- The actual "find others with this expertise" search results page (only the click target / nav).
- IRIS recommendation generator logic (schema only, per spec).
- Nightly job to recompute `iris_expertise_coverage` (table + manual refresh fn only).
- Mobile bottom sheet variant — desktop dropdown is responsive; explicit mobile sheet can be a follow-up.
- First-time onboarding empty state copy block (small follow-up if you want it).

## Migration risk
- Existing `profiles.expertise_areas` free-text values will be **lost** on column drop. If anyone has data in there today and you want it preserved as custom tags, say so and I'll add a pre-drop migration step. Otherwise I'll proceed with a clean cut.

## File deltas (estimate)
- 1 migration
- 1 server-fn file rewritten
- 6 new components
- 1 component edited (`ExpertiseProfileEditor`) — only the expertise/question-type blocks replaced
- Possibly 1 dep add (`@dnd-kit/sortable`)

After you approve I'll run the migration, then build the components in one pass.
