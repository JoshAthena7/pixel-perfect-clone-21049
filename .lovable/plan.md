# Athena Command V2 — Foundation (Steps 1–6)

Full replacement of the existing app. Existing routes/components/server-fns under `_authenticated/`, `war-room/`, `iris/`, `holy-grail`, etc. will be removed. New V2 system built from scratch on the same Supabase project with a new schema.

## Step 1 — Database (single migration)

Drop existing app tables that conflict (engagements, huddles, decisions, risks, sos_alerts, heatmap_sections, win_themes, intel_documents, mission_strategic_signals, pipeline_horizon, market_intelligence, engagement_research, engagement_members, etc.). Keep `profiles`, `embeddings` (recreated to V2 shape), pgvector.

Create V2 tables exactly as specified:
- `missions`, `mission_members`, `profiles` (recreate cleanly)
- `mission_review_gates`
- `question_records`, `question_gate_status`, `question_scores`, `question_collaboration`, `question_intelligence`, `question_relationships`
- `alignment_conflicts`, `win_themes`
- `mission_library`, `mission_risks`, `mission_decisions`
- `escalations`, `broadcasts`, `iris_brief_cache`
- `embeddings` (1536 dims, ivfflat)

RLS on every table, scoped via `mission_members`. `handle_new_user` trigger creates profile. GRANTs to authenticated + service_role. Realtime publication for `question_records`, `question_collaboration`, `alignment_conflicts`, `escalations`, `broadcasts`.

## Step 2 — Magic-link auth

- Strip Google OAuth + password flows.
- New `/login` route: email input → `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })`. Show "Check your email" state.
- `_authenticated` layout gates everything (re-validates with `getUser()`).
- Sign-out in sidebar.

## Step 3 — Shell, theme, navigation

- Replace `src/styles.css` tokens with the V2 dark palette (oklch equivalents of the hex values).
- New `__root.tsx` with single `onAuthStateChange` invalidator.
- New left sidebar (`AppSidebar`) with three contexts:
  - HOME → `My Brief`
  - MISSIONS list (live, with health dot) + `New Mission` modal
  - COMMAND CENTER section (Question Health, Alignment Conflicts, Score Dashboard, Pens Down Watch, Broadcasts)
- Sidebar switches to Mission-context nav when inside `/missions/$missionId/*`.
- Delete all `src/routes/_authenticated/*` (old), `src/components/war-room/*`, `src/components/iris/*`, `src/lib/ai/*` (old), `src/lib/iris/*`, old AppSidebar.

## Step 4 — Home / My Brief (`/`)

- Server fn `getMyBriefData` returns role-aware payload: writer = assigned non-green questions, leader = portfolio Red+Yellow.
- Server fn `generateMorningBrief` (stubbed text for now — actual streaming IRIS comes in Step 11). Uses `iris_brief_cache` (30 min TTL).
- Renders greeting, today's questions table (clickable rows → workspace), brief text, regenerate button.

## Step 5 — Mission / Question Command (`/missions/$missionId`)

- Mission header (name, client, days to pens-down, health pill, [+ Add Question], [Upload RFP]).
- Filters: All / Red / Yellow / Green / No Writer / Awaiting SME / Below Standard / Approaching Deadline.
- Sortable question list with all spec fields. Empty state copy from spec.
- Add Question modal. Upload RFP stub (real parser is Step 8).
- Bulk-assign actions: writer, SME, pens-down date.

## Step 6 — Mission / Question Workspace (`/missions/$missionId/questions/$questionId`)

- Two-column layout (60/40 desktop, stacked mobile).
- Left: question detail, requirements, mandatory language, scoring criteria, collaboration panel (typed cards with colors per entry_type), Question Health panel (gate progress, score history, [+ Log Score]).
- Right: Athena Intelligence panel (reads `question_intelligence` cache; "Generate" button stubs IRIS until Step 9), Strategy Alignment panel (related questions, conflicts, link to alignment map modal).
- Alignment map modal: all mission questions grouped by section with relationship lines (SVG), filterable.
- Esc → back to Question Command.
- Modals: Add Note, Log Score, Assign Writer/SME.

## Out of scope this turn (Steps 7–18)

Library page polish, IRIS edge functions (rfp-parser, question-brief, alignment-scan, morning-brief), Command Center pages, Mission Settings, Mission Brief, Broadcasts, batch scoring. Stub buttons will be visible but say "Coming in next phase" where they depend on IRIS or later steps.

## Technical notes

- Stack stays TanStack Start + Supabase (no Edge Functions for app logic; server fns via `createServerFn`). IRIS edge functions in spec will be implemented as TanStack server routes/server fns in later steps.
- Files structured as: `src/lib/missions/*.functions.ts`, `src/lib/questions/*.functions.ts`, `src/lib/iris/*.functions.ts`, `src/components/v2/*`, `src/routes/_authenticated/...`.
- One big SQL migration (will require your approval). Code lands after migration runs.
- Existing data in old tables will be lost — confirming this is acceptable since you chose "Replace entirely".

Approve to proceed, or tell me what to change.