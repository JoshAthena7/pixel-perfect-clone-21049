## Goal

Replace the scattered mission-setup surfaces with **one** Olympus-only "Mission Setup Record" — a long-scroll page with a sticky progress sidebar — and keep `Mission Home` strictly user-facing. Olympus = factory. Mission Home = cockpit. Studio = work.

## What I'll build

### 1. New route: `olympus/missions/$missionId/setup.tsx`
Single page, 9 stacked sections, sticky left sidebar with section list + completion dots (auto-derived: section is "complete" when its required fields are populated / has ≥1 row / has ≥1 upload). Smooth scroll on sidebar click. NASA-mission-planning aesthetic — mono labels, thin rules, dense but calm; no card-soup, no CRM chrome.

Sections (each renders inline, no tabs):
1. **Mission Identity** — name, client, opportunity type, state, prime, submission date, status (Setup/Active/Review/Submitted/Won/Lost) → `missions`
2. **Team Assignment** — Engagement Lead, PM, Lead Writer, Writers[], SMEs[], Reviewers[], Exec Review[] → `mission_members` (role column)
3. **Mission Inputs** — 7 upload zones (RFP, Amendments, Q&A, Client Docs, Research, Prior Responses, Supporting). Each row: filename · date · uploader. Writes to `mission_vault_documents` with a `category` tag → auto-visible in Vault.
4. **Strategic Foundation** — repeating rows: Win Themes, Discriminators, Proof Points, Client Priorities, Competitors (name+notes), Risks; textareas: Sensitivities, Language Guidance, Avoid, Reinforce → `win_themes`, `mission_sensitivities`, plus new `mission_strategy` rows. Feeds Oracle.
5. **Client Intelligence** — Contacts, Stakeholders, Decision Makers, Relationship Owners, Political Considerations, Meeting Cadence, Notes → new `mission_client_intel`.
6. **Timeline & Gates** — date pickers: Question Deadline, Draft Deadlines, Pink, Red, Gold, Exec Review, Submission, Orals, Award → new `mission_timeline` (one row per mission, dated columns). Feeds Mission Calendar.
7. **Question Setup** — import (upload/paste) → reuses existing matrix import; volumes (name+desc); per-question owner/reviewer/due/review path (sequential|parallel) → `question_records` + new `mission_volumes`.
8. **Governance** — Approval Workflow, Escalation Path, Leadership Gates, Quality Gates, Submission Authority → new `mission_governance` (JSON blob fields).
9. **Financial Setup** — collapsed by default, gated to platform admins via `useAccess`. SOW, Budget, Hours, Consultants, Tracking → new `mission_financials`. Hidden everywhere outside this section.

**Footer**: single `[ Launch Mission ]` button (disabled until sections 1, 2, 6, 7 are complete). On click: server fn `launchMission` flips `missions.status` → `Active`, ensures vault/oracle/studio derivations exist, triggers IRIS briefing job, returns mission id. Confirmation modal: "Mission Ready" → [View Mission Home].

### 2. Mission Home — keep clean
- Audit `routes/_authenticated/missions/$missionId/overview.tsx` (Mission Home) and strip any admin/budget/governance/setup references.
- Mission Home shows ONLY: Health, My Assignments, Upcoming Deadlines, Latest IRIS Briefing, Open Risks, Recent Updates, Team Directory, Key Mission Info.
- Add an "Open Setup in Olympus" link visible only to admins/leads.

### 3. Olympus index update
- Mission row "Edit" → routes to new `olympus/missions/$missionId/setup` instead of the old `settings`.
- Old `settings` / `vault` / `questions` mission routes stay as redirects into the matching anchor on the new setup page (`#team`, `#inputs`, `#questions`) so nothing 404s.

### 4. Database (one migration)
New tables (all with grants + RLS scoped to mission members; financials policy gated to platform admins):
- `mission_strategy` (mission_id, kind enum [discriminator|proof_point|client_priority|competitor|risk], label, notes, sort)
- `mission_client_intel` (mission_id, contacts jsonb, stakeholders jsonb, decision_makers jsonb, relationship_owners jsonb, political text, cadence text, notes text)
- `mission_timeline` (mission_id PK, question_deadline, draft_deadlines jsonb, pink, red, gold, exec_review, submission, orals, award — all timestamptz)
- `mission_volumes` (mission_id, name, description, sort)
- `mission_governance` (mission_id PK, approval_workflow jsonb, escalation_path jsonb, leadership_gates jsonb, quality_gates jsonb, submission_authority text)
- `mission_financials` (mission_id PK, sow text, budget numeric, hours numeric, consultants jsonb, tracking jsonb) — RLS admin-only.
- Extend `mission_vault_documents` with `category text` (RFP/Amendments/etc.) if missing.
- Extend `question_records` with `volume_id`, `reviewer_id`, `review_path` if missing.

### 5. Server functions
- `getMissionSetup({missionId})` — fetches all 9 sections in one call.
- `saveMissionSection({missionId, section, payload})` — generic upsert per section.
- `launchMission({missionId})` — validates required sections, flips status, kicks IRIS briefing.

## Notes
- Aesthetic: monospace section eyebrows, hairline rules between sections, generous vertical rhythm, no shadows, status pills only where status is meaningful. Sticky sidebar uses small filled/empty circles for complete/incomplete.
- I will reuse existing components (Vault upload, matrix import, date picker) instead of forking them.
- Old per-tab routes become redirects so deep links keep working.

## Out of scope
- Reworking the Studio itself.
- Building the IRIS briefing generator (will stub the trigger and rely on existing `iris-mission-brief.functions`).
- Rebuilding Atlas/Intel surfaces.

Reply **go** and I'll ship it.
