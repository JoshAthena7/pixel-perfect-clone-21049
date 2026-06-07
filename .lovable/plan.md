## Goal
Add a unified three-state user model (LOADED / INVITED / ACTIVE) surfaced in Olympus, and block all mission access for users who are not ACTIVE. Build on existing tables — do not duplicate infrastructure.

## What's already in place (reuse, don't rebuild)
- `atlas_invites` table — already stages people with `email`, `display_name`, `role_hint`, `invite_sent_at`, `accepted_at`, `accepted_user_id`. Today it has an extra "contract signed" gate.
- `profiles` table — has `has_onboarded` (boolean) and `onboarded_at`. FK'd to `auth.users`.
- `/admin/invites` page — manages staging.
- `/admin/users` page — lists everyone in `profiles`.
- Server fns `createAtlasInvite`, `sendAtlasInvite`, etc. in `src/lib/atlas-invites.functions.ts`.

The three states map cleanly onto existing data — no new table needed.

## State derivation (single source of truth)

| State    | Condition                                                                                          |
|----------|----------------------------------------------------------------------------------------------------|
| LOADED   | Row in `atlas_invites`, `invite_sent_at IS NULL`, `accepted_user_id IS NULL`                       |
| INVITED  | `invite_sent_at IS NOT NULL` AND (no linked profile yet OR `profiles.has_onboarded = false`)       |
| ACTIVE   | Linked `profiles` row with `has_onboarded = true`                                                  |

Users who already exist in `profiles` without an invite row are treated as ACTIVE (legacy). New people always start by being LOADED via the Olympus "Add user" form.

## Implementation

### 1. Migration (small, additive)
- Drop the "contract signed" precondition from `sendAtlasInvite` to match the new simpler model. Keep the columns for now (backward compat, no data loss).
- Add `last_login_at timestamptz` to `profiles` (nullable). Updated client-side on successful sign-in.
- Add DB function `public.get_user_state(_email text) returns text` — returns `'loaded' | 'invited' | 'active'` so the UI and policies share one definition.

### 2. Mission access gate (ACTIVE-only)
- In `src/routes/_authenticated/route.tsx`: after `supabase.auth.getUser()`, fetch `profiles.has_onboarded`. If false → `redirect({ to: '/onboarding' })` (existing onboarding flow already redirects this way for non-admins; we extend it to apply to everyone except `/onboarding` and `/admin/*` for platform admins).
- This guarantees no INVITED user reaches `/missions/*` or any mission content.

### 3. Server functions (`src/lib/atlas-invites.functions.ts`)
- `loadUser({ email, displayName, roleHint })` — thin wrapper that creates an `atlas_invites` row with no invite sent (LOADED).
- `sendOfficialInvite({ id })` — replaces the contract-gated path. Calls `supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo: <origin>/onboarding })`, stamps `invite_sent_at = now()`, status `invite_sent`. Resending re-stamps the timestamp.
- `listTeamRoster()` — returns the unified roster (atlas_invites LEFT JOIN profiles by email/accepted_user_id) plus active-mission counts and `last_login_at`. One query for the whole Team view.

### 4. Olympus UI — `/admin/users` becomes the unified Team view
- Status badge column: LOADED (gray) / INVITED (amber) / ACTIVE (emerald).
- Row actions by state:
  - LOADED → prominent gold "Official Invite" button.
  - INVITED → "Invitation sent {date}" + secondary "Resend invite" link.
  - ACTIVE → "Last login {date}" + active mission count with link to memberships.
- Add a small "Add to roster (LOADED)" form at the top — email + name + role hint.
- Keep `/admin/invites` route for now, but redirect it to `/admin/users` so there is one place to manage people. Do not delete the file in this build — just change its component to a `Navigate`.

### 5. Login wiring
- On successful sign-in in `AtlasLoginPage`, write `profiles.last_login_at = now()`.

## Technical details (for engineering review)

- New code paths added only; existing Olympus pages (Atlas Sources, Audit, etc.) are untouched.
- `last_login_at` write happens client-side under the user's own RLS policy (`profiles_self_update`, which already exists).
- The onboarding redirect in `_authenticated/route.tsx` exempts: the onboarding route itself, `/auth*`, and `/admin/*` for platform admins (so admins can never lock themselves out).
- `sendOfficialInvite` is idempotent — if `accepted_user_id` already exists, it short-circuits to "already accepted" instead of re-inviting.

## Out of scope
- Per-user permissions UI beyond what `mission_members` already provides.
- Removing the contract-signed columns from `atlas_invites` (kept for history).
- Bulk import / CSV roster upload.

## Files touched
- New migration (profiles.last_login_at, get_user_state function).
- `src/lib/atlas-invites.functions.ts` — add `loadUser`, `sendOfficialInvite`, `listTeamRoster`.
- `src/routes/_authenticated/admin/users.tsx` — rebuild as unified Team view.
- `src/routes/_authenticated/admin/invites.tsx` — replace component with redirect to `/admin/users`.
- `src/routes/_authenticated/route.tsx` — add ACTIVE gate.
- `src/components/AtlasLoginPage.tsx` — stamp `last_login_at` on success.
