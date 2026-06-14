# IRIS Daily Monitor

The Athena Signal Network ingestion engine. Implemented as a TanStack Start
public server route, not a Supabase Edge Function — Lovable Cloud deploys
this automatically every time the project builds, so there is no manual
`supabase functions deploy` step.

## Endpoint

```
POST https://athenacommandcenter.com/api/public/hooks/iris-daily-monitor?cadence=daily
GET  https://athenacommandcenter.com/api/public/hooks/iris-daily-monitor?cadence=daily
```

Stable Lovable URLs that also work (immutable, ideal for pg_cron):
- Published: `https://project--7bfa8d36-2720-42a4-8ca9-23881aaf003a.lovable.app`
- Preview:   `https://project--7bfa8d36-2720-42a4-8ca9-23881aaf003a-dev.lovable.app`

Query params:
- `cadence` — one of `daily` (default), `weekly`, `monthly`, `mission_triggered`, `manual`

Auth (one required):
- `x-cron-secret: <CRON_HOOK_SECRET>` header
- `apikey: <CRON_HOOK_SECRET>` header (pg_cron compatibility)
- `?token=<CRON_HOOK_SECRET>` query param (manual curl tests)

`CRON_HOOK_SECRET` must be set as a project secret. If it is missing the
endpoint returns `401`. If `LOVABLE_API_KEY` is missing the loop still runs
and updates hashes/timestamps, but IRIS classification is skipped (logged).

## Behavior

1. Pulls active `intel_sources` whose `monitor_cadence` matches and whose
   `last_checked_at` is null or older than 23 hours.
2. Fetches each source by `source_type` (RSS → `rss_url`; webpage-like →
   `scrape_url`; PDF → stubbed with `routing_status='needs_pdf_extraction'`;
   `internal_debrief` / `manual_upload` skipped; LinkedIn excluded).
3. SHA-256 hash compared to `last_content_hash`. Unchanged sources update
   `last_checked_at` and skip classification.
4. New content is sent to IRIS via the Lovable AI Gateway
   (`google/gemini-3-flash-preview`) and parsed as a JSON array of signals.
5. Each signal is written to `intel_events` with
   `event_type='signal'`, `output_type` and `signal_category` from IRIS, and
   `routing_status='unreviewed'`. High-relevance intel cards (≥70) are also
   written to `oracle_knowledge_base`.
6. After every source: `last_checked_at` always updates; `last_content_hash`
   and `last_successful_check_at` update on success.
7. Three consecutive `404`/`403` responses flip the source to
   `is_active = false`. (Counter tracked via a `__fail:N` sentinel in
   `last_content_hash`; resets on the next successful fetch.)

Per-source failures never break the loop. The Lovable AI Gateway returning
non-JSON is captured as a single `intel_card_candidate` with
`routing_status='needs_review'`.

## Response

```json
{
  "run_at": "2026-06-14T11:00:00.000Z",
  "cadence": "daily",
  "sources_checked": 12,
  "sources_skipped_no_change": 4,
  "sources_failed": 1,
  "signals_extracted": 23,
  "intel_events_written": 23,
  "oracle_cards_written": 3
}
```

## Manual test

```bash
curl -X POST \
  -H "x-cron-secret: $CRON_HOOK_SECRET" \
  "https://athenacommandcenter.com/api/public/hooks/iris-daily-monitor?cadence=daily"
```

## Schedule with pg_cron

Run **once** in the SQL editor (replace `<CRON_HOOK_SECRET>` with the real
value of the project secret of that name):

```sql
-- Daily sweep at 06:00 UTC
select cron.schedule(
  'iris-daily-monitor',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://athenacommandcenter.com/api/public/hooks/iris-daily-monitor?cadence=daily',
    headers := '{"x-cron-secret": "<CRON_HOOK_SECRET>", "Content-Type": "application/json"}'::jsonb
  );
  $$
);

-- Weekly Tier 3 sweep, Mondays at 07:00 UTC
select cron.schedule(
  'iris-weekly-monitor',
  '0 7 * * 1',
  $$
  select net.http_post(
    url := 'https://athenacommandcenter.com/api/public/hooks/iris-daily-monitor?cadence=weekly',
    headers := '{"x-cron-secret": "<CRON_HOOK_SECRET>", "Content-Type": "application/json"}'::jsonb
  );
  $$
);
```

To re-schedule, run `select cron.unschedule('iris-daily-monitor');` (and the
weekly one) before re-creating.

## Constraints (enforced in code)

- All AI calls go through the Lovable AI Gateway. No direct OpenAI or
  Anthropic calls.
- All DB writes are best-effort. Failures are logged, never thrown.
- LinkedIn URLs are skipped.
- PDF classification is deferred (flagged `needs_pdf_extraction`).
- No new UI screens were added.
