# Olympus Admin Build-Out — Phased Plan

The current `src/routes/_authenticated/olympus.tsx` is a single-page tab view (Status, Missions, Settings placeholder). The new spec turns Olympus into a full admin workspace with its own left-rail nav, a mission switcher header, and 9 sections. This is a multi-day build; below is a phased plan so each phase ships clean.

No existing Lobby / Mission / Studio code is touched. Schema additions are kept minimal — most sections use tables that already exist.

## Phase 1 — Shell & Navigation (foundation)

- Convert `/olympus` from a single file into a layout route:
  - `src/routes/_authenticated/olympus.tsx` becomes the layout (header + left rail + `<Outlet />`).
  - New child routes under `src/routes/_authenticated/olympus/`:
    `index.tsx` (Missions), `team.tsx`, `questions.tsx`, `gates.tsx`, `win-themes.tsx`, `vault.tsx`, `settings.tsx`, `users.tsx`, `audit.tsx`.
- Olympus header: `⚡ OLYMPUS` wordmark · mission switcher dropdown (lists all missions admin/lead can see, writes selection to `localStorage` key `olympus:mission`) · `← Back to Mission` button.
- Left rail items: Missions · Team · Questions · Gates · Win Themes · Vault · Settings · divider · Users (admin only) · Audit Log (admin only).
- Access rules:
  - Whole `/olympus` tree: admin or lead only (`mission_members.role in ('admin','lead')`, plus zero-membership escape hatch already used today).
  - `users.tsx` + `audit.tsx`: admin only — gated client-side, with redirect-to-Missions for leads.
- AppShell already shows the Olympus gear; add a top-level "Olympus" link visible only to admin/lead (currently we only show the gear footer).

## Phase 2 — Missions (master list + create + activate)

- Missions index: real columns — name · client · status · submission date · question count · health · last activity.
- `[+ Create New Mission]` opens an inline form (name, client, state, procurement type, submission date, description). On save → insert into `missions`, then navigate to `/olympus/settings?mission=<id>`.
- `[Import from Template]` — stub button with "Coming soon" toast (no template tables yet; flagged as deferred).
- Row actions: Open (→ Mission page) · Edit (→ Olympus settings for that mission) · Activate (modal w/ checklist) · Archive (sets `status='Archived'`).
- Activation checklist driven by live data: RFP uploaded (`mission_library.is_rfp=true`), ≥1 writer (`mission_members.role='writer'`), submission_date set, ≥1 review gate. Warnings, not blockers.

## Phase 3 — Team

- Two-column layout. Left: roster from `mission_members` + `profiles` (avatar/initials, name, role, questions assigned count from `question_records`, last active from `profiles.last_seen_signals_at`).
- Filter chips: All / Writers / SMEs / Leaders / Reviewers.
- Edit role (inline dropdown) · Remove (delete row).
- Right panel: invite by email — reuses existing `inviteMissionMember` server fn. Pending invitations list = members whose profile shows no `last_seen_signals_at` AND created within last 30d (heuristic — no separate invites table). Bulk invite collapsible: textarea + role, loops the same server fn.

## Phase 4 — Questions (the big one)

- Full-width table over `question_records`. Inline-editable cells (writer, SME, pens_down, page_limit, status, weight) using small popovers / native inputs that fire `update` mutations on blur.
- `[+ Add Question]` — inline new-row form at top.
- `[Import from RFP]` — calls existing `parseRfp` server function; progress toast.
- `[Bulk Assign]` — checkbox column → action bar with writer/SME dropdown.
- Question detail drawer (right-side `Sheet`): full text, requirements, mandatory language, scoring criteria, compliance flags — all editable.

## Phase 5 — Gates · Win Themes · Vault

- **Gates**: CRUD over `mission_review_gates` (already exists). Add inline form + reviewer multi-select. Reviewers stored as JSON in a new column **OR** we reuse `question_gate_status` indirectly; if needed, one tiny migration adds `mission_review_gates.reviewer_ids uuid[]`.
- **Win Themes**: CRUD over `win_themes`. "Link Questions" opens a checklist that writes to `win_themes.question_ids`.
- **Vault**: left rail = categories, main = `mission_library` rows filtered by category, right = upload panel using existing `mission-library` storage bucket. RFP upload prompts "Parse RFP?" → calls existing parser. Duplicate guard by filename.

## Phase 6 — Settings · Users · Audit Log

- **Settings**: edit `missions` row (name/client/state/program_type/submission_date/description). Status changer with confirm-on-Archived. Scoring fields (threshold/scale) — needs **one small migration**: add `missions.score_threshold numeric default 4.5`, `missions.score_scale numeric default 5.0`. Danger zone: delete mission with typed-name confirmation.
- **Users (admin only)**: lists all profiles + their mission roles (aggregated from `mission_members`). Invite at firm level uses `supabaseAdmin.auth.admin.inviteUserByEmail` via a new `inviteFirmUser` server fn. Suspend = no schema support today; ship as disabled with tooltip "Coming soon" rather than fake it.
- **Audit Log (admin only)**: reads `olympus_audit_log` (already exists). Filters by user / action_type / date range. CSV export client-side.

## Out of scope (this build)

- Templates library (no tables yet — "Import from Template" is a stub).
- User suspension / firm-level role storage (no `is_suspended` or `firm_role` columns yet — flagged as deferred).
- Real-time presence in roster beyond `last_seen_signals_at`.
- PDF preview inside Vault drawer (download only).

## Schema changes (minimal — submitted as one migration in Phase 5/6)

1. `mission_review_gates.reviewer_ids uuid[] default '{}'`
2. `missions.score_threshold numeric default 4.5`, `missions.score_scale numeric default 5.0`
3. No new tables. All other sections use existing tables.

## Suggested approval order

I recommend approving and shipping **Phase 1 + Phase 2 first** (shell + Missions section + activate modal upgrade). That gives you the new structure end-to-end with the most-used section live, and we iterate Phases 3-6 in follow-up turns. Reply with "ship 1+2" (or any subset) to proceed.
