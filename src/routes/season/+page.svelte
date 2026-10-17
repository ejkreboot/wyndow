<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import DayBar from '$lib/components/DayBar.svelte';
	import Swatch from '$lib/components/Swatch.svelte';
	import {
		allocationSpans,
		blockWindow,
		findTime,
		fitAllocation,
		formatTime,
		weekFocusHours,
		weekMode
	} from '$lib/planner';
	import type { DayEvent, DayPlan, Kind, LocalDate, Project } from '$lib/planner';
	import {
		dayNumber,
		formatDate,
		formatMonth,
		formatShort,
		inRange,
		weekHeadings,
		weekMondays
	} from '$lib/season/season';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const MODE_LABEL = { sprint: 'Sprint', steady: 'Steady', 'keep-alive': 'Keep-alive' } as const;
	const UNKNOWN_COLOR = '#4e5a66';

	const kindById = $derived(new Map(data.kinds.map((k) => [k.id, k] as const)));
	const projectById = $derived(new Map(data.projects.map((p) => [p.id, p] as const)));
	const brushProjects = $derived(data.projects.filter((p) => p.area === 'venture' || p.area === 'family'));
	const ventures = $derived(data.projects.filter((p) => p.area === 'venture'));

	const unrecognizedCount = $derived([...data.days.values()].filter((d) => d.kindId === 'unrecognized').length);

	// ---------- selection (kept in the URL) ----------
	const selectedDate = $derived.by(() => {
		const d = page.url.searchParams.get('d');
		return d && inRange(d, data.range) && data.days.has(d) ? d : data.today;
	});
	const selectedDay = $derived(data.days.get(selectedDate) ?? null);

	// ---------- brushes ----------
	let brush = $state<string>('inspect'); // 'inspect' | 'erase' | project id
	const activeBrush = $derived(brushProjects.find((p) => p.id === brush) ?? null);
	const brushValue = $derived(activeBrush ? activeBrush.id : '');
	let brushNote = $state<string | null>(null);

	$effect(() => {
		// A brush for a project that no longer exists falls back to Inspect.
		if (brush !== 'inspect' && brush !== 'erase' && !activeBrush) brush = 'inspect';
	});

	// ---------- grid ----------
	function kindName(day: DayPlan): string {
		if (day.kindId === 'unrecognized') return 'Unrecognized';
		return kindById.get(day.kindId)?.name ?? 'Unknown';
	}

	function barSpans(day: DayPlan) {
		return allocationSpans(day, data.allocations[day.date] ?? [], data.settings).map((s) => ({
			start: s.start,
			end: s.end,
			color: s.projectId ? (projectById.get(s.projectId)?.color ?? UNKNOWN_COLOR) : null
		}));
	}

	function dayLabel(day: DayPlan): string {
		const alloc = fitAllocation(day, data.allocations[day.date]);
		const names = [...new Set(alloc.filter((p): p is string => p !== null))].map(
			(id) => projectById.get(id)?.name ?? 'a project'
		);
		const blocks = `${day.blocks} block${day.blocks === 1 ? '' : 's'}`;
		return `${formatDate(day.date)}: ${kindName(day)}, ${blocks}${names.length ? `, ${names.join(' and ')}` : ''}`;
	}

	const rows = $derived(
		weekMondays(data.range).map((monday, i) => {
			const hours = weekFocusHours(data.days, monday);
			const plans: DayPlan[] = [];
			for (const [date, plan] of data.days) {
				if (date >= monday && date < nextMonday(monday)) plans.push(plan);
			}
			plans.sort((a, b) => (a.date < b.date ? -1 : 1));
			return {
				monday,
				headings: weekHeadings(monday, i === 0),
				hours,
				mode: weekMode(hours),
				days: plans
			};
		})
	);

	function nextMonday(monday: LocalDate): LocalDate {
		const [y, m, d] = monday.split('-').map(Number);
		return new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10);
	}

	function onDayClick(e: MouseEvent, day: DayPlan) {
		brushNote = null;
		if (brush === 'inspect') {
			e.preventDefault();
			goto(`?d=${day.date}`, { replaceState: true, noScroll: true, keepFocus: true });
		} else if (day.blocks === 0) {
			e.preventDefault();
			brushNote = `${formatDate(day.date)} has no focus blocks to paint.`;
		}
	}

	// ---------- side panel ----------
	function eventTime(e: DayEvent): string {
		if (e.allDay) return 'All day';
		const end = e.endMin >= 1440 ? 'next day' : formatTime(e.endMin);
		if (!e.startsToday) return e.endMin >= 1440 ? 'All day (continues)' : `until ${end}`;
		return `${formatTime(e.startMin)}–${end}`;
	}
	function eventKind(e: DayEvent): string {
		return e.kindId ? (kindById.get(e.kindId)?.name ?? 'no rule yet') : 'no rule yet';
	}
	function schoolText(s: DayPlan['school']): string {
		if (s === null) return 'No school';
		if (s === 'unknown') return 'Unknown until the event has a rule';
		return s === 'async' ? 'Async (packets)' : 'Live';
	}
	const selectedKind = $derived<Kind | null>(
		selectedDay && selectedDay.kindId !== 'unrecognized' ? (kindById.get(selectedDay.kindId) ?? null) : null
	);
	const selectedAlloc = $derived(selectedDay ? fitAllocation(selectedDay, data.allocations[selectedDay.date]) : []);

	function blockRange(index: number): string {
		if (!selectedDay) return '';
		const w = blockWindow(selectedDay, index, data.settings);
		return `${formatTime(w.start)}–${formatTime(w.end)}`;
	}

	// ---------- suggest ----------
	let confirmingSuggest = $state(false);

	// ---------- find time ----------
	let ftHours = $state(4);
	let ftProject = $state('any');
	let ftBy = $state('');
	const ftByDate = $derived(ftBy && inRange(ftBy, data.range) ? ftBy : data.range.to);
	const ftValid = $derived(Number.isFinite(ftHours) && ftHours > 0 && ftHours <= 200);
	const ft = $derived(
		ftValid
			? findTime({
					hours: ftHours,
					projectId: ftProject === 'any' ? null : ftProject,
					by: ftByDate,
					from: data.today,
					days: data.days,
					allocations: data.allocations,
					settings: data.settings,
					familyIds: data.familyIds
				})
			: null
	);
	const ftOpen = $derived(ft ? ft.rows.filter((r) => !r.assigned).reduce((n, r) => n + r.blocks, 0) : 0);
	const ftProjectObj = $derived<Project | null>(ftProject === 'any' ? null : (projectById.get(ftProject) ?? null));
</script>

<svelte:head><title>Season · Wyndow</title></svelte:head>

<h1 class="visually-hidden">Season</h1>

{#if unrecognizedCount > 0}
	<p class="notice season-notice" role="status">
		{unrecognizedCount} day{unrecognizedCount === 1 ? '' : 's'} in this range
		{unrecognizedCount === 1 ? 'has' : 'have'} calendar events with no rule yet.
		<a href="/settings">Add rules in Settings</a>
	</p>
{/if}

<div class="season-layout">
	<section class="season-main" aria-label="Season grid">
		<div class="season-toolbar" role="group" aria-label="Brush">
			<button class="btn-ghost season-brush" type="button" aria-pressed={brush === 'inspect'} onclick={() => (brush = 'inspect')}>
				Inspect
			</button>
			{#each brushProjects as p (p.id)}
				<button
					class="btn-ghost season-brush"
					type="button"
					aria-pressed={brush === p.id}
					onclick={() => (brush = p.id)}
				>
					<Swatch color={p.color} />{p.name}
				</button>
			{/each}
			<button class="btn-ghost season-brush" type="button" aria-pressed={brush === 'erase'} onclick={() => (brush = 'erase')}>
				Erase
			</button>
			<span class="season-spacer"></span>
			<button class="btn-ghost" type="button" onclick={() => (confirmingSuggest = !confirmingSuggest)} aria-expanded={confirmingSuggest}>
				Suggest stretches
			</button>
		</div>

		{#if confirmingSuggest}
			<form
				class="notice season-confirm"
				method="POST"
				action="?/suggest"
				use:enhance={() => {
					return async ({ update }) => {
						confirmingSuggest = false;
						await update();
					};
				}}
			>
				<p>
					This replaces every block assignment from today to {formatDate(data.range.to)} with a
					fresh suggestion: open stretches alternate between your ventures and open weekends go to
					family. Past days are untouched.
				</p>
				<div class="season-confirm-actions">
					<button class="btn" type="submit">Replace future assignments</button>
					<button class="btn-ghost" type="button" onclick={() => (confirmingSuggest = false)}>Cancel</button>
				</div>
			</form>
		{/if}

		{#if form?.error}<p class="notice notice-error" role="alert">{form.error}</p>{/if}
		{#if brushNote}<p class="notice" role="status">{brushNote}</p>{/if}
		{#if brush !== 'inspect'}
			<p class="season-hint dim">
				{activeBrush ? `Painting ${activeBrush.name}` : 'Erasing'}: click a day to {activeBrush ? 'give it all its blocks' : 'clear its blocks'}.
			</p>
		{/if}

		<ul class="season-legend" aria-label="Legend">
			{#each data.kinds as k (k.id)}
				<li><Swatch color={k.color} />{k.name}</li>
			{/each}
			{#each data.projects as p (p.id)}
				<li><Swatch color={p.color} />{p.name}</li>
			{/each}
		</ul>

		<form method="POST" action="?/paint" class="season-grid-form" use:enhance>
			<input type="hidden" name="projectId" value={brushValue} />
			<div class="season-dow" aria-hidden="true">
				<span></span>
				<span class="season-dow-days">
					{#each ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as d (d)}<span>{d}</span>{/each}
				</span>
				<span></span>
			</div>
			{#each rows as row (row.monday)}
				{#each row.headings as ym (ym)}
					<h2 class="season-month">{formatMonth(ym)}</h2>
				{/each}
				<div class="season-week">
					<span class="season-week-label mono dim">{formatShort(row.monday)}</span>
					<div class="season-days">
						<span class="season-gl" style="--at: 0.25"></span>
						<span class="season-gl" style="--at: 0.5"></span>
						<span class="season-gl" style="--at: 0.75"></span>
						{#each row.days as day (day.date)}
							<button
								class="season-day"
								type={brush === 'inspect' ? 'button' : 'submit'}
								name="date"
								value={day.date}
								aria-label={dayLabel(day)}
								aria-pressed={selectedDate === day.date}
								aria-current={day.date === data.today ? 'date' : undefined}
								onclick={(e) => onDayClick(e, day)}
							>
								<DayBar
									segments={day.segments}
									spans={barSpans(day)}
									label={dayNumber(day.date)}
									today={day.date === data.today}
									past={day.date < data.today}
									selected={selectedDate === day.date}
								/>
							</button>
						{/each}
					</div>
					<span class="season-week-meta">
						<span class="mono dim">{row.hours}h</span>
						<span class="chip season-mode season-mode-{row.mode}">{MODE_LABEL[row.mode]}</span>
					</span>
				</div>
			{/each}
		</form>
	</section>

	<aside class="season-side" aria-label="Selected day and tools">
		{#if selectedDay}
			<section class="panel season-panel">
				<p class="label">{selectedDay.date === data.today ? 'Today' : selectedDay.date < data.today ? 'Past day' : 'Selected day'}</p>
				<h2 class="season-panel-title">{formatDate(selectedDay.date)}</h2>
				<p class="season-kind">
					{#if selectedDay.kindId === 'unrecognized'}
						<span class="chip">Unrecognized</span>
						<a href="/settings">Add a rule</a>
					{:else}
						<span class="chip"><Swatch color={selectedKind?.color ?? null} />{kindName(selectedDay)}</span>
					{/if}
				</p>
				<dl class="season-kv">
					<dt>Focus</dt>
					<dd class="mono">
						{#if selectedDay.focusWindow}
							{formatTime(selectedDay.focusWindow.start)}–{formatTime(selectedDay.focusWindow.end)} · {selectedDay.focusHours}h
						{:else}
							None
						{/if}
					</dd>
					<dt>Blocks</dt>
					<dd class="mono">
						{#if selectedDay.blocks > 0}
							{selectedDay.blocks} × {data.settings.blockHours}h{selectedDay.looseHours > 0
								? `, plus ${selectedDay.looseHours}h loose`
								: ''}
						{:else if selectedDay.looseHours > 0}
							{selectedDay.looseHours}h loose
						{:else}
							None
						{/if}
					</dd>
					<dt>School</dt>
					<dd>{schoolText(selectedDay.school)}</dd>
				</dl>

				{#if selectedDay.blocks > 0}
					<p class="label season-sub">Who gets each block</p>
					<div class="season-blocks">
						{#each selectedAlloc as current, i (i)}
							<form class="season-block" method="POST" action="?/setBlock" use:enhance>
								<input type="hidden" name="date" value={selectedDay.date} />
								<input type="hidden" name="index" value={i} />
								<span class="mono dim">{blockRange(i)}</span>
								<span class="season-seg" role="group" aria-label="Block {i + 1}">
									{#each brushProjects as p (p.id)}
										<button
											type="submit"
											name="projectId"
											value={p.id}
											aria-pressed={current === p.id}
											title={p.name}
											style="--c: {p.color}"
										>
											<Swatch color={p.color} /><span class="season-seg-name">{p.name}</span>
										</button>
									{/each}
									<button type="submit" name="projectId" value="" aria-pressed={current === null}>Open</button>
								</span>
							</form>
						{/each}
					</div>
					<form class="season-give" method="POST" action="?/paint" use:enhance>
						<input type="hidden" name="date" value={selectedDay.date} />
						{#each brushProjects as p (p.id)}
							<button class="btn-ghost" type="submit" name="projectId" value={p.id}>
								<Swatch color={p.color} />All {p.name}
							</button>
						{/each}
						<button class="btn-ghost" type="submit" name="projectId" value="">Clear</button>
					</form>
				{/if}

				<p class="label season-sub">Events</p>
				{#if selectedDay.events.length === 0 && selectedDay.derivedKindIds.length === 0}
					<p class="dim">No events. Open day.</p>
				{:else}
					<ul class="list season-events">
						{#each selectedDay.events as e (e.event.id + ':' + e.startMin)}
							<li class="season-event">
								<span class="season-event-title">{e.event.title}</span>
								<span class="mono dim">{eventTime(e)}</span>
								<span class="season-event-kind">→ {eventKind(e)}</span>
							</li>
						{/each}
						{#each selectedDay.derivedKindIds as id (id)}
							<li class="season-event">
								<span class="season-event-title">{kindById.get(id)?.name ?? 'Recovery'}</span>
								<span class="mono dim">after last night's shift</span>
							</li>
						{/each}
					</ul>
				{/if}
				<p class="season-open-day"><a href="/day/{selectedDay.date}">Open day</a></p>
			</section>
		{/if}

		<section class="panel season-panel" aria-labelledby="season-find-title">
			<p class="label" id="season-find-title">Find time</p>
			<div class="season-find-fields">
				<div class="field">
					<label for="season-ft-hours">Hours</label>
					<input id="season-ft-hours" type="number" min="1" max="200" step="1" bind:value={ftHours} />
				</div>
				<div class="field">
					<label for="season-ft-project">For</label>
					<select id="season-ft-project" bind:value={ftProject}>
						<option value="any">Anything</option>
						{#each ventures as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
					</select>
				</div>
				<div class="field">
					<label for="season-ft-by">By</label>
					<input
						id="season-ft-by"
						type="date"
						min={data.today}
						max={data.range.to}
						value={ftByDate}
						onchange={(e) => (ftBy = e.currentTarget.value)}
					/>
				</div>
			</div>
			{#if !ft}
				<p class="notice">Enter a number of hours between 1 and 200.</p>
			{:else}
				<p class="season-find-sum {ft.covered ? 'season-ok' : 'season-short'}" role="status">
					{#if ft.covered}
						Covered by {ft.lastDate ? formatDate(ft.lastDate) : 'today'}
					{:else}
						Short by {ft.shortBy}h before {formatDate(ftByDate)}
					{/if}
				</p>
				{#if ftOpen > 0}
					<p class="dim season-find-note">
						{ftOpen} of these block{ftOpen === 1 ? ' is' : 's are'} still open.
						{ftProjectObj ? `Give ${ftOpen === 1 ? 'it' : 'them'} to ${ftProjectObj.name} to hold the time.` : ''}
					</p>
				{/if}
				<ul class="list season-find-rows">
					{#each ft.rows as r (r.date + r.assigned)}
						{@const plan = data.days.get(r.date)}
						<li class="list-row">
							<span>{formatDate(r.date)}</span>
							<span class="dim">{plan ? kindName(plan) : ''}</span>
							<span class="season-find-count">
								{r.blocks} × {data.settings.blockHours}h
								<span class="chip">{r.assigned ? 'Assigned' : 'Open'}</span>
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</aside>
</div>
