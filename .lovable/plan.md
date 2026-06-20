# IRIS Studio — Phase 1 Build Plan

You chose **(a) full scaffold first** + **secure server-side** ElevenLabs. Before I spend hours building, I want to lock the scope of the scaffold tabs, because your spec only fully details two of them.

## What this plan delivers

A working `/admin/iris-studio` page with five tabs, real ElevenLabs voice via a server function (key never touches the browser), and the language-enforcement system wired into every IRIS AI prompt.

## Tabs in IRIS Studio

```text
┌──────────────────────────────────────────────────────────────┐
│ Brief Settings │ Language & Inclusion │ Evaluator │ Voice │ … │
└──────────────────────────────────────────────────────────────┘
```

1. **Brief Settings** — scaffold only (mission picker + 3 placeholder fields: brief tone, length cap, citation density). Saves to `mission_iris_config`.
2. **Language & Inclusion** — full build per spec: 28 person-first pairs, 8 cultural standards, NJ state terminology, Language Audit.
3. **Evaluator Persona** — scaffold only (3 placeholder fields: persona name, lens, priorities). Saves to `mission_iris_config`.
4. **Voice Studio** — full build per spec: voice library grid, model selector, 5 character controls, streaming toggle, Test IRIS Voice.
5. **Personality** — scaffold only (tone slider, formality slider).

The three "scaffold only" tabs render real controls bound to columns, but aren't the focus — you can flesh them out in a later prompt.

## Database (one migration)

New table `mission_iris_config` with the columns from your spec plus scaffold fields for the other tabs. Standard RLS scoped by mission membership, GRANTs to authenticated + service_role.

## ElevenLabs — secure architecture

```text
Browser  ──(POST)──►  /api/iris/voices            (server fn, lists voices)
Browser  ──(POST)──►  /api/iris/tts               (server fn, returns audio/mpeg)
                            │
                            └─► ElevenLabs API with ELEVENLABS_API_KEY (server env)
```

- One secret: `ELEVENLABS_API_KEY` added via Lovable Cloud (server-side only).
- A `voiceConfigured` server fn returns `{ configured: boolean }` so the UI shows the green/amber banner without ever shipping the key.
- Read-aloud in IRIS Chat goes through the same `/api/iris/tts` route.

## Files I'll create

- `supabase/migrations/...mission_iris_config.sql`
- `src/lib/iris-voice.functions.ts` — `listVoices`, `synthesizeSpeech`, `isVoiceConfigured`
- `src/lib/iris-config.functions.ts` — `getIrisConfig`, `updateIrisConfig`
- `src/lib/iris/language-prompt.ts` — `buildLanguagePrompt(config)` (pure)
- `src/lib/iris/default-person-first.ts` — the 28 default pairs
- `src/routes/_authenticated/admin/iris-studio.tsx` — page with tabs
- `src/components/iris-studio/{BriefSettingsTab,LanguageInclusionTab,EvaluatorPersonaTab,VoiceStudioTab,PersonalityTab}.tsx`
- `src/components/iris-studio/{VoiceCard,LanguagePairTable,LanguageAuditModal}.tsx`

## Files I'll modify

- `src/components/dev/DevToolsPanel.tsx` — add "Language Audit →" quick action
- IRIS Chat component — add Read Aloud toggle (hidden when not configured)
- IRIS brief generation server fn(s) — append `buildLanguagePrompt(config)` to system prompt

## Out of scope for this build

- Custom voice cloning (you marked it "Coming Soon")
- Fleshing out Brief Settings / Evaluator Persona / Personality tabs beyond skeleton
- Storing audit results in DB (spec says ephemeral)
- Connecting to a real ElevenLabs connector (using direct API + secret, per spec; can swap later)

## Confirm before I start

1. **Where does IRIS Chat live?** I'll search the codebase, but if you know the component name (e.g. `IrisChat`, `AskIrisPanel`), say so to save me a round trip.
2. **Mission selector in IRIS Studio**: should the page default to the currently-selected mission from your global mission picker, or always show a dropdown at the top?
3. **OK to add the `ELEVENLABS_API_KEY` secret now?** I'll prompt for it via `add_secret` once you approve.

Reply "go" to execute, or adjust any of the above.