# ATLAS — Three Rooms Rebuild

Collapse all mission navigation into **Atrium → Mission Room ↔ Studio**. Flight Plan, Overview, Operations, Activity, Team, Briefing Room, Vault page, Oracle page, Intelligence page — all disappear as destinations. Their content moves into one scrollable Mission Room page or into Studio.

---

## 1. AppShell (`src/components/v2/AppShell.tsx`)

Rewrite navigation chrome:

- **Top bar** stays 56px, `#060b14`. Left: `⚡ ATLAS` logo + mission name. Right: bell, avatar, Olympus (admin only).
- **Center room toggle** — only 2 segments now: `🏛 MISSION ROOM` (gold) and `✏ STUDIO` (blue). Drop the Command segment from the toggle (Command stays reachable via Olympus / direct URL for admins, not in main toggle).
- **Remove all secondary nav bars**: delete `FlightPlanNav`, `StudioNav`, `CommandNav` calls. No tabs under the top bar.
- **Remove `BreadcrumbStrip`** entirely — 3 rooms don't need breadcrumbs.
- **Remove `StudioHealthStrip` mount** from shell — Studio page renders its own health strip inline (it already exists as a component, just move the mount).
- **Remove `RecentStrip`** — Studio page can embed it inline if needed; not in shell.
- Keep: `CommandPalette`, `IrisDock`, `KeyboardShortcuts`, `UpdateRealityMount` (Studio only — gate on room), `IrisOnboardingMount`.
- `detectRoom` simplified: studio if path matches `/questions` or `/iris`, else mission-room when inside a mission.

## 2. Mission Room (`src/routes/_authenticated/missions/$missionId/overview.tsx`)

This becomes **the** mission page. One long scrollable page. Sections top-to-bottom:

1. **Mission Header** — health dot + name + client/state/program + submission countdown + status counts (Green/Yellow/Red).
2. **IRIS Mission Brief** — pulsing teal, 2–4 sentence narrative (reuse `irisMissionBrief` server fn from `src/lib/iris-mission-brief.functions.ts`).
3. **Vault + Oracle hero cards** — two big classified cards side by side. Clicking them opens existing `/library` and `/briefing` routes (we keep those routes; they're just no longer in nav).
4. **IRIS Intelligence Ticker** — reuse `MissionIntelligenceFeed` component, compact.
5. **Full Question Map** — table of ALL questions in mission. Writer's own rows get blue left border + "YOUR QUESTION" label. Click own question → Studio + open question. Click someone else's → read-only modal/drawer (Phase 1: just link to Studio question page; modal can be Phase 2).
6. **Mission Intelligence 3-column** — Team / Timeline / Decisions. Pull from existing team + activity data.
7. **Leadership Section** (visible to all, writable by leads) — Notes, Risks, Broadcasts.
8. **Enter Studio CTA banner** — full-width blue banner at the bottom with "Ready to work? Enter Studio →" + assigned/attention counts.

Redirect all of these to `overview` (which is now Mission Room):
- `/missions/$missionId/intelligence` → redirect to `/overview`
- `/missions/$missionId/briefing` and `/brief` → keep as-is (Oracle deep view, opens from card)
- `/missions/$missionId/library` → keep as-is (Vault deep view, opens from card)
- `/missions/$missionId/team` → redirect to `/overview#team`
- `/missions/$missionId/activity` → redirect to `/overview#timeline`
- `/missions/$missionId/operations` → redirect to `/overview`

## 3. Studio (`src/routes/_authenticated/missions/$missionId/questions/index.tsx`)

This is the writer's home in a mission.

- Slightly lighter background `#0a0e1a` (set via wrapper div).
- **Health strip** at top (move `StudioHealthStrip` mount here from shell).
- **Writer Brief panel** — 4 cells: Today / Next Step / Waiting On / Next Gate.
- **Compact Vault + Oracle cards** — small horizontal cards with icon + count, click to open `/library` and `/briefing`.
- **My Questions list** — already exists; keep current rendering but filter to writer-assigned only by default.
- Question Workspace (`questions/$questionId.tsx`) untouched — still two-column. Action bar already has Update Reality + Ask IRIS; add SOS button (red treatment) that opens a "You're not alone" modal with 4 choices (Direction / Decision / Help / Air Cover) → 2-field form → posts as a leadership signal.
- **Studio Tips** — small dismissible IRIS tip card on first question open (localStorage flag).
- **Update Reality FAB** — fixed bottom-center, Studio only.

SOS is Phase 1 stub OK — render the modal + form, post to existing signals/notifications table; full leadership routing can be Phase 2.

## 4. Atrium (`src/routes/_authenticated/home.tsx`)

Already largely correct. Adjustments:

- Top bar shows only `⚡ ATLAS` (no toggle) — handled by AppShell's `isLobby` branch.
- Keep IRIS Morning Brief at top.
- Mission cards grid with health border, IRIS one-liner, next deadline, last signal — most of this exists; tighten if needed.
- Single-mission writer auto-redirect: if user has exactly 1 assigned mission and role is writer, `redirect` from home loader to that mission's Studio.
- Firm Intelligence section collapsed by default behind a "Firm Intel ▾" disclosure.

## 5. Routes to redirect (not delete)

Keep route files alive but redirect to Mission Room so old links don't 404:

```
intelligence.tsx → redirect /overview
team.tsx         → redirect /overview
activity.tsx     → redirect /overview
operations.tsx   → redirect /overview
```

`library.tsx` and `briefing.tsx` stay as standalone deep views (opened from the Vault/Oracle hero cards).

## 6. CommandPalette + IrisDock

- Update `CommandPalette` jump entries: drop Intelligence/Briefing Room/Team/Activity/Operations entries; keep Mission Room (overview), Studio (questions), Vault, Oracle.
- IrisDock unchanged.

## 7. Background transitions

Add 300ms background-color transition on `<main>` in AppShell based on room. Mission Room `#060b14`, Studio `#0a0e1a`. Use CSS variable + class swap.

---

## Technical notes

- All redirects use `beforeLoad: () => throw redirect(...)` pattern already used in `studio.tsx` and `index.tsx`.
- Mission Room content is heavy — load sections in parallel via separate `useQuery`s, each with its own skeleton, so the page renders progressively.
- "Read-only question view inside Mission Room" — Phase 1 just links to the question's Studio page. Building a true read-only drawer is Phase 2.
- SOS posting: insert into existing signals or notifications table (will check schema), tagged `kind: 'sos'` with the chosen category + free-text fields.
- Litmus test (5 tasks) — verify after build by navigating the preview as a writer.

## Out of scope (explicitly NOT touched)

- IRIS prompts / intelligence engine
- Classified visual treatment on Vault/Oracle cards
- Question Workspace 2-column layout
- Update Reality modal internals
- Notification system internals
- Olympus internal structure
- Database / RLS / backend logic

## Sequencing

1. AppShell rewrite (toggle, remove secondary nav, room backgrounds)
2. Mission Room page (overview.tsx) — biggest piece
3. Studio page (questions/index.tsx) — Brief panel + compact Vault/Oracle + SOS
4. Redirects for removed routes
5. Atrium polish + single-mission auto-redirect
6. CommandPalette jump list update
7. Smoke test in preview
