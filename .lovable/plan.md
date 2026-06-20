# Unify Intel Loading — One Surface

Reorganization only. No schema changes, no new pipelines. We're collapsing today's four entry points (Setup Wizard, Intelligence page "Add Single Item", Intelligence page "Refresh IRIS", Intelligence page "Open Setup Wizard" banner, plus the standalone "Add Single Item" on the ORACLE page) down to **three**:

1. Setup Wizard Step 1 — initial mission setup only
2. **"+ Feed ATLAS"** drawer on the ORACLE page — the canonical ongoing path
3. **"Feed ORACLE →"** contextual link in Briefing Room — only when coverage <30%

Everything else becomes read-only.

## Files I plan to touch

**New**
- `src/components/mission-command/oracle/FeedAtlasDrawer.tsx` — the unified drawer (header + 3 tabs + close)
- `src/components/mission-command/oracle/feed/DocumentsTab.tsx` — wraps existing Setup Wizard Step 1 upload UI
- `src/components/mission-command/oracle/feed/ManualItemTab.tsx` — inline form → `oracle_signals` insert (status `needs_review`, tier `mission`, `user_created=true`)
- `src/components/mission-command/oracle/feed/StatePackTab.tsx` — admin-only, reads `oracle_signals` for `tier='state' AND state_code=mission.state_code`

**Edited**
- `src/routes/_authenticated/missions.$missionId.olympus.tsx` — add gold "+ Feed ATLAS" button in header, mount drawer, route the page's existing "Add Single Item" button to open drawer on Manual tab
- `src/routes/_authenticated/missions.$missionId.intelligence.tsx` — remove "Add Single Item" button, "Refresh IRIS" button, and Setup Wizard banner; add "Manage intelligence →" text link in sidebar; replace banner with one muted line inside Executive Summary band
- `src/components/intelligence/IntelLoadBanner.tsx` — delete (or no-op) since the banner is removed
- `src/components/mission-command/oracle/sections/IntelSidebar.tsx` and/or `IntelFeed.tsx` — remove standalone Add-Single-Item modal trigger, wire to drawer
- Briefing Room intel status widget — add conditional "Feed ORACLE →" gold link only when approved+pushed < 15; remove any existing Setup Wizard links
- Setup Wizard Step 1 component — add one muted italic line: "You can also add documents anytime via the ORACLE page — no need to re-run the wizard."
- `src/routes/_authenticated/admin.state-intel.index.tsx` — read `?from_mission=` query param, show "← Return to [mission name] ORACLE" banner when present

## Tab-by-tab behavior

**Documents tab (default)** — Lift the existing Setup Wizard Step 1 drag-drop + tagging pills + "Analyze with IRIS" component as-is. Same `mission_documents` query, same pipeline trigger. Success banner inside the drawer; drawer stays open; center-column Intel Review Queue refreshes via existing query invalidation.

**Manual Item tab** — Inline form (no nested modal). Fields per spec: Category (9-pill selector), Title, What happened, Why it matters, Recommended action, Source name, Urgency (4 pills, default Normal), Topic tags (comma list → `string[]`). Submit inserts into `oracle_signals` with `status='needs_review'`, `tier='mission'`, `mission_id`, `user_created=true`. Clear form on success, toast, invalidate review queue.

**State Pack tab (admin-only)** — If signals exist for `tier='state' AND state_code=mission.state_code`: header line + compact list + "Refresh State Pack" + "Manage all state packs →" (`/admin/state-intel?from_mission={id}`). Else: empty state + "Create State Pack" button → same admin page with state pre-selected. Hidden entirely for non-admins.

## Audit checklist when done

- ORACLE page header shows gold "+ Feed ATLAS"
- Drawer opens with Documents tab active, three tabs visible (State Pack hidden for non-admins)
- Intelligence page sidebar: ORACLE HEALTH + SECTION NAV + "Manage intelligence →" only
- Intelligence page has zero Setup Wizard references
- Briefing Room shows "Feed ORACLE →" only when intel coverage <30%
- Setup Wizard Step 1 has the informational note
- ORACLE page "Add Single Item" opens drawer on Manual tab (no separate modal)
- `/admin/state-intel?from_mission=…` shows return banner
- No console errors

## What I will NOT change

Review Queue logic, `oracle_signals` schema, document processing pipeline internals, Setup Wizard steps 2–9, Flight Deck/ATC nav, RLS policies, `/admin/state-intel` page content (only the back-link banner is added).

## Open question before I start

The prompt references `/missions/[id]/olympus` as "the ORACLE page." The codebase has both `missions.$missionId.olympus.tsx` and `missions.$missionId.oracle.tsx`. I'll target `missions.$missionId.olympus.tsx` since the route name matches. If `oracle.tsx` is the actually-used one, flag it in your reply and I'll move the work there.
