## Important context I found before planning

Your spec asks me to create `question_assignments` with `lead_writer_id`, `sme_ids[]`, `due_date`, etc. The codebase already has a **working Question Assignments feature** I want to extend rather than duplicate:

- Table `public.mission_assignments` (one row per question) already stores `assigned_writer_id`, `due_date`, `acceptance_status`, `writer_confidence`, `assigned_by`, `assigned_at`. It's populated automatically when questions are imported.
- A `public.question_assignments` table *also* exists but holds plain-text names (`writer_name`, `athena_sme_name`, …) and is only read by the Briefing Room. It's not what the live UI uses.
- A "Team & Assignments" page at `/missions/$missionId/team` already renders the writer dropdown, due-date picker, bulk-reassign, and acceptance/confidence chips against `mission_assignments`. It's currently visible to all mission members, not gated to admins.
- The schema models team members as `mission_team_members → atlas_team_members`, **not** `profiles`. Your spec's `REFERENCES profiles(id)` won't match how teams actually work here, so writer/SME IDs need to point at `atlas_team_members.id` (which is what the existing dropdown already uses).
- Flight Deck `ThreadPanel` does not currently show the assigned Lead Writer / SMEs.

Given this, creating a brand-new `question_assignments` shape would fork the assignment system in two. Plan below extends what exists.

## Plan

### 1. Database migration (extend `mission_assignments`)
- Add `sme_member_ids uuid[] NOT NULL DEFAULT '{}'` (each entry is an `atlas_team_members.id`).
- Keep existing `assigned_writer_id` as the Lead Writer (rename in UI only).
- Tighten RLS so only mission admins/owners (mission_role in `engagement_lead`, `lead`, `owner`, `admin` plus platform admins) can `INSERT/UPDATE/DELETE`. Mission team members keep `SELECT`. Use the existing `is_mission_team_member` / `has_role` security-definer functions to avoid recursion.
- Add a comment on the table: "Single source of truth for question assignments. Mutations only via Olympus."

### 2. Olympus Question Assignments UI (extend existing tab)
File: `src/components/mission-command/TeamAssignmentsTab.tsx` → `AssignmentsSub`.
- Add a **SMEs** column with a multi-select (popover with checkboxes over team members), persisting to `sme_member_ids`.
- Add a **Status** column derived as: Unassigned (no writer) → yellow badge; Assigned (writer, no completion) → neutral; In Progress (acceptance = accepted) → blue; Complete (question.status complete or pens-down met) → green. Falls back to existing `acceptance_status` text where richer state isn't available.
- Truncate the question text to ~80 chars in the row.
- Hide editing controls (writer dropdown, SME multi-select, due-date popover, bulk actions) for non-admins/non-owners; show read-only chips instead, with a footer line: "Assignments are managed in Olympus by mission admins."
- Reuse the existing route `/missions/$missionId/team` (subtab "Assignments") — this is the Olympus mission workspace. No new route needed.

### 3. Flight Deck Thread — read-only assignment header
File: `src/components/flight-deck/ThreadPanel.tsx`.
- In the panel header, add a small "On this question" row showing: Lead Writer name (or yellow "Unassigned" badge) and SME chips. Sourced from `mission_assignments` joined to `atlas_team_members`.
- Make the entire block non-interactive. If a user clicks it, toast: "Assignments are managed in Olympus."
- No data changes from Flight Deck.

### 4. Briefing Room / other surfaces
- Leave `briefing-room.functions.ts`'s read of the legacy `question_assignments` text table alone (separate read-only digest).
- No changes to mission wizard or other places — assignments stay in Olympus.

## Open question

Do you want me to also **hide** the writer dropdown for non-admin team members (read-only for them), or keep the current behavior where any team member can reassign? Your spec implies admins-only; I'll go with admins-only unless you say otherwise.
