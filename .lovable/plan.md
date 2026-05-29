# Writer/SME Portal — Full Build Plan

Five phases. Each is independently shippable; I'll execute in order and only continue after the migration in Phase 1 is approved.

## Phase 1 — Database schema (one migration)

New tables (all with grants + RLS scoped to engagement membership; writes limited to leadership where noted):

- **`heatmap_sections.instructions`** — new `text` column. Lead-editable, member-readable (existing RLS already covers it).
- **`section_assignments`** — `engagement_id`, `section_id` (→ heatmap_sections), `user_id`, `status` (`Not Started`/`In Progress`/`Under Review`/`Complete`), `due_date`, `word_count_min`, `word_count_max`. Leads CRUD; writer can update only `status` on their own row.
- **`win_themes`** — `engagement_id`, `title`, `description`, `section_names text[]`. Leads CRUD, members read.
- **`faqs`** — `engagement_id`, `question`, `answer`, `sort_order`. Leads CRUD, members read.
- **`work_log`** — `engagement_id`, `user_id`, `description`, `section`, `time_spent`. Writer reads/writes only their own rows.
- **`writer_last_seen`** — `engagement_id`, `user_id`, `last_seen_at`, `streak_count`, `streak_last_day`. Writer reads/writes only their own row.
- **`win_of_the_day`** — `engagement_id`, `title`, `body`, `posted_by_name`, `posted_at`. Leads write, members read; UI shows entries from last 24 h.

Realtime publication added for `section_assignments` (for milestone triggers) and `broadcasts` (already may be there — will check).

Milestone-trigger logic for 25/50/75/100% Complete is computed **client-side** on the writer progress page (compare current % to a `localStorage` "last celebrated %" so confetti+broadcast fire once per threshold per device). Auto-broadcast is inserted by whichever writer's client crosses the threshold, with `author_name = 'War Room'` and a pinned flag. Simple and avoids needing a server trigger.

## Phase 2 — Role gate

`useEngagement` already exposes `member.role`. Add `isWriter`/`isLeadership` helpers and a small `RoleGate` component:

- `/writer/*` routes — wrapped in `WriterLayout`; if `isLeadership`, `<Navigate to="/command-center" />`.
- Lead routes (`/command-center`, `/heatmap`, `/risks`, `/sos`, `/decisions`, `/broadcasts`, `/intel`, `/pulse`, `/snapshots`, `/huddle`, `/assistant`, `/team`, `/settings`) — wrapped via a `LeadGate` in `_authenticated.tsx`'s outlet; if `isWriter`, redirect to `/writer/my-sections`.
- `src/routes/index.tsx` — after auth, send writers to `/writer/my-sections`, leads to `/command-center`.

Since `useEngagement` is a React context (not router context), gating happens in component-level effects with `<Navigate>`, matching the repo's existing auth pattern.

## Phase 3 — Writer portal shell

New `src/components/war-room/WriterLayout.tsx` rendered from a new pathless route `src/routes/_authenticated/writer/route.tsx` (using `__root.tsx`-style layout file: `writer.tsx` with `<Outlet/>`).

Pieces:

- **`TMinusStrip`** — full-width gold-accent bar; days to `engagement.submission_date`.
- **`DailyQuote`** — array of 20 quotes in `src/lib/quotes.ts`; index = day-of-year mod 20. Centered, italic, muted.
- **`SinceLastSeenStrip`** — queries 4 sources where `created_at > last_seen_at`: broadcasts, decisions (filtered by writer's section_names), risks (same), `engagement_pulses` recognitions where the writer is the member. Hidden when zero. Updates `last_seen_at` 5 seconds after mount (so the strip stays visible during the session).
- **`WriterContactBar`** — fixed bottom; uses existing `get_engagement_member_contacts` RPC; renders engagement_lead (left) and pm (right) with `mailto:` and `tel:` buttons. Compact, dark, full-width.
- **`WriterSidebar`** — extended with new nav entries per spec; "Go to Talent Desk" already present and pinned.
- **`WinOfTheDayBanner`** — appears at top of writer layout when a `win_of_the_day` row exists < 24 h old.

## Phase 4 — Writer pages

New routes under `src/routes/_authenticated/writer/`:

1. **`my-sections.tsx`** — only the writer's assignments. Card = name + status badge + due date + brief (or "Brief coming soon"). Status select; choosing **Complete** opens a `Dialog` with the 4-checkbox checklist. On confirm: fire 2-second confetti (using `canvas-confetti` — needs install) → update status. Streak counter top-right ("Day X 🔥"). Indiana trivia card below the since-last-seen strip; reveals correct answer + 2-sentence fact on click; one question per day from `src/lib/trivia.ts`.
2. **`win-themes.tsx`** — list + section filter dropdown.
3. **`work-log.tsx`** — form + list scoped via RLS to `user_id = auth.uid()`.
4. **`progress.tsx`** — aggregate status counts from `section_assignments`, progress bar per status, **Wall of Win milestone bar** with 25/50/75/100% checkpoints (lit-up badge once reached), `WinOfTheDayBanner` if active, full-page confetti burst when % Green crosses a new threshold.
5. **`recognition-feed.tsx`** — entries from `engagement_pulses` newest first; shows `last_recognition_note` + member display_name. (Recognition currently writes to one row per member with `star_count`; I'll display rows where `last_recognition_note` is non-null and order by `updated_at`.)
6. **`faq.tsx`** — searchable Q&A.

Existing writer pages (`broadcasts`, `decisions`, `intel-library`, `submit-risk`, `submit-sos`, `team`) are kept as-is. `team.tsx` will be trimmed to only show name/email/phone if it shows more.

## Phase 5 — Lead-side additions

- **Heatmap section detail** — add `instructions` textarea (find existing component, add field).
- **`/win-themes`** — leads CRUD page in command center; new entry in `AppSidebar` under Intel group.
- **`/faq`** — leads CRUD page; new entry under Intel.
- **`/win-of-the-day`** — small lead-only "post" UI (could live on command center page as a quick-post card, or its own page). I'll add a quick form on the existing `/recognition` or `/command` page — simplest: a card on the command center.
- **`/section-assignments`** — leads need a way to assign writers to sections. Minimal admin UI: a page where leads pick a section and assign user_ids from `engagement_members` with a due date.
- **"Go to Talent Desk"** added to bottom of `AppSidebar`.

## Dependencies

- `canvas-confetti` — `bun add canvas-confetti @types/canvas-confetti`.

## What I'm intentionally NOT building (flag if you want them)

- Server-side milestone triggers / pg cron / push notifications. Client-side localStorage gate handles "once per browser" celebrations; broadcast row is the cross-user signal.
- Email/SMS on risk/SOS — existing Slack notify is kept.
- Per-writer recognition filter — feed shows team-wide as spec requires.
- Trivia analytics/tracking — daily reset only, no history.

## Approve to proceed

Reply **"go"** and I'll execute Phase 1 (migration) first for your approval, then continue through 2–5.