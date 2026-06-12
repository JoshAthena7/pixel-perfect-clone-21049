# Mission Briefing Room — Build Plan

Read-only command center at `/missions/[id]/briefing`. Olympus creates reality; ATLAS distributes it. Zero edit affordances for non-admin.

## Files to create

```text
src/routes/_authenticated/missions.$missionId.briefing.tsx     (route shell + Suspense per section)
src/routes/_authenticated/missions.$missionId.index.tsx        (redirect → briefing)
src/lib/briefing-room.functions.ts                              (9 parallel server fns)
src/components/briefing-room/BriefingHeader.tsx
src/components/briefing-room/SectionCard.tsx                    (shared header + READ ONLY chip + Edit-in-Olympus)
src/components/briefing-room/SectionSnapshot.tsx                (#1)
src/components/briefing-room/SectionWhyMatters.tsx              (#2)
src/components/briefing-room/SectionNorthStar.tsx               (#3)
src/components/briefing-room/SectionIntelligence.tsx            (#4)
src/components/briefing-room/SectionClientStory.tsx             (#5)
src/components/briefing-room/SectionMissionMap.tsx              (#6)
src/components/briefing-room/SectionRisks.tsx                   (#7)
src/components/briefing-room/SectionDocuments.tsx               (#8)
src/components/briefing-room/SectionSignals.tsx                 (#9)
```

Sidebar `AppSidebar`: add "Briefing" item active on `/missions/$id/briefing`.

## Schema substitutions (confirmed against live DB)

Spec named several tables/columns that don't exist. Mapping:

| Spec field | Actual source |
|---|---|
| `mission_context.*` | `mission_win_strategy.mission_significance`, `client_priorities`, `known_risks`, `value_proposition` |
| `mission_client_profile.*` | `mission_win_strategy.discriminators`, `proof_points`, `client_priorities` |
| `missions.estimated_contract_value` | `missions.contract_value` |
| `missions.prime_contractor` | not in schema → render "—" |
| `missions.intelligence_completeness_pct` | `missions.intelligence_graph_completeness` |
| `mission_win_strategy.things_to_avoid` | `mission_win_strategy.known_risks` (array) |
| `mission_win_strategy.evaluator_priorities` | exists ✓ |
| `intelligence_graph_nodes.node_title/node_summary` | `label` / `description` |
| `intelligence_feed_items.requires_action` | `recommended_action IS NOT NULL` |
| `team_updates` | `reality_updates` (signal_type: `sos`, `pulse`, `update_reality`, `pm_update`) + `broadcasts` |
| Question SME | `question_assignments.athena_sme_name` (mission_assignments has writer only) |
| Question title | `mission_questions.question_text` (truncated) |
| Question confidence | `mission_questions.iris_confidence` |

If a referenced column truly doesn't exist for `node_type='policy'/'regulatory'`, query falls back to filtering by label/keywords.

## Route default landing

Spec says `/missions/[id]` should default to briefing. Implement as `missions.$missionId.index.tsx` with `beforeLoad: throw redirect({ to: '/missions/$missionId/briefing', params })`. Current Flight Deck route stays at `/missions/$id/flight-deck`.

## Data loading shape

Route loader fires nothing. Component renders 9 `<Suspense>` boundaries; each section uses `useSuspenseQuery` against its own queryOptions calling its own server fn. Result: page shell + header paint immediately, each section streams in independently with skeletons. Native parallelism without `Promise.all`.

Header data (`getBriefingHeader`) is awaited in loader because health badge belongs in the chrome.

## Server functions (all `requireSupabaseAuth`, RLS-scoped read)

1. `getBriefingHeader(missionId)` → mission core + health calc (counts at_risk questions, days to deadline, unassigned sections)
2. `getSnapshot(missionId)` → mission + team counts + engagement lead name
3. `getWhyMatters(missionId)` → 4 fields from `mission_win_strategy`
4. `getNorthStar(missionId)` → central_claim, win_themes, evaluator_priorities, known_risks + top evaluator stakeholders
5. `getIntelligence(missionId)` → parallel queries: stakeholders, incumbent, competitors, policy nodes, regulatory nodes, feed items
6. `getClientStory(missionId)` → discriminators, proof_points, client_priorities, value_proposition
7. `getMissionMap(missionId)` → sections + questions + assignments + question_assignments joined; returns grouped tree
8. `getRisks(missionId)` → mission_risks + at-risk questions + actionable feed items + unresolved SOS from reality_updates
9. `getDocuments(missionId)` → mission_documents grouped by document_type
10. `getSignals(missionId)` → reality_updates + broadcasts, last 10 merged by created_at

## Read-only enforcement

- No mutation imports in any section component.
- `<SectionCard>` accepts optional `editInOlympusHref`; only rendered when `isAdmin` from route context.
- No `<button>`, no `<input>`, no `<a href>` on data fields. Document links in §8 are the only outbound `<a target="_blank">`.

RLS: existing policies already gate writes to admin/lead roles. No new policies in this sprint — purely additive UI on existing read paths.

## Design tokens (from spec, applied inline)

Health: green `#7DCF7D`, amber `#EF9F27`, red `#f08080`. Gold `#C49A2B`. Backgrounds use the rgba values in the spec verbatim. Section cards: `rgba(255,255,255,0.02)` bg, `rgba(255,255,255,0.06)` border, 16px radius, 20px padding. 13/12/11/10px type ladder. No shadcn cards — bespoke divs to keep the chrome quiet.

## Mobile

Each grid uses `grid-cols-1 md:grid-cols-2` / `lg:grid-cols-3`. Section 6 table becomes stacked cards below `md` via duplicate render gated by `useIsMobile()`.

## Out of scope (this sprint)

- Real-time refresh of signals (poll on focus only)
- "Edit in Olympus" target URLs (link to `/olympus/missions/$id/wizard?step=N` placeholders — admin still gets the affordance, deep links can be tightened later)
- Skeleton animations beyond a simple pulsing gray block
- IRIS "Explain This Page" button — referenced in spec but uses existing dispatch pattern, one line per section is enough

## Validation checklist after build

- Route renders without console errors at `/missions/{real-id}/briefing` and `/missions/fake-id/briefing` (latter → existing notFound)
- Header health badge changes color when deadline crosses 30/14-day thresholds
- All 9 sections render with empty-state italic placeholder when their queries return nothing
- Non-admin sees zero `Edit in Olympus` links; admin sees one per section
- §6 table rows are not clickable (no `cursor-pointer`, no `onClick`)
- §8 document anchors open in new tab
- Mobile single-column at 375px viewport
- Build passes; no TS errors