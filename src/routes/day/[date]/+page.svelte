<script lang="ts">
	import { enhance } from '$app/forms';
	import DayStrip from '$lib/components/DayStrip.svelte';
	import Swatch from '$lib/components/Swatch.svelte';
	import { elapsedMinutes, longDate, shortDate } from '$lib/day/format';
	import { formatTime } from '$lib/planner/dates';

	let { data, form } = $props();

	let now = $state(Date.now());
	$effect(() => {
		const id = setInterval(() => (now = Date.now()), 15_000);
		return () => clearInterval(id);
	});

	let stopping = $state(false);
	let note = $state('');
	let noteError = $state('');
	let busy = $state(false);

	const running = $derived(data.session);
	const minutes = $derived(running ? elapsedMinutes(running.startedAt, now) : 0);
	const formError = $derived(form && 'error' in form ? (form.error as string) : '');
	const formAction = $derived(form && 'action' in form ? (form.action as string) : '');
	const shownOnPage = $derived(
		running != null &&
			data.timeline.some((i) => i.card.type === 'focus' && i.card.projectId === running.projectId)
	);

	function validateNote(cancel: () => void) {
		const t = note.trim();
		if (!t) {
			noteError = 'Write a short note about where you left off.';
			cancel();
		} else if (t.length > 2000) {
			noteError = 'Keep the note under 2000 characters.';
			cancel();
		} else {
			noteError = '';
		}
	}
</script>

<svelte:head><title>{longDate(data.date)} · Wyndow</title></svelte:head>

{#snippet stopControls()}
	{#if running}
		{#if !stopping}
			<span class="chip day-running">Running · {minutes} min</span>
			<button class="btn" type="button" onclick={() => (stopping = true)}>Stop and leave a note</button>
		{:else}
			<form
				class="day-stop"
				method="POST"
				action="?/stop"
				use:enhance={({ cancel }) => {
					validateNote(cancel);
					busy = true;
					return async ({ update, result }) => {
						busy = false;
						if (result.type === 'success') {
							stopping = false;
							note = '';
						}
						await update();
					};
				}}
			>
				<input type="hidden" name="sessionId" value={running.id} />
				<div class="field">
					<label class="label" for="day-note">Where did you leave off?</label>
					<textarea
						id="day-note"
						name="note"
						required
						minlength="1"
						maxlength="2000"
						bind:value={note}
						aria-invalid={noteError ? 'true' : undefined}
						aria-describedby={noteError ? 'day-note-error' : undefined}
					></textarea>
					{#if noteError}<p class="day-field-error" id="day-note-error" role="alert">{noteError}</p>{/if}
				</div>
				<div class="day-actions">
					<button class="btn" type="submit" disabled={busy}>End session</button>
					<button class="btn-ghost" type="button" onclick={() => (stopping = false)}>Cancel</button>
				</div>
			</form>
		{/if}
	{/if}
{/snippet}

<div class="day">
	<div class="day-main">
		<header class="day-head">
			<div class="day-title">
				<p class="label">{data.isToday ? 'Today' : data.date < data.today ? 'Past day' : 'Upcoming'}</p>
				<h1>{longDate(data.date)}</h1>
				<p class="dim">{data.kindName}</p>
			</div>
			<nav class="day-nav" aria-label="Change day">
				<a class="btn-ghost" href="/day/{data.prev}" aria-label="Previous day">‹</a>
				<a class="btn-ghost" href="/day/{data.today}" aria-current={data.isToday ? 'date' : undefined}>Today</a>
				<a class="btn-ghost" href="/day/{data.next}" aria-label="Next day">›</a>
			</nav>
		</header>

		<section class="panel day-readout" aria-label="Next focus">
			<p class="readout">{data.readout.time}</p>
			<p class="day-sub">{data.readout.sub}</p>
			<DayStrip
				segments={data.segments}
				spans={data.spans}
				nowMinutes={data.nowMinutes}
				title="The 24 hours of {longDate(data.date)}"
			/>
		</section>

		{#if formError && formAction !== 'stop'}
			<p class="notice notice-error" role="alert">{formError}</p>
		{/if}
		{#if formError && formAction === 'stop' && !stopping}
			<p class="notice notice-error" role="alert">{formError}</p>
		{/if}

		{#if running && !shownOnPage}
			<section class="panel day-card day-card-running" style="--c: var(--hal-blue)">
				<h2 class="day-card-title">Session running: {data.sessionProjectName}</h2>
				<div class="day-actions">{@render stopControls()}</div>
			</section>
		{/if}

		<ol class="day-timeline">
			{#each data.timeline as item, i (i)}
				{@const c = item.card}
				<li class="day-slot">
					<span class="day-time mono dim">{item.label}</span>
					{#if c.type === 'event'}
						<div class="panel day-card" class:day-card-warn={c.unrecognized} style={c.color ? `--c: ${c.color}` : undefined}>
							<h2 class="day-card-title">
								{#if c.unrecognized}
									{c.title}: no rule yet
								{:else}
									<Swatch color={c.color} />
									{c.kindName}
									<span class="mono dim day-code">{c.title}</span>
								{/if}
							</h2>
							<p class="mono dim">{c.range}</p>
							{#if c.unrecognized}
								<p><a href="/settings">Give this title a kind in Settings</a></p>
							{/if}
						</div>
					{:else if c.type === 'recovery'}
						<div class="panel day-card" style={c.color ? `--c: ${c.color}` : undefined}>
							<h2 class="day-card-title"><Swatch color={c.color} /> {c.kindName}</h2>
							<p>Following last night's shift. Sleep first; nothing is scheduled.</p>
						</div>
					{:else if c.type === 'lesson'}
						<div class="panel day-card">
							<h2 class="day-card-title">
								{c.className} · {c.student} <span class="chip">Live</span>
							</h2>
							<p class="mono dim">{formatTime(c.startMin)}–{formatTime(c.endMin)}</p>
						</div>
					{:else if c.type === 'async'}
						<div class="panel day-card">
							<h2 class="day-card-title">Async school day <span class="chip day-chip-warn">Packets</span></h2>
							<p>
								{c.classes.length
									? `Kids work from packets for ${c.classes.join(', ')}.`
									: 'Kids work from packets.'}
							</p>
						</div>
					{:else if c.type === 'focus'}
						{#if c.family}
							<div class="panel day-card" style="--c: {c.color ?? 'var(--text-label)'}">
								<h2 class="day-card-title"><Swatch color={c.color} /> {c.name ?? 'Family'}</h2>
								<p class="mono dim">
									{formatTime(c.start)}–{formatTime(c.end)} · {c.blocks} block{c.blocks === 1 ? '' : 's'}
								</p>
								<p>Protected. Nothing gets scheduled here.</p>
							</div>
						{:else if c.projectId}
							{@const isRunning = running?.projectId === c.projectId}
							<div class="panel day-card day-card-focus" style="--c: {c.color ?? 'var(--hal-blue)'}">
								<h2 class="day-card-title"><Swatch color={c.color} /> Focus: {c.name ?? 'Project'}</h2>
								<p class="mono dim">
									{formatTime(c.start)}–{formatTime(c.end)} · {c.blocks} block{c.blocks === 1 ? '' : 's'}
								</p>
								<div class="day-resume">
									<p class="label">Where you left off</p>
									<p>{data.notes[c.projectId] ?? 'No note yet.'}</p>
								</div>
								<div class="day-actions">
									{#if isRunning}
										{@render stopControls()}
									{:else}
										<form method="POST" action="?/start" use:enhance>
											<input type="hidden" name="projectId" value={c.projectId} />
											<button class="btn" type="submit">Start session</button>
										</form>
									{/if}
								</div>
							</div>
						{:else}
							<div class="panel day-card">
								<h2 class="day-card-title">Open focus time</h2>
								<p class="mono dim">
									{formatTime(c.start)}–{formatTime(c.end)} · {c.blocks} block{c.blocks === 1 ? '' : 's'}, not given to
									anything yet
								</p>
								<div class="day-actions">
									{#each data.ventures as v (v.id)}
										<form method="POST" action="?/give" use:enhance>
											<input type="hidden" name="date" value={data.date} />
											<input type="hidden" name="fromIndex" value={c.fromIndex} />
											<input type="hidden" name="count" value={c.blocks} />
											<input type="hidden" name="projectId" value={v.id} />
											<button class="btn-ghost" type="submit"><Swatch color={v.color} /> Give to {v.name}</button>
										</form>
									{/each}
								</div>
							</div>
						{/if}
					{:else if c.type === 'small'}
						<div class="panel day-card">
							<h2 class="day-card-title">Small tasks · {c.hours} hour{c.hours === 1 ? '' : 's'}</h2>
							<p>Shallow work that fits after the focus blocks.</p>
							<p><a href="/projects">Pick from your projects</a></p>
						</div>
					{:else if c.type === 'family'}
						<div class="panel day-card" style="--c: var(--text-label)">
							<h2 class="day-card-title">Family time</h2>
							<p>Protected evening. Nothing gets scheduled here.</p>
						</div>
					{/if}
				</li>
			{/each}
		</ol>
	</div>

	<aside class="day-side" aria-label="Planning">
		<section class="panel day-prep">
			<p class="label">Homeschool prep</p>
			<h2 class="day-card-title">
				{data.asyncCount} async school day{data.asyncCount === 1 ? '' : 's'} in the next 10
			</h2>
			{#if data.needs.length}
				<ul class="list">
					{#each data.needs as n (n.classId)}
						<li class="day-need" class:day-need-ok={n.missing === 0}>
							<span>{n.label}</span>
							<span class="mono">
								{#if n.missing === 0}Covered{:else}{n.missing} more by {shortDate(n.dueBy ?? data.today)}{/if}
							</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="dim">No classes yet. Add them in Projects.</p>
			{/if}
		</section>

		<section class="panel day-upcoming">
			<p class="label">Next 10 days</p>
			<ul class="list">
				{#each data.upcoming as u (u.date)}
					<li class="list-row day-up-row">
						<a class="mono" href="/day/{u.date}">{shortDate(u.date)}</a>
						<span class="day-up-kind"><Swatch color={u.kindColor} /> {u.kindName}</span>
						<span class="day-up-meta">
							{#if u.async}<span class="chip day-chip-warn">Async</span>{/if}
							{#if u.blocks}<span class="mono dim">{u.blocks} bl</span>{/if}
							{#each u.colors as col, j (j)}<Swatch color={col} />{/each}
						</span>
					</li>
				{/each}
			</ul>
		</section>
	</aside>
</div>
