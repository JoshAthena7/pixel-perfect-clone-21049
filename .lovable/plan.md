# Olympus UX Refinement — Implementation Plan

All 60 items are copy, labels, helper text, tooltips, conditional states, and small CSS affordances. No architectural changes. I'll ship in three batches matching your priority order so you can review after each.

## Batch 1 — Immediate (highest return, lowest effort)

Targets the moments users first encounter Atlas: mission creation, Setup Record framing, IRIS readiness language.

- UX-1: Add plain-language explanation under IRIS coverage bar
- UX-2: Add "Readiness: X/10" label above Launch Mission; copy reflects state ("Launch with Partial Setup →" under 7/10)
- UX-9: "Estimated time to complete: 15–20 minutes. IRIS activates at section 5." under Setup Record title
- UX-11: "Create & Open Setup →" → "Create Mission & Begin Setup Record →"
- UX-12: Prepend stakes statement to mission creation modal helper text
- Clarity-1: "IRIS CONTEXT COVERAGE" → "IRIS Intelligence Readiness"
- Clarity-2: "Opportunity Type" → "Procurement Vehicle"
- Language-1: "MISSION SETUP RECORD" → "Mission Intelligence Record"
- Language-2: Rewrite "operating with partial context" banner to active-outcome phrasing
- Onboarding-1: Add expectation-setting sentence to new-mission modal

## Batch 2 — Short-term (clarity & navigation polish)

- UX-3: Setup Record left-rail steps become clickable anchor jumps with hover affordance
- UX-7: Tooltip on Readiness score explaining 5/10 IRIS activation, 10/10 full
- UX-10: Bold or mark the highest-priority missing IRIS chip with "Start here →"
- UX-20: One-time tooltip on Ask IRIS button on first Setup Record visit
- Clarity-3 → Clarity-7: Rename Setup Record steps (Mission Context, Win Strategy, How We'll Be Scored, Agency Intelligence, Deadlines & Decision Gates)
- Nav-1: Anchor links + ↓ hover affordance on rail steps
- Nav-3: Visual grouping dividers between MISSION / ORACLE / PLATFORM / SECURITY
- Nav-8: Breadcrumb includes mission name (OLYMPUS / SETUP RECORD / [Mission])
- Onboarding-3: "Help IRIS get smarter:" header above partial-context chips
- Onboarding-6: IRIS routing explainer above Team Assignment dropdowns

## Batch 3 — Ongoing structural polish

Remaining 35 items: section save confirmations, conditional empty states (team dropdowns, Olympus first-run), sidebar subtitles (ORACLE, Firm Health, Score-Me Lab), language rewrites (Audit Log, PHI, Right-to-Deletion), navigation context (top-nav greying in Olympus, sticky Back to Mission, active sidebar accent bar), mission list status badges, Question Setup sub-step indicator, pre-launch summary state, invited-user pending screen, milestone toast at 5/10 readiness, IRIS pre-fill offer for Question Setup, Send Team Briefing rename, Clarity 8–10 (Conflict & Ethics Review, Budget & Pricing Setup, verb-first IRIS chips), Language 3–6.

## Technical notes

All changes live in existing files — primarily:
- Setup Record route + step rail component
- New Mission modal
- Olympus sidebar config
- IRIS partial-context banner component
- Mission list page
- Invited-user gate (already created at `/welcome`)

No new routes, no migrations, no schema changes. Conditional empty states use existing data already in scope. The one-time IRIS tooltip uses a localStorage flag.

## Question for you before I start

Want me to:
- **(A)** Ship Batch 1 now, review, then continue, or
- **(B)** Ship all three batches straight through in one pass?

Either works — (A) gives you a checkpoint, (B) is faster.