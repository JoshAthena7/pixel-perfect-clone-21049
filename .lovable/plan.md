# Sidebar Navigation Sprint

Full structural replacement of tab-based navigation with a persistent left sidebar. No new features — only routing, layout, and chrome.

## 1. New shell component

**`src/components/nav/AppSidebar.tsx`** — 200px fixed sidebar, dark `#050d18`, with four parts:

- **Mission context block** (only inside `/missions/$missionId/*`): mission name, days-to-submission color-coded (red <14, amber <30), at-risk + Intel % chips. Home state shows ATLAS mark + "Select a mission".
- **Nav sections** — MISSION / MY WORK / ADMIN, lucide icons, gold active state matching current URL via `useRouterState`.
- **All Missions** link → `/home`.
- **Footer** — user name · role, sign out link.

Mobile (<768px): collapses to 48px icon rail; hamburger in nav bar opens overlay. Uses `useIsMobile`.

**`src/components/nav/AppNavBar.tsx`** — 44px slim bar: ATLAS wordmark · breadcrumb · (Score Draft if in mission) · Ask IRIS · Notification bell · Avatar. Removes all nav links.

**`src/components/layout/AppShell.tsx`** — wraps `<AppNavBar />` + `<AppSidebar />` + `<main>{children}</main>`. Replaces the body of `_authenticated.tsx`'s shell.

## 2. New route tree under `/missions/$missionId/*`

Create flat route files:

```
src/routes/_authenticated/missions.$missionId.tsx              (layout: redirects to /briefing)
src/routes/_authenticated/missions.$missionId.briefing.tsx
src/routes/_authenticated/missions.$missionId.oracle.tsx
src/routes/_authenticated/missions.$missionId.insights.tsx
src/routes/_authenticated/missions.$missionId.flight-deck.tsx
src/routes/_authenticated/missions.$missionId.qa.tsx
src/routes/_authenticated/missions.$missionId.scores.tsx
src/routes/_authenticated/missions.$missionId.win-strategy.tsx
src/routes/_authenticated/missions.$missionId.team.tsx
src/routes/_authenticated/missions.$missionId.journey.tsx
src/routes/_authenticated/missions.$missionId.compliance.tsx
src/routes/_authenticated/missions.$missionId.reports.tsx
src/routes/_authenticated/missions.$missionId.settings.tsx
```

Each route wires an existing component (OverviewTab → briefing, OracleTab → oracle, FlightDeckLayout → flight-deck, TeamAssignmentsTab → team, MissionSettingsTab → settings, etc.). Missing components render a centered "[Section] — coming soon" placeholder. Never 404.

**Legacy redirect**: `/olympus/missions/$missionId` and `?tab=foo` URLs redirect to the new `/missions/$missionId/<sub>` paths so existing links don't break.

## 3. Remove tab strips

- Delete `MissionTabs` from `olympus.missions.$missionId.index.tsx` page body (route file becomes redirect).
- Strip the `SegmentedControl` from `TeamTab`, `SettingsTab`, `WorkTab` — each sub-tab becomes its own route under `/missions/$missionId/*`.
- Oracle internal sub-nav converted to a pill segmented-control header inside the Oracle content area only (sub-views, not top-level nav). Keep as a single component-internal control — no route changes for Oracle sub-views in this sprint.
- `AdminLayout` tab strip replaced: admin pages render inside the AppShell with sidebar showing an Admin context (Overview / Team Roster / IRIS Health items under a single ADMIN section, swapping the mission section when path starts with `/admin`).

## 4. Flight Deck assist bar

`FlightDeckLayout` already exists. Confirm its assist bar (Score Draft, Ask IRIS, Post Update, Find SME, Daily Brief, SOS) is pinned to the bottom of the main content area (not full window width). On mobile becomes horizontally scrollable icon row.

## 5. Active-state source of truth

Sidebar reads `useRouterState({ select: s => s.location.pathname })`. No localStorage. Browser back/forward updates highlight automatically.

## Out of scope (explicit)

- No data fetching changes — existing Supabase queries inside components untouched.
- No Oracle sub-route URLs (Graph/Feed/etc. stay as in-component pill control).
- No changes to mission wizard (`/olympus/missions/new`, `/olympus/missions/$missionId/wizard`) — still chromeless full-page.
- No changes to login, /auth, /welcome, /checkin.
- No new icons dependency — lucide-react throughout.

## Risks

- Large route-tree change → `routeTree.gen.ts` regenerates; preview may flicker once.
- Existing deep links to `?tab=oracle` etc. handled by redirect shim.
- TeamTab/SettingsTab/WorkTab still imported from mission-command; their sub-tabs are dropped — sub-components rendered directly by new routes.

## Done criteria

Matches the user's "YOU ARE DONE WHEN" checklist exactly.
