<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Swatch from '$lib/components/Swatch.svelte';
	import { formatDay, formatShort, packetStatus } from '$lib/projects/issues';
	import type { Project } from '$lib/planner';
	import type { ClassView, VentureView } from './+page.server';

	let { data, form } = $props();

	let addingProject = $state(false);
	let editingProject = $state<string | null>(null);
	let confirmArchive = $state<string | null>(null);
	let addingClass = $state(false);
	let editingClass = $state<string | null>(null);
	let confirmDelete = $state<string | null>(null);
	let busy = $state(false);

	const closeAll = () => {
		addingProject = false;
		editingProject = null;
		confirmArchive = null;
		addingClass = false;
		editingClass = null;
		confirmDelete = null;
	};

	const submit: SubmitFunction = () => {
		busy = true;
		return async ({ result, update }) => {
			await update({ reset: false });
			busy = false;
			if (result.type === 'success') closeAll();
		};
	};
	// Packet steppers keep the page state as it is.
	const stepper: SubmitFunction = () => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	};

	const err = (scope: string) => (form && 'scope' in form && form.scope === scope && 'error' in form ? String(form.error) : null);
	const ventures = $derived(data.ventures as VentureView[]);
	const classes = $derived(data.classes as ClassView[]);
	const others = $derived(data.others as Project[]);
	const archived = $derived(data.archived as Project[]);
	const pct = (v: VentureView) => {
		const total = v.done + v.remaining;
		return total > 0 ? Math.min(100, (v.done / total) * 100) : 0;
	};
</script>

<svelte:head><title>Projects · Wyndow</title></svelte:head>

{#snippet projectFields(p: Project | null, edit: boolean)}
	<div class="projects-fields">
		<label class="field"><span class="label">Name</span>
			<input name="name" required maxlength="80" value={p?.name ?? ''} /></label>
		<label class="field"><span class="label">Color</span>
			<input class="projects-color" type="color" name="color" value={p?.color ?? '#5991c5'} /></label>
		<label class="field"><span class="label">Area</span>
			<select name="area">
				<option value="venture" selected={(p?.area ?? 'venture') === 'venture'}>Venture</option>
				<option value="family" selected={p?.area === 'family'}>Family</option>
			</select></label>
		<label class="field"><span class="label">GitHub repo</span>
			<input name="githubRepo" maxlength="140" placeholder="owner/name" value={p?.githubRepo ?? ''} /></label>
		<label class="field"><span class="label">Milestone</span>
			<input name="milestone" maxlength="120" value={p?.milestone ?? ''} /></label>
		{#if edit}
			<label class="field"><span class="label">Blocks done</span>
				<input type="number" name="blocksDone" min="0" max="10000" step="1" value={p?.blocksDone ?? 0} /></label>
		{/if}
	</div>
{/snippet}

{#snippet classFields(c: ClassView['cls'] | null)}
	<div class="projects-fields">
		<label class="field"><span class="label">Class</span>
			<input name="name" required maxlength="80" value={c?.name ?? ''} /></label>
		<label class="field"><span class="label">Student</span>
			<input name="student" required maxlength="60" value={c?.student ?? ''} /></label>
		<label class="field"><span class="label">Wyrkbook reference</span>
			<input name="wyrkbookRef" maxlength="200" value={c?.wyrkbookRef ?? ''} /></label>
		<label class="field"><span class="label">Current unit</span>
			<input name="currentUnit" maxlength="200" value={c?.currentUnit ?? ''} /></label>
	</div>
{/snippet}

{#snippet projectRow(p: Project)}
	<li class="projects-manage-row">
		{#if editingProject === p.id}
			<form method="POST" action="?/update" use:enhance={submit} class="projects-form">
				<input type="hidden" name="id" value={p.id} />
				{@render projectFields(p, true)}
				{#if err('update')}<p class="notice notice-error" role="alert">{err('update')}</p>{/if}
				<div class="projects-actions">
					<button class="btn" type="submit" disabled={busy}>Save</button>
					<button class="btn-ghost" type="button" onclick={closeAll}>Cancel</button>
				</div>
			</form>
		{:else}
			<div class="projects-manage-line">
				<Swatch color={p.color} />
				<span class="projects-manage-name">{p.name}</span>
				<span class="chip">{p.area}</span>
				<span class="projects-manage-buttons">
					{#if !p.archived}
						<button class="btn-ghost" type="button" onclick={() => { closeAll(); editingProject = p.id; }}>Edit</button>
					{/if}
					{#if confirmArchive === p.id}
						<form method="POST" action="?/archive" use:enhance={submit} class="projects-inline">
							<input type="hidden" name="id" value={p.id} />
							<input type="hidden" name="archived" value={p.archived ? 'false' : 'true'} />
							<span class="dim">{p.archived ? 'Restore' : 'Archive'} {p.name}?</span>
							<button class="btn-danger" type="submit" disabled={busy}>{p.archived ? 'Unarchive' : 'Archive'}</button>
							<button class="btn-ghost" type="button" onclick={() => (confirmArchive = null)}>Keep</button>
						</form>
					{:else}
						<button class="btn-ghost" type="button" onclick={() => { closeAll(); confirmArchive = p.id; }}>
							{p.archived ? 'Unarchive' : 'Archive'}
						</button>
					{/if}
				</span>
			</div>
			{#if confirmArchive === p.id && err('archive')}<p class="notice notice-error" role="alert">{err('archive')}</p>{/if}
		{/if}
	</li>
{/snippet}

<main class="projects">
	<header class="projects-head">
		<div>
			<h1 class="label">Projects</h1>
			<p class="dim">Issue sizes are in blocks; one block is {data.blockHours} focus hours.</p>
		</div>
		<button class="btn" type="button" onclick={() => { closeAll(); addingProject = true; }}>Add project</button>
	</header>

	{#if addingProject}
		<section class="panel">
			<form method="POST" action="?/create" use:enhance={submit} class="projects-form">
				<h2 class="label">New project</h2>
				{@render projectFields(null, false)}
				{#if err('create')}<p class="notice notice-error" role="alert">{err('create')}</p>{/if}
				<div class="projects-actions">
					<button class="btn" type="submit" disabled={busy}>Add</button>
					<button class="btn-ghost" type="button" onclick={closeAll}>Cancel</button>
				</div>
			</form>
		</section>
	{/if}

	<h2 class="label projects-section">Ventures</h2>
	{#if ventures.length === 0}
		<p class="notice">No ventures yet. Add a project with the venture area.</p>
	{/if}
	<div class="projects-grid">
		{#each ventures as v (v.project.id)}
			{@const p = v.project}
			<article class="panel projects-card" style="--c: {p.color}">
				<div class="projects-card-head">
					<div>
						<p class="label">{p.githubRepo ? `GitHub · ${p.githubRepo}` : 'No GitHub repo'}</p>
						<h3 class="projects-name"><Swatch color={p.color} /> {p.name}</h3>
					</div>
					{#if v.remaining === 0 && v.issues.status === 'ok'}
						<span class="chip">Nothing left</span>
					{:else if v.forecast.date}
						<span class="chip projects-ok">On pace for {formatShort(v.forecast.date)}</span>
					{:else if v.forecast.shortBlocks > 0}
						<span class="chip projects-warn">Assign {v.forecast.shortBlocks} more block{v.forecast.shortBlocks === 1 ? '' : 's'}</span>
					{/if}
				</div>
				<p class="projects-progress-text">
					{#if p.milestone}<strong>{p.milestone}</strong> <span class="dim">· </span>{/if}
					<span class="dim mono">{v.done} of {v.done + v.remaining} blocks done · {v.remaining} left ({v.remaining * data.blockHours}h)</span>
				</p>
				<div class="projects-bar" role="img" aria-label="{Math.round(pct(v))} percent done"><i style="width: {pct(v)}%"></i></div>
				{#if v.note}
					<div class="projects-resume"><p class="label">Where you left off</p><p>{v.note}</p></div>
				{/if}
				{#if v.issues.status === 'none'}
					<p class="dim">Add a GitHub repo to see issues.</p>
				{:else if v.issues.status === 'no-token'}
					<p class="dim">Set GITHUB_TOKEN to load issues.</p>
				{:else if v.issues.status === 'error'}
					<p class="notice notice-error" role="alert">{v.issues.message}</p>
				{:else if v.issues.issues.length === 0}
					<p class="dim">No open issues.</p>
				{:else}
					<ul class="list projects-issues">
						{#each v.issues.issues as i (i.number)}
							<li class="list-row">
								<a class="mono" href={i.url} target="_blank" rel="noopener noreferrer">#{i.number}</a>
								<span>{i.title}</span>
								<span class="projects-labels">
									<span class="chip">size:{i.size}</span>
									{#if i.depth}<span class="chip projects-{i.depth}">{i.depth}</span>{/if}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</article>
		{/each}
	</div>

	<h2 class="label projects-section">All projects</h2>
	<section class="panel">
		<ul class="list">
			{#each [...ventures.map((v) => v.project), ...others] as p (p.id)}{@render projectRow(p)}{/each}
		</ul>
		{#if archived.length > 0}
			<h3 class="label projects-sub">Archived</h3>
			<ul class="list">{#each archived as p (p.id)}{@render projectRow(p)}{/each}</ul>
		{/if}
	</section>

	<header class="projects-head projects-section">
		<div>
			<h2 class="label">Homeschool</h2>
			<p class="dim">The planner decides live or async for each school day and counts the packets you need ready.</p>
		</div>
		<button class="btn-ghost" type="button" onclick={() => { closeAll(); addingClass = true; }}>Add class</button>
	</header>

	{#if addingClass}
		<section class="panel">
			<form method="POST" action="?/createClass" use:enhance={submit} class="projects-form">
				<h3 class="label">New class</h3>
				{@render classFields(null)}
				{#if err('createClass')}<p class="notice notice-error" role="alert">{err('createClass')}</p>{/if}
				<div class="projects-actions">
					<button class="btn" type="submit" disabled={busy}>Add</button>
					<button class="btn-ghost" type="button" onclick={closeAll}>Cancel</button>
				</div>
			</form>
		</section>
	{/if}

	{#if classes.length === 0}<p class="notice">No classes yet.</p>{/if}
	<div class="projects-grid">
		{#each classes as c (c.cls.id)}
			{@const st = packetStatus(c.asyncDays, c.cls.packetsReady)}
			<article class="panel projects-card">
				{#if editingClass === c.cls.id}
					<form method="POST" action="?/updateClass" use:enhance={submit} class="projects-form">
						<input type="hidden" name="id" value={c.cls.id} />
						{@render classFields(c.cls)}
						{#if err('updateClass')}<p class="notice notice-error" role="alert">{err('updateClass')}</p>{/if}
						<div class="projects-actions">
							<button class="btn" type="submit" disabled={busy}>Save</button>
							<button class="btn-ghost" type="button" onclick={closeAll}>Cancel</button>
						</div>
					</form>
				{:else}
					<p class="label">{c.cls.wyrkbookRef ? `Wyrkbook · ${c.cls.wyrkbookRef}` : 'Class'}</p>
					<h3 class="projects-name">{c.cls.name} · {c.cls.student}</h3>
					{#if c.cls.currentUnit}<p class="dim">{c.cls.currentUnit}</p>{/if}
					<ol class="projects-strip" aria-label="Next {c.strip.length} school days">
						{#each c.strip as s (s.date)}
							<li class:projects-async={s.mode === 'async'} title="{formatDay(s.date)}: {s.mode}">
								<span>{Number(s.date.slice(8, 10))}</span>
								<span>{s.mode === 'async' ? 'A' : s.mode === 'live' ? 'L' : '?'}</span>
							</li>
						{/each}
					</ol>
					<div class="projects-packets">
						<span>Async packets: <strong class="mono">{st.ready}</strong> ready of {st.needed} needed</span>
						<form method="POST" action="?/packets" use:enhance={stepper} class="projects-inline">
							<input type="hidden" name="id" value={c.cls.id} />
							<button class="btn-ghost" name="delta" value="-1" aria-label="One fewer ready" disabled={busy || st.ready === 0}>−</button>
							<button class="btn-ghost" name="delta" value="1" aria-label="One more ready" disabled={busy}>+</button>
						</form>
					</div>
					{#if err('packets')}<p class="notice notice-error" role="alert">{err('packets')}</p>{/if}
					<p>
						{#if st.covered}<span class="chip projects-ok">Covered</span>
						{:else if st.by}<span class="chip projects-warn">Prep {st.prep} by {formatDay(st.by)}</span>{/if}
					</p>
					<div class="projects-actions">
						<button class="btn-ghost" type="button" onclick={() => { closeAll(); editingClass = c.cls.id; }}>Edit</button>
						{#if confirmDelete === c.cls.id}
							<form method="POST" action="?/deleteClass" use:enhance={submit} class="projects-inline">
								<input type="hidden" name="id" value={c.cls.id} />
								<span class="dim">Delete {c.cls.name}?</span>
								<button class="btn-danger" type="submit" disabled={busy}>Delete</button>
								<button class="btn-ghost" type="button" onclick={() => (confirmDelete = null)}>Keep</button>
							</form>
						{:else}
							<button class="btn-ghost" type="button" onclick={() => { closeAll(); confirmDelete = c.cls.id; }}>Delete</button>
						{/if}
					</div>
					{#if confirmDelete === c.cls.id && err('deleteClass')}<p class="notice notice-error" role="alert">{err('deleteClass')}</p>{/if}
				{/if}
			</article>
		{/each}
	</div>
</main>
