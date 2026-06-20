# Mission invite emails + onboarding wizard

## What already exists

- Email template `mission-invite.tsx` (subject "Your Mission Awaits — {missionName}", CTA → `acceptUrl`)
- Send route `/lovable/email/transactional/send` with the `mission-invite` template registered
- `atlas_invites` (has `mission_id`) and `atlas_invite_tokens` (14-day expiry)
- `/welcome/$token` page that validates the token and routes signed-in users to `/welcome` or `/home`
- Mission Setup → Team Assignments tab with an "Invite" button (currently just flips a status flag — no email)
- Email domain `notify.athenacommandcenter.com` verified

## Gaps to close

1. The "Invite" button doesn't generate a token, doesn't include mission context, doesn't send an email.
2. The sender is currently `noreply@athenacommandcenter.com`. You want `IRIS <iris@athenacommandcenter.com>`.
3. There is no `/welcome` (no-token) onboarding wizard — `welcome.$token` assumes one exists.

## Plan

### 1. Sender identity
Update `src/routes/lovable/email/transactional/send.ts` so the queued `from` reads `IRIS <iris@athenacommandcenter.com>`.

### 2. New server function: `sendMissionInvite`
File: `src/lib/mission-invite.functions.ts` (auth-gated, mission lead / admin only).

Inputs: `{ missionId, memberId }`.

Does:
- Look up the team member's email, name, role on the mission
- Look up mission name, engagement lead name, expected start date
- Upsert `atlas_invites` row with `mission_id`
- Invalidate prior unused tokens, mint a fresh 32-byte token, hash + insert into `atlas_invite_tokens` (14-day expiry)
- POST to `/lovable/email/transactional/send` with `templateName: 'mission-invite'`, `recipientEmail`, `idempotencyKey: mission-invite-<inviteId>-<tokenHash>`, and `templateData: { recipientName, missionName, role, engagementLeadName, expectedStartDate, acceptUrl: https://athenacommandcenter.com/welcome/<rawToken> }`
- Update `atlas_team_members.atlas_invite_status = 'invite_sent'` + write `atlas_activity_log`

### 3. Wire the Invite button
`src/components/mission-command/TeamAssignmentsTab.tsx` → replace the current `sendInvite` (which only flips a flag) with a `useServerFn(sendMissionInvite)` call. Toast on success ("Invite emailed to {email}") and error.

### 4. New onboarding wizard at `/welcome`
File: `src/routes/welcome.tsx` (auth-gated; if no user → redirect to `/auth`).

Four steps with a progress bar at top, IRIS-voice copy throughout, dark Athena UI:

1. **Welcome / mission context** — "IRIS here. You've been brought onto {missionName}. Here's what matters." Shows mission name, client, role, submission deadline, days remaining, team size, at-risk question count (already returned by `lookupWelcomeInvite`). Continue.
2. **Profile basics** — first name, last name, job title, phone (optional). Writes to `profiles` + `atlas_team_members`.
3. **Expertise tags** — multi-select chips from a fixed taxonomy (clinical operations, Medicaid policy, behavioral health, IT/data, finance, compliance, etc.) plus a free-text "Other expertise" field. Writes to `user_expertise`.
4. **Communication prefs** — daily brief email yes/no, Slack handle (optional), preferred contact time. Writes to `profiles`.

On final step → set `profiles.has_onboarded = true`, redirect to the mission they were invited to (`/mission/{id}` or `/home` if no mission on the invite).

A "Skip for now" link at every step writes whatever's there and lets them in. Their pending steps remain accessible from a banner on `/home`.

### 5. Backend touch-ups
- `profiles` already has the fields needed (`has_onboarded`, `first_name`, `last_name`, `job_title`, `phone`). No schema change.
- Add a tiny server fn `completeOnboardingStep(step, data)` that writes the per-step data and conditionally sets `has_onboarded`.

## Out of scope (separate ask if you want them)

- Bulk invite (multiple writers at once)
- Reminder emails for un-accepted invites
- An admin view showing who's onboarded vs pending across all missions
- Custom welcome video / personal note from the Engagement Lead

## Files touched

Created:
- `src/lib/mission-invite.functions.ts`
- `src/lib/onboarding.functions.ts`
- `src/routes/welcome.tsx`

Edited:
- `src/routes/lovable/email/transactional/send.ts` (sender)
- `src/components/mission-command/TeamAssignmentsTab.tsx` (wire Invite button)
- `src/lib/email-templates/mission-invite.tsx` (subject + IRIS-voice copy tweak so it sounds like it's from IRIS, not generic Athena ops)

## Confirm before I build

- Sender exact string: **`IRIS <iris@athenacommandcenter.com>`** — ok?
- Onboarding fields above — anything to add/remove (e.g. years of proposal experience, security clearance, time zone)?
- After onboarding, drop them on the **specific mission** they were invited to, not `/home`?
