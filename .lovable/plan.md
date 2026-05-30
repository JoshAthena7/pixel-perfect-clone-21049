# Multi-Engagement Architecture

Six prompts batched into one coherent build. Run order matters — later prompts build on earlier ones.

## Current state (relevant)

- `use-engagement` hook loads a single engagement, but assumes 1:1 user→engagement.
- After login, users are routed straight to `/command` (leadership) or `/writer/my-sections` (writer) based on a single role lookup.
- `engagement_members` already supports many-to-many with per-engagement `role`.
- RLS already enforces role-based writes via `private.has_engagement_role`.
- `viewer` role exists in schema but has no UI treatment.

## What changes

### 1. Engagement context refactor (foundation for everything else)
- Extend `use-engagement` (or wrap it) to hold: `currentEngagementId`, `currentEngagement`, `currentMember` (the user's `engagement_members` row for that engagement), and `currentRole`.
- Persist `currentEngagementId` in `localStorage` so refreshes stay in the same war room.
- Expose `switchEngagement(id)` that re-fetches engagement + member row and updates context.
- All existing role checks across components switch to reading `currentRole` from context (no more ad-hoc queries).

### 2. New route: `/select-engagement`
- Lists every non-archived engagement the user belongs to (join `engagement_members` → `engagements where status != 'Archived'`).
- Card shows: name, client, submission_date, status, user's role badge (color-coded: leadership=blue, writer=amber, viewer=gray).
- Click → sets context + routes:
  - `founder` / `pm` / `engagement_lead` → `/command`
  - `writer` → `/writer/my-sections`
  - `viewer` → `/command` (read-only mode)

### 3. New route: `/overview` (founder/pm cross-engagement dashboard)
- Only accessible to users who have `founder` or `pm` role in ≥1 engagement.
- Summary grid: name, client, status, submission_date, latest `snapshots.health` + `temperature_score` + `client_sentiment`, count of open SOS alerts, count of open risks.
- Warning indicator (red border + icon) for cards with open SOS or `health = 'Red'`.
- Click card → enter that war room.

### 4. Post-login routing logic (the "front door")
Decision tree after auth:
```
memberships = engagement_members for user where engagement.status != 'Archived'
if memberships.length == 0  → empty-state page ("Ask an admin to invite you")
if memberships.length == 1  → route by that single role (current behavior)
if memberships.length >= 3 AND user has founder/pm in any → /overview
else                        → /select-engagement
```

### 5. Engagement switcher in sidebars
- Add to top of `AppSidebar` and `WriterSidebar`.
- Shows current engagement name + client.
- If user has >1 membership: chevron opens popover listing other engagements with role badges.
- Selecting one calls `switchEngagement(id)` then `navigate()` to the right route for that role. No full reload — context updates and queries re-fetch.
- Sidebar component itself swaps (AppSidebar ↔ WriterSidebar) based on new role, driven by the route layout.

### 6. Role-gating enforcement
- If a `writer` directly navigates to `/command/*`, redirect to `/writer/my-sections`.
- If a non-leadership user hits `/overview`, redirect to `/select-engagement`.
- Route guards live in the `_authenticated` layout (or a new `_authenticated/_leadership` sub-layout for command routes).

### 7. Viewer role implementation
- Viewers see leadership UI but all write actions are disabled/hidden:
  - Hide: "New Risk", "New SOS", "New Decision", "Broadcast", "New Huddle", "Capture Snapshot", "Upload Intel", "Add FAQ", "Add Win Theme", milestone edits, member edits, settings.
  - Use a `useCanWrite()` helper that returns `['founder','pm','engagement_lead'].includes(currentRole)`.
- "Viewer" badge with distinct gray styling on `/select-engagement` and switcher.
- RLS already blocks writes server-side — UI gating is the UX layer.

## Technical details

### Files to add
- `src/routes/select-engagement.tsx` — picker page
- `src/routes/_authenticated/overview.tsx` — cross-engagement dashboard
- `src/components/EngagementSwitcher.tsx` — sidebar popover
- `src/hooks/use-can-write.ts` — role gate helper
- `src/hooks/use-memberships.ts` — fetches all user memberships (used by router + switcher + overview)

### Files to edit
- `src/hooks/use-engagement.tsx` — add `currentMember`, `currentRole`, `switchEngagement`, localStorage persistence
- `src/routes/_authenticated.tsx` (or login success handler) — implement the front-door decision tree
- `src/components/war-room/AppSidebar.tsx` — mount `EngagementSwitcher` at top
- `src/components/war-room/WriterSidebar.tsx` — mount `EngagementSwitcher` at top
- Every leadership write action component (Risks, SOS, Decisions, Broadcasts, Huddles, Snapshots, Intel, FAQs, Win Themes, Team settings) — wrap action buttons in `useCanWrite()` check
- Writer guard inside `/command` layout — redirect writers out

### Queries
- Memberships query: `engagement_members.select('*, engagements!inner(*)').eq('user_id', uid).neq('engagements.status', 'Archived')`
- Overview snapshot rollup: latest `snapshots` per `engagement_id` (subquery or RPC); counts of `sos_alerts where status != 'Resolved'` and `risks where status = 'Open'`.

### Route guards
TanStack Start `beforeLoad` on `_authenticated/command/*` checks `currentRole` from context; if `writer`, throw `redirect({ to: '/writer/my-sections' })`. Same pattern for `/overview` → must be founder/pm.

### Migrations
No schema changes required. All tables, columns, and RLS already support this.

## Out of scope (ask if needed)
- Inviting users to additional engagements from the switcher (existing invite flow stays per-engagement).
- "Last visited engagement" analytics.
- Notifications across engagements (notification badges in switcher).

## Build order
Strictly sequential — each step assumes the previous:
1. Refactor `use-engagement` (context + switch + persistence)
2. Build `/select-engagement`
3. Implement front-door routing logic
4. Build `EngagementSwitcher` and mount in both sidebars
5. Build `/overview` and update front-door to route 3+ leadership users there
6. Add `useCanWrite()` and gate every write action; add route guards for writer/viewer
