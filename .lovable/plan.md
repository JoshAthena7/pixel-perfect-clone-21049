# Athena Command — Intelligence & Mission Architecture

Building on the existing Mission Setup Record. Adding the missing pieces: monitoring watchlist, evaluation criteria map, Launch Mission animated sequence, IRIS three-wave activation, expert routing, state comparables, and win/loss learning loop.

## 1. Mission Setup Record — additions to existing page

The 9-section long-scroll already exists at `/olympus/missions/$missionId/setup`. Adding:

- **Section 2 extension** — expertise-tag picker per team member (Collective tag chips on each row)
- **Section 3 extension** — new "IRIS Monitoring Watchlist" sub-panel: pre-seeded sources based on state + opportunity type, custom-URL adder, daily/weekly frequency toggle
- **Section 4B (new)** — Evaluation Criteria Map table: Category · Points · Questions Covered · Competitive Risk

## 2. Launch Mission — animated activation sequence

Replace the current static confirmation with an 8-step animated sequence (4-5s total). Each step shows a spinner → checkmark with the live count from the DB. Then a "Mission Ready" screen with all checkmarks and `[View Mission Home]`.

```text
Mission Context Locked          ✓
Vault Populated (N docs)        ✓
Oracle Seeded (N intel cards)   ✓
Evaluation Priority Map Built   ✓
Studio Generated (N questions)  ✓
IRIS Briefing → Brief Room      ✓
Monitoring Active (N sources)   ✓
Team Notified                   ✓
```

`launchMission()` becomes orchestrated: each step is a server fn that returns its count, the UI streams them as they resolve.

## 3. IRIS three-wave activation

- **Wave 1 (immediate, on launch)** — generate Initial IRIS Briefing from Sections 1+4, post to Brief Room as `briefings` row.
- **Wave 2 (background)** — `iris.indexMissionInputs` server fn: parses vault docs, extracts RFP requirements, tags questions with vault refs + win themes + competitive risk + IRIS pre-brief card. Drift baseline = Things to Avoid list.
- **Wave 3 (ongoing)** — cron'd `iris.monitor` route (`/api/public/hooks/iris-monitor`) polling watchlist sources daily/weekly per mission config; routes findings to Brief Room or Oracle inbox.

## 4. Advanced intel features

- **Evaluation Priority Map** — Studio question rows show points badge + risk pill. New "Mission Priority" sort. Top-5 get Priority badge.
- **Collective Expert Routing** — in Studio question detail, IRIS panel matches question topic vs member expertise tags; offers `[Route to Expert]` button that opens a thread.
- **State Comparables** — Oracle gets a "State Comparables" tab. New `state_comparables` table seeded for PA/MA/CT/TX/IL/OH/CO/WA × common CSA/ASO topics. IRIS can pull cards into `@mention` responses.
- **Win/Loss Learning Loop** — on mission status → Won/Lost, Olympus shows a "Mission Debrief" prompt. Captures scored well / missed / feedback / lessons. IRIS generates 3-5 Canon suggestions; admin approves → enters `intelligence_canon` as universal items.

## 5. Mission Home — generated view

Mission Home already cleaned (Win Themes removed, Olympus link is admin-only). Adding: priority flags on My Assignments, Latest IRIS Briefing card sourcing from `briefings` table.

## Technical

**New tables (migration):**
- `mission_monitoring_sources` — mission_id, source_type, url, label, frequency, enabled, last_checked_at
- `mission_evaluation_criteria` — mission_id, category, points, sections_covered (jsonb), competitive_risk
- `mission_expertise_tags` — mission_member rowid, tag (or store tags[] on `mission_members`)
- `state_comparables` — state, program_name, topic, approach, outcome, source_url
- `mission_debriefs` — mission_id, scored_well, missed, evaluator_feedback, lessons_learned
- Extend `question_records`: `point_value int`, `competitive_risk text`, `iris_pre_brief jsonb`
- Extend `mission_vault_documents`: `extracted_requirements jsonb`, `extracted_terms text[]`

**New server functions (`src/lib/`):**
- `mission-setup.functions.ts` — extend with `saveMonitoringSources`, `saveEvaluationCriteria`, `saveExpertiseTags`
- `iris.functions.ts` — `generateInitialBriefing`, `indexMissionInputs`, `tagQuestionsWithIntel`, `matchExpertForQuestion`
- `launch.functions.ts` — split `launchMission` into 8 callable steps for the animated sequence
- `debrief.functions.ts` — `saveDebrief`, `generateCanonSuggestions`, `approveCanonItem`

**New routes:**
- `/api/public/hooks/iris-monitor` — cron-callable, polls all enabled monitoring sources
- `/olympus/missions/$missionId/debrief` — debrief capture + Canon approval

**Studio integration:**
- Add Priority badge + points/risk pills to existing question list
- Add IRIS Expert Routing panel to question detail
- Add "State Comparables" tab to Oracle

**LLM:** Lovable AI Gateway with `google/gemini-2.5-pro` for briefing + Canon synthesis; `google/gemini-2.5-flash-lite` for tagging/classification.

## Out of scope (for this iteration)

- Actual external API calls for monitoring sources (cron job runs but uses stub fetchers for SAM.gov / Federal Register / state portals — real adapters are a follow-up)
- Real-time streaming of launch steps via SSE (animated sequence runs sequential RPCs)
- Cross-state intelligence data ingestion pipeline (seed table manually, expand later)

## Build order

1. Migration: new tables + column extensions
2. Setup Record additions (Section 4B, monitoring panel, expertise tags)
3. Launch orchestration + animated sequence
4. IRIS Wave 1 briefing generator + Wave 2 indexer
5. Studio priority/risk display + expert routing
6. Oracle State Comparables tab
7. Debrief flow + Canon approval
8. Monitoring cron route (stub adapters)
