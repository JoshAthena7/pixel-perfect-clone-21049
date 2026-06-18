# ORACLE Intelligence Taxonomy

**Status**: Authoritative reference for the ATLAS intelligence architecture.
**Source of truth**: `public.oracle_taxonomy` table.
**Query interface**: `public.query_oracle(mission_id, question_id, taxonomy_codes[], limit_per_branch)`

## Layering note: ORACLE Taxonomy vs IRIS 9-Domain Model

These operate at different layers and do not conflict:

- **ORACLE Taxonomy (this doc)** — storage and retrieval. How intelligence is organized in the database and how IRIS queries for it. 8 top-level domains, 67+ leaf nodes.
- **IRIS 9-Domain Model** — briefing output structure. How IRIS *presents* assembled intelligence to writers. Lives in the North Star.

ORACLE retrieves using the taxonomy; IRIS reshapes results into the 9-domain briefing format the writer sees.

## How it works

Every `oracle_signals` row carries:
- `taxonomy_node_ids uuid[]` — authoritative classification (one signal can tag multiple branches), GIN-indexed
- `scope_tier` — `platform` | `state` | `mission`
- `state_code` — required when `scope_tier='state'`

When a writer opens a question, IRIS calls `query_oracle(...)` with the relevant taxonomy codes. The function fans out across all matching branches, scoped to:
- All `platform` signals
- `state` signals matching the mission's `state_code`
- `mission` signals for the current `mission_id`

Results are boosted when a `question_intel_links` row already ties the signal to the question, then sorted by `oracle_score` (relevance + urgency + impact + confidence) and grouped per taxonomy branch.

---

## The Tree

### REGULATORY_AUTHORITY  (`REG`)

- **Federal (CMS, SAMHSA, HHS)** (`REG_FED`)
  - Statute (Title XIX, Title XXI) — `REG_FED_STATUTE`
  - Regulation (42 CFR parts) — `REG_FED_REGULATION`
  - Guidance (informational bulletins, SMD letters) — `REG_FED_GUIDANCE`
  - Waiver (1115, 1915b, 1915c) — `REG_FED_WAIVER`
  - Policy (state plan requirements) — `REG_FED_POLICY`
- **State** (`REG_STATE`)
  - State Plan (base + amendments) — `REG_STATE_PLAN`
  - Waiver conditions — `REG_STATE_WAIVER`
  - State regulation (N.J.A.C.) — `REG_STATE_REGULATION`
  - Contract requirements — `REG_STATE_CONTRACT`

### QUALITY_PERFORMANCE  (`QP`)

- HEDIS measures — `QP_HEDIS`
- CAHPS survey results — `QP_CAHPS`
- NCQA accreditation — `QP_NCQA`
- CMS Star Ratings — `QP_STARS`
- Quality Withhold / P4P programs — `QP_P4P`
- Encounter data quality — `QP_ENCOUNTER`
- Performance Improvement Projects (PIPs) — `QP_PIP`
- External Quality Review (EQR) — `QP_EQR`

### HEALTH_OUTCOMES_SDOH  (`HO`)

- Clinical outcomes (chronic disease, maternal, BH) — `HO_CLINICAL`
- Health disparities & equity metrics — `HO_EQUITY`
- Social Determinants screening & referral — `HO_SDOH_SCREENING`
- Housing & food security interventions — `HO_HOUSING_FOOD`
- Behavioral health integration — `HO_BH_INTEGRATION`
- Population health management — `HO_POP_HEALTH`
- Community health worker programs — `HO_CHW`

### POLICY_INNOVATION  (`PI`)

- Value-based payment models — `PI_VBP`
- Alternative payment models (APM) — `PI_APM`
- Care delivery transformation — `PI_CARE_TRANSFORM`
- Integrated care models — `PI_INTEGRATED`
- 1115 demonstration innovations — `PI_1115_INNOVATION`
- Cross-sector partnerships — `PI_PARTNERSHIPS`
- Technology & digital health pilots — `PI_DIGITAL`

### EVIDENCE_BASE  (`EV`)

- Peer-reviewed research — `EV_RESEARCH`
- Systematic reviews & meta-analyses — `EV_SYSREVIEW`
- Clinical practice guidelines — `EV_GUIDELINES`
- Evidence-based program registries — `EV_REGISTRIES`
- Best practice case studies — `EV_CASES`
- Federal evaluation reports — `EV_FED_EVAL`
- Foundation reports (RWJF, Commonwealth, KFF) — `EV_FOUNDATION`

### FIELD_INTELLIGENCE  (`FI`)

- SME interviews & debriefs — `FI_SME`
- State agency relationships — `FI_STATE_RELATIONSHIPS`
- Provider network intelligence — `FI_PROVIDER`
- Member & advocate feedback — `FI_MEMBER`
- Conference & event intelligence — `FI_EVENTS`
- Vendor & subcontractor scuttlebutt — `FI_VENDOR`
- Political climate signals — `FI_POLITICAL`

### COMPETITIVE_LANDSCAPE  (`CL`)

- Incumbent performance profile — `CL_INCUMBENT`
- Competitor capabilities matrix — `CL_CAPABILITIES`
- Past win/loss intelligence — `CL_WINLOSS`
- Competitor staffing & key personnel — `CL_STAFFING`
- Pricing & rate intelligence — `CL_PRICING`
- Competitor weaknesses & ghosting opportunities — `CL_WEAKNESSES`
- M&A and market share shifts — `CL_MARKET_SHIFTS`

### CLIENT_CONTENT_MAP  (`CC`)

- Win themes (strategic narrative per theme) — `CC_WIN_THEMES`
- Proof point categories (by topic) — `CC_PROOF_POINTS`
- Program descriptions (high level) — `CC_PROGRAMS`
- Performance highlights (benchmark level) — `CC_PERFORMANCE`
- Where to find details (pointer to client environment) — `CC_POINTERS`

---

## Implementation notes

- **`oracle_nodes` mapping**: the original spec referenced `oracle_nodes`; the actual canonical intel record table is `oracle_signals`. The taxonomy columns (`taxonomy_node_ids`, `scope_tier`, `state_code`) and GIN index were added there.
- **`oracle_question_intel` mapping**: the actual question→intel join table is `question_intel_links`. `query_oracle` joins through it to boost confirmed links.
- **Branches needing review**: The original taxonomy spec was truncated mid-document, so the leaf nodes for **QUALITY_PERFORMANCE**, **HEALTH_OUTCOMES_SDOH**, **POLICY_INNOVATION**, **EVIDENCE_BASE**, **FIELD_INTELLIGENCE**, and **COMPETITIVE_LANDSCAPE** are reasonable defaults — refine them against the canonical source when available.
- **Backfill**: `oracle_signals` was empty at migration time, so no rows needed mapping from the legacy `signal_type` enum. New ingest should populate `taxonomy_node_ids` directly.
