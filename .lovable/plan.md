
# Setup Record as IRIS's authoritative mission context

Goal: every IRIS call on a mission reads the Setup Record first and injects a strategic preamble into the system prompt. The richer the Setup Record, the smarter every IRIS output gets. A completeness meter at the top of the Setup Record shows admins exactly how much context IRIS has.

## 1. Shared context loader (one source of truth)

New file: `src/lib/iris-mission-context.server.ts` — server-only helper, never imported by client code.

Exports:

```ts
loadMissionContext(supabase, missionId): Promise<MissionContext>
formatMissionContextPreamble(ctx: MissionContext): string
computeSetupCompleteness(mission, evalRows, intel): { pct, filled, total, missing }
```

`loadMissionContext` does one parallel read of:
- `missions` row (all strategic foundation cols + identity + win_themes + key_requirements + iris_setup_suggested_fields + iris_setup_autofill_status)
- `mission_evaluation_criteria`
- `mission_client_intel` (population_served / geographic_scope live on `iris_setup_suggested_fields` until promoted; pull both)

`formatMissionContextPreamble` returns the exact block from the user's spec:

```
MISSION CONTEXT (from Setup Record):
- Client: {client} / {state_agency}
- Win Strategy: ...
- Client Strengths: ...
- Program Goals: ...
- Win Themes: ...
- Key Contract Requirements: ...
- Incumbent: ...
- Evaluation Criteria: ...
- Population Served: ...

Use this context to ground every response. Do not contradict it.
Do not speculate about things explicitly stated here.
```

Empty fields are listed as `(not yet provided)` so the model knows the gap rather than hallucinating.

## 2. Wire preamble into every IRIS server fn

Each target file already constructs a `system` string and passes it to the Lovable AI gateway. Add at the top of every `.handler`:

```ts
const ctx = await loadMissionContext(supabase, missionId);
const preamble = formatMissionContextPreamble(ctx);
const system = `${preamble}\n\n${existingSystemPrompt}`;
```

Files to edit:
- `src/lib/iris-ask.functions.ts` (line 21 — wraps `withPersonFirst(system)`)
- `src/lib/iris-mission-brief.functions.ts`
- `src/lib/iris-question-brief.functions.ts`
- `src/lib/iris-question-coaching.functions.ts` (line 28 — already concatenates `IRIS_BASE_PROMPT`; insert preamble between)
- `src/lib/score-me-v2.functions.ts` (line 162)

For question-scoped fns (`iris-question-brief`, `iris-question-coaching`, `score-me-v2`), resolve `missionId` from the `question_records` row when it isn't already in the input — most already load the question; we'll grab `mission_id` from there.

Risk and signal extraction were called out in the spec but live in the kickoff pipeline; flagging out of scope for this pass (noted below) so we don't blow up scope.

## 3. Setup Record completeness meter

The form already has a `CompletionMeter` in the sidebar (counts SECTIONS). Add a richer **field-level** completeness display at the top of the main column, above the IRIS autofill banner:

```
Setup Record — 73% complete
⚡ IRIS is operating with partial context. Complete this record for full intelligence.
[ shows 4 missing fields: Win Themes, Population Served, Evaluation Criteria, Incumbent ]
```

When 100%:

```
✓ Setup Record complete — IRIS is fully context-aware for this mission.
```

New component: `src/components/admin/SetupCompletenessMeter.tsx`. It uses the same `computeSetupCompleteness` helper, but exposed via a client-safe re-export (`src/lib/iris-mission-context.ts`) that contains only the pure computation function — no Supabase imports. Server file imports the same pure helper.

Tracked fields (15): `client`, `state_agency`, `submission_date`, `program_type`, `incumbent_name`, `contract_value`, `mission_highlights`, `client_strengths`, `client_win_strategy`, `program_goals`, `key_requirements` (≥1), `win_themes` (≥1), `evaluation_criteria` (≥1 row), `population_served`, `geographic_scope` (last two read from `iris_setup_suggested_fields` or promoted fields).

## 4. Files

- **NEW** `src/lib/iris-mission-context.ts` — pure `computeSetupCompleteness` + field list (client + server safe).
- **NEW** `src/lib/iris-mission-context.server.ts` — `loadMissionContext`, `formatMissionContextPreamble`.
- **NEW** `src/components/admin/SetupCompletenessMeter.tsx`.
- **EDITED** five IRIS server fns listed above.
- **EDITED** `src/routes/_authenticated/admin/missions.$missionId.setup.tsx` — render the meter above the autofill banner.

No migration, no schema change.

## Out of scope (this pass)

- Risk / Signal extraction in the kickoff pipeline — separate file set; happy to wire next.
- Per-IRIS-call telemetry that records which preamble fields were used.
- Caching the preamble in `iris_memories`.
