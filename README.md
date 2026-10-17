# Wyndow

A personal planner built around irregular shifts: a season view of 24-hour day bars, focus blocks split across projects, a day timeline with focus sessions and "where you left off" notes, GitHub-backed venture projects, and homeschool async-packet tracking.

SvelteKit 2 (Svelte 5, TypeScript) on Vercel, Supabase (schema `wyndow`) for auth and data. See [docs/PLAN.md](docs/PLAN.md) for architecture, security rules, and the data model, and `prototypes/` for the original clickable prototype and design studies.

## Setup

1. `npm install`
2. `.env` (git-ignored) needs:
   - `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
   - `ALLOWED_EMAILS` — comma-separated emails allowed to sign in (the app refuses to start without it)
   - `CRON_SECRET` — at least 16 characters; Vercel cron sends it as a bearer token
   - `GITHUB_TOKEN` — optional fine-grained token on your venture repos with *Issues: read and write* (and *Metadata: read*)
3. Supabase dashboard (Dev project):
   - *Settings → Data API → Exposed schemas*: add `wyndow`.
   - *Authentication → Users*: make sure your allowed email has a password user.
4. `npm run dev`, sign in, then in **Settings** add your calendar feed (ICS URL) and assign kinds to the event titles in the inbox.

## Project boards

Ventures with a GitHub repo get a board page (`/projects/<id>`). GitHub stays the source of truth:

- **Milestone** — link an existing GitHub milestone or create one from Wyndow; its due date drives the burndown.
- **Board** — Backlog (open, no status label), Next (`status:next`), Doing (`status:doing`), Done (closed). Moving a card edits the labels or closes/reopens the issue. "Won't do" closes as *not planned*, which removes the work from scope.
- **Sizes** — `size:N` labels (blocks, default 1); `deep` / `shallow` mark depth. Wyndow creates its labels on first use and leaves every other label alone.
- **Burndown** — blocks left per day since the milestone was created, with a projected line that follows the blocks painted for the project on the Season view.
- The Day view lists a project's Doing cards on its focus blocks and on a running session.

## Database

SQL lives in `supabase/wyndow/` and is applied in order with `supabase db query --linked -f <file>`.
The Dev project's migration history belongs to other apps, so never use `supabase db push`, `db reset`, or `migration repair` here.
Regenerate types after schema changes: `supabase gen types typescript --linked --schema wyndow > src/lib/types/database.ts`.

## Scripts

- `npm run dev` — dev server
- `npm run check` — type check
- `npm test` — unit tests (Vitest)
- `npm run build` — production build (Vercel adapter)

## Deploying to Vercel

Set the same environment variables in the Vercel project. `vercel.json` schedules a daily calendar refresh at 09:00 UTC (`/api/cron/sync-ics`); Hobby plans allow daily crons only. No Supabase redirect URLs are needed, because sign-in is email and password.
