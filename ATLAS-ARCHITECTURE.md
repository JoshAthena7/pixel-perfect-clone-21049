# ATLAS Platform Architecture

Last updated: 2026-06-19 — generated from a full forensic audit pass.
Authoritative reference. Update on every architectural change.

## Platform Overview

ATLAS is a mission-intelligence platform for Medicaid bid teams. It turns
unstructured regulatory, competitive, and clinical evidence into structured
briefings that writers can use directly while drafting proposal responses.

Users:
- **Writers** work in the Flight Deck, one question at a time.
- **Captains** coordinate the team from ATC (URL: `/war-room`).
- **Platform admins** manage intelligence and pipeline health in Olympus.
- **All users** see the same five IRIS Outputs (Mission Brief, Environmental
  Assessment, What the State Wants, Emerging Risks, Recommended Strategy).

## Design Principles

- **Olympus creates reality. ATLAS distributes reality.** All intelligence
  curation happens in Olympus or the automated pipeline; consumer pages are
  read-only views over that curated layer.
- **IRIS is a briefing officer, not a ghostwriter.** It surfaces grounded
  evidence; writers compose the response.
- **ATC is observation and coordination, not participation.** Captains see
  pulse, radar, and alerts; they nudge writers — they do not write.
- **Truth → Intelligence → Understanding → Strategy → Execution** — every
  piece of intelligence maps to one of the 9 Domains and is tagged across
  5 dimensions (Mission Domain, Geography, Signal Type, Importance, Time
  Horizon).
- Distinctive visual direction. Dark surface `#070f1c`, gold accent
  `#d4af37`. All color / gradient / shadow values are semantic tokens in
  `src/styles.css`. No hardcoded color utilities in components.

## Page Map

| Route | Purpose | Access | Key components |
|---|---|---|---|
| `/` → `/missions` | Mission switcher / portfolio | Any auth user | `MissionsListPage` |
| `/missions/$id/briefing` | Mission Brief sections | Mission team | `BriefingHeader`, `Section*` |
| `/missions/$id/intelligence` | ORACLE intelligence feed + Add Intel | Mission team | `IntelligencePanel`, `OracleIntakeModal` |
| `/missions/$id/flight-deck` | Question-level writer cockpit | Mission team | `FlightDeckLayout`, `QuestionCommand`, `FlightDeckAssistBar` |
| `/missions/$id/war-room` | ATC: team pulse, mission radar, IRIS alerts | Captains + admin | `WarRoomPage`, `MissionRadar`, `IrisAlertsPanel`, `WriterDrawer` |
| `/olympus` | ORACLE command surface | Admin only (`has_role('admin')`) | `OlympusCommand`, `TaxonomyBrowser`, `IntelReviewQueue`, `SourcesPanel`, `HealthColumn` |
| `/admin/*` | Team, settings, messaging, activity | Admin only | `admin.*` route files |
| `/api/public/hooks/*` | Cron + webhooks (no auth) | External / pg_cron | route handlers verify `x-cron-secret` header |

Component URL kept as `/war-room` per cleanup spec; in-code identifiers are
in transition to `ATC` — see Known Tech Debt.

## Database Schema

Source of truth: `src/integrations/supabase/types.ts` + `supabase/migrations/`.
Live row counts captured 2026-06-19.

### ORACLE intelligence layer

| Table | Purpose | Rows | RLS |
|---|---|---|---|
| `oracle_signals` | Canonical intelligence nodes (formerly `oracle_nodes`) | 0 | mission-scoped via `is_mission_team_member`; admin override |
| `oracle_taxonomy` | 67 nodes across 8 domains | 67 ✓ | read-all authenticated |
| `oracle_source_registry` | Monitored sources | 14 ✓ (10 platform + 4 NJ) | admin-only write |
| `oracle_ingestion_queue` | Raw scraped items pending classification | varies | admin-only |
| `oracle_quality_measures` | HEDIS / EQRA benchmarks | 0 | mission-scoped |
| `oracle_sdoh_data` | SDOH data by geography | 0 | mission-scoped |
| `question_intel_links` | Question ↔ signal map (formerly `oracle_question_intel`) | varies | mission-scoped |

`oracle_signals` canonical content columns:
- `what_happened` — primary content describing what the intelligence item is
- `why_it_matters` — relevance and significance for this procurement
- `recommended_action` — what the team should do about this item (when present)

These are the field-of-record names used by all code, prompts, and
documentation. The early spec referenced `full_text` / `source_url` /
`created_by` — those columns do not exist and must not be added. See the
"oracle_signals Schema Note" in Known Issues for the canonical decision.

`question_intel_links` uses `relevance_explanation` (not `relevance_reason`)
and has no `mapping_source` column. Code matches the schema.

### Critical app tables

| Table | Purpose |
|---|---|
| `missions` | Mission record (56 cols) |
| `mission_questions`, `questions` | Question authoring + lifecycle |
| `mission_team_members` | Canonical mission membership |
| `user_roles` + `has_role()` | Canonical RBAC |
| `question_intel_links`, `question_notes`, `question_briefs`, `question_pulses` | Per-question writer surface |
| `mission_nudges` | Captain → writer pings (channel: slack / teams / in-app) |
| `iris_brief_cache` | Generated brief cache (TTL invalidated on regenerate) |

### Indexes verified present

- `oracle_signals`: GIN on `taxonomy_node_ids`, `topic_tags`,
  `win_theme_tags`, `jpb_variable_tags`, `question_type_tags`;
  B-tree on `tier`, `category`, `mission`, `published_at`, `urgency`,
  `subcategory`, `scope`, `type`.
- `oracle_taxonomy`: B-tree on `parent_id`, `domain`; unique on `node_code`.
- `oracle_source_registry`: B-tree on `tier`, `state`, `status`, `check`.
- `oracle_ingestion_queue`: partial idx on pending; B-tree on `status`,
  `source`, `relevance`.
- `question_intel_links`: B-tree on `question_id`, `mission_id`,
  `briefing_layer`; unique on (`question_id`, `signal_id`).

### Database functions

- `query_oracle(mission_id, question_id, taxonomy_codes[], limit)` — returns
  `jsonb` grouped by taxonomy branch; reads `oracle_signals` with
  `status IN ('approved','pushed','needs_review')`; boost by
  `question_intel_links.relevance_score`. **Verified live.** When IRIS
  formats results for briefing prompts it uses `what_happened` as the
  primary content, `why_it_matters` as the relevance context, and
  `recommended_action` as the action guidance (when present).
- `has_role(_user_id, _role)` — security-definer; reads `user_roles`.
- `is_mission_team_member(mission_id, user_id)` — security-definer.
- `is_platform_admin(_user_id)` — legacy helper; internally identical to
  `has_role(_user_id, 'admin')`. RLS policies still call this function; that
  is safe but cosmetically inconsistent.

### Enums

| Enum | Values |
|---|---|
| `oracle_tier` | platform, state, mission |
| `oracle_category` | regulatory_federal, regulatory_state, quality_performance, health_outcomes_sdoh, policy_innovation, evidence_base, field_intelligence, competitive_landscape, client_content_map |
| `oracle_authority` | primary, secondary, tertiary, field |
| `oracle_urgency` | immediate, high, normal, low, archived |
| `app_role` | admin, lead, writer, sme, project_manager, engagement_lead, executive |

`source_type`, `source_status`, and `ingestion_status` are text columns,
not enums (intentional — easier evolution).

## ORACLE Intelligence Architecture

Three source layers feeding `oracle_signals`:

```
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ Manual intake   │   │ Bulk seed       │   │ Automated pipe  │
│ (Add Intel)     │   │ (iris-bulk-*)   │   │ (cron)          │
└────────┬────────┘   └────────┬────────┘   └────────┬────────┘
         │                     │                     │
         └─────────────────────▼─────────────────────┘
                       oracle_signals
                              │
                              ▼
                       query_oracle(...)
                              │
                              ▼
                   IRIS brief / Olympus / ATC
```

Pipeline (all in `src/lib/oracle/pipeline.server.ts`):

1. `runScraper()` — `/api/public/hooks/oracle-scraper` — every 4h
2. `runClassifier()` — `/api/public/hooks/oracle-classifier` — every 30m
3. `runPromoter()` — `/api/public/hooks/oracle-promoter` — every 30m

Cron auth: `x-cron-secret` header validated against `CRON_HOOK_SECRET`.

Taxonomy: 8 domains × 67 nodes (`docs/specs/oracle-taxonomy.md`).

## IRIS Briefing Architecture

Canonical service: `src/lib/iris-brief-generator.functions.ts`
(`generateIrisBrief`). Flight Deck `QuestionCommand` is the only consumer.

Flow per brief:

1. Four parallel `query_oracle` calls with these branch-sets:
   - **decode** → `regulatory_federal`, `regulatory_state`, `field_intelligence`
   - **winAngle** → `client_content_map`, `competitive_landscape`, `policy_innovation`
   - **evidence** → `evidence_base`, `quality_performance`, `health_outcomes_sdoh`
   - **risk** → `regulatory_federal`, `regulatory_state`, `competitive_landscape`, `field_intelligence`
2. Single AI Gateway call with all four context sets injected into the prompt.
3. Response parsed into six layers: `decoded_intent`, `evaluation_focus`,
   `recommended_approach`, `win_theme_connections`, `iris_evidence`,
   `risk_flags`.
4. Every signal used is upserted into `question_intel_links` with
   `briefing_layer` set.

The file header carries the full Lovable AI Gateway call-site map (74 sites
across 30+ files) — update it when adding a new gateway caller.

## ATC Architecture (URL `/war-room`)

Layout 26 / 44 / 30. Refresh interval 30s.

| Column | Panels | Source |
|---|---|---|
| Left | Team Pulse + heat borders | `useQuestionHealth`, `mission_team_members` |
| Center | Mission Radar feed | recent question_pulses / nudges / activity rollup |
| Right | IRIS Alerts | AI-generated from mission state |
| Drawer | Writer drill-down | per-writer questions + read-only sticky notes |

Nudge flow writes to `mission_nudges` and (when wired) dispatches via
Slack/Teams webhooks. Both webhook calls are currently `console.log` stubs.

## Assist Bar (Flight Deck)

`src/components/flight-deck/FlightDeckAssistBar.tsx`. **Current production
state diverges from the intended 4-button design.** Actual buttons:

| # | Label | Notes |
|---|---|---|
| 1 | Thread | **Deprecated** — intended to be removed / replaced by Sticky Notes |
| 2 | Phone a Friend | Not in the canonical 4-button design |
| 3 | Score Me | Canonical |
| 4 | Mission Pulse | Canonical |
| 5 | SOS | Not in the canonical 4-button design |

Intended canonical (per `cockpit-v3.md` and recent prompts): Check-In,
Score Me, Sticky Notes, Mission Pulse. **See Known Tech Debt #1.**

## Olympus Architecture

Three columns, admin-only. Each component in `src/components/olympus/`.

| Column | Component | Purpose |
|---|---|---|
| Left (24%) | `TaxonomyBrowser` / `SourcesPanel` | Taxonomy tree with 67-node count badges and gap detection; source registry CRUD |
| Center (48%) | `IntelReviewQueue` | Status-tabbed signal queue (needs_review / approved / pushed / dismissed) with optimistic Approve/Push/Dismiss |
| Right (28%) | `HealthColumn` | 4 panels: Briefing Coverage, Pipeline Health (with Run Now), IRIS Usage, Top Intelligence — 60s refetch |

Detail drawer edit mode (taxonomy override + relevance slider) is stubbed.

## Key Integrations

| Integration | Status | Location |
|---|---|---|
| Lovable Cloud (Supabase) | Live | `src/integrations/supabase/*` |
| Lovable AI Gateway | Live | 30+ server modules; canonical map in `iris-brief-generator.functions.ts` |
| pg_cron | Live | Verified read access denied to `cron.job` from psql; schedules verified during build |
| Slack webhook | **STUB** | `NudgeModal.tsx`, `StickyNotesPanel.tsx` (Pin to Slack) — both `console.log` |
| Teams webhook | **STUB** | `NudgeModal.tsx` (Teams DM) — `console.log` |

## Environment Variables

See `.env.example` (committed). Required:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `LOVABLE_API_KEY` — AI gateway
- `CRON_HOOK_SECRET` — cron header auth

Read sites verified: each is read inside `.handler()` bodies or at server
module top level (never at client-import-time). Missing vars degrade
gracefully (cron hooks return early with a skip message; no throws at boot).

## Known Issues and Technical Debt

### oracle_signals Schema Note
The original spec referenced `full_text`, `source_url`, and `created_by` as
`oracle_signals` columns. The actual implementation uses `what_happened`,
`why_it_matters`, and `recommended_action` — these are the canonical field
names. All code, prompts, and documentation use these names. Do not add
`full_text` / `source_url` / `created_by` columns. Option A confirmed
June 2026.


1. **Assist bar drift** — `FlightDeckAssistBar.tsx` ships 5 buttons
   (Thread, Phone a Friend, Score Me, Mission Pulse, SOS), not the
   intended 4 (Check-In, Score Me, Sticky Notes, Mission Pulse).
   `ThreadPanel` is still wired in here and in `QuestionHealthTab.tsx`.
   *Requires a feature-build prompt, not a cleanup pass.*
2. **`profiles.is_platform_admin` column reads** — fixed in
   `src/routes/_authenticated.tsx` this pass. Still read in
   `src/components/flight-deck/FlightDeckV2.tsx` (deleted as orphan),
   `src/lib/iris-refresh-all-for-mission.functions.ts`,
   `src/lib/home.functions.ts`, `src/routes/_authenticated/admin.tsx`.
   Each uses the redundant `prof.is_platform_admin || roleRow` fallback —
   zero security impact, cosmetic.
3. **93 RLS policies call `is_platform_admin(uuid)` function** — this
   function is itself a security-definer wrapper that reads
   `user_roles WHERE role = 'admin'`, i.e. semantically identical to
   `has_role(uid, 'admin')`. Cosmetic, not a security issue.
4. **Slack / Teams webhooks** — stubbed in `NudgeModal.tsx` and
   `StickyNotesPanel.tsx`. Need real webhook URLs on mission rows.
5. **Olympus review-drawer edit mode** — taxonomy override and relevance
   slider stubbed.
6. **Activity logging consolidated on `mission_assist_events`** (2026-06-19).
   `mission_activity` was created then dropped after audit confirmed
   `mission_assist_events` is the de-facto unified event log (see
   "Activity Logging" section below). No code path was reading the
   short-lived `mission_activity` table.
7. **TODO comments**: 6 across `src/` (manual review).
8. **Orphan deleted**: `src/components/flight-deck/FlightDeckV2.tsx`
   (1241 lines, 0 importers).
9. **Console logs**: pipeline `console.log` calls gated behind
   `debug-log.ts`; remaining `console.warn` / `console.error` are
   catch-block diagnostics intentionally left raw for prod telemetry.

## Activity Logging

The unified activity log is `mission_assist_events` — not `mission_activity`
(dropped 2026-06-19).

`mission_assist_events` schema:
- `id`, `mission_id`, `question_id`, `user_id`: standard identifiers
- `event_type`: text. Current values: `check_in`, `sticky_note_posted`,
  `sticky_note_pinned_slack`, `brief_exported`, `brief_opened`,
  `nudge_sent`, `writer_reviewed`, `writer_flagged`, `sos_raised`,
  `status_updated`, `assist_acknowledged`, `assist_ignored`,
  `oracle_intel_added`, `score_me_run`, `mission_pulse_signal`.
- `metadata`: jsonb — event-specific context (must include `summary` string)
- `created_at`: timestamptz

`getMissionActivity` (`src/lib/mission-activity.functions.ts`) reads from
7 sources and merges into one stream:
1. `mission_assist_events` — assist-bar / writer-behavior events
2. `thread_messages` — collaboration thread
3. `expert_consults` — phone-a-friend
4. `score_me_history` — scoring runs with full analysis
5. `team_updates` (non-SOS) — pulse and emerging-risk signals
6. `team_updates` (SOS) — SOS + acknowledgements
7. `conflict_flags` — unresolved conflicts

Do NOT recreate `mission_activity`. Do NOT collapse the 7 sources into one
table — the stream-specific tables (`score_me_history`, `team_updates`,
`conflict_flags`) carry typed columns (`score`, `severity`,
`conflict_description`) that the radar surfaces directly.

When wiring a new action that should appear in Mission Radar, insert into
`mission_assist_events` after the primary action succeeds, wrap in
try/catch, and add the new `event_type` to the IN-list in
`getMissionActivity`.

## Build History

- Prompts 1–3: ORACLE schema, taxonomy, source registry, `query_oracle`.
- Prompt 4: Option-3 grounding — four parallel `query_oracle` calls + 6-layer brief + `question_intel_links` upsert.
- Prompt 5: Olympus rebuild (Phases A / B / C — role guard, taxonomy
  browser, intel review queue, sources, health column).
- Prompt 6: Flight Deck IRIS brief redesign.
- ATC build sequence: Team Pulse, Mission Radar, IRIS Alerts, Writer
  Drawer, Nudge modal, orientation overlay.
- Sticky Notes panel + Pin to Slack stub.
- Cleanup pass 1: gateway call-site index, debug-log gating,
  `has_role` migration in `writer-missions.functions.ts`,
  initial ATLAS-ARCHITECTURE.md.
- **Forensic audit pass (this revision)**: full DB/RLS/function/enum/
  index inventory, runtime smoke checks, dead-component sweep,
  `.env.example`, `_authenticated.tsx` `is_platform_admin` removal,
  deleted `FlightDeckV2.tsx` orphan, this document fully rewritten
  from live state.

## Data Safety Boundary

ATLAS stores: mission intelligence, metadata, collaboration signals,
scores, statuses, and brief coordination notes.

ATLAS does NOT store: proposal draft text, PHI, client confidential
program data, or protected health information.

Key rules:
- `score_me_history` stores scoring metadata and analysis only (overall
  score, opportunities, compliance flags, context meta). Raw draft text
  submitted to Score Me is not persisted.
- `question_notes` (Sticky Notes) are coordination metadata —
  decisions, warnings, references. Soft limit 500 characters (UI warning).
  Not for draft content.
- IRIS brief output is displayed in the UI and cached for performance —
  it is not the writing surface. Copy to Brief Notes writes to the
  clipboard, not the database.
- Writing happens in the client environment (Word, Loopio, SharePoint).
  ATLAS is the intelligence layer, not the writing tool.
