## Phase E — IRIS Context Wiring

No navigation or layout changes. We add three context-aware IRIS briefs powered by Gemini via Lovable AI, make Ask IRIS context-aware, and add five background triggers. All using existing tables.

### 1. Server functions (new / updated in `src/lib/`)

- **`iris-lobby-brief.functions.ts`** *(new)* — `generateLobbyBrief({ force?: boolean })`. Pulls active `missions`, aggregated `question_records` health counts, unresolved `question_collaboration` (sme_request/decision_needed/air_cover, last 24h), unresolved `alignment_conflicts`, `mission_review_gates` within 14d, latest 3 `market_intelligence`, open SOS `signals`. Calls `google/gemini-2.5-flash` via Lovable AI Gateway with the firm-level prompt. Caches in `iris_brief_cache` with `scope='lobby'`, `user_id=auth.uid()`, daily key; `force` bypasses cache.

- **`iris-mission-brief.functions.ts`** *(new)* — `generateMissionBrief({ missionId, force? })`. Pulls mission's `question_records` (totals/health/score<4.5/pens_down≤14d), `alignment_conflicts` (unresolved), `question_collaboration` (unresolved signals), next `mission_review_gates`, recent `signals`, `win_themes`. Caches in `iris_brief_cache` scope=`mission`, ref_id=missionId, 30-min TTL. Replaces the simple status string in `$missionId.tsx`.

- **`iris-question-brief.functions.ts`** *(extend existing)* — Add 3 labeled outputs (State Priority / Procurement Signal / Differentiation) + optional Compliance Note via tool-calling JSON. Uses `question_records`, `question_intelligence`, semantic matches from `embeddings` (cosine) to `market_intelligence` and engagement research, `win_themes`, `question_relationships`, `mission_assumptions`. 4-hour TTL.

- **`iris-ask.functions.ts`** *(extend)* — Accept `contextLevel: 'lobby'|'mission'|'question'` + `missionId?`, `questionId?`. Build system prompt with the base IRIS persona + level-specific data block. Persona suffix per level.

### 2. UI integrations

- **Lobby (`home.tsx`)**: Add IRIS Morning Brief card at the top — prose, "● IRIS · Updated {time}", Refresh link. Calls `generateLobbyBrief` via TanStack Query (auto-fetch on mount, manual refresh).

- **Mission layout (`$missionId.tsx`)**: Replace the hand-computed status text in the existing IRIS strip with `generateMissionBrief({ missionId })`. Keep strip layout/styling untouched. Add Refresh link + timestamp.

- **Question workspace (Studio)**: Locate the existing IRIS right column in `questions/$questionId` route. Render the three labeled insights (State Priority, Procurement Signal, Differentiation, optional Compliance) returned by the extended question brief fn. Keep visual treatment.

- **Ask IRIS**: Find current Ask IRIS entry points (drawer/modal) and pass `contextLevel` + IDs based on current route. No UI redesign.

### 3. Proactive triggers (lightweight, no new tables)

Implemented as server functions invoked from existing write paths (no cron required for v1):

- **Conflict detection**: after a `question_collaboration` insert (writer comment/sme_request), an existing trigger or follow-up server fn compares embeddings across the mission's recent entries. On semantic similarity + LLM "contradicts?" check → insert `alignment_conflicts`. *(Wire only if embedding pipeline already exists — otherwise stub a TODO function and document.)*
- **Win-theme coverage**: server fn `checkWinThemeCoverage(missionId)` called on win_theme or question save; emits a `signals` row when a theme has < 3 linked questions.
- **Pens-down proximity**: SQL view/query already feeds Responses At Risk; add a tiny server fn that flips `question_records.health = 'red'` when pens_down ≤ 7d and status != complete. Invoked on mission brief refresh.
- **SME silence**: server fn invoked on mission brief refresh; emits a `signals` row for unresolved `sme_request` older than 3 days (idempotent via dedupe on related_question_id + signal_type).
- **New market intel match**: server fn `matchIntelToQuestions(intelId)` called after a new `market_intelligence` insert; semantic match → invalidate matching question briefs (delete `question_intelligence` cache rows) and insert a `signals` row.

### 4. Prompts

Single shared base prompt constant (`IRIS_BASE_PROMPT`) + per-level append. JSON tool-call output for question brief (3–4 fields). Prose output for lobby & mission briefs.

### 5. Out of scope

- No schema migrations.
- No new routes or layout changes.
- No changes to Update Reality modal, lobby card layout, IRIS visual tokens.
- Cron-based scheduling for proactive triggers (kept synchronous on write paths for v1).

### Files touched

New: `src/lib/iris-lobby-brief.functions.ts`, `src/lib/iris-mission-brief.functions.ts`, `src/lib/iris-prompts.ts`, `src/lib/iris-triggers.functions.ts`.
Edited: `src/lib/iris-question-brief.functions.ts`, `src/lib/iris-ask.functions.ts`, `src/routes/_authenticated/home.tsx`, `src/routes/_authenticated/missions/$missionId.tsx`, question workspace component, Ask IRIS component(s).

Confirm to proceed and I'll implement in batches (server fns first, then UI wiring, then triggers).
