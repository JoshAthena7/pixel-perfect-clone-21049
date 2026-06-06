## Goal

Today: `market_intelligence` has 37 rows, `missions` has 1 row (NJ CSOC), the other 5 tables are empty. After this build, running one server function per mission populates `signals`, `mission_risks`, `win_themes`, `mission_strategy`, and `mission_client_intel` with real, source-cited intelligence derived from the market feed + mission metadata, and the `/iris` page reads from those tables.

Scope is **the extractor pipeline + UI wiring**, not the full ingestion/web-monitoring stack. We use what's already in the DB.

## Architecture

```text
market_intelligence (37 rows, multi-tenant feed)
        │
        ├── filter: relevance to mission (state, agency, program_type, search terms)
        ▼
   relevantSignals[]
        │
        ▼
   Lovable AI Gateway (google/gemini-2.5-flash, JSON mode)
        │   one structured prompt per output type
        ▼
   signals + mission_risks + win_themes + mission_strategy + mission_client_intel
        │
        ▼
   /iris reads via server fns
```

One server function per extractor; one orchestrator that runs all five and stamps `iris_brief_cache`. Each extractor is idempotent: deletes prior system-generated rows for that mission, re-inserts fresh.

## Files

### New server functions (`src/lib/iris-extractors/`)
- `shared.server.ts` — relevance filter, AI call helper (uses LOVABLE_API_KEY + Lovable AI Gateway), Zod schemas for each output, common types.
- `signals.functions.ts` — `extractSignals({ missionId })`. Filters market rows, asks AI to produce environmental signals categorized as `political | regulatory | competitive`, inserts into `signals` with `created_by_system=true`, `source_module='iris_extractor'`.
- `risks.functions.ts` — `extractRisks({ missionId })`. Produces risk items with severity + description.
- `win-themes.functions.ts` — `extractWinThemes({ missionId })`. Produces win themes + proof-point notes.
- `strategy.functions.ts` — `extractStrategy({ missionId })`. Produces strategic priorities ("what the state wants" maps here).
- `client-intel.functions.ts` — `extractClientIntel({ missionId })`. Synthesizes contacts/stakeholders/decision-makers (best-effort from public sources in the feed; empty arrays are fine).
- `run-all.functions.ts` — `runIrisPipeline({ missionId })`. Calls all five sequentially with `Promise.allSettled`, returns per-stage status, stamps `iris_brief_cache`.

### New read-side server functions (`src/lib/iris-read.functions.ts`)
- `getIrisData({ missionId })` — single fetch that returns `{ mission, signals, risks, winThemes, strategy, clientIntel, lastGeneratedAt }` for the page. Auth-protected.

### UI changes (`src/routes/_authenticated/iris.tsx`)
- Replace hardcoded NJ CSOC arrays with `useSuspenseQuery` against `getIrisData`.
- Mission selector: for now, default to the first mission (only one exists). Add a small `?missionId=` search param so it's swappable later.
- Header "Generate Intelligence" button calls `runIrisPipeline`, shows toast per-stage status, then `router.invalidate()`.
- Each tab renders real rows; show a contextual empty state ("No risks generated yet — click Generate Intelligence") when a table returns zero.
- Mission Brief tab keeps the existing prose-section layout but is sourced from `iris_brief_cache` (which `generateMissionBrief` already populates) — out of scope to rebuild; reads cache and falls back to "Not generated yet".

## Extractor contract (per stage)

Each extractor:
1. Loads mission row + filters relevant market_intelligence rows (mission.state in title/summary OR mission.program_type/category match OR matched_mission_ids contains missionId).
2. If fewer than N relevant rows, broadens to last 60 days of the whole feed (graceful for tenants with no matches yet).
3. Calls AI Gateway with a typed JSON schema prompt that includes:
   - Mission metadata block (name, client, state_agency, procurement_name, program_type, key_requirements, win_themes seed).
   - Up to ~25 condensed market rows ({title, source, published_at, summary truncated to 400 chars, url}).
   - Strict output schema (Zod-validated server-side).
4. Deletes existing rows for that mission where `created_by_system=true` (or `owner='iris_extractor'` for tables without that flag — we add the flag for risks/themes/strategy/client_intel via a migration so we never stomp human edits).
5. Bulk-inserts the new rows using `supabaseAdmin` (bypasses RLS for trusted server context).
6. Returns `{ inserted: number, model: string, ms: number }`.

## Migration (one)

Add a `created_by_system boolean not null default false` column to: `mission_risks`, `win_themes`, `mission_strategy`, `mission_client_intel`. `signals` already has it. This is the only schema change; nothing else is altered.

## Out of scope (explicit)

- Web monitoring / Firecrawl ingestion (the market_intelligence feed already exists).
- Document chunking + pgvector retrieval (separate workstream).
- The Mission Intelligence Graph (Layer 3) — flagged in memory as the real differentiator but a much larger build.
- Anthropic / Voyage / LlamaIndex — we use Lovable AI Gateway with Gemini 2.5 Flash. The North Star names other vendors aspirationally; calling those requires API keys you haven't provided.
- Auto-running the pipeline on a schedule. V1 is manual via the button.

## Risks / honest caveats

- With 37 generic market rows (Medicaid/Medicare news, not NJ-CSOC-specific), early outputs will be thin and broad. Quality scales with feed quality, not with the extractor.
- `mission_client_intel` will be mostly empty — the public market feed doesn't carry contacts. Tagged as "no data" rather than hallucinated.
- AI cost: ~5 calls per `runIrisPipeline` × ~5K tokens each. Cheap on Gemini 2.5 Flash; still budget-aware.

## Order of work

1. Migration: add `created_by_system` to four tables. Wait for approval.
2. `shared.server.ts` + the 5 extractor functions + orchestrator.
3. `iris-read.functions.ts`.
4. Rewrite `/iris` to consume real data with a Generate button.
5. Run pipeline once against the NJ CSOC mission, verify each tab renders.
