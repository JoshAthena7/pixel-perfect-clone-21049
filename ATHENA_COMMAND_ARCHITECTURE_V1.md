# ATHENA COMMAND™ — Architecture V1

**Source of truth.** If the codebase were lost, this document is sufficient to recreate the platform.

Generated: 2026-05-30 · Project: Athena Strategy Group · Supabase ref: `hqtmulghixcirvamdcol` · Lovable project: `7bfa8d36-2720-42a4-8ca9-23881aaf003a`

---

## 1. Platform Identity

- **Firm:** Athena Strategy Group
- **Platform:** Athena Command™
- **Tagline:** *Operator-Led. Intelligence-Driven.*
- **Restricted-access footer:** `ATHENA COMMAND™ · RESTRICTED ACCESS · AUTHORIZED PERSONNEL ONLY`

### Brand colors (hex)

| Token | Hex | Use |
|---|---|---|
| Navy | `#1B3B72` | Primary brand, nav accents, headers |
| Gold | `#C49A2A` | CTA, highlights, "Strategy Group" wordmark |
| Gold Light | `#D4AE4A` | Hover, secondary highlights |
| White | `#FFFFFF` | Light surfaces |
| Background (dark) | `#0D0F1A` | App background |
| Surface | `#141628` | Cards, panels |
| Border | `#1E2240` | Dividers |
| Red (escalations) | `var(--red)` | Signals/Escalations |

Color tokens are defined in `src/styles.css` (oklch) and consumed via Tailwind semantic classes (`bg-background`, `text-foreground`, etc.). Never use raw hex in components.

### Typography

System: dark theme, Apple-like minimal. Display + body pair as defined in `src/styles.css` `@theme`. Avoid Inter/Poppins defaults.

### Logo assets

- `public/athena-logo.png` — full lockup (color)
- `public/athena-logo-white.png` — full lockup (white wordmark)
- `public/athena-mark.png` — circular figure mark (color)
- `public/athena-mark-white.png` — circular figure mark (white)
- `public/favicon.ico` — 32×32 mark
- React component: `src/components/AthenaMark.tsx` with `variant: "mark" | "lockup"`, `tone: "color" | "white"`, `size: sm|md|lg|xl`

### Naming conventions — old → new

| Old | New |
|---|---|
| War Room | Command Center |
| SOS | Escalation |
| Heatmap | Delivery Map |
| Intel Library | Vault |
| Admin Portal | Command Operations |
| Ask Athena | Navigator™ |
| Snapshots (nav) | (removed) |
| Flag an Issue / I'm Stuck / Submit Risk | Raise a Signal™ |
| Executive Overview | Command |

### ™ modules

`Command™`, `Navigator™`, `Pulse™`, `Collective™`, `Radar™`, `Pathfinder™`, `Signal™`, `Gateway™`, `Atlas™`, `Horizon™`, `Compass™`.

---

## 2. Tech Stack

- **Framework:** TanStack Start v1 + Vite 7 + React 19 (SSR, file-based routing)
- **Runtime:** Cloudflare Workers (`nodejs_compat`)
- **Styling:** Tailwind CSS v4 (`src/styles.css`, no `tailwind.config.js`), shadcn/ui
- **Database:** Supabase Postgres (pgvector, pgmq, pg_cron, pg_net)
- **Auth:** Supabase Auth (email/password + Google OAuth via Lovable broker, MFA-capable)
- **Storage:** Supabase Storage — private buckets `intel-files`, `compliance-docs`
- **Realtime:** Supabase Realtime (postgres_changes channels)
- **Email:** pgmq queue (`auth_emails`, `transactional_emails`) drained by `process-email-queue` cron, sent via Lovable Email API
- **AI:** Lovable AI Gateway — primary model `google/gemini-2.5-flash`; embeddings via `text-embedding-3-small` (1536d, pgvector)
- **OpenAI:** secret available (`OPENAI_API_KEY`), reserved for future use
- **Hosting:** Lovable Cloud (preview + published)

Supabase project ref: **`hqtmulghixcirvamdcol`**.

---

## 3. Database Schema — Complete

> Authoritative inventory of public-schema tables. Full DDL (columns, defaults, constraints, indexes, policies, triggers) is in the project's Supabase migrations under `supabase/migrations/`. Each migration is the source of truth for its objects. The agent must re-read those when restoring.

### Tables (61)

`activity_log`, `attention_acks`, `broadcast_reads`, `broadcasts`, `client_pulses`, `compliance_documents`, `compliance_requirements`, `content_library`, `daily_checkins`, `decisions`, `email_send_log`, `email_send_state`, `email_unsubscribe_tokens`, `embedding_queue`, `embeddings`, `engagement_config`, `engagement_invites`, `engagement_members`, `engagement_milestones`, `engagement_outcomes`, `engagement_postmortems`, `engagement_pulses`, `engagement_research`, `engagements`, `faqs`, `heatmap_sections`, `holy_grail_runs`, `hook_failures`, `huddles`, `insight_type_weights`, `intel_documents`, `intelligence_insights`, `login_events`, `market_intelligence`, `monitoring_targets`, `nudges`, `policy_intelligence`, `policy_section_mappings`, `presence`, `profiles`, `quick_chats`, `rfp_questions`, `risks`, `saved_insights`, `section_assignments`, `section_drafts`, `section_threads`, `snapshots`, `sos_alerts`, `state_resources`, `state_trivia_bank`, `stuck_flags`, `suppressed_emails`, `trivia_answers`, `trivia_winners`, `web_research_cache`, `win_of_the_day`, `win_theme_mappings`, `win_themes`, `work_log`, `writer_last_seen`.

**RLS:** enabled on every public table; every table has at least one policy (verified by `pg_tables` ∖ `pg_policies` = ∅).

### Core entity DDL outlines

```sql
-- engagements
CREATE TABLE public.engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  client_name text,
  state text,
  status text NOT NULL DEFAULT 'active', -- active|archived|closed
  created_by uuid NOT NULL,
  slack_webhook text,
  services jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Trigger on_engagement_created → seed_engagement() (creates founder member + 9 sections)
-- Trigger trg_seed_engagement_config → seed_engagement_config()

-- engagement_members
CREATE TABLE public.engagement_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  user_id uuid,                    -- nullable for unaccepted invites
  email text,
  display_name text,
  phone text,
  slack_handle text,
  role text NOT NULL,              -- founder|pm|engagement_lead|writer|viewer
  UNIQUE (engagement_id, user_id)
);
-- Trigger trg_prevent_last_leader_loss
-- Trigger trg_cascade_member_removal

-- heatmap_sections (Delivery Map)
CREATE TABLE public.heatmap_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  section_name text NOT NULL,
  status text NOT NULL DEFAULT 'Green', -- Green|Yellow|Red
  sort_order int,
  notes text,
  instructions text,
  UNIQUE (engagement_id, section_name)
);

-- Standard pattern repeats for: sos_alerts (Escalations), risks, huddles,
-- broadcasts, intel_documents (Vault), section_assignments, section_drafts,
-- client_pulses (Pulse), engagement_research (Holy Grail), etc.
```

### RLS pattern

All access is gated through two `private` schema helpers (SECURITY DEFINER):

```sql
private.is_engagement_member(_engagement_id uuid) returns boolean
private.has_engagement_role(_engagement_id uuid, _roles text[]) returns boolean
```

Plus public helpers:

- `public.is_platform_admin(uuid)` — reads `profiles.is_platform_admin`
- `public.current_user_is_admin_or_founder()`
- `public.user_has_any_leadership_role(uuid)`
- `public.leadership_count(uuid)`

Typical per-table policies:

| Op | Policy |
|---|---|
| SELECT | `is_engagement_member(engagement_id) OR is_platform_admin(auth.uid())` |
| INSERT/UPDATE/DELETE | `has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']) OR is_platform_admin(auth.uid())` |

`profiles` is self-scoped: `auth.uid() = id`.

### Triggers (active)

| Trigger | Table | Function |
|---|---|---|
| `on_engagement_created` | `engagements` AFTER INSERT | `seed_engagement()` |
| `trg_seed_engagement_config` | `engagements` AFTER INSERT | `seed_engagement_config()` |
| `trg_prevent_last_leader_loss` | `engagement_members` BEFORE UPDATE/DELETE | `prevent_last_leader_loss()` |
| `trg_cascade_member_removal` | `engagement_members` AFTER DELETE | `cascade_member_removal()` |
| `trg_seed_state_intel` | `engagements` AFTER INSERT/UPDATE OF state | `seed_state_intel()` |
| `trg_outcome_processing` | `engagement_outcomes` AFTER INSERT | `trigger_outcome_processing()` |
| Embedding triggers | `heatmap_sections`, `decisions`, `huddles`, `sos_alerts`, `intel_documents`, `win_themes`, `risks`, `client_pulses`, `engagement_research` | `enqueue_for_embedding()` |
| `update_*_updated_at` | most tables with `updated_at` | `update_updated_at_column()` |

### Key functions (full bodies in DB)

`seed_engagement`, `seed_engagement_config`, `seed_state_intel`, `cascade_member_removal`, `prevent_last_leader_loss`, `handle_new_user`, `enqueue_for_embedding`, `search_similar_content`, `search_similar_market_intel`, `get_engagement_slack_webhook`, `get_engagement_member_contacts`, `get_engagement_compliance_score`, `leadership_count`, `user_has_any_leadership_role`, `is_platform_admin`, `current_user_is_admin_or_founder`, `cleanup_quick_chats`, `enqueue_email`, `delete_email`, `move_to_dlq`, `read_email_batch`, `scan_cron_failures`, `record_hook_failure`, `call_hook`, `touch_engagement_pulses_updated_at`, `trigger_outcome_processing`, `update_updated_at_column`.

### Constraints

- `engagement_members_engagement_id_user_id_key`: UNIQUE (engagement_id, user_id) — NULL user_id permitted multiple times (placeholder seats).
- `engagement_invites`: PK + UNIQUE(token) + partial UNIQUE `uq_engagement_invites_active(engagement_id, lower(email)) WHERE revoked_at IS NULL AND accepted_at IS NULL`.
- `heatmap_sections`: UNIQUE(engagement_id, section_name).

---

## 4. Business Logic

### Roles (5)

| Role | Scope | Powers |
|---|---|---|
| `founder` | Engagement | Full read/write on every table in the engagement; create/archive engagement; invite/remove members; manage broadcasts; resolve escalations. |
| `pm` | Engagement | Same write powers as founder, cannot demote/remove founders past last-leader rule. |
| `engagement_lead` | Engagement | Same as pm. |
| `writer` | Engagement | Read engagement; write to assigned `section_drafts`, `section_threads`, `huddles`, `stuck_flags`, `sos_alerts` (own); cannot edit settings, broadcasts, members. |
| `viewer` | Engagement | Read-only on engagement-scoped tables. No write buttons rendered. |

Platform-level: `profiles.is_platform_admin = true` overrides all engagement gates (see `current_user_is_admin_or_founder`).

### Two private security functions

1. `private.is_engagement_member(engagement_id)` — `SELECT 1 FROM engagement_members WHERE engagement_id=$1 AND user_id=auth.uid()`.
2. `private.has_engagement_role(engagement_id, roles[])` — same as above with `AND role = ANY(roles)`.

### Trigger cascade behavior

- **Member removal:** unassigns sections (resets to `Not Started`), auto-resolves open stuck flags, deletes presence rows, marks nudges/quick_chats as read.
- **Last-leader protection:** blocks DELETE/UPDATE that would leave zero `founder|pm|engagement_lead` on the engagement (`check_violation`).
- **Engagement creation:** auto-inserts creator as `founder`, seeds 9 default heatmap sections (LTSS, Care Management, Quality, Behavioral Health, Operations, Implementation, Transition, IT/Systems, Staffing/HR), seeds `engagement_config` row.

---

## 5. Routes — Complete

> Access shorthand: **L** = founder/pm/engagement_lead, **W** = writer, **V** = viewer, **A** = platform admin, **U** = any authenticated user, **P** = public.

| Route file | Path | Access | Primary tables |
|---|---|---|---|
| `__root.tsx` | shell | — | — |
| `index.tsx` | `/` | P | — |
| `login.tsx` | `/login` | P | auth |
| `accept-invite.tsx` | `/accept-invite` | P (token) | engagement_invites, engagement_members |
| `_authenticated.tsx` | layout | U | profiles |
| `_authenticated/select-engagement.tsx` | `/select-engagement` | U | engagements, engagement_members, intel_documents |
| `_authenticated/command.tsx` | `/command` | L,V | engagements, heatmap_sections, sos_alerts, broadcasts |
| `_authenticated/heatmap.tsx` | `/heatmap` (Delivery Map) | U | heatmap_sections, section_assignments |
| `_authenticated/intel.tsx` | `/intel` (Vault / Briefing Room) | U | intel_documents, storage:intel-files |
| `_authenticated/issues.tsx` | `/issues` (Escalations) | U | sos_alerts, risks, stuck_flags |
| `_authenticated/broadcasts.tsx` | `/broadcasts` | U (write: L) | broadcasts, broadcast_reads |
| `_authenticated/pulse.tsx` | `/pulse` | U (write: L) | client_pulses |
| `_authenticated/assistant.tsx` | `/assistant` (Navigator™) | U | embeddings, search_similar_content |
| `_authenticated/huddle.tsx` | `/huddle` | U | huddles |
| `_authenticated/decisions.tsx` | `/decisions` | L | decisions |
| `_authenticated/win-themes.tsx` | `/win-themes` | L | win_themes, win_theme_mappings |
| `_authenticated/team.tsx` | `/team` | L | engagement_members, engagement_invites |
| `_authenticated/settings.tsx` | `/settings` | L | engagement_config, engagements |
| `_authenticated/section-assignments.tsx` | `/section-assignments` | L | section_assignments |
| `_authenticated/needs-attention.tsx` | `/needs-attention` | L | stuck_flags, sos_alerts, risks |
| `_authenticated/insights.tsx` | `/insights` | L | intelligence_insights, saved_insights |
| `_authenticated/market.tsx` | `/market` | L | market_intelligence |
| `_authenticated/faq.tsx` | `/faq` | U | faqs |
| `_authenticated/activity.tsx` | `/activity` | L | activity_log |
| `_authenticated/overview.tsx` | `/overview` | L,A | aggregate |
| `_authenticated/nda-required.tsx` | `/nda-required` | U | profiles |
| `_authenticated/mfa-enrollment.tsx` | `/mfa-enrollment` | U | auth.mfa |
| `_authenticated/engagement.new.tsx` | `/engagement/new` | U | engagements |
| `_authenticated/engagement.$id.compliance.tsx` | `/engagement/:id/compliance` | L | compliance_requirements |
| `_authenticated/engagement.$id.sizing.tsx` | `/engagement/:id/sizing` | L | engagement_research |
| `_authenticated/engagement.$id.section.$sectionId.edit.tsx` | section editor | W,L | section_drafts, section_threads |
| `_authenticated/writer/my-sections.tsx` | `/writer/my-sections` | W | section_assignments, section_drafts |
| `_authenticated/admin.tsx` | `/admin` layout | A | — |
| `_authenticated/admin/index.tsx` | `/admin` (Command Operations) | A | aggregate |
| `_authenticated/admin/engagements.tsx` | `/admin/engagements` | A | engagements |
| `_authenticated/admin/collective.tsx` | `/admin/collective` (Collective™) | A | engagement_members |
| `_authenticated/admin/messaging.tsx` | `/admin/messaging` | A | broadcasts |
| `_authenticated/admin/intelligence.tsx` | `/admin/intelligence` | A | intelligence_insights |
| `_authenticated/admin/pipeline.tsx` | `/admin/pipeline` | A | engagement_outcomes |
| `_authenticated/admin/alerts.tsx` | `/admin/alerts` | A | sos_alerts, risks, stuck_flags |
| `_authenticated/admin/activity.tsx` | `/admin/activity` | A | activity_log |
| `_authenticated/admin/settings.tsx` | `/admin/settings` | A | — |
| `api/public/hooks/daily-digest.ts` | `/api/public/hooks/daily-digest` | cron (apikey) | engagements, huddles, sos_alerts, risks → email |
| `api/public/hooks/weekly-brief.ts` | weekly | cron | aggregate → email |
| `api/public/hooks/monitor-cron.ts` | every 5m | cron | cron.job_run_details, hook_failures |
| `api/public/hooks/process-embeddings.ts` | every 5m | cron | embedding_queue, embeddings |
| `api/public/hooks/backfill-embeddings.ts` | manual | A | embeddings |
| `api/public/hooks/ingest-market-intel.ts` | hourly | cron | market_intelligence |
| `api/public/hooks/intelligence-engine.ts` | hourly | cron | intelligence_insights |
| `api/public/hooks/process-outcome.ts` | trigger-fired | DB net.http_post | engagement_postmortems |
| `lovable/email/queue/process.ts` | — | (Lovable email cron) | email queues |
| `lovable/email/suppression.ts` | — | webhook | suppressed_emails |
| `lovable/email/transactional/send.ts` | — | server | email_send_log |
| `lovable/email/transactional/preview.ts` | — | server | — |
| `email/unsubscribe.ts` | `/email/unsubscribe` | P (token) | email_unsubscribe_tokens, suppressed_emails |

---

## 6. React Hooks

| Hook | Returns | Realtime |
|---|---|---|
| `use-session.ts` | Supabase session, user, sign-out | listens `onAuthStateChange` |
| `use-admin.ts` | `{ isPlatformAdmin }` from profiles | — |
| `use-engagement.tsx` | current engagement, members, role helpers | `engagements`, `engagement_members` channels |
| `use-presence.tsx` | online member list | `presence` table channel |
| `use-comms.tsx` | nudges + quick_chats inbox | `nudges`, `quick_chats` channels |
| `use-needs-attention.ts` | aggregated stuck/sos/risk/overdue/morale items | reads `stuck_flags`, `sos_alerts`, `risks`, `section_assignments`, `heatmap_sections`, `daily_checkins`, `attention_acks` |
| `use-trivia-winner.ts` | latest trivia winner | `trivia_winners` |
| `use-session-timeout.ts` | idle-timeout signer-out | — |
| `use-mobile.tsx` | viewport <md | — |

---

## 7. Realtime Subscriptions

| Channel | Table | Filter | Owner |
|---|---|---|---|
| `engagement-members:<id>` | `engagement_members` | `engagement_id=eq.<id>` | `use-engagement` |
| `presence:<id>` | `presence` | `engagement_id=eq.<id>` | `use-presence` |
| `nudges:<uid>` | `nudges` | `recipient_id=eq.<member_id>` | `use-comms` |
| `quick_chats:<uid>` | `quick_chats` | `recipient_id=eq.<member_id>` | `use-comms` |
| `broadcasts:<id>` | `broadcasts` | `engagement_id=eq.<id>` | `broadcasts.tsx` |
| `heatmap:<id>` | `heatmap_sections` | `engagement_id=eq.<id>` | `heatmap.tsx` |
| `sos:<id>` | `sos_alerts` | `engagement_id=eq.<id>` | `issues.tsx`, `LivePresence` |
| `trivia` | `trivia_winners` | — | `use-trivia-winner` |

`supabase_realtime` publication includes these tables; add new tables with `ALTER PUBLICATION supabase_realtime ADD TABLE public.<t>`.

---

## 8. Server Routes & Cron Jobs

### Server routes (TanStack)

All under `src/routes/api/public/hooks/*` (apikey-protected) and `src/routes/lovable/email/*` (Lovable email infra). No Supabase Edge Functions — use `createServerFn` for app-internal logic.

### pg_cron jobs (active)

| Job | Schedule | Calls |
|---|---|---|
| `athena-daily-digest` | `0 11 * * *` | `/api/public/hooks/daily-digest` |
| `athena-weekly-brief` | `30 10 * * 1` | `/api/public/hooks/weekly-brief` |
| `athena-monitor-cron` | `*/5 * * * *` | `/api/public/hooks/monitor-cron` |
| `athena-process-embeddings` | `*/5 * * * *` | `/api/public/hooks/process-embeddings` |
| `athena-ingest-market-intel` | `15 * * * *` | `/api/public/hooks/ingest-market-intel` |
| `athena-intelligence-engine` | `0 * * * *` | `/api/public/hooks/intelligence-engine` |
| `cleanup-quick-chats-daily` | `0 2 * * *` | `SELECT public.cleanup_quick_chats()` |

**Gap:** `process-email-queue` cron is NOT registered. If transactional email is required, run `setup_email_infra` (idempotent) to provision it.

### Server functions (`createServerFn`)

`src/lib/ai/`: `assistant`, `compliance`, `holy-grail`, `policy`, `pulse`, `rfp-intake`, `sizing`, `trivia`, `win-theme-mappings`. `src/lib/invites.functions.ts`. `src/lib/api/example.functions.ts`. All use `requireSupabaseAuth` unless they are public-by-design.

---

## 9. Third-Party Integrations

| Service | Purpose | Secret | Called from |
|---|---|---|---|
| Lovable AI Gateway | LLM + embeddings | `LOVABLE_API_KEY` | `src/lib/ai/*.functions.ts`, `process-embeddings` |
| OpenAI | reserved | `OPENAI_API_KEY` | (not yet wired) |
| Firecrawl | web scraping for market intel | `FIRECRAWL_API_KEY` (connector-managed) | `ingest-market-intel`, `holy-grail.functions` |
| Federal Register | CMS rules + proposed rules | none (public API) | `ingest-market-intel` |
| Congress.gov | Medicaid/Medicare legislation | `CONGRESS_API_KEY` (free, api.congress.gov) | `ingest-market-intel` |
| KFF State Health Facts | per-state Medicaid enrollment + managed care | via `FIRECRAWL_API_KEY` | `ingest-market-intel` → `state_market_data` |
| Lovable Email | transactional + auth emails | `LOVABLE_API_KEY` | `lovable/email/*` |
| Slack | webhook notifications | per-engagement `engagements.slack_webhook` | hooks |
| Supabase Storage | file uploads | service-role | `intel.tsx`, `compliance` flows |

---

## 10. Component Inventory

**Top-level:** `src/components/EngagementSwitcher.tsx`, `HookFailuresPanel.tsx`, `AthenaMark.tsx`.

**`src/components/admin/`:** `AdminSidebar`, `AdminTopbar`, `AdminPlaceholder`, `InviteToCollectiveDialog`.

**`src/components/war-room/`:** `AppSidebar` (9-item nav), `WriterSidebar` (5-item nav), `ActionLauncher`, `AskAthenaWidget` (Navigator™ surface), `FlagIssueButton` (Raise a Signal™), `LivePresence`, `Recognition`, `SnapshotsPanel`.

**`src/components/sizing/`:** RFP sizing wizard components.

**`src/components/ui/`:** shadcn primitives (button, card, dialog, tabs, table, toast, etc.).

Props are typed locally in each file; see source for exact shapes.

---

## 11. Naming Conventions Reference

### Sidebar — Command (AppSidebar, exact order, 9 items)

1. Command — `/command`
2. Delivery Map — `/heatmap`
3. Briefing Room — `/research`
4. Escalations — `/issues` *(red accent)*
5. Broadcasts — `/broadcasts`
6. Pulse™ — `/pulse`
7. Vault — `/intel`
8. Navigator™ — `/assistant`
9. Settings — `/settings`

### Sidebar — Writer (WriterSidebar, exact order, 5 items)

1. My Sections — `/writer/my-sections`
2. Broadcasts — `/broadcasts`
3. Vault — `/intel`
4. Raise a Signal™ — modal *(red)*
5. Help — `/faq`

### Brand voice

- Tagline: *Operator-Led. Intelligence-Driven.*
- Tab title: `Athena Command™`
- Footer: `ATHENA COMMAND™ · RESTRICTED ACCESS · AUTHORIZED PERSONNEL ONLY`
- Email footer: *Powered by Athena Command™*
- Module names always trademarked in user-visible headers, nav labels, dialog titles, toast messages.

### Renames (full list)

See §1.

---

## 12. Known Gaps & Next Build Phase

**Designed, not built:**

- **Briefing Room / Holy Grail** — research surface (table `engagement_research`, function `holy-grail.functions.ts`); UI placeholder only.
- **Radar™ ingestion** — `market_intelligence` ingest scaffolded, classification + scoring TBD.
- **Navigator™ RAG** — embeddings pipeline live; chat UI in `/assistant` is minimal.
- **Gateway™** — concept only (external client portal).
- **RFP intake wizard** — `rfp-intake.functions.ts` exists; wizard UI incomplete.
- **Compliance matrix** — `compliance_requirements` schema live; mapping UI partial.
- **Intelligence engine** — hourly cron runs `intelligence_insights`; promotion to saved insights UI partial.

**Concept-only (™ reserved):** Gateway™, Atlas™, Horizon™, Scout™, Pathfinder™.

**Prompted, needs confirmation:** `process-email-queue` cron registration; CSP `Content-Security-Policy` (beyond X-Frame/Referrer/Content-Type which are now set); MFA enforcement policy.

**Data nit:** engagement `1762a153-83e9-4c24-8268-667d20083ab6` has 17 `engagement_members` rows with NULL `user_id` (placeholder seats). Unique constraint permits this because `NULL ≠ NULL`. Decide whether to backfill or add a partial-unique on a synthetic key.

**Data nit:** Sidebar item conflict — Briefing Room and Vault both mapped to `/intel` in architecture doc. Confirmed: Briefing Room = `/research`, Vault = `/intel`.

---

## 13. Environment Variables

### Client-visible (Vite)

| Var | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase API URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | anon/publishable key (RLS applies) |
| `VITE_SUPABASE_PROJECT_ID` | project ref |

### Server-only (`process.env`)

| Var | Purpose |
|---|---|
| `SUPABASE_URL` | server-side API URL |
| `SUPABASE_PUBLISHABLE_KEY` | server-side publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | admin client (bypasses RLS) |
| `SUPABASE_DB_URL` | direct Postgres connection |
| `LOVABLE_API_KEY` | AI Gateway + Lovable Email + connectors |
| `ANTHROPIC_API_KEY` | Claude Sonnet/Opus for extract + analyze tasks |
| `OPENAI_API_KEY` | embeddings (`text-embedding-3-large`, 1536 dims) |
| `PERPLEXITY_API_KEY` | live web intelligence (Sonar / Sonar Pro / People) |
| `NEWS_API_KEY` | NewsAPI ingestion in market-intel hook |
| `CONGRESS_API_KEY` | Congress.gov ingestion in market-intel hook |
| `FIRECRAWL_API_KEY` | web scraping (connector-managed) |

Names only. Never commit values.

---

## 14. Rebuild Checklist

1. **Provision Supabase project.** Note the ref. Enable extensions: `pgcrypto`, `vector`, `pgmq`, `pg_cron`, `pg_net`.
2. **Run migrations** in `supabase/migrations/` chronologically. They create the `private` schema helpers, all 61 public tables, RLS policies, GRANTs (`anon`, `authenticated`, `service_role`), triggers, and functions.
3. **Auth:** enable Email + Password and Google OAuth; configure redirect URLs; set `auto_confirm_email=false`; enable HIBP password check.
4. **Storage:** create private buckets `intel-files`, `compliance-docs`. Apply RLS policies on `storage.objects` scoped via `(storage.foldername(name))[1] = engagement_id`.
5. **Secrets:** set `LOVABLE_API_KEY`, `OPENAI_API_KEY`, `FIRECRAWL_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in Lovable Cloud project secrets.
6. **Email infrastructure:** run `setup_email_infra` to provision `pgmq` queues (`auth_emails`, `transactional_emails`, DLQs), the `process-email-queue` cron, and the Vault secret. Configure email domain in Cloud → Emails.
7. **Realtime:** `ALTER PUBLICATION supabase_realtime ADD TABLE ...` for every table in §7.
8. **Deploy app:** push the TanStack Start project to Lovable Cloud. Server routes under `src/routes/api/public/hooks/*` deploy automatically.
9. **pg_cron jobs:** install the 7 jobs in §8 with `cron.schedule(...)`. Each calls the corresponding server route with `apikey` header.
10. **Seed data:** insert `state_resources` (state procurement portals), `state_trivia_bank`, optional `faqs`.
11. **First admin:** sign up, then `UPDATE profiles SET is_platform_admin=true WHERE id=<your-uid>`.
12. **Verify:** create a test engagement → confirm `seed_engagement` produced 9 sections and founder membership. Raise a Signal™ → row appears in `sos_alerts`. Realtime updates propagate without refresh.
13. **Branding:** drop the four logo PNGs into `public/`, set favicon, confirm `Athena Command™` browser title.
14. **Lock down:** ship security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) — already wired in `src/start.ts`.

End of document.
