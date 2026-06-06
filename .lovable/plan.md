## ATLAS V1 — Single Mission Build (NJ CSOC)

A focused rebuild around one mission. No portfolio, no Olympus, no Atrium. Login → straight into NJ CSOC. Three screens carry the product: Mission Command, Sections Tracker, Section Workspace.

---

### Scope decisions (please confirm before I start)

This is a large, opinionated reshape of the app. Before I touch routes, I need to lock 4 things:

1. **Coexistence vs. replacement.** The repo currently has Atrium, Olympus, Admin, multi-mission lists, Cockpit, check-in, etc. Two options:
   - **(A) V1 mode toggle** — keep all existing routes intact, add a new `/v1` (or root redirect for non-admins) experience that delivers the 7 screens against the NJ CSOC mission. Lowest risk. Easiest to back out. *Recommended.*
   - **(B) Hard cutover** — make `/` land in NJ CSOC for every non-admin, hide AtriumNav, demote `/missions`, `/journey-map`, `/cockpit`. Admin still reachable at `/admin`. Closer to spec, but irreversible without a revert.
2. **Data source.** Spec gives concrete sample data (18 sections, 7 people, 4 themes, dates). Two options:
   - **(A) Seed the real DB** — insert one mission row + members + sections + clarifications via migration so IRIS/scoring/threads work against real tables. *Recommended.*
   - **(B) Hard-code a fixture** — render all 7 screens off a static TS module. Faster, but breaks the moment you click into anything that writes.
3. **The "NJ CSOC mission id."** Do you want me to (a) create a brand-new mission with the exact name/client/dates and pin its UUID in an env-style constant, or (b) point V1 at an *existing* mission already in your DB? If (b), paste the mission id.
4. **Editor.** Section Workspace shows a "full text editing area." Is a plain textarea + autosave enough for V1, or do you want the existing rich editor (if one exists in `src/components/v2/`)?

Default assumptions if you say "go": **1A, 2A, new mission (3a), plain textarea editor (4)**.

---

### What gets built (assuming defaults above)

**Routing**
- New `/v1` route tree under `_authenticated/v1/` — leaves the current app untouched.
  - `/v1` → role-based redirect (PM/EL → `/v1/command`, Writer/SME → `/v1/my-sections`, Reviewer → `/v1/sections?filter=in-review`).
  - `/v1/command` — Mission Command
  - `/v1/sections` — Sections Tracker
  - `/v1/sections/$sectionId` — Section Workspace
  - `/v1/my-sections` — Writer/SME personal list
  - `/v1/intel` — Mission Intel (IRIS Brief + library tabs)
  - `/v1/vault` — Mission Vault
  - `/v1/journey` — Journey Map (reuse existing `JourneyMapPage` bound to NJ CSOC)
- New thin shell `V1Shell` with: ATLAS logo, mission header strip (name + days-to-submission), left nav (Command / Intel / Vault / Sections / Journey), top-right "My Sections" + user menu. No AtriumNav. No mission switcher.
- Role visibility rules per spec (PM/EL see Command; Writer/SME see Sections read-only + My Sections prominent; Reviewer sees filtered tracker).

**Data layer**
- Single migration:
  - Insert NJ CSOC mission (idempotent on a known slug) with all the spec fields (client, program, submission_date 2026-06-28, status Active, contract_value).
  - Insert 7 team members linked to existing users where emails match, otherwise create placeholder profile rows + mission_members entries with the right roles.
  - Insert 4 win themes + alignment scores.
  - Insert 18 sections with owner, due date, status, alignment %, theme links.
  - Insert 3 client clarifications.
  - Insert ~5 mission intel rows + a pinned response template vault entry.
- Constant `NJ_CSOC_MISSION_ID` exported from `src/lib/v1/mission.ts`, resolved at build time from the migration.

**Components (all new, under `src/components/v1/`)**
- `V1Shell.tsx` — layout + nav
- `MissionCommand.tsx` — header, IRIS Health block, WinThemes 2×2 grid, KeyDates strip, ClientClarifications table, RecentActivity
- `SectionsTracker.tsx` — filterable table, status pills, alignment column, ⚠ flags, bulk actions for PM/EL
- `SectionWorkspace.tsx` — two-column: `SectionEditor` (textarea + autosave + status dropdown + notes thread) | `IrisPanel` (alignment, brief, intel, requirements checklist), collapsible
- `MySections.tsx` — writer-scoped list, at-risk pinned to top
- `MissionIntel.tsx` — tabs: IRIS Brief / All Intelligence / By Category
- `MissionVault.tsx` — category groups with IRIS-Active badge on Response Template
- `IrisBadge.tsx` — shared ⚡ + indigo wrapper used everywhere IRIS speaks

**Server functions (new, in `src/lib/v1/*.functions.ts`)**
- `getMissionCommand` — health, win themes, dates, clarifications, recent activity in one round trip
- `listSections` / `getSection` / `updateSection` (status, body) / `bulkUpdateSections`
- `listMySections`
- `listMissionIntel` / `getIrisBrief` (reuse existing `iris-mission-brief.functions.ts`)
- `listVault`
- All gated by `requireSupabaseAuth` + a `requireMissionMember(NJ_CSOC_MISSION_ID)` check.

**Design system**
- Add the spec's tokens to `src/styles.css` under `@theme` as `--color-v1-bg`, `--color-v1-surface`, `--color-v1-border`, `--color-iris`, plus reuses for primary/success/warning/danger. Keep them additive — existing dark theme stays.
- `IrisBadge` and every IRIS surface use `text-iris` / `bg-iris/10` — no raw hex in components.

**Login routing**
- Update `src/components/v2/LoginRouter.tsx` (or add a sibling V1 router) so that after auth, role lookup sends user into `/v1/command` or `/v1/my-sections`. Admins keep their existing destination.

---

### What is explicitly NOT touched
- `/admin/*` (untouched)
- `/olympus` (untouched — still the Phase 5 placeholder)
- `/atrium`, `/cockpit`, `/missions`, `/missions/$id/*`, `/status-report`, `/journey-map` (untouched — still reachable, just not the default landing)
- Existing IRIS, Atlas, vault, canon, expertise infrastructure (reused, not rewritten)

If you want option **(B) hard cutover** instead, I'll additionally: redirect `/` → `/v1`, remove AtriumNav items, and add legacy splat redirects from old mission routes into `/v1/sections/...`. Say the word.

---

### Technical notes (for the dev-minded)
- Mission id resolution: migration inserts with `ON CONFLICT (name, client) DO UPDATE` and returns the id; a small `getNjCsocMissionId()` serverFn caches it in memory so we don't hardcode UUIDs in client bundles.
- Sections table: if the existing `sections` schema doesn't have `alignment_pct` or `theme_ids[]`, the migration adds nullable columns + grants. No destructive changes.
- Autosave: debounced 800ms via `useMutation` against `updateSection`.
- IRIS panel reuses `generateMissionBrief` (already in `iris-mission-brief.functions.ts`) and a new `generateSectionBrief` that wraps the same gateway pattern.
- All new tables/columns get explicit `GRANT` + RLS policies scoped through `has_role` + `is_mission_member`.

---

### Build order (matches your spec)
1. Tokens + `V1Shell` + `/v1` route tree skeleton
2. Migration: NJ CSOC mission + members + themes + sections + clarifications + intel + vault
3. Login routing → `/v1`
4. Mission Command
5. Sections Tracker
6. Section Workspace
7. My Sections
8. Mission Intel
9. Mission Vault
10. Journey Map binding + nav QA pass

Each step ends with a manual smoke check in the preview before moving on.

---

**Reply with (1A or 1B), (2A or 2B), (3a-new or 3b-existing + id), and (4 textarea or rich) — or just "go with defaults" and I'll start.**
