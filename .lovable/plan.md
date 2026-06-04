# Atlas — Permissions & Access Control Enforcement

## What the user will see

- **Writers/SMEs**: Olympus link disappears from navigation entirely. Visiting `/olympus` directly shows "Not available." Visiting a mission they're not assigned to shows "This mission is not available." (no error page, no name confirmation).
- **Leads**: Same as writers, plus lead-only health views on missions they lead.
- **Admins**: Full access — every mission, Olympus, and a new **Olympus → Team** page to invite users, assign mission roles, revoke, and promote to admin.
- **No more "first-time escape hatch"** that currently grants Olympus to anyone with zero missions.

## Architecture

### 1. Role model (DB)

```
app_role enum: 'admin' | 'lead' | 'writer' | 'sme'
public.user_roles (id, user_id → auth.users, role app_role, granted_by, granted_at, UNIQUE(user_id, role))
public.has_role(_user_id uuid, _role app_role) -> boolean   -- SECURITY DEFINER, stable
```

- `admin` in `user_roles` = platform admin = Olympus access.
- Per-mission roles (writer/sme/lead/admin) stay in `mission_members` — that table already exists and is correct.
- **Migration step**: backfill `user_roles(user_id, 'admin')` for every `profiles.is_platform_admin = true`, then rewrite existing SQL functions to use `has_role`:
  - `is_platform_admin(uuid)` → `has_role(_user_id, 'admin')`
  - `is_olympus_user(uuid)` → same
  - `current_user_is_admin_or_founder()` → `has_role(auth.uid(),'admin') OR EXISTS(... engagement_members founder)`
- Keep `profiles.is_platform_admin` column for now (read-only legacy) to avoid breaking any unseen reader; new writes go to `user_roles`.

### 2. Route guards

| Route | Gate |
|---|---|
| `/_authenticated/olympus/*` | `beforeLoad` → server fn `requireAdmin()` → if false, redirect to `/home`. Olympus nav link hidden when `useIsAdmin()` returns false. |
| `/_authenticated/missions/$missionId/*` | `beforeLoad` → server fn `requireMissionAccess(missionId)` → if not admin AND not in `mission_members`, render "This mission is not available." (no redirect, no name). |
| `/_authenticated/atrium`, `/home` | No additional gate — Atrium is for any signed-in user. |

`requireAdmin` and `requireMissionAccess` are `createServerFn` calls with `requireSupabaseAuth` middleware, hitting `has_role` / `is_mission_member`.

### 3. Nav visibility

- `AppShell` / sidebar: query `useIsAdmin()` once at root, hide Olympus entry when false. No greyed-out link, no lock icon — absent entirely.
- Mission switcher: only show missions the current user is a member of (or all if admin). Already mostly correct via RLS — verify.

### 4. RLS hardening

Audit and tighten policies on:

- `missions`, `question_records`, `question_*`, `mission_vault_documents`, `mission_library`, `mission_members`, `mission_decisions`, `mission_risks`, `mission_assumptions`, `mission_outcomes`, `mission_review_gates`, `briefing_book_sections`, `signals`, `broadcasts`, `iris_brief_cache`, `iris_health_flags`, `iris_memories`, `pilot_copilot_messages`, `question_pulses`, `contributions`, `reality_updates`, `escalations`, `support_requests`, `support_responses` → **read/write only if `is_mission_member(mission_id, auth.uid())` OR `has_role(auth.uid(), 'admin')`**.
- `score_me_history` → **read/write only by the submitter** OR admin. Leads do NOT read individual rows (they consume aggregated `iris_health_flags`).
- `question_pulses` (individual responses) → submitter + admin only. Aggregates surface via existing `iris_health_flags`.
- Olympus-only tables (`olympus_audit_log`, `app_support_settings`, `atlas_*` curation tables, `intelligence_canon`, `federal_compliance_library`, `state_intelligence`, `program_intelligence`, `market_intelligence`) → `has_role(auth.uid(),'admin')` for write; read policy depends on whether IRIS needs them (see §5).

### 5. IRIS scoping

- Update IRIS server fns (`iris-lobby-brief`, `iris-mission-brief`, score-me, etc.) to filter all queries by `is_mission_member` for non-admins. Most already use the authenticated supabase client, so RLS does the work — but audit any place that uses `supabaseAdmin` to ensure it scopes by `userId`.
- Atrium-level IRIS (`generateLobbyBrief`): never references mission content the user isn't on; reads legacy record + global health flags only.

### 6. Olympus → Team Management UI

New page `/_authenticated/olympus/team` (or extend existing `team.tsx`):

- **Platform roster**: list all profiles with their platform role chips and mission count.
- **Invite**: email + name + role hint (Writer/SME) → sends invite (existing `send-invite` flow, just ensure admin gate).
- **Assign to mission**: pick user + mission + role (writer/sme/lead/admin) → insert `mission_members`.
- **Revoke mission**: delete from `mission_members`. Existing `cascade_member_removal` trigger handles cleanup.
- **Promote/demote admin**: insert/delete `user_roles(user_id, 'admin')`. Logged to `olympus_audit_log`.
- **Deactivate**: set `profiles.deactivated_at` (new column) + remove all `mission_members` + remove `user_roles`. Login flow checks deactivation.
- All mutations are `createServerFn` with `requireSupabaseAuth` + explicit `has_role(auth.uid(),'admin')` check.

### 7. "Not available" component

Tiny shared component `<NotAvailable kind="mission" | "olympus" />`:

```
This mission is not available.
```

No mission name. No error code. Just a single sentence + a "Back to Atrium" button.

## Files

**New**
- `supabase/migrations/<ts>_user_roles_and_access_gates.sql`
- `src/lib/access.functions.ts` — `requireAdmin`, `requireMissionAccess`, `getMyAccess`
- `src/lib/team.functions.ts` — invite / assign / revoke / promote / deactivate
- `src/components/access/NotAvailable.tsx`
- `src/hooks/useAccess.ts` — `useIsAdmin()`, `useMissionAccess(missionId)`
- `src/routes/_authenticated/olympus/team.tsx` (or extend existing)

**Edited**
- `src/routes/_authenticated/olympus.tsx` — replace client-side check with `beforeLoad` admin gate
- `src/routes/_authenticated/missions/$missionId.tsx` — add `beforeLoad` mission-access gate
- `src/components/v2/AppShell.tsx` and any sidebar/header — hide Olympus nav for non-admins
- `src/routes/_authenticated/home.tsx` — Olympus shortcut/CTAs hidden for non-admins (already does some of this; verify)

## Non-goals (this pass)

- Email invitation infrastructure (assumed to exist; we only wire admin gating around it).
- Migrating away from `profiles.is_platform_admin` reads in app code — we just stop relying on them for gates; the column becomes legacy.
- Realtime broadcast of revocation (a revoked user stays signed in until their next request; that request 401s out of mission data via RLS, which is the spec'd behavior).

## Order of operations

1. **Migration** (one call): create `app_role`, `user_roles`, `has_role`, backfill from `profiles.is_platform_admin`, rewrite admin-check functions, add RLS tightening for the table list in §4.
2. After migration approves & types regen → write server fns, hooks, components, route gates, Team UI.
