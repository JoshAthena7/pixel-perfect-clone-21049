## Phase B — Mission Page Consolidation

Reorganize navigation so everything mission-related lives inside `/missions/$missionId/*` with five sections, a persistent IRIS strip, and a Studio CTA. No backend changes; no functionality deleted — content is moved and renamed.

### New routes (file-based)

Create a layout route that owns the Mission sidebar + IRIS strip + section outlet:

```
src/routes/_authenticated/missions/$missionId.tsx       (layout: sidebar + IRIS strip + <Outlet />)
src/routes/_authenticated/missions/$missionId/index.tsx (redirect → overview)
src/routes/_authenticated/missions/$missionId/overview.tsx       (rewritten)
src/routes/_authenticated/missions/$missionId/intelligence.tsx   (new — Vault + Oracle)
src/routes/_authenticated/missions/$missionId/operations.tsx     (new — tabs: Risks/Issues/Decisions/Assumptions/Signals/Health)
src/routes/_authenticated/missions/$missionId/team.tsx           (new)
src/routes/_authenticated/missions/$missionId/activity.tsx       (new)
src/routes/_authenticated/missions/$missionId/studio.tsx         (new layout/back-link shell wrapping question list)
```

Existing `library.tsx`, `briefing.tsx`, `brief.tsx`, `iris.tsx` route files: keep file but replace body with `<Navigate to="…/intelligence" replace />` so deep links keep working. `questions/` stays under Studio.

### Mission layout (`$missionId.tsx`)

- Left rail (240px): mission name + client, divider, 5 nav links (Overview, Intelligence, Operations, Team, Activity), divider, prominent **Studio →** filled button, footer settings gear (icon-only link to `settings`).
- Main column: persistent **IRIS Brief Strip** (collapsible, teal border, pulse dot, ▾ chevron, default expanded; collapsed shows truncated first sentence). Reads `missions.iris_brief` if present, else fallback copy.
- Below strip: `<Outlet />`.

Use `useRouterState` for active link styling. Active section gets `bg-accent` + left teal accent.

### AppShell / global nav changes

In `src/components/v2/AppShell.tsx`: remove top-level "Mission Control", "Library", "Briefing Book", "Command Center", "Mission Overview" entries. Top-level nav becomes just **Lobby** (home) and the active mission (which expands into its own sidebar inside the layout). Keep Olympus if it exists for admins. Eliminate the string "Mission Control" everywhere in UI copy.

### Section content (move, don't rewrite logic)

**Overview** — port from current `overview.tsx` + `command/attention.tsx`:
- Block A Health summary (Green/Yellow/Red counts from `question_records`)
- Block B Timeline (submission + pens-down + review gates; red if ≤7d)
- Block C Team Needs (from existing Team Needs component / signals where `entry_type` in (decision_needed, sme_request, air_cover) and unresolved; inline Respond form → `leadership_guidance` insert + resolve)
- Block D Responses At Risk (query: red health OR score<3.0 with <14d to pens-down OR unresolved critical conflict OR no writer <14d)
- Block E Leadership Notes (read all; write Leadership/Admin only via role check)
- Block F SOS banner (only if active SOS signals exist)

**Intelligence** — two-column:
- Left "THE VAULT": category list (RFP & Amendments, State Q&A, Past Responses, Templates, Reference Materials, Research, Supporting Materials, Client Materials) + filtered document table. Upload button gated to Admin/Leadership.
- Right "● ORACLE": collapsible IRIS panels (Alignment Analysis, Theme Analysis, Question Clusters, Reviewer Signals, Emerging Risks, Predictive Insights, Political Landscape, State Priorities, Procurement Landscape, Competitor Analysis, Stakeholder Intelligence, Policy & Regulatory Climate). First 3 expanded by default; each has timestamp + Refresh; empty state copy when none.
- Bottom: link "Mission Activity — Recent uploads and intelligence updates →" to Activity section.

**Operations** — tabbed surface (Risks | Issues | Decisions | Assumptions | Signals | Health Checks). Pull existing components/queries; no logic change.

**Team** — roster, SME directory, leadership, assignment matrix, access management (Admin only).

**Activity** — reverse-chron feed combining inserts from documents, signals, mission_decisions, comments, assignments, reviews, IRIS updates, leadership notes. Filter chips: All / Documents / Signals / Decisions / Comments / IRIS. Default All, last 7 days.

### Studio entry

`Studio →` from sidebar navigates to `…/studio` which renders existing question list + writer brief panel (currently in `questions/index.tsx`). Studio shell sidebar shows: mission name, "My Questions", "← Mission" back link to `…/overview`.

### Terminology sweep

Replace strings project-wide in UI copy only:
- "Library" → "The Vault"
- "Briefing Book" → "The Oracle"
- Remove all "Mission Control"

### Redirects

Add redirect components in the now-vestigial route files (`library.tsx`, `briefing.tsx`, `brief.tsx`, `iris.tsx`) and in `command/*` top-level files (or remove from nav and let the layout absence handle it).

### Out of scope

No DB migrations. No RLS edits. No deletion of existing components — only moves/renames in the UI.

### Acceptance

- Land on Overview on mission entry.
- IRIS strip visible across all 5 sections, collapsible.
- Vault + Oracle live in Intelligence.
- Team Needs + Responses At Risk live in Overview.
- Studio reachable from sidebar CTA; back link present in Studio.
- "Mission Control" and "Briefing Book" do not appear in UI. "Library" replaced with "The Vault".

---

### Scope note

This is a very large refactor (~6k lines of touched route/component code: new layout, 5 new section files, AppShell rewrite, redirects, terminology sweep, role-gated Leadership Notes + SOS + Activity feed). I'd recommend landing it in stages so each piece is reviewable:

1. Layout + sidebar + IRIS strip + redirects + AppShell nav cleanup (skeleton, sections render placeholders).
2. Overview (port + new blocks).
3. Intelligence (Vault + Oracle).
4. Operations tabs.
5. Team + Activity.
6. Terminology sweep + Studio shell.

Reply with **"go"** to start at stage 1, or tell me to do it all in one pass.
