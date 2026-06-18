## Why a plan first

This prompt is ~8 parts and ~2,000–3,000 lines of new UI plus a route/auth refactor. Doing it in one shot guarantees a half-built page. I'll deliver in 3 phases so each lands working, behind a feature flag is not needed because the page is currently broken anyway.

## Pre-work: diagnose the crash (no UI yet)

`/olympus` renders `AthenaCommandPage`. The "Mission not found" error originates from a server fn (briefing-room / oracle / intelligence-graph) called without a valid missionId. I'll trace it from `AthenaCommandPage` and either pass a missionId or short-circuit the call when no mission is selected. This unblocks the page before the rebuild lands on top.

## Phase A — Skeleton + Part 1, 2, 7 (routing fix, layout, access control)

- New file `src/components/olympus/OlympusCommand.tsx` — 3-column shell (24/48/28), top status bar, mission name + countdown + "Run Pipeline" button wired to the existing `runOraclePipeline` helper from Prompt 3.
- Replace `OlympusIndex` to render `OlympusCommand` instead of `AthenaCommandPage`. Old `AthenaCommandPage` stays — it's still used elsewhere (search confirmed).
- Role guard: `useIsAdmin || useHasRole('engagement_lead')`. Non-matching → redirect `/missions`. Hide the nav item the same way (locate via grep of "Olympus" in nav components).
- Mission selector dropdown in the top bar (defaults to most recent active mission) — all panels key off this. Resolves the "missionId is undefined" crash class permanently.

## Phase B — Parts 3, 4, 6 (taxonomy browser, intel review queue, sources tab)

- Left column: tab switcher (Taxonomy | Sources). Taxonomy tree from `oracle_taxonomy` (67 nodes) with count badges from `oracle_signals.taxonomy_node_ids` (single aggregate query). Gaps section at bottom. Click → filters center column.
- Center column: status tabs (All/Needs Review/Approved/Pushed/Dismissed/Errors), review cards with Approve/Push/Dismiss actions (optimistic update via React Query mutation), detail drawer (Sheet) with edit mode (category, subcategory, taxonomy multi-select, topic tags, relevance slider). Stats bar above the list.
- Sources tab: list `oracle_source_registry`, Pause/Resume + Check Now actions, Add Source form.

## Phase C — Part 5 (Health column, 4 panels)

- Briefing Coverage map: for each `mission_questions` row, compute 4-dot status by counting `question_intel_links` joined to `oracle_signals.category` matched to each brief-type's branch-set. One server fn aggregates this.
- Pipeline Health: reuse the queue stats query from the admin pipeline page.
- IRIS Usage Stats: group `question_intel_links` by `briefing_layer`, bar chart with `recharts` (already in deps).
- Top Intelligence: top 5 approved/pushed `oracle_signals` by relevance, with usage count.

## Out of scope (will NOT touch)

Flight Deck, ATC, Intelligence feed, Add Intel modal, existing brief generator, Prompt 6A. Existing `olympus.missions.*`, `olympus.wizard.*`, `olympus.team.tsx`, `olympus.flight-deck.tsx`, `olympus.change-requests.tsx` routes stay as-is.

## Confirm before I start

1. **Phase A this turn, B and C next**, or **all three this turn** (high risk of one panel being incomplete given scale)?
2. **Mission selector**: top-bar dropdown of user's missions (my recommendation — single Olympus URL works for any mission), or **route param** `/olympus/missions/$missionId/command` (more URL-shareable, more refactor)?
3. **Role**: `engagement_lead` isn't a value in the existing `app_role` enum I can see. Add it as part of this work, or treat "lead" as `admin` only for now and add the new role separately later?
