# Cleanup & Reconciliation Prompt — RUN LAST

Do not run until Prompts 3, 4, 5, 6, 6A, and the Option-3 grounding follow-up
have all confirmed clean.

Scope: reconciliation only — no new features, no functionality changes.

---

## Part 1 — Naming audit
Replace every instance, TS/TSX + SQL migrations:

| Deprecated | Canonical |
|---|---|
| War Room / WarRoom / war-room (components) | ATC / AirTrafficControl (keep `/war-room` URL) |
| Thread (old assist bar button) | Remove — Sticky Notes replaces it |
| Watch Out (brief tab) | Risk Flags |
| oracle_nodes (table) | oracle_signals |
| oracle_question_intel (table) | question_intel_links |
| profiles.is_platform_admin | has_role(auth.uid(), 'admin'::app_role) |
| member_id = auth.uid() (RLS) | is_mission_team_member(mission_id, auth.uid()) |
| is_active (filter on oracle_signals) | status IN ('approved','pushed','needs_review') |

Note each change with file + line.

## Part 2 — Consolidate IRIS gateway calls
List every `ai.gateway.lovable.dev` call site. Flight Deck brief panel MUST
use `generateIrisBrief` from `src/lib/iris-brief-generator.functions.ts`.
Other call sites stay scoped to their feature. Add an index comment at the
top of the brief generator listing all gateway call sites.

## Part 3 — Dead component audit
Import-graph analysis. Remove files not imported anywhere and not a route.
Watch for: old Thread modal, old 6-button assist bar, old War Room page, old
brief tab components.

## Part 4 — RLS standardization
Audit query:
```sql
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname;
```
Fix any `profiles.is_platform_admin`, raw `member_id = auth.uid()`,
hardcoded user IDs, duplicate policies. Single migration. Re-run audit.

## Part 5 — Console log cleanup
Gate `console.log/warn/error` containing ORACLE:, IRIS:, query_oracle,
pipeline, scraper, classifier, promoter, grounding, taxonomy behind
`if (process.env.NODE_ENV === 'development')`. Do not delete.

## Part 6 — ATLAS-ARCHITECTURE.md
Generate at repo root. Sections: Overview, Design Principles, Page
Architecture, Database Schema, ORACLE Architecture, IRIS Briefing
Architecture, ATC Architecture, Assist Bar, Key Integrations, Env Vars,
Known Tech Debt, Build History. Fill from actual codebase; mark unknowns
"Verify manually."

## Part 7 — Verification checklist
Report PASS / FAIL / VERIFY MANUALLY for each:
- [ ] No deprecated names in codebase
- [ ] No deprecated names in SQL migrations
- [ ] iris-briefing service used by Flight Deck brief panel
- [ ] Gateway call map comment exists
- [ ] No orphaned components remain
- [ ] All RLS uses has_role() / is_mission_team_member()
- [ ] No hardcoded user IDs in RLS
- [ ] All debug logs gated on NODE_ENV
- [ ] ATLAS-ARCHITECTURE.md exists with all sections
- [ ] No console errors on /briefing, /intelligence, /flight-deck, /war-room, /olympus
- [ ] query_oracle returns valid JSON for valid mission+question
- [ ] oracle_source_registry has 14 rows
- [ ] oracle_taxonomy has 67 nodes
- [ ] All 3 TanStack cron routes exist under /api/public/hooks/

Done when all 7 parts complete, checklist reported, doc exists, no console errors.
