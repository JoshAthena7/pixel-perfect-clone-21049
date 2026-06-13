# IRIS-Driven Mission Setup Wizard

Rebuild the mission setup wizard so it becomes a **review-and-confirm** experience powered by IRIS, not a blank-form wizard. User uploads everything in Step 1, IRIS reads it all and pre-populates every downstream field, human confirms / corrects / fills gaps.

This is a large rebuild. Before I start, I want to confirm scope and a few key decisions.

---

## Proposed structure

**Routes**
- `/olympus/wizard/new` — creates a draft mission row immediately, redirects to `/olympus/wizard/:missionId?step=1`
- `/olympus/wizard/:missionId` — resume at last saved step
- Replaces the current 5-step wizard at `/olympus/missions/:missionId/wizard`

**Shell**
- Top progress bar with 8 labeled steps, click-to-jump on visited steps, checkmarks on completed
- Bottom bar: Back · Step X of 8 · Save & Continue
- Field-level auto-save on blur
- "Exit Wizard" returns to Olympus list; mission shows "Resume Setup"

**Steps**
1. **Fuel IRIS** — mission name + multi-zone document upload (RFP, addenda, past proposals, state plans, program guidance, win/loss, other). "Analyze with IRIS" triggers `iris-mission-analysis` edge function with a full-screen progress panel and per-step extraction summary.
2. **Mission Basics** — 14 fields pre-populated by IRIS with gold "IRIS extracted from [file]" badges. Per-field Confirm / Edit. "Confirm All" one-click.
3. **Strategic Foundations** — IRIS drafts North Star, Why We Win, Why We Could Lose, Biggest Concerns from RFP + state_dna + program_dna + past proposals. Use This / Edit / Write My Own per field, expandable source citations.
4. **Competitive & Win Strategy** — IRIS suggests Competitors, State Priorities, Win Themes, Reinforce, Avoid.
5. **Stakeholder Intelligence** (optional) — Member/Family, Provider, Evaluator cards.
6. **Executive Intelligence** (optional) — 6 role cards × 5 fields.
7. **Team & Assignments** — IRIS-suggested team members + IRIS-suggested lead writer per extracted question (this is the Olympus assignment surface established in the earlier turn).
8. **Review & Launch** — read-only summary, IRIS Mission Brief generation, Approve Brief → Launch Mission.

**New table**: `mission_iris_extractions` (id, mission_id, source_file_name, source_file_id, extracted_field, extracted_value, confidence_score, wizard_step, confirmed_by_user, confirmed_at, overridden_by_user, user_override_value) with RLS via `is_mission_member()` + full GRANTs.

**New edge function**: `iris-mission-analysis` — reads uploaded vault files, extracts structured data per document, cross-references `state_dna` / `program_dna` / `insights` / `experts`, writes to `mission_iris_extractions`, seeds `missions` row with confirmed basics, returns summary by wizard step.

**Removals**
- Replace the current 5-step wizard route entirely (`olympus.missions.$missionId.wizard.tsx` + `MissionWizardChrome`, `WizardShell`, `Step1BUpload`, `Step3WinStrategy`, `Step4Journey`, `Step5Team`, `Step6BlastOff` either replaced or rewired).
- Remove Win Themes / Strategy editing from Briefing Room Strategy tab → redirect to wizard Step 4.
- Keep Briefing Room (read-only brief display), Flight Deck, all other mission views unchanged.

---

## Scope check — please confirm before I build

This is roughly 15–25 files of work (new wizard shell, 8 step components, edge function, migration, route swap, briefing-room redirect, type wiring). I want to make sure I'm building the right thing before committing.

1. **The current 5-step wizard is the one to replace.** It was built last week as the "v2" simplified flow (Upload → Strategy → Team → Timeline → Blast Off). You want to throw that out and build the 8-step IRIS-driven flow on top of it. Confirm?

2. **Edge function vs. serverFn.** Per this project's TanStack architecture, `iris-mission-analysis` should be a `createServerFn` (in `src/lib/iris-mission-analysis.functions.ts`), not a Supabase Edge Function. It can stream a progress signal via polling on `mission_iris_extractions` row count. OK to use serverFn?

3. **IRIS extraction depth in v1.** The full spec implies IRIS extracts ~40+ structured fields across 8 steps from arbitrary PDFs. For the first cut, do you want:
   - **(a) Full pass** — single Gemini call per document with a giant structured-output schema covering every field. Higher cost, slower, more brittle.
   - **(b) Targeted pass** — extract Step 2 basics + Step 7 questions deterministically first (high-confidence stuff), and have Steps 3–6 IRIS suggestions generate **lazily when the user lands on that step** (cheaper, faster Step 1, suggestions feel "live"). I recommend (b).

4. **Timeline step.** The current wizard has a "Set the Timeline" step (deadline + auto-generated journey phases). Your new 8-step spec doesn't include it. Should the deadline move into Step 2 Mission Basics (IRIS already extracts it) and the journey phase generation happen automatically at launch in Step 8? Or keep a dedicated timeline step as Step 7.5?

Once you confirm these four, I'll build the whole thing in one pass: migration → serverFn → wizard shell → all 8 steps → route swap → briefing-room redirect.