## ATLAS Threads — MVP

Object-anchored internal commenting on writing assignments (= `question_records`). Right-side panel, @mentions, @IRIS replies, resolve. Polymorphic schema, but only `question_record` is wired into UI for v1.

### What ships

- Persistent **"Athena internal — not visible to clients"** label at the top of every thread (non-dismissible).
- **First-use modal**: "Comments in ATLAS are internal to Athena…" dismissed with "Understood"; dismissal logged to `profiles.has_acked_threads_internal_at`.
- **Thread panel** (right-side drawer) on each question. Comments newest-at-bottom. Shows avatar, name, role, timestamp, body.
- **@mention picker** — live search of active ATLAS users; notifies them and adds to mentions table.
- **@IRIS** — typing `@IRIS` triggers a server-side IRIS query against current mission context; response posted as a reply labeled "IRIS reply" (read-only, `is_iris_reply = true`). All queries logged.
- **Resolve / Reopen** any thread (any participant). Resolved threads collapse with badge + resolver name. "Show resolved" toggle keeps them accessible.
- **Retires Signals** — `signal_threads`, `signal_messages`, `signal_thread_participants`, `signal_pins` are dropped (0 rows in DB, only used in unused `signals.functions.ts` and the `/signals` route). The `/signals` page is removed and the sidebar link goes away.

### Explicitly deferred (schema-ready, no UI)

Inline anchoring (`anchor_text`, `anchor_offset` columns added now), version tagging (`version_tag` added now), checkmark reactions, mentions inbox, status transitions (Submit for review / Send back), comment deletion log (`is_deleted`/`deleted_by`/`deleted_at` columns added now). These ship in follow-up cuts without further migrations.

### Where it appears (v1)

Only on `src/routes/_authenticated/missions/$missionId/questions/$questionId.tsx` — a "Threads" button in the page header opens the right-side panel. Schema supports `deliverable | iris_output | milestone` for later.

---

## Technical detail

### Migration (one batch)

Drop unused Signals tables (and `signals.functions.ts` consumers):

```text
DROP TABLE signal_pins, signal_messages, signal_thread_participants, signal_threads CASCADE;
DROP FUNCTION is_signal_thread_participant, signal_messages_bump_thread;
```

Create:

```text
threads(id, object_type enum, object_id uuid, mission_id uuid, created_by, created_at)
  UNIQUE(object_type, object_id)
  object_type enum: 'question_record' | 'deliverable' | 'iris_output' | 'milestone'

comments(id, thread_id, author_id, body text, is_iris_reply bool default false,
         anchor_text varchar(500) null, anchor_offset int null,
         version_tag varchar(20) null,
         is_deleted bool default false, deleted_by uuid null, deleted_at ts null,
         created_at)
  CHECK length(body) BETWEEN 1 AND 4000
  INDEX(thread_id, created_at)

mentions(id, comment_id, mentioned_user uuid, is_iris bool default false,
         is_read bool default false, created_at)
  INDEX(mentioned_user, is_read)

comment_resolutions(thread_id PK, resolved_by, resolved_at,
                    reopened_by null, reopened_at null)

profiles.has_acked_threads_internal_at  TIMESTAMPTZ null
```

Security definer helper:

```text
has_thread_access(p_thread_id uuid, p_user uuid) returns bool
  -- admin OR mission_member(thread.mission_id, p_user)
```

RLS (all tables): `SELECT/INSERT/UPDATE` gated by `has_thread_access`. `mentions.SELECT` additionally allows `mentioned_user = auth.uid()`. Grants: `SELECT, INSERT, UPDATE ON ... TO authenticated; ALL TO service_role`. No `anon`.

### Server functions (`src/lib/threads.functions.ts`)

All `.middleware([requireSupabaseAuth])`:

- `getOrCreateThread({ objectType, objectId })` — derives `mission_id` (for `question_record`, joins `question_records`), upserts thread row, returns thread + resolution state.
- `listComments({ threadId, includeResolved })` — joins author profile (name, avatar, role) + mentions.
- `postComment({ threadId, body, mentions: uuid[], mentionsIris: bool })` — inserts comment + mention rows; if `mentionsIris`, fires `composeIrisReply` synchronously (uses existing `iris_brief_cache` for mission; falls back to a short Lovable AI call) and inserts a second comment with `is_iris_reply = true, author_id = SERVICE_BOT_ID`. Logs `olympus_audit_log` row `action_type='iris_thread_query'`.
- `resolveThread({ threadId })` / `reopenThread({ threadId })`.
- `searchUsers({ q })` — `profiles` ilike, capped at 8.
- `ackThreadsInternalNotice()` — sets `profiles.has_acked_threads_internal_at = now()`.

### IRIS reply (MVP)

Calls Lovable AI gateway (`google/gemini-2.5-flash`) with a tight system prompt + the cached mission DNA (`mission_intelligence_dna`) + the question text. Times out at 25s; on failure posts a comment "IRIS couldn't respond — try @-mentioning a teammate." Author shown as **IRIS** with the existing iris-dot styling, read-only in UI (no edit/delete affordance).

### UI components

```text
src/components/threads/
  ThreadPanel.tsx       (right-side Sheet drawer)
  CommentList.tsx       (groups Resolved vs Active; "Show resolved" toggle)
  CommentItem.tsx       (avatar/role/timestamp/body; IRIS variant)
  CommentComposer.tsx   (textarea with @-trigger; uses COMMENT_PLACEHOLDER)
  MentionPicker.tsx     (popover; live search; @IRIS pinned at top when mission has DNA)
  ThreadsInternalAckModal.tsx  (one-time, gated by profile flag)
```

Reuses existing `CommentPanelChrome.tsx`:
- `<CommentPanelLabel />` at top of `ThreadPanel`.
- `COMMENT_PLACEHOLDER` in composer.
- `CommentPanelFirstNotice` replaced by `ThreadsInternalAckModal` (DB-backed instead of localStorage — spec says dismissal is logged).

### Wiring

`src/routes/_authenticated/missions/$missionId/questions/$questionId.tsx`:
- Add "Threads" button in the page header with unread-mentions dot.
- Drawer mounts `<ThreadPanel objectType="question_record" objectId={questionId} />`.

`src/components/v2/AppShell.tsx`:
- Mount `<ThreadsInternalAckModal />` globally (renders only if profile flag is null AND the user opens a thread panel — controlled via a tiny zustand-free local trigger).

### Cleanup

- Delete `src/lib/signals.functions.ts`, `src/components/signals/*`, `src/routes/_authenticated/signals.tsx`.
- Remove Signals from sidebar nav in `AppShell.tsx`.

### Naming guardrails (enforced in code + UI strings)

Feature = **Threads** · item = **comment** · anchored = **inline comment** · IRIS = **IRIS reply**. Lint-style: I'll grep for "chat|message|conversation|approve|reject" in new files before shipping.

---

## Order of operations

1. Migration (drop Signals; create threads/comments/mentions/resolutions + helper + RLS + grants + profile flag).
2. Delete Signals code + sidebar entry.
3. `threads.functions.ts` + IRIS reply helper.
4. `ThreadPanel` + sub-components + ack modal.
5. Wire button into question route.
6. Smoke test: post comment, @mention teammate, @IRIS, resolve, reopen.
