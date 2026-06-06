# ATLAS Check-In — Build Plan

Adds two new surfaces to ATLAS:

1. **`/checkin/:token`** — a public, no-login, mobile-first page reached via emailed magic link, where a writer updates the status of their assigned sections in ~30 seconds.
2. **`/_authenticated/status-report`** — a PM dashboard inside ATLAS that aggregates Check-In submissions + Studio activity, flags risk, and generates a copy/export-ready weekly client status report.

Build is staged so each step ships a working slice.

---

## Data model (new tables)

Created via migration with RLS + grants.

```text
mission_sections
  id uuid pk
  mission_id uuid -> missions.id
  number text          -- e.g. "4.2"
  title text
  rfp_page_ref text null
  assigned_user_id uuid null -> profiles.id   -- writer
  internal_due_date date null
  studio_status text null                     -- last Studio status (for blend)
  studio_progress_pct int null
  studio_updated_at timestamptz null
  created_at, updated_at

checkin_cycles
  id uuid pk
  mission_id uuid
  cycle_start date            -- Monday of the week, or milestone label
  trigger_type text           -- 'weekly' | 'milestone_14' | 'milestone_7' | 'milestone_48h'
  expires_at timestamptz
  created_at

checkin_tokens
  id uuid pk
  cycle_id uuid -> checkin_cycles.id
  mission_id uuid
  writer_user_id uuid -> profiles.id
  token text unique           -- 32-byte url-safe random
  expires_at timestamptz
  consumed_at timestamptz null
  created_at

checkin_submissions
  id uuid pk
  cycle_id, mission_id, writer_user_id
  submitted_at timestamptz
  unique (cycle_id, writer_user_id)

checkin_section_updates
  id uuid pk
  submission_id uuid -> checkin_submissions.id
  section_id uuid -> mission_sections.id
  status text         -- 'not_started' | 'in_progress' | 'draft_done' | 'blocked'
  progress_pct int null   -- 25/50/75/90 when in_progress
  notes text null         -- max 140
  source text default 'checkin'  -- 'checkin' | 'studio'
```

RLS: tokens/submissions readable only via server fn (no anon select policy). PMs (mission_members with PM role) can read submissions for their mission. Writers can read their own.

---

## Server surface

All in `src/lib/checkin.functions.ts` + one public route.

- `getCheckinByToken({ token })` — public serverFn (no auth middleware). Validates token, not expired, not consumed; returns mission name, writer first name, countdown, cycle trigger_type, assigned sections, and any prior submission for the cycle (for "already submitted" state).
- `submitCheckin({ token, updates[] })` — public serverFn. Re-validates token, upserts `checkin_submissions` + `checkin_section_updates`, marks token consumed, and on any `blocked` status inserts a row into existing `escalations` table for the PM.
- `listMissionCheckins({ missionId, cycleId? })` — `requireSupabaseAuth`. Returns per-writer submission status + section updates for the PM feed.
- `getSectionStatusBoard({ missionId })` — `requireSupabaseAuth`. Blends `mission_sections.studio_*` with latest `checkin_section_updates`, returns rows with `source`, IRIS risk flags computed server-side (rules below).
- `sendCheckinReminders({ missionId, cycleId })` — `requireSupabaseAuth`, PM only. Re-enqueues the check-in email to writers without a submission.
- `generateStatusReport({ missionId })` — `requireSupabaseAuth`, PM only. Returns the structured report object that the modal renders.

**Public route** `src/routes/api/public/checkin/email-trigger.ts` — HMAC-verified POST used by pg_cron to mint tokens + enqueue emails for a mission's cycle.

### IRIS risk rules (server-computed)
- `not_started` AND `internal_due_date` ≤ 5 days → 🔴 "Not Started — due in N days"
- `blocked` with no follow-up update in 48h → 🟡 "Blocked — no resolution logged"
- No update of any kind in 5 days → 🟡 "No update in 5 days"

### Overall status (status report)
- Behind: any 🔴, or >20% sections blocked
- At Risk: any 🟡, or >30% not started with <14 days to submission
- On Track: otherwise

---

## Email (Lovable Emails)

Uses existing email infrastructure. New template `src/lib/email-templates/checkin-request.tsx` with props `{ firstName, missionName, daysToSubmission, sections[], magicLinkUrl, triggerType }`. Subject is dynamic based on trigger. pg_cron job runs hourly to fire the public route for any mission whose cycle is due.

---

## Frontend

### Check-In page — `src/routes/checkin.$token.tsx`
Public route (no `_authenticated` prefix), SSR on, light theme by default.
- Loader calls `getCheckinByToken`; on `expired`/`not_found` → notFound, on `already_submitted` → success-style "You're all set" state.
- Components (new, scoped to this route):
  - `CheckinHeader` — wordmark, mission name, countdown chip (amber ≤7d, red ≤48h), writer name
  - `CheckinSectionCard` — number/title, 4 pill status buttons (44px tap target), progress chips (25/50/75/90) when In Progress, 140-char notes input
  - `CheckinSubmit` — disabled until ≥1 status chosen; on success swaps to `CheckinSuccess`
- Local state only; one submit POST. Max-width 680px, mobile-first, large touch targets.

### Status Report — `src/routes/_authenticated/status-report.tsx`
Dark theme, matches ATLAS. Two-panel layout (stacks on mobile).
- Left: `CheckinFeed` — completion bar `N of M submitted`, per-writer rows with expand, "Send Reminder" button (confirm dialog).
- Right: `SectionStatusBoard` — sortable table (status/writer/due/last updated), source icon (`⚡ Studio` / `✉ Check-In`), inline IRIS risk chips in indigo `#6366F1`.
- Header: `Generate Client Status Report` button → `StatusReportModal`.

### `StatusReportModal`
Renders the formatted report. Actions: Copy to clipboard, Export .docx (via `docx` lib server-rendered + download), Export PDF (print stylesheet → `window.print()` to keep it simple), Send via email (PM confirm → reuses transactional send).

### Navigation
Adds "Status Report" entry to `src/components/v2/AppShell.tsx` sidebar, visible when the user is a mission member with PM role.

---

## Accessibility

- All status pills are radiogroups with arrow-key navigation + roving tabIndex (same pattern as the Motion control on Journey Map).
- Countdown chip has `aria-label` with full text ("14 days until submission").
- Source icons paired with visible text, not icon-only.
- Reduced-motion respected; no decorative animations on Check-In page.

---

## Build order (matches request)

1. Migration: `mission_sections`, `checkin_cycles`, `checkin_tokens`, `checkin_submissions`, `checkin_section_updates` + RLS + grants.
2. Server fns: `getCheckinByToken`, `submitCheckin` + blocked → `escalations` insert.
3. `/checkin/$token` page: header, section cards, status pills, progress chips, notes, submit, success.
4. Already-submitted state + expired/notFound boundary.
5. Status Report view: feed + section status board (server fns + UI).
6. Generate Status Report modal (copy + print-to-PDF first; .docx + email send second).
7. IRIS risk flags wired into board + report.
8. Email template + public `/api/public/checkin/email-trigger` route + pg_cron schedule (weekly Mon 8am + milestone checks hourly).

---

## Open questions before coding

1. **Sections data**: the current schema has no `mission_sections`-like table. OK to create it as designed above, or should sections derive from `mission_volumes` / `briefing_book_sections` you already have?
2. **PM role**: should "PM" be `mission_members.role = 'pm'` (existing column) or a new `user_roles` entry?
3. **Studio status source**: which existing table represents "Studio activity last status update" for a section so the blend logic can read it? If none yet, I'll just store it on `mission_sections.studio_*` and leave wiring for later.
4. **Email**: confirm Lovable Emails is set up for this project (custom domain `athenacommandcenter.com`). If not, I'll run the infra + auth/transactional scaffold as part of step 8.
