## Competitor Intelligence Cards — Step 4

Generate an IRIS Competitor Intelligence Card for every confirmed competitor in the Mission Setup Wizard Step 4, persist it as confirmable/editable extractions, and surface the counter-strategy in the Mission Brief and Flight Deck.

### Stack adaptations (with your sign-off)
- **Backend boundary:** TanStack `createServerFn` in `src/lib/iris-competitor-intel.functions.ts` instead of a Supabase Edge Function — this project is TanStack Start; `createServerFn` is the canonical equivalent.
- **Model:** Lovable AI Gateway with `google/gemini-3-flash-preview` (Lovable's built-in AI, no key required) instead of Claude. Same structured-JSON prompt, identical output shape.
- **Storage:** Reuse `mission_iris_extractions` exactly as you specified — no new tables.

### 1. Server function: `generateCompetitorIntelligence`
File: `src/lib/iris-competitor-intel.functions.ts`

Input: `{ mission_id, competitors: string[] }` (mission state + program type loaded server-side from `missions`).

Per competitor, query in this order and collect raw records:
1. `insights` where `insight_type='competitive_intel'` and name match in `content` or `tags`
2. `state_dna` where `state = mission.state_location` and content matches
3. `program_dna` where `program = mission.program_type` and content matches
4. `signals` content match, newest 5
5. `missions` where `known_competitors @> ARRAY[name]` (status / outcome)
6. `experts` where `organization ILIKE %name%`

Call Lovable AI Gateway with your exact 8-section + `how_we_beat_them` prompt, requesting JSON. Map confidence → 0.3/0.6/0.9. Upsert one row per competitor into `mission_iris_extractions`:
- `extracted_field = 'competitor_card_' + slug(name)`
- `extracted_value = JSON.stringify(card)`
- `wizard_step = 4`
- `confidence_score` per mapping
- `source_file_name = name` (for display)

After all cards, generate the **Competitive Landscape Summary** paragraph (second AI call) and upsert as `extracted_field = 'competitive_landscape_summary'`, `wizard_step = 4`.

### 2. Trigger from Step 4
In `Step4Competitive.tsx`, add a **"Confirm Competitors & Generate Intelligence"** button. On click:
1. Save confirmed list to `missions.known_competitors`.
2. Invoke `generateCompetitorIntelligence` (shows progress: "IRIS is researching N competitors…").
3. Reveal the cards section.

Re-running is allowed — server function upserts; existing user-overridden text on individual sections is preserved (we only overwrite sections where `overridden_by_user = false`).

### 3. Competitor card UI
New component `src/components/mission-wizard-v3/CompetitorCard.tsx`.

**Header row:** name (bold), threat-level badge (HIGH/MEDIUM/LOW computed from incumbent flag + recent-wins count), IRIS confidence label, **Add Intelligence** button (opens modal).

**Body:** 8 collapsible sections (Incumbent Status, How They Win, Known Weaknesses, Win/Loss History, Likely Teaming, Pricing Posture, Key Personnel, Recent Signals). Gold IRIS badge on each. Inline **Edit** writes `user_override_value` per-section in a sub-extraction row (key pattern: `competitor_card_<slug>__<section>`) so card-level regeneration doesn't clobber edits.

**Footer:** gold/amber highlighted **⚡ HOW WE BEAT THEM** box with `how_we_beat_them` paragraph and Edit Counter-Strategy.

**Empty state:** placeholder copy with prompt to use Add Intelligence.

### 4. Add Intelligence modal
`AddCompetitorIntelModal.tsx` — title, body, tag chips (auto-tags the competitor name). Inserts into `insights` with `insight_type='competitive_intel'`. Optional "Regenerate this card with new intel" button after save.

### 5. Competitive Landscape Summary panel
Below all cards in Step 4 — read-only synthesis paragraph with single Regenerate button.

### 6. Wiring to Mission Brief & Flight Deck
- **Mission Briefing Room** (`/missions/$missionId`): new read-only "Competitive Intelligence" section that renders all `competitor_card_*` extractions plus the landscape summary.
- **Flight Deck Question Brief** (`iris-brief.functions.ts → generateQuestionBrief`): inject `how_we_beat_them` paragraphs + landscape summary into the brief-generation prompt context, and add a "Counter-Strategy" panel in the Question Brief UI that shows them inline.

### Technical details
- Slug helper: lowercase, non-alphanumeric → `_`, trim.
- Threat computation server-side from the queried records, stored as `card.threat_level`.
- All AI calls use Lovable AI Gateway (`createLovableAiGatewayProvider`); errors (402/429) surface to the wizard with retry.
- Idempotent: re-running upserts via unique `(mission_id, extracted_field)` index already on `mission_iris_extractions`.
- All queries scoped server-side via `requireSupabaseAuth`; mission ownership verified before any insert.

### Files touched
- **New:** `src/lib/iris-competitor-intel.functions.ts`, `src/components/mission-wizard-v3/CompetitorCard.tsx`, `src/components/mission-wizard-v3/AddCompetitorIntelModal.tsx`, `src/components/mission-wizard-v3/CompetitiveLandscapePanel.tsx`, `src/components/mission/CompetitiveIntelligenceSection.tsx` (briefing room).
- **Edited:** `src/components/mission-wizard-v3/Step4Competitive.tsx`, `src/routes/_authenticated/missions.$missionId.tsx`, `src/lib/iris-brief.functions.ts`, Flight Deck Question Brief component.

### Out of scope (confirm if you want them in)
- Per-section streaming UI while AI generates (kept simple with a single progress spinner).
- Web-search augmentation when IRIS Memory is empty (your spec says "Limited intelligence available…" copy instead).
