
# ATLAS Learning Architecture — Phases 1–3

Backend + service layer only. No UI changes except a single "Backfill Embeddings" button on `/admin/iris-control`.

## Corrections to the spec (must approve before I build)

The prompt as written would expose secrets and use the wrong server runtime. I'll deviate on these points; everything else matches the spec.

1. **AI provider** — Use Lovable AI Gateway for both completions and embeddings, not direct OpenAI. No `VITE_OPENAI_API_KEY` or `VITE_LOVABLE_API_KEY` (those would leak the key to the browser). `LOVABLE_API_KEY` is server-side only.
2. **Embedding model** — Use `openai/text-embedding-3-small` (1536 dims) via the gateway, matching the `vector(1536)` columns the spec calls for.
3. **Completion models** — Replace `claude-sonnet-4-5` / `gpt-4o-mini` literals with gateway-supported model IDs (`google/gemini-2.5-pro` for high-reasoning brief layers, `google/gemini-3-flash-preview` for fast/cheap tasks like ghost text and classification). Keeps the routing table; just the IDs change.
4. **Server runtime** — All AI calls move into TanStack `createServerFn` handlers and `src/routes/api/...` server routes. No `fetch(...)` to the gateway from `src/services/*` modules that run in the browser. The classifier hook lives at `src/routes/api/public/hooks/oracle-classifier.ts` (existing file); the backfill route at `src/routes/api/admin/backfill-embeddings.ts` guarded by `requireSupabaseAuth` + `has_role('admin')`.
5. **Embedding generation from the IRIS brief path** — `generateIrisBrief` already runs server-side; the embedding + `hybrid_oracle_search` call happens inside that server boundary, not from React.
6. **Existing `query_oracle` RPC** — left in place, as requested.

If you'd rather keep raw OpenAI + direct Claude (separate keys, separate billing), say so and I'll wire those as `add_secret` server-only keys instead — but still server-side, never `VITE_`.

## Phase A — Database migration (single migration)

One migration with everything in Parts 1–4, 9, 10:

- `CREATE EXTENSION vector`
- `oracle_signals.embedding vector(1536)` + ivfflat index
- `oracle_knowledge_base.embedding vector(1536)` + ivfflat index
- `oracle_signal_feedback` table + RLS + grants
- `atlas_institutional_memory` table + RLS + grants + embedding index
- `atlas_entity_relationships` table + RLS + grants
- `oracle_source_registry` adds `approval_count`, `dismissal_count`, `total_signals_generated`, `avg_relevance_score`, `quality_score`, `last_quality_update`
- RPCs: `hybrid_oracle_search`, `keyword_oracle_search`, `get_signals_needing_embeddings`, `increment_source_approvals`, `increment_source_dismissals`, `update_signal_relevance_from_feedback`
- `cron.schedule('signal-relevance-update', '0 3 * * *', ...)`

All four-step shape (CREATE → GRANT → ENABLE RLS → POLICY) on new tables, with `service_role` grants so server functions can write.

## Phase B — Server-side AI services

Files (all server-only, never imported by browser code):

- `src/lib/ai-gateway.server.ts` — Lovable gateway provider helper (reuses canonical pattern).
- `src/lib/embeddings.server.ts` — `generateEmbedding(text)` → calls gateway `/embeddings` with `openai/text-embedding-3-small`, dimensions 1536. Plus `buildSignalEmbeddingText`, `buildQueryEmbeddingText` (pure helpers, also re-exported from a client-safe `.ts` file for type sharing).
- `src/lib/model-router.server.ts` — `MODEL_ROUTING` table + `callAI(task, system, user, opts?)`, with fallback to flash model on failure.
- `src/lib/lessons.functions.ts` — `extractMissionLessons` as a `createServerFn` with `requireSupabaseAuth` + admin check.
- `src/lib/embeddings-backfill.functions.ts` — `backfillSignalEmbeddings` as a `createServerFn` (admin-gated) called by the IRIS Control button.

## Phase C — Pipeline + brief wiring

- `src/routes/api/public/hooks/oracle-classifier.ts` — after each `oracle_signals` insert, fire-and-forget embedding generation + update. Non-blocking; failures logged only.
- IRIS brief generator (current location `src/services/iris-briefing.ts` if present, otherwise the server fn that wraps it) — replace direct gateway fetches with `callAI(task, ...)` using the routed task types. Replace `query_oracle` calls with four `hybrid_oracle_search` calls (decode / win-angle / evidence / risk). After brief assembly, upsert `question_intel_links` with `briefing_layer` tag and `relevance_score: 75`.

## Phase D — Human feedback wiring

`recordSignalFeedback(signalId, missionId, type, weight, userId, questionId?)` helper (client-callable; writes through RLS as `authenticated`). Wired at:

1. ORACLE review queue Approve / Push / Dismiss buttons (`IntelReviewQueue` or equivalent) → `approved` +0.5 / `pushed` +0.8 / `dismissed` −0.5, plus `increment_source_approvals|dismissals`.
2. Check-In submit handler → for `confidence='high'|'low'`, look up `question_intel_links` for the question and write `confidence_high` (+0.2) or `confidence_low` (−0.1) for each linked signal.
3. `brief_opened` event → `brief_used` (+0.1) for each linked signal.
4. `assist_ignored` event where `metadata.tool === 'decode'` → `brief_ignored` (−0.05) for each linked signal.

## Phase E — Admin UI (one button only)

`/admin/iris-control` (or current IRIS Control page) gains a single "Backfill Embeddings" button that calls `backfillSignalEmbeddings` server fn (batches of 5, up to 50 signals/run) and shows a `sonner` toast with `{processed, failed, total}`. No other UI changes anywhere.

## Phase F — Mission close hook

When `missions.status` transitions to `closed` (current write path), call `extractMissionLessons(missionId)` server fn. If the close path is purely SQL today, add a trigger that enqueues a row in a small `pending_lesson_extractions` table and the cron job (or a follow-up server fn invocation) processes it — confirm with you whether to use a trigger or change the close handler in app code.

## Verification

- `supabase--read_query` to confirm the new tables, columns, indexes, RPCs, and cron entry exist.
- Invoke `hybrid_oracle_search` with a sample mission/question to confirm it returns rows.
- Invoke the backfill server fn against a test mission's signals; re-query to confirm `embedding IS NOT NULL`.
- Trigger one Approve in the review queue and confirm a row appears in `oracle_signal_feedback` and `oracle_source_registry.approval_count` incremented.
- No new console errors in the preview.

## Open questions before I start

1. **AI gateway is fine, right?** (Saves you the OpenAI + Anthropic keys and billing.) If you want raw OpenAI + Claude instead, I'll wire those as server-only secrets via `add_secret`.
2. **Mission close hook** — is there an existing app-level handler I should call `extractMissionLessons` from, or do you want me to add the trigger + queue pattern?
3. **Scope confirmation** — OK to land Phases A–E in this single pass and follow up with Phase F (mission close) once you answer #2?
