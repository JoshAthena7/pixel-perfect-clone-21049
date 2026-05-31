## Athena Command V1.5 — Rebuild Plan

The uploaded spec is essentially a new, opinionated v1 of an app that already exists here in a more elaborate form. Before I build, I need decisions on three forks. Then I'll execute in phases.

---

### Reality check: what already exists vs. what the spec asks for

| Spec concept | Already in this project | Gap |
|---|---|---|
| `missions` table | `engagements` (richer: roles, NDA, MFA, members, config) | Naming + simpler shape |
| `mission_members` + roles | `engagement_members` + `user_roles` | None |
| `team_signals` | `pulse_*` tables (daily check-ins) | Different shape |
| `support_requests` | `needs_attention` / `flag_issue` | Different shape |
| `risks` | ❌ | Build new |
| `decisions` | `decisions` route exists, table likely | Verify |
| `alignment_signals` | ❌ (closest: intelligence insights) | Build new |
| `mission_library` | mission_library tables for RFP/intel | Different shape |
| `mission_health_map` | `heatmap_sections` (richer) | Naming only |
| `broadcasts` | `broadcasts` | ✅ |
| `recognition` | `recognition` | ✅ |
| `IRIS` brief | Ask Iris widget (chat) | Spec wants streaming briefs, not chat |
| Slack webhook | ❌ | Build new |
| Magic-link auth | Password + Google + MFA | Conflict |
| OpenAI GPT-4o for IRIS | Lovable AI Gateway (Gemini) | Conflict |

---

### Fork 1 — Reuse existing schema, or build "missions" fresh alongside?

**Option A (recommended): Rename/adapt — treat `engagements` as `missions`.**
Keep all current data, add a `missions` *view* (or just use `engagements` directly in the new UI), build only the genuinely new tables (`risks`, `alignment_signals`, `support_requests` if we keep it separate from `needs_attention`). Avoids dual data models.

**Option B: Build `missions.*` fresh in parallel.**
Cleaner mapping to the spec, but you end up with two parallel systems (engagements + missions) and have to migrate later. I do not recommend this.

### Fork 2 — Auth model

Spec says **magic-link only**. Current app has **email/password + Google + MFA + NDA enforcement**. Switching to magic-link-only would tear out working infrastructure that the existing routes depend on.

Options: (a) keep current auth, ignore that part of the spec; (b) add magic-link as a *third* option; (c) rip out password+Google and replace with magic link. I recommend **(a)**.

### Fork 3 — IRIS provider

Spec says OpenAI GPT-4o streaming via Edge Function. Current IRIS uses Lovable AI Gateway (Gemini), no API key needed. Spec model is fine but adds cost + secret management. Options: (a) keep Gemini through Lovable AI Gateway (free, already works, can stream); (b) switch to OpenAI (need `OPENAI_API_KEY`). I recommend **(a)** unless you specifically want GPT-4o.

Also note: this stack uses TanStack `createServerFn`, not Supabase Edge Functions, for app logic. Slack webhook posting and IRIS briefs will be server functions, not edge functions.

---

### Proposed execution phases (after decisions)

**Phase 1 — Foundation (~1 turn)**
- Migrations: add `risks`, `alignment_signals` tables (+ RLS + GRANTs). Optionally add `iris_briefs` cache table. Skip tables we already have.
- Seed `heatmap_sections` defaults per spec on engagement creation.

**Phase 2 — New Command shell at `/command-v2`**
- Sidebar with three contexts: Lobby / Mission / Executive (matches spec IA, but maps "mission" → existing `engagements`).
- Apply spec design tokens (`#0a0e1a` bg, etc.) as scoped CSS variables for v2 routes only, so v1 stays intact.
- Mission Control page: header strip, 4-metric row, 2×2 panel grid, IRIS Mission Brief panel.

**Phase 3 — Lobby pages**
- My Missions grid · Mission Health list · Leadership Broadcasts feed · Recognition feed · IRIS Daily Brief.

**Phase 4 — Mission sub-pages**
- Mission Briefing · Alignment Hub · Team Signals · Mission Library (reuse existing where possible).

**Phase 5 — Executive views**
- All Active Missions table · Mission Health Grid · Leadership Action Queue · Open Risks · Client Signals · Alignment Signals · IRIS Executive Brief.

**Phase 6 — Modals + realtime + Slack**
- All 10 modals.
- Realtime subscriptions on `team_signals`/`support_requests`/`broadcasts`/`risks`.
- Slack server function that fires on broadcast insert (needs Slack webhook URL secret).

**Phase 7 — Cutover**
- Swap `/command` → new layout (or keep both during transition).

---

### Decisions I need from you

1. **Schema**: A (reuse engagements, add gaps) or B (fresh `missions.*` parallel)?
2. **Auth**: keep current (password + Google + MFA) and skip magic-link, or add/replace?
3. **IRIS provider**: keep Lovable AI Gateway (Gemini) or switch to OpenAI GPT-4o?
4. **Cutover style**: build at `/command-v2` first (safe, parallel), or rip out v1 routes as we go?

Tell me your picks (or just "go with your recommendations") and I'll start Phase 1.
