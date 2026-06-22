# Clone NJ T1932 → Indiana Medicaid Mission

Before executing, three findings need your call — the spec doesn't fully line up with the schema.

## Findings that need a decision

**1. `atlas_institutional_memory` has no `domain:` tag column.**
The schema (`pattern_type`, `applicable_states`, `applicable_procurement_types`, `applicable_question_categories`, `applicable_win_theme_ids`, plus an embedding) has no field tagged `domain:medicaid-general`, `domain:jpb-model`, or `domain:evaluator-science`. The closest proxy is `applicable_states` — rows where `'NJ' = ANY(applicable_states)` are NJ-scoped, rows where it's empty/NULL or contains other states are general. **Institutional memory is also not mission-scoped** — it's already shared across every mission, so nothing needs to be "carried over." It just stays where it is and the new Indiana mission will see whatever rows match its state/procurement type. Flagging as **manual review**.

**2. "JPB Model signal patterns" live in `oracle_signals`, which the spec also says to wipe.**
All 72 NJ oracle signals are tied to `mission_id=128da20f…`. None are global. If the JPB pattern lives elsewhere (e.g. `oracle_risk_patterns`, `signal_patterns`, `oracle_beliefs`), those are not mission-scoped and stay as-is. The clone will **wipe all 72 NJ oracle_signals** (none cloned). If you want specific signal templates carried over, point me at row IDs.

**3. Question structure cloning.**
The source mission has 1,353 `mission_questions`. The spec is ambiguous: "Mission wizard structure" suggests keep, but "question_assignments, score_me_history" suggests questions are mission-specific work product. **Default: do NOT clone 1,353 NJ questions.** Indiana questions will come from its own RFP extraction. Confirm if you want a different behavior.

## What gets created

New row in `missions`:
- `name`: "Indiana Medicaid Managed Care RFP"
- `state`, `state_code`: "Indiana" / "IN"
- `agency_name`: "State of Indiana — Family and Social Services Administration" (placeholder, update when confirmed)
- `program_type`: "medicaid_managed_care"
- `submission_deadline`: NULL (TBD)
- `north_star`: NULL (TBD)
- `known_competitors`: `{}` (empty)
- `win_themes_text`, `why_win`, `why_lose`, `state_priorities`, `reinforce`, `avoid`, `biggest_concerns`, `how_we_win`, `today_focus`, `watch_items`, `stakeholder_intelligence`, `executive_intelligence`, `why_it_matters`, `leadership_broadcast`: NULL
- `status`: "active"
- `created_by`: josh@athenama.com (`535d2fe6-480d-4882-9b22-78c3fca71097`)
- `metadata`: `{"cloned_from": "128da20f-9479-4108-b6b9-0017595509b1", "cloned_at": "<ts>", "clone_note": "RFP drops 2026-08-06"}`

## Tables touched

```text
CLONED (structure carried, NJ data stripped)
 ├─ mission_iris_config      → copy IRIS persona, voice, brief tone/length;
 │                             reset state_terminology={}, known_competitors=[],
 │                             win_theme_keywords=[]
 ├─ mission_journey_phases   → 7 phase templates (no NJ copy in titles — verify)
 └─ mission_milestones       → 10 milestone templates (dates shifted by deadline
                               delta, or set NULL until Indiana deadline confirmed)

CARRIED ROLE STRUCTURE (no named assignees)
 └─ mission_team_members     → 1 row: Josh as admin/engagement_lead.
                               The other 27 NJ assignees are NOT copied.

WIPED (created empty for Indiana)
 ├─ mission_questions        (1,353 NJ rows — none cloned)
 ├─ oracle_signals           (72 NJ rows — none cloned)
 ├─ mission_win_themes       (5 NJ rows — none cloned)
 ├─ competitor_profiles      (1 NJ row — none cloned; PerformCare is NJ-only)
 ├─ mission_documents        (5 NJ RFP docs — none cloned)
 ├─ question_assignments     (0)
 ├─ score_me_history         (0)
 ├─ mission_north_star       (0)
 ├─ market_intelligence      (0)
 └─ briefing_book_sections   (0)

UNTOUCHED (shared / global by design)
 ├─ atlas_institutional_memory   (not mission-scoped — Indiana inherits whatever
 │                                applies via applicable_states/procurement_types)
 ├─ oracle_risk_patterns, signal_patterns, oracle_beliefs
 ├─ oracle_taxonomy, oracle_source_registry, oracle_quality_measures
 └─ IRIS knowledge objects that are not state-scoped
```

## Output you'll get back

- `mission_id` for Indiana
- Per-table actual row counts (cloned vs wiped) confirming the table
- Manual-review list (the three findings above) with row IDs for any institutional_memory rows whose `applicable_states` is ambiguous (contains NJ alongside other states)

## Execution mechanism

Single SQL transaction via the data-insert tool: INSERT into `missions`, INSERT into `mission_iris_config` (cloned + reset), INSERT into `mission_journey_phases` / `mission_milestones` (cloned with new mission_id and dates nulled), INSERT into `mission_team_members` (Josh only), then a SELECT report. No DELETE statements run against the NJ mission — it stays intact.

## Confirm before I run

1. Approve the **3 findings** above (institutional memory not tagged; oracle_signals fully wiped; mission_questions fully wiped — Indiana questions come from its own RFP)?
2. Confirm Indiana `agency_name` (default placeholder above) — or leave NULL?
3. Mission `metadata.clone_note` text OK?
