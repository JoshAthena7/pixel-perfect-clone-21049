# IRIS Intelligence Architecture — North Star

> Hand to developer before writing any code.
> Principle: **Truth → Intelligence → Understanding → Strategy → Execution.**
> Not Vault → Oracle → Studio.

IRIS is not a document library. It is a connected intelligence system that
thinks the way experienced healthcare strategists think, and surfaces the
right understanding at the right moment.

---

## Layer 1 — Knowledge Acquisition

Three source categories, one engine.

- **Client sources** — RFP, Q&A, contracts/SOW, client decks, incumbent reports, meeting notes, SME interviews.
- **Public sources** — CMS, state Medicaid / DCF, legislature / governor, Federal Register, advocacy groups, provider associations, academic journals, news / social / conferences.
- **Relationship sources** — Athena network, consultant observations, market conversations, client signals, partner signals, Pathfinder (future).

## Layer 2 — Intelligence Processing (auto-tagging)

Every document tagged across five dimensions. Tagging is what makes retrieval intelligent, not keyword-based.

| Dimension | Values |
|---|---|
| Mission Domain | Medicaid, IDD, Behavioral Health, Child Welfare, LTSS, Duals, SUD, Technology |
| Geography | Federal, State, County, Region |
| Signal Type | Policy, Research, Advocacy, Provider, Political, Operational, Financial, Competitive |
| Importance | Critical, Important, Interesting, Noise |
| Time Horizon | Immediate, Near Term, Long Term, Historical |

## Layer 3 — Mission Intelligence Graph (THE DIFFERENTIATOR)

Not rows and columns. A connected graph. Humans think in connections; IRIS must too.

> Example chain: *Governor Murphy's children's behavioral health priorities → 1115 Waiver → Wraparound Services → Family Support Organizations → Provider Workforce Crisis → Recent Legislative Hearing → Emerging Win Theme.*

That chain is what a senior strategist does instinctively. IRIS does it automatically.

**Tech note:** requires a graph database (Neo4j) or a graph layer on Postgres. Hardest piece. Most differentiated asset Athena will own.

### The 9 Intelligence Domains

1. **Mission Intelligence** — RFP requirements, deliverables, questions, evaluation criteria
2. **Policy Intelligence** — State Plan, 1115 / 1915 waivers, CMS regulations, federal guidance
3. **Political Intelligence** — Governor priorities, legislature, budget cycles, agency priorities
4. **Stakeholder Intelligence** — Decision makers, advocates, providers, associations, influencers
5. **Market Intelligence** — Competitors, incumbents, partners, prior awards, protest history
6. **Community Intelligence** — Families / caregivers, public testimony, advisory groups, consumer concerns
7. **Research Intelligence** — Academic centers, best practices, national models, evidence base, outcome data
8. **Signal Intelligence** — News, social, conferences, press releases, emerging developments
9. **Relationship Intelligence** — Who knows whom, who influences whom, who to call, who to avoid, Pathfinder (future)

## The 5 IRIS Outputs — the only things users ever see

Everything above is invisible infrastructure.

1. **Mission Brief** — complete orientation; generated at mission launch; every member reads first.
2. **Environmental Assessment** — political, regulatory, stakeholder, community, competitive picture of the room.
3. **What the State Wants** — decoded priorities; built from Governor, legislature, agency leadership, stakeholder testimony, program history.
4. **Emerging Risks** — live feed; regulatory shifts, competitor positioning, political headwinds, community concerns.
5. **Recommended Strategy** — mission-specific win themes, discriminators, proof points, language guidance, Athena positioning.

## V1 Build Pipeline — hardwire before any UI

1. Upload RFP
2. Extract Requirements (requirements, deliverables, evaluation criteria)
3. Identify Program Domains → Mission Domain taxonomy
4. Identify Regulatory Authorities (CMS, state agency, waiver authorities, federal programs)
5. Identify Stakeholders → Stakeholder + Political domains
6. Identify State Priorities → parse Governor, legislature, agency signals
7. Identify Research Base → Research Intelligence domain
8. Identify Community Signals → families, providers, advocacy groups, public testimony
9. Identify Competitors → incumbent history, market positioning, prior awards
10. Generate **Mission Brain** — build the intelligence graph; connect all identified nodes
11. Generate Win Themes from Mission Brain
12. Feed Studio

## Tech Stack

| Layer | Choice |
|---|---|
| Database | Supabase + pgvector (SOC 2; Anthropic BAA for HIPAA) |
| Graph | Neo4j or Supabase JSON graph for the Mission Intelligence Graph |
| LLM | Anthropic Claude API (`claude-sonnet-4-6`) — best on long healthcare/government docs |
| Document processing | LlamaIndex — chunk, embed, index uploaded RFPs |
| Embeddings | Voyage AI — optimized for technical/legal retrieval |
| Web monitoring | Firecrawl — schedule NJSTART, CMS.gov, DCF, state legislature |
| Serverless | Supabase Edge Functions for pipelines and crons |

---

*Truth — Intelligence — Understanding — Strategy — Execution.*
