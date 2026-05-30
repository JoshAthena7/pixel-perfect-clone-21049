# Athena Admin Portal — Phased Build Plan

This is a major build (8 prompts + wiring). Rather than ship a half-broken mega-PR, I'll deliver it in **4 phases**, each independently usable and testable. You can stop, redirect, or reorder between phases.

## What we already have (reuse, don't rebuild)
- `/select-engagement` lobby — already lists every war room with health/days/members and a "+ New War Room" tile. This becomes the **Engagements list** inside `/admin`.
- `/engagement/new` 4-step wizard — already exists (Identity / Config / Sections / Invite). Becomes `/admin/engagements/new`, no rebuild.
- `broadcasts`, `intelligence_insights`, `market_intelligence`, `engagement_members`, `engagement_config` tables — all live.
- `AppSidebar` already has a "War Rooms" link. We add **Admin** above it for platform admins.

## Phase 1 — Admin shell + Dashboard + Engagements list (Prompts 1, 2, partial 3, wiring)
**Ships:** working `/admin` portal with sidebar, topbar, dashboard KPIs, war rooms table, and the engagements list page that reuses the existing wizard for creation.

- DB migration:
  - Add `profiles.is_platform_admin boolean default false`
  - `is_platform_admin(uuid)` security-definer helper
- Routes:
  - `src/routes/_authenticated/admin.tsx` — layout with AdminSidebar + topbar + `<Outlet/>`, gated by `beforeLoad` (admin OR founder-on-any-engagement)
  - `src/routes/_authenticated/admin/index.tsx` — Dashboard (4 sections: KPI strip, war rooms table, recent broadcasts, intel feed)
  - `src/routes/_authenticated/admin/engagements.tsx` — full list w/ status filters
  - Reuse `/engagement/new` for "+ New"
- Components: `AdminSidebar`, `AdminTopbar`, `KpiStrip`, `WarRoomsTable`, `AdminEngagementCard`
- Server fn: `getAdminDashboard` (parallel queries: engagements, sos counts, pipeline TCV, collective active, intel unreviewed)
- Wire `AppSidebar` "Admin" link (shield icon) — visible only when `is_platform_admin` or founder-anywhere
- Back-nav in war rooms: "Back to Admin" for admins

## Phase 2 — Collective + Global Messaging (Prompts 4, 5)
- `/admin/collective` — roster table across all engagements, Capacity tab, invite-to-any
- `/admin/messaging` — broadcast composer (scope: all / specific / role-filtered), pin toggle, history feed with read-receipt counts
- Server fns: `getCollectiveRoster`, `sendGlobalBroadcast`, `getAdminBroadcastHistory`
- Skip "Schedule Message" v1 (needs cron infra) — add a "Coming soon" tab

## Phase 3 — Intelligence + Pipeline (Prompts 6, 7)
- `/admin/intelligence` — 3 tabs (Insights / Market Intel / Engine Health) with manual "Run Now" buttons calling existing intelligence-engine + ingest-external-intelligence endpoints
- `/admin/pipeline` — Kanban (Positioning/Bidding/Submitted/Won/Lost) with drag-to-update-status, Horizon table from `market_intelligence` w/ "Create Engagement" pre-fill via querystring into the wizard

## Phase 4 — Settings + Activity + Alerts polish (Prompt 8 + remaining nav)
- `/admin/settings` — Platform / Intelligence / Security / Billing(placeholder) tabs
- `/admin/alerts` — unified SOS + risks + stuck flags across all rooms
- `/admin/activity` — global activity feed (huddles, decisions, broadcasts, intel) across all rooms

---

## Technical notes
- Admin route uses its own `AdminSidebar` (48px icon-only, same dark aesthetic). The existing war-room `AppSidebar` stays untouched — admin is a separate shell as you specified.
- Admin gating: single helper `useIsAdmin()` reading `profiles.is_platform_admin` + a founder-check from `engagement_members`. Server-side enforced via RLS + a `requireAdmin` server-fn middleware.
- All admin server fns use `requireSupabaseAuth` + an inner admin check, NOT `supabaseAdmin`, so RLS stays the backstop.
- Reuse existing health/temperature/days-remaining utilities — no parallel implementations.

## Out of scope for this plan (call out and skip)
- Scheduled message delivery (needs pg_cron job — separate task)
- "Force-logout any session" in Settings → Security (Supabase Auth admin API, separate task)
- API key rotation UI (already exists in Cloud settings)
- Billing tab (placeholder card only)

---

## Recommendation
**Start with Phase 1 now.** It gives you a real working admin portal end-to-end (shell + dashboard + engagements list + wiring) in one push. Once you click around, Phase 2 builds on the same shell.

Approve this plan and I'll start Phase 1.
