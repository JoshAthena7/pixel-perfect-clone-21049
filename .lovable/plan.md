
# Holy Grail v2: Full Opportunity Intelligence

Today's Holy Grail only does **Category 1 (Opportunity Intelligence)** from your list, and only from the uploaded RFP. The other six (Market, Political, Competitive, Customer, Provider, Community) require external research — they aren't in the RFP.

## What needs to change

### 1. Schema rework

Restructure the `engagement_research` `holy_grail` row from a single blob into seven labeled sections, one per intelligence category, each with its own sub-fields. Writers can expand/collapse and jump to a section.

```
holy_grail.content = {
  opportunity: { program_name, state, agency, population_served,
                 enrollment, budget, incumbents[], contract_term,
                 regions[], timeline[], evaluation_criteria[],
                 mandatory_requirements[], procurement_vehicle,
                 historical_awards[] },
  market:      { program_structure, mco_landscape[], market_share[],
                 enrollment_trends, population_change, fiscal_outlook,
                 managed_care_maturity, recent_legislation[],
                 provider_market_dynamics },
  political:   { governor_priorities[], medicaid_director_priorities[],
                 leadership_changes[], legislative_pressures[],
                 budget_pressures[], advocacy_influence[],
                 provider_association_influence[], election_considerations,
                 inferred_political_problem },
  competitive: { likely_bidders: [{ name, strengths[], weaknesses[],
                 recent_wins[], recent_losses[], local_footprint,
                 provider_relationships, community_relationships,
                 state_reputation, executive_relationships,
                 known_performance_issues }],
                 likely_winner_if_nothing_changes },
  customer:    { keeps_them_up_at_night[], embarrassments[],
                 auditor_criticisms[], legislator_criticisms[],
                 advocate_criticisms[], stated_fixes[],
                 inferred_real_problem, sources[] },
  provider:    { hospital_systems[], fqhcs[], behavioral_health[],
                 hcbs[], idd[], ltss[], associations[],
                 happy[], angry[], ignored[], influential[] },
  community:   { disability_advocates[], aging_advocates[],
                 family_orgs[], child_welfare[], behavioral_coalitions[],
                 provider_coalitions[], tribal_orgs[], community_leaders[],
                 complaints[], frustrations[], gaps[], emerging_needs[] }
}
```

Each section also gets `confidence` and `sources[]` so writers can see what's solid vs. speculative.

### 2. Research pipeline

Three input streams feed Gemini 2.5 Pro:

1. **RFP text** (already extracted) — drives Category 1 + seeds names/dates for the others.
2. **Engagement config** (state, market, incumbent, competitors already entered in the wizard) — seeds Categories 4 and 6.
3. **Web research** (NEW) — Firecrawl search + scrape across:
   - State Medicaid agency site (priorities, leadership, advisory minutes)
   - State legislature site (recent hearings, bills)
   - CMS reports / OIG reports about that state
   - News on incumbent + likely competitors (recent wins/losses, performance issues)
   - Advocacy org sites (disability, aging, behavioral health) for that state

Pipeline runs as ONE leadership-triggered job per engagement, ~2–4 min, ~$0.30–0.80 per run. Status is persisted so the spinner doesn't hang (background pattern, polled from UI).

### 3. UI changes (`/intel` Holy Grail panel)

- Tabbed layout: Opportunity · Market · Political · Competitive · Customer · Provider · Community.
- Each section shows: extracted bullets, confidence chip, "Sources" expandable with links.
- "Refresh this section" button per tab (so you can re-run Political without redoing the whole thing).
- Visible to all writers (read-only); only leadership can trigger / refresh.

## What I need from you before building

### a. Web research connector

External research needs **Firecrawl** (web search + scrape). Not connected yet. Two options:

1. **Connect Firecrawl** — clean, server-side, handles JS-heavy gov sites, ~$0.001 per page. Recommended.
2. **Use Lovable AI's web grounding only** — cheaper, but shallower, often misses state-specific PDFs/advisory minutes.

### b. Scope of first build

The seven categories are roughly **3 weeks of solo work** if done well. Three options:

1. **Full build**, all 7 categories, one shot. ~6–8 hrs of agent time, more iteration risk.
2. **Phase 1**: Opportunity (expand current) + Competitive + Customer. The three with the highest writer ROI. Add the rest in follow-ups.
3. **Phase 1 lite**: Just restructure existing Opportunity into proper sub-fields + add Competitive (uses competitors already in engagement_config). Smallest, fastest.

### c. Caching

Web research is slow and expensive. Should re-running Holy Grail:
- Always re-fetch everything (fresh but slow/$$)
- Cache web results for 7 days unless force-refresh (recommended)

Tell me **(a)** connect Firecrawl or use built-in only, **(b)** which phase to start with, **(c)** caching preference — and I'll start building.
