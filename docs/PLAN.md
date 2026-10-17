# Wyndow — Phase 1 implementation plan

Phase 1 turns the clickable prototype into a working app: real Amion shifts synced from the ICS feed, user-defined kinds and rules, focus blocks split across projects, the season, day, projects, and settings views, focus sessions with "where you left off" notes, GitHub issues for ventures, and homeschool async-packet tracking.

Reference material (read before building UI):
- `prototypes/wyndow.html` — behavior of every view (season grid, brushes, block editor, find time, day timeline, sessions, projects, kinds/rules/inbox).
- `prototypes/design-studies.html`, **Study D** ("Console, hairline, dark") — the look. Free time is the light part of each 24-hour day bar; shifts are near-black, recovery a step lighter; project colors glow; the big time readout is near-white; the O in WYNDOW is HAL red `#AB0618`; Snapval/primary blue is `#5991C5`.

Later phases (not now): health and workouts, quote of the day, finances, deeper project management, Wyrkbook API.

## Stack and conventions

- SvelteKit 2, Svelte 5 runes, TypeScript strict, `@sveltejs/adapter-vercel`, npm.
- **One stylesheet: `src/app.css`.** No `<style>` blocks in components, no Tailwind, no CSS-in-JS. Components use descriptive semantic class names. Dynamic colors go through `style="--c: …"` custom properties only. Each feature owns one section of `app.css` between its markers; add rules only there.
- Fonts are self-hosted via `@fontsource/jost`, `@fontsource/michroma`, `@fontsource/ibm-plex-mono` (imported once in the root layout). No external font or script hosts.
- Times display in 24-hour format (`11:00`), matching the hospital schedule.
- Validation with `zod` on every form action and endpoint input.
- Dates in the planner are `LocalDate` strings (`YYYY-MM-DD`) in the user's timezone (`settings.timezone`, default `America/Detroit`). Convert with `Intl.DateTimeFormat`; no date library.
- Tests: Vitest, files named `*.test.ts` next to the code. Definition of done for every task: `npm run check` and `npm test` pass with zero errors, and `npm run build` succeeds.

## Security rules (non-negotiable)

1. **All Supabase access is server-side.** No browser Supabase client, no Supabase env var with a `PUBLIC_` prefix, no keys in client bundles. Pages get data from `load` functions and change it through form actions (`use:enhance`).
2. Session cookies from `@supabase/ssr` are set `httpOnly: true`, `secure: !dev`, `sameSite: 'lax'`, `path: '/'`. Because no browser code needs the token, XSS cannot read it.
3. Identity comes from `supabase.auth.getUser()` (validated by the Auth server) in `hooks.server.ts`, never from `getSession()` alone. The user's email must be in `ALLOWED_EMAILS`; otherwise sign out and reject.
4. Every route requires a signed-in, allowed user except `/login`, `/logout`, and `/api/cron/*`. Redirect targets (`?next=`) must be same-origin relative paths starting with a single `/`.
5. The secret key (`SUPABASE_SECRET_KEY`) is used only in `src/lib/server/supabaseAdmin.ts`, which is imported only by `src/routes/api/cron/**`. Cron routes require `Authorization: Bearer ${CRON_SECRET}` checked with a constant-time compare.
6. Database: schema `wyndow`; RLS enabled **and forced** on every table; policies restrict to `user_id = (select auth.uid())` for the `authenticated` role; `anon` and `public` have no privileges; child rows reference parents with composite `(user_id, id)` foreign keys so a row can only point at the same user's rows. Functions use `set search_path = ''`.
7. SvelteKit CSRF origin checking stays on (the default). CSP is configured in `svelte.config.js`; do not loosen it. `hooks.server.ts` also sets `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
8. The ICS URL is a secret. It is stored in the database, fetched only on the server, and never sent to the browser in full (show a masked form such as `amion.com/…/773739.ics`). Fetching: `https:` only, no IP-literal or `localhost` hosts, 15 s timeout, 2 MB cap.
9. `GITHUB_TOKEN` is read only on the server. Error messages shown to the user never include tokens, URLs with secrets, or raw stack traces.

## Environment (`.env`, git-ignored)

| Name | Use |
|---|---|
| `SUPABASE_URL` | Project URL (server only) |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…`, used by the per-request server client |
| `SUPABASE_SECRET_KEY` | `sb_secret_…`, cron routes only |
| `ALLOWED_EMAILS` | Comma-separated sign-in allowlist |
| `CRON_SECRET` | Bearer token Vercel cron sends |
| `GITHUB_TOKEN` | Optional fine-grained read-only token for issues |

Read them with `$env/dynamic/private` inside `src/lib/server/env.ts` only, which exports a typed, validated object.

## Database (schema `wyndow`)

The Dev Supabase project is shared with other apps, and its migration history already holds their migrations. **Do not use `supabase db push`, `db reset`, or `migration repair`.** Keep SQL in `supabase/wyndow/NNNN_name.sql` and apply each file with `supabase db query --linked -f <file>`. Generate types with `supabase gen types typescript --linked --schema wyndow > src/lib/types/database.ts`.

Every table has `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade` and `unique (user_id, id)` where children reference it.

- `settings` — `user_id` PK; `timezone text default 'America/Detroit'`; `block_hours numeric(3,1) default 2 check (block_hours between 0.5 and 8)`; `chunk_min_hours numeric(3,1) default 3`; `school_days smallint[] default '{1,2,3,4,5}'`; `created_at`, `updated_at`.
- `kinds` — `id uuid pk default gen_random_uuid()`; `name text not null check (length between 1 and 60)`; `color text check (color ~ '^#[0-9a-fA-F]{6}$')` null for built-ins; `focus_hours numeric(3,1) not null default 0 check (0..16)`; `focus_start time null`; `school_mode text not null default 'live' check in ('live','async')`; `next_day_kind_id uuid null` (composite FK to `kinds`, on delete set null); `builtin text null check in ('open_weekday','open_weekend')`, `unique (user_id, builtin)`; `sort int default 0`.
- `calendar_sources` — `id`; `name text not null`; `ics_url text not null check (ics_url ~ '^https://')`; `last_synced_at timestamptz`; `last_error text`; `created_at`.
- `calendar_events` — `id`; `source_id` (composite FK, on delete cascade); `uid text not null`; `title text not null`; `description text`; `starts_at timestamptz`; `ends_at timestamptz`; `all_day_start date`; `all_day_end date` (exclusive); `updated_at`; `unique (source_id, uid)`; check that either `starts_at` or `all_day_start` is set. Index on `(user_id, starts_at)` and `(user_id, all_day_start)`.
- `rules` — `id`; `source_id uuid null` (composite FK, cascade); `match text not null default 'equals' check in ('equals','prefix')`; `pattern text not null check (length between 1 and 120)`; `kind_id uuid not null` (composite FK, on delete **cascade**, so deleting a kind returns its titles to the inbox); `priority int default 0`; unique `(user_id, source_id, match, pattern)` with nulls not distinct.
- `projects` — `id`; `name text not null`; `color text not null` (hex check); `area text not null check in ('venture','family','homeschool')`; `github_repo text null check (github_repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')`; `milestone text`; `blocks_done int not null default 0 check (>= 0)`; `archived boolean default false`; `sort int default 0`.
- `block_allocations` — `user_id`; `day date`; `block_index smallint check (>= 0 and < 16)`; `project_id uuid not null` (composite FK, cascade); PK `(user_id, day, block_index)`.
- `focus_sessions` — `id`; `project_id` (composite FK, cascade); `day date not null`; `started_at timestamptz not null default now()`; `ended_at timestamptz`; `note text check (length <= 2000)`. At most one open session per user: partial unique index on `(user_id) where ended_at is null`.
- `classes` — `id`; `name text not null`; `student text not null`; `wyrkbook_ref text`; `current_unit text`; `packets_ready int not null default 0 check (>= 0)`; `sort int default 0`.
- Function `wyndow.ensure_defaults()` — `security invoker`, `set search_path = ''`; for `auth.uid()` inserts (on conflict do nothing) the settings row, the two built-in kinds (`Open weekday`: 4 h from 11:00, live; `Open weekend`: 2 h from 14:00, live), and a `Family` project (area `family`, color `#B59CFF`) if the user has none. Execute granted to `authenticated` only.
- Grants: `usage` on schema and `select, insert, update, delete` on all tables to `authenticated`; all to `service_role`; nothing to `anon` or `public`; matching `alter default privileges`.

**Manual step for the owner:** in the Supabase dashboard, add `wyndow` to *Settings → Data API → Exposed schemas*. The app cannot reach the tables until this is done.

## Planner core (`src/lib/planner`)

Pure TypeScript, no I/O, fully unit-tested. Types are in `src/lib/planner/types.ts` (the contract; do not change without coordinating). Modules and exports:

- `dates.ts` — `addDays(d, n)`, `weekdayOf(d): IsoWeekday`, `eachDate(from, to)` (inclusive), `mondayOf(d)`, `todayIn(tz)`, `zonedParts(instant: Date, tz): { date: LocalDate; minutes: Minutes }`, `formatTime(m): 'HH:MM'`, `parseTime('HH:MM'): Minutes`.
- `rules.ts` — `matchRule(title, sourceId, rules): Rule | null`. Equals beats prefix; then higher priority; then longer pattern; source-specific beats global.
- `days.ts` — `buildDays({ from, to, events, rules, kinds, settings }): Days`.
  - Each event is clipped onto every local date it touches (`DayEvent.startsToday` is true only on its start date). All-day events cover `[allDayStart, allDayEnd)`; a missing end means one day.
  - Day kind: candidates are the kinds of events that **start** that day, plus `derivedKindIds` (the `nextDayKindId` of kinds that governed the previous day). If any starting event has no matching rule, `kindId = 'unrecognized'`. With no candidates, use the built-in `open_weekend` kind on Saturday/Sunday and `open_weekday` otherwise. Otherwise pick the candidate with the fewest `focusHours` (ties: first).
  - `focusHours` from the kind (0 when unrecognized); `focusWindow` starts at `focusStart ?? 11:00`; `blocks = floor(focusHours / blockHours)`; `looseHours = focusHours - blocks * blockHours`.
  - `school`: `null` if the weekday is not in `settings.schoolDays`; `'unknown'` if unrecognized; `'async'` if any candidate kind is async; else `'live'`.
  - `segments` for the 24-hour bar: an event clipped to the day whose kind has `focusHours === 0` → `shift`; a timed event whose kind has `focusHours > 0` → `oncall`; all-day events with focus time → none; unmatched events → `unknown`. If the day has a derived kind, add `recovery` from the end of that day's last shift segment (or 00:00) to 22:00.
- `blocks.ts` — `fitAllocation(day, stored?): Allocation` (resize to `day.blocks`, padding with null), `blockWindow(day, index, settings): Window`, `allocationSpans(day, alloc, settings): { start; end; projectId: string | null; blocks: number }[]` (merges consecutive equal entries).
- `queries.ts` —
  - `nextChunk({ days, allocations, settings, from, nowMinutes?, familyIds }): Chunk | null` — first run of consecutive non-family blocks totaling at least `chunkMinHours`; on `from`, ignore blocks that end before `nowMinutes`.
  - `findTime({ hours, projectId, by, from, days, allocations, settings, familyIds }): FindTimeResult` — blocks assigned to `projectId` first (any non-family project when `projectId` is null), then open blocks, earliest first, until `hours` is covered.
  - `forecast({ projectId, remainingBlocks, days, allocations, from }): Forecast`.
  - `suggestStretches({ days, from, to, ventureIds, familyId }): Allocations` — runs of consecutive days with blocks; a run with at least 3 blocks goes to the next venture in rotation; open-weekend days go to family.
  - `weekFocusHours(days, monday)` and `weekMode(hours): 'sprint' | 'steady' | 'keep-alive'` (≥ 16 sprint, ≤ 6 keep-alive).
  - `schoolDaysAhead(days, from, count): LocalDate[]` and `asyncDaysAhead(days, from, count)`.
- `index.ts` re-exports everything.

ICS parsing lives in `src/lib/server/ics.ts`: `parseIcs(text): ParsedEvent[]` with `{ uid, title, description, start, end, allDayStart, allDayEnd }`, using `ical.js`. Handles UTC times, `TZID` times, `VALUE=DATE` all-day events with or without `DTEND`, and skips (with a count) recurring events and events without `UID`. Rejects input over 2 MB.

## Server layer

- `src/lib/server/env.ts` — validated env (shell task).
- `src/lib/server/supabase.ts` — `createSupabaseServerClient(event)` typed `SupabaseClient<Database, 'wyndow'>` (shell task).
- `src/lib/server/supabaseAdmin.ts` — admin client, cron only (shell task).
- `src/lib/server/db/*.ts` — typed repository functions that take the per-request client and return planner types (database task). One file per table group: `settings.ts`, `kinds.ts`, `rules.ts`, `sources.ts` (never returns `ics_url` except `getSourceUrl`), `events.ts`, `allocations.ts` (`setDayAllocation` replaces all rows for a day), `projects.ts`, `classes.ts`, `sessions.ts` (`startSession`, `endSession`, `activeSession`, `latestNotes`), `defaults.ts` (`ensureDefaults`), and `index.ts`.
- `src/lib/server/context.ts` — `loadPlannerContext(locals, { from, to })` returns settings, kinds, rules, events, projects, allocations, `days`, `familyIds` (integration step, written before the view tasks start).
- `src/lib/server/sync.ts` — `syncSource(client, source)` fetches, parses, upserts events by `(source_id, uid)`, deletes events no longer in the feed within the feed's date span, and records `last_synced_at` / `last_error` (settings task).
- `src/lib/server/github.ts` — open issues for `owner/name` with `GITHUB_TOKEN`; reads `size:N` (default 1) and `deep` / `shallow` labels; 5-minute in-memory cache (projects task).

## Routes

| Route | Owner task |
|---|---|
| `/login`, `/logout`, `/` (redirect to `/season`), root layout, `+error.svelte` | shell |
| `/season` | season |
| `/day`, `/day/[date]`, and the root layout's next-chunk readout | day |
| `/projects` | projects |
| `/settings`, `/api/cron/sync-ics`, `vercel.json` | settings |

Shared components in `src/lib/components` (shell task): `DayBar.svelte` (vertical 24-hour capsule: segments plus colored block spans, with `today`, `past`, `selected` states), `DayStrip.svelte` (horizontal 24-hour bar with ticks 00/06/12/18/24 and an optional red now-marker), `Swatch.svelte`.

## Task waves

- **Wave 0 (lead):** scaffold, dependencies, configs, this plan, `planner/types.ts`, `app.css` tokens and section markers.
- **Wave 1 (parallel):** shell and security; database and repository layer; planner core and ICS parser.
- **Integration (lead):** `context.ts`, run check/test/build, seed the owner's starting kinds, rules, projects, and classes after first sign-in.
- **Wave 2 (parallel):** season; day; projects; settings and sync.
- **Final (lead):** end-to-end run, Supabase security advisors, review, setup notes.
