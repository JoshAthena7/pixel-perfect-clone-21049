# Intelligence Page Command Center Reorganization

Rewrite `OracleTab.tsx` into a single scrollable page. Keep all existing data and sub-components — only change order, grouping, and presentation. No schema changes, no new queries beyond gap detection and "last visit" delta.

## Scope

**Modified:**
- `src/components/mission-command/oracle/OracleTab.tsx` — gut and rebuild as scrollable layout
- `src/routes/_authenticated/missions.$missionId.intelligence.tsx` — pass through sidebar layout

**New:**
- `src/components/mission-command/oracle/sections/ExecutiveSummary.tsx` — North Star + Top Signal + Coverage band
- `src/components/mission-command/oracle/sections/JumpNav.tsx` — sticky pill nav with scroll-spy hook
- `src/components/mission-command/oracle/sections/KeySignals.tsx` — top 3 elevated signal cards + collapsible rest
- `src/components/mission-command/oracle/sections/StakeholderIntel.tsx` — wraps existing People/Orgs into 4 buckets
- `src/components/mission-command/oracle/sections/CompetitiveIntel.tsx` — filtered oracle_signals
- `src/components/mission-command/oracle/sections/EvidenceBase.tsx` — filtered oracle_signals with PRIMARY badges
- `src/components/mission-command/oracle/sections/SourceNetwork.tsx` — collapsed wrapper around IntelSources + legacy scans
- `src/components/mission-command/oracle/sections/IntelligenceGaps.tsx` — taxonomy leaf nodes with zero signals
- `src/components/mission-command/oracle/sections/AnalysisTools.tsx` — collapsed Graph/StoryMap/GraphHealth
- `src/components/mission-command/oracle/sections/IntelSidebar.tsx` — simplified left rail

**Unchanged components (reused as-is):**
IntelFeed cards, IntelPeople, IntelOrganizations, IntelSources, OracleGraph, StoryMapTab, GraphHealthTab, AskIrisButton, RequestChangeButton, IntelLoadBanner (removed from render, not deleted), WriterIntelView.

## Layout

```text
┌─ Sidebar (sticky) ──┐ ┌─ Main column ────────────────────────────────┐
│ ORACLE HEALTH       │ │ [Sticky jump-nav: Summary·Signals·...]       │
│   42% + sentence    │ │                                              │
│                     │ │ #summary    Executive Summary band           │
│ QUICK ACTIONS       │ │ #signals    Key Signals (top 3 + more)       │
│   Add Single Item   │ │ #stakeholders  Stakeholder Intel (4 buckets) │
│   Setup Wizard      │ │ #competitive   Competitive Intel             │
│   Refresh IRIS      │ │ #evidence   Evidence Base                    │
│                     │ │ #sources    Source Network (collapsed)       │
│ SECTION NAV         │ │ #gaps       Intelligence Gaps                │
│   • Summary         │ │             Analysis Tools (collapsed)       │
│   • Signals         │ │                                              │
│   • ...             │ │                                              │
│                     │ │                                              │
│ IRIS config→Olympus │ │                                              │
└─────────────────────┘ └──────────────────────────────────────────────┘
```

## Data sources (all existing)

- `missions.north_star` — North Star text
- `oracle_signals` — filtered by status/tier/category for each section
- `oracle_source_registry` — Source Network
- `oracle_taxonomy` (is_leaf=true) LEFT JOIN `oracle_signals` — gap detection
- `intel_people` / `intel_organizations` — existing Stakeholder components
- `localStorage['atlas_intel_last_visit:<missionId>']` — "since last visit" delta

## Key implementation notes

- **Scroll-spy**: single `IntersectionObserver` in JumpNav watching the 6 section anchors; active pill = section with greatest intersection ratio.
- **Filter pills** (All/Signals/Risks/...): lift state into KeySignals; remove from IntelFeed top-level.
- **Legacy EXTRACTION items** (`ingestion_source='automated_feed' AND title ILIKE 'Initial scan:%'`): excluded from Key Signals query, surfaced in Source Network's "LEGACY FEED ITEMS" sub-section.
- **Stakeholder bucketing**: client-side classify via `topic_tags`/`source_name` includes-match; bucket priority STATE→ADVOCACY→PROVIDERS→FEDERAL→OTHER (first match wins); hide empty buckets; collapse >5.
- **Coverage sentence**: shared helper imported by ExecutiveSummary + IntelSidebar.
- **Writer role**: unchanged — still renders `WriterIntelView` early-return.
- **Admin/Lead gating**: Story Map (lead) + Graph Health (admin) tabs render inside collapsed AnalysisTools when permitted.

## What's removed

- Top-level tab bar (replaced by jump-nav)
- `IntelLoadBanner` from render (Executive Summary supersedes it; component file stays)
- Top header stats strip (Completeness/Feed/People/Orgs/Sources) — info moves to sidebar + summary band
- Sidebar tab buttons, separate count pills

## Risks / confirmations

1. `missions.north_star` column — need to verify it exists; if not, fall back to placeholder string described in spec.
2. Gap query (taxonomy leaf nodes with zero linked signals) needs a join pattern that matches existing Olympus gap-map logic — will mirror that exact query.
3. Sticky sidebar on small screens collapses below main content (single-column under `lg`).

Proceed?
