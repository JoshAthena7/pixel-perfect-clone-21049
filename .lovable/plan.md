
## Phone a Friend — Flight Deck Upgrade

Phone a Friend already exists as a slim overlay (`PhoneAFriendOverlay`) that picks an expert and logs a `question_collaboration` row. We will turn it into the full 3-step IRIS-drafted consult flow you described, add a contextual entry on each reconciliation row, add status tracking on Flight Deck, and give the expert an Atlas inbox to respond in.

---

### 1. Data model (1 migration)

New table `expert_consults` — one row per Phone a Friend request.

```text
expert_consults
  id uuid pk
  mission_id uuid → missions
  question_id uuid null → question_records       -- null = global / section-level
  section_id uuid null → mission_sections
  requested_by uuid → auth.users
  expert_user_id uuid null → auth.users          -- internal SME
  external_expert_id uuid null → expert_directory  -- curated external
  urgency text  ('urgent' | 'standard' | 'fyi')
  ask_subject text
  ask_body text                                  -- IRIS-drafted, user-edited
  context_snapshot jsonb                         -- PRISIM ctx, point weight, due, draft-so-far
  status text  ('sent' | 'acknowledged' | 'needs_info' | 'reassigned' | 'responded' | 'closed')
  response_body text null
  response_at timestamptz null
  created_at / updated_at
```

New table `expert_directory` — curated external expert network.

```text
expert_directory
  id uuid pk
  name, title, org, email, domain_tags text[], states text[],
  programs text[], avg_response_hours int, notes, active bool
```

RLS: mission members read/write consults on missions they belong to; `expert_directory` is admin-managed, readable by all authed users. Both get the standard GRANT block.

Realtime publication added for `expert_consults` so the Flight Deck status panel and the expert's inbox both live-update.

### 2. Server functions (`src/lib/expert-consult.functions.ts`)

- `buildConsultDraft({ missionId, questionId? })` — pulls question text, section, point weight, PRISIM signal map data, due date, current draft (latest `question_records.draft_text`), then calls Lovable AI Gateway (`google/gemini-3-flash-preview`, `Output.object` schema) to produce `{ subject, body, suggested_urgency }`. Used to pre-fill Step 3.
- `matchExpertsRich({ missionId, questionId? })` — extends existing `matchExperts` to also return external directory matches (tag overlap on `domain_tags` / state / program), with availability and response history.
- `sendConsult({ ...full ask })` — inserts `expert_consults` row (status=`sent`), writes a `signals` + `question_collaboration` entry so it surfaces on ATC and the question thread.
- `respondToConsult` / `ackConsult` / `requestMoreInfo` / `reassignConsult` — used by the expert from their inbox; on `responded` it also appends the response to the question's `comments` thread so it lands in the reconciliation row.

All protected with `requireSupabaseAuth`.

### 3. UI — three steps in the upgraded overlay

Replace `src/components/v2/PhoneAFriendOverlay.tsx` with a 3-step wizard (keep the component name and existing call sites so nothing breaks):

**Step 1 — Context.** When opened from a row: header shows `Q{number} · {section} · {points} pts · due {date}`, PRISIM signal chips (intent divergence, evaluator-layer notes, CMS alignment), and a "Draft so far" preview. When opened globally: dropdown "Consult about…" lists open questions grouped by section, plus a "General consult" option.

**Step 2 — Expert match.** Two tabs: **Internal SMEs** (existing matcher) and **Expert Network** (new directory). Each card: avatar/initials, name, title, domain chips, availability dot, "avg reply in 4h" badge. IRIS-recommended card pinned on top with the existing "IRIS Recommends" treatment. "Browse full roster" expands the list.

**Step 3 — IRIS-drafted ask.** Auto-populated subject + body from `buildConsultDraft`, editable. Shows the structured ask blocks: what & why · PRISIM context · due/urgency selector · draft-so-far (collapsible) · the specific question. Send button writes the consult.

### 4. Flight Deck wiring

- **Global button:** add a "Phone a Friend" pill in the Flight Deck header next to "Back to Mission Command" — opens the wizard with no `questionId`.
- **Row button:** in the reconciliation table inside `FlightDeck.tsx`, add a small phone icon per row that opens the wizard pre-bound to that `questionId`.
- **Active Consults panel:** new section on Flight Deck below ATC titled "Open Consults", driven by a query on `expert_consults` filtered to this mission, status ≠ `closed`. Columns: Q#, Expert, Status pill, Age, "Open". Realtime subscribed.

### 5. Mission Intelligence Graph indicator

`question_records` nodes already render on the graph. The graph card reads `expert_consults` and overlays a small "Pending Expert Input" dot (amber) when a consult is open for that question, switching to green check when the latest consult for that question is `responded`.

### 6. Expert inbox (Atlas)

New route `src/routes/_authenticated/inbox.tsx`:
- Lists `expert_consults` where `expert_user_id = auth.uid()` grouped by status.
- Detail view shows the full structured ask, the linked question, a response composer, and three secondary actions: **Need more info**, **Suggest a different expert** (opens a small SME picker), **Close**.
- Submitting a response writes back to `expert_consults.response_body`, status=`responded`; a trigger (or the server fn) also writes the response into the question's `comments` thread so it lands in the reconciliation row, and into Vault as a Tier-2 record via the existing `mission_vault_documents` path (`source_type='expert_consult'`).
- Add an unread badge to the global nav for the inbox.

### 7. Notifications

- In-app: a toast + a row in an existing notifications mechanism when a consult lands in someone's inbox (we'll reuse `signals` of type `expert_consult` since there is no dedicated notification table).
- No email in v1 unless you want it — say the word and I'll add it via the existing email queue.

---

### Out of scope for this pass

- Editing the curated `expert_directory` from the UI (seed a few rows in the migration; admin CRUD page can be a follow-up).
- SLA enforcement / auto-escalation when an expert doesn't reply.
- SMS / Slack notifications.

---

### Open questions before I build

1. **External expert directory** — should this be seeded empty (admins add later) or do you want me to scaffold an admin CRUD page for `expert_directory` in this same pass?
2. **Expert inbox location** — top-level `/inbox` route, or nested under `/atrium`? (Atrium already exists.)
3. **Auto-close** — when the requester accepts a response, should the consult auto-close, or do you want an explicit "Mark Resolved" by the requester?

Tell me how to resolve those three and I'll ship it.
