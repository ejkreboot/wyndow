# Wave 2 brief (shared by the season, day, projects, and settings tasks)

Read first: docs/PLAN.md, src/lib/planner/types.ts, src/lib/planner/index.ts (and the modules it re-exports),
src/lib/server/context.ts, src/lib/server/db/index.ts (and the modules it re-exports), src/app.css,
src/routes/+layout.svelte, src/lib/components/*.svelte, and the behavior reference prototypes/wyndow.html.
The look is Study D in prototypes/design-studies.html (`.K` CSS, `renderK`, palette KP.D).

## How to build a view
- Load with `loadPlannerContext(locals, { from, to })` from `$lib/server/context` (it returns settings, kinds,
  rules, events, projects, allocations, days (a Map, serializable), familyIds, today, nowMinutes). Use the
  repository functions in `$lib/server/db` for anything else. Use the pure functions in `$lib/planner`.
- Change data only through SvelteKit form actions with `use:enhance`. Validate every input with zod
  (dates `^\d{4}-\d{2}-\d{2}$`, uuids, bounded numbers and strings). Return `fail(400, { error })` with a
  plain sentence; never echo raw errors. RLS enforces ownership; never accept a user_id from the client.
- Use `setDayAllocation` / `setAllocations` (atomic) for block assignments.
- Wrap repository errors in loads with a friendly error (`error(500, 'Could not load your plan.')`).
- Svelte 5 runes only. TypeScript. No `<style>` blocks. Dynamic colors only through `style="--c: …"`.
- Times are 24-hour (`formatTime`). Dates in labels like `Fri 16 Oct`.
- Reuse shell classes: .screen .panel .label .readout .mono .dim .visually-hidden .btn .btn-ghost
  .btn-danger .field .check .list .list-row .chip .notice .notice-error .swatch, and the DayBar,
  DayStrip, and Swatch components. Put new CSS only in your own section of src/app.css
  (between your marker and the next one). Prefix your classes with your feature name.
- In-page confirmation for destructive actions (the app cannot use confirm()).
- Must work at 375px width without horizontal page scroll.

## Rules
- Touch only the files your task lists. Do not git commit. Do not add npm dependencies. Never read or
  print .env. Do not run Supabase CLI commands that change the database.
- You cannot sign in (no credentials), so verify with `npm run check` (0 errors), `npm test`, and
  `npm run build`. Pure helpers you write get Vitest tests.
- Final report under 300 words: files, decisions, anything unfinished, anything the lead must wire up.
