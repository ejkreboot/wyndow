<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Burndown from '$lib/components/Burndown.svelte';
	import Swatch from '$lib/components/Swatch.svelte';
	import { COLUMNS, moveTarget, type Column } from '$lib/projects/board';
	import { formatDay, formatShort, type Issue } from '$lib/projects/issues';

	let { data, form } = $props();

	let addingIssue = $state(false);
	let editingIssue = $state<number | null>(null);
	let confirmDrop = $state<number | null>(null);
	let editingMilestone = $state(false);
	let creatingMilestone = $state(false);
	let busy = $state(false);

	const closeAll = () => {
		addingIssue = false;
		editingIssue = null;
		confirmDrop = null;
		editingMilestone = false;
		creatingMilestone = false;
	};

	const submit: SubmitFunction = () => {
		busy = true;
		return async ({ result, update }) => {
			await update({ reset: false });
			busy = false;
			if (result.type === 'success') closeAll();
		};
	};
	// Moves keep any open editor as it is.
	const quiet: SubmitFunction = () => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	};

	const err = (scope: string) => (form && 'scope' in form && form.scope === scope && 'error' in form ? String(form.error) : null);
	const p = $derived(data.project);
	const ms = $derived(data.milestone);
	const openMilestones = $derived(data.milestones.status === 'ok' ? data.milestones.list.filter((m) => m.state === 'open' || m.number === ms?.number) : []);
	const b = $derived(data.burndown);
	const COLUMN_LABEL: Record<Column, string> = { backlog: 'Backlog', next: 'Next', doing: 'Doing', done: 'Done' };
	// Not-planned issues left scope, so they don't count toward a column's blocks.
	const columnSize = (issues: Issue[]) => issues.reduce((n, i) => n + (i.stateReason === 'not_planned' ? 0 : i.size), 0);
</script>

<svelte:head><title>{p.name} · Projects · Wyndow</title></svelte:head>

{#snippet issueFields(i: Issue | null)}
	<div class="projects-fields">
		<label class="field projects-board-wide"><span class="label">Title</span>
			<input name="title" required maxlength="256" value={i?.title ?? ''} /></label>
		<label class="field"><span class="label">Size (blocks)</span>
			<input type="number" name="size" min="1" max="20" step="1" required value={i?.size ?? 1} /></label>
		<label class="field"><span class="label">Depth</span>
			<select name="depth">
				<option value="" selected={!i?.depth}>Unset</option>
				<option value="deep" selected={i?.depth === 'deep'}>Deep</option>
				<option value="shallow" selected={i?.depth === 'shallow'}>Shallow</option>
			</select></label>
		<label class="field projects-board-wide"><span class="label">Description</span>
			<textarea name="body" rows="5" maxlength="20000">{i?.body ?? ''}</textarea></label>
	</div>
{/snippet}

{#snippet milestoneFields(m: typeof ms, edit: boolean)}
	<div class="projects-fields">
		<label class="field"><span class="label">Title</span>
			<input name="title" required maxlength="120" value={m?.title ?? ''} /></label>
		<label class="field"><span class="label">Due</span>
			<input type="date" name="dueOn" value={m?.dueOn ?? ''} /></label>
		{#if edit}
			<label class="field"><span class="label">State</span>
				<select name="state">
					<option value="open" selected={m?.state !== 'closed'}>Open</option>
					<option value="closed" selected={m?.state === 'closed'}>Closed</option>
				</select></label>
		{/if}
		<label class="field projects-board-wide"><span class="label">Description</span>
			<textarea name="description" rows="2" maxlength="2000">{m?.description ?? ''}</textarea></label>
	</div>
{/snippet}

<main class="projects">
	<header class="projects-head">
		<div>
			<p class="label"><a href="/projects">Projects</a> · <a href="https://github.com/{p.githubRepo}" target="_blank" rel="noopener noreferrer">GitHub · {p.githubRepo}</a></p>
			<h1 class="projects-name"><Swatch color={p.color} /> {p.name}</h1>
			<p class="dim">Sizes are in blocks; one block is {data.blockHours} focus hours. Columns are GitHub labels (status:next, status:doing); Done is closed.</p>
		</div>
	</header>

	<!-- ---------- milestone ---------- -->
	<section class="panel projects-card">
		{#if data.milestones.status === 'no-token'}
			<p class="dim">Set GITHUB_TOKEN to use milestones.</p>
		{:else if data.milestones.status === 'error'}
			<p class="notice notice-error" role="alert">{data.milestones.message}</p>
		{:else if editingMilestone && ms}
			<form method="POST" action="?/updateMilestone" use:enhance={submit} class="projects-form">
				<h2 class="label">Edit milestone</h2>
				{@render milestoneFields(ms, true)}
				{#if err('milestone')}<p class="notice notice-error" role="alert">{err('milestone')}</p>{/if}
				<div class="projects-actions">
					<button class="btn" type="submit" disabled={busy}>Save</button>
					<button class="btn-ghost" type="button" onclick={closeAll}>Cancel</button>
				</div>
			</form>
		{:else if creatingMilestone}
			<form method="POST" action="?/createMilestone" use:enhance={submit} class="projects-form">
				<h2 class="label">New milestone on GitHub</h2>
				{@render milestoneFields(null, false)}
				{#if err('milestone')}<p class="notice notice-error" role="alert">{err('milestone')}</p>{/if}
				<div class="projects-actions">
					<button class="btn" type="submit" disabled={busy}>Create and link</button>
					<button class="btn-ghost" type="button" onclick={closeAll}>Cancel</button>
				</div>
			</form>
		{:else}
			<div class="projects-card-head">
				<div>
					<p class="label">Milestone</p>
					{#if ms}
						<h2 class="projects-board-milestone">
							<a href={ms.url} target="_blank" rel="noopener noreferrer">{ms.title}</a>
							{#if ms.state === 'closed'}<span class="chip">closed</span>{/if}
						</h2>
						<p class="dim mono">
							{ms.dueOn ? `Due ${formatDay(ms.dueOn)}` : 'No due date'} · {ms.openIssues} open · {ms.closedIssues} closed
						</p>
						{#if ms.description}<p class="projects-board-desc">{ms.description}</p>{/if}
					{:else}
						<p class="dim">No milestone linked. The board shows every open issue; link a milestone to see a burndown.</p>
					{/if}
				</div>
				<div class="projects-actions">
					{#if ms}<button class="btn-ghost" type="button" onclick={() => { closeAll(); editingMilestone = true; }}>Edit</button>{/if}
					<button class="btn-ghost" type="button" onclick={() => { closeAll(); creatingMilestone = true; }}>New milestone</button>
				</div>
			</div>
			<form method="POST" action="?/linkMilestone" use:enhance={submit} class="projects-inline">
				<label class="field projects-board-link"><span class="visually-hidden">Linked milestone</span>
					<select name="milestone">
						<option value="" selected={!ms}>No milestone</option>
						{#each openMilestones as m (m.number)}
							<option value={m.number} selected={m.number === ms?.number}>{m.title}{m.dueOn ? ` (due ${formatShort(m.dueOn)})` : ''}</option>
						{/each}
					</select></label>
				<button class="btn-ghost" type="submit" disabled={busy}>Link</button>
			</form>
			{#if err('milestone')}<p class="notice notice-error" role="alert">{err('milestone')}</p>{/if}
		{/if}
	</section>

	<!-- ---------- burndown ---------- -->
	{#if b && ms}
		<section class="panel projects-card">
			<div class="projects-card-head">
				<div>
					<p class="label">Burndown</p>
					<p class="projects-progress-text">
						<strong class="mono">{b.remaining}</strong> block{b.remaining === 1 ? '' : 's'} left
						<span class="dim mono">({b.remaining * data.blockHours}h) · {b.done} done</span>
					</p>
				</div>
				{#if b.remaining === 0}
					<span class="chip projects-ok">Nothing left</span>
				{:else if b.finish}
					<span class="chip {ms.dueOn && b.finish > ms.dueOn ? 'projects-warn' : 'projects-ok'}">
						Planned blocks finish {formatShort(b.finish)}{ms.dueOn && b.finish > ms.dueOn ? ', after the due date' : ''}
					</span>
				{:else}
					<span class="chip projects-warn">Paint {b.shortBlocks} more block{b.shortBlocks === 1 ? '' : 's'} on the Season view</span>
				{/if}
			</div>
			<Burndown {b} color={p.color} title="Burndown for {ms.title}: {b.remaining} blocks left" />
			<p class="dim projects-board-note">History uses each issue's open and close dates and its current size label.</p>
		</section>
	{/if}

	<!-- ---------- board ---------- -->
	<header class="projects-head projects-section">
		<h2 class="label">Board</h2>
		<button class="btn" type="button" onclick={() => { closeAll(); addingIssue = true; }} disabled={!data.board}>New issue</button>
	</header>

	{#if addingIssue}
		<section class="panel">
			<form method="POST" action="?/createIssue" use:enhance={submit} class="projects-form">
				<h3 class="label">New issue{ms ? ` in ${ms.title}` : ''}</h3>
				{@render issueFields(null)}
				<label class="field"><span class="label">Column</span>
					<select name="column">
						<option value="backlog">Backlog</option>
						<option value="next">Next</option>
						<option value="doing">Doing</option>
					</select></label>
				{#if err('createIssue')}<p class="notice notice-error" role="alert">{err('createIssue')}</p>{/if}
				<div class="projects-actions">
					<button class="btn" type="submit" disabled={busy}>Create on GitHub</button>
					<button class="btn-ghost" type="button" onclick={closeAll}>Cancel</button>
				</div>
			</form>
		</section>
	{/if}

	{#if data.issuesError}
		<p class="notice notice-error" role="alert">{data.issuesError}</p>
	{:else if data.board}
		{@const board = data.board}
		{#if err('move')}<p class="notice notice-error" role="alert">{err('move')}</p>{/if}
		<div class="projects-board">
			{#each COLUMNS as col (col.id)}
				{@const issues = board[col.id]}
				<section class="projects-board-col" aria-labelledby="col-{col.id}">
					<h3 class="label projects-board-col-head" id="col-{col.id}">
						{col.label}
						<span class="mono dim">{issues.length} · {columnSize(issues)} bl</span>
					</h3>
					{#if issues.length === 0}<p class="dim projects-board-empty">Empty</p>{/if}
					<ul class="projects-board-cards">
						{#each issues as i (i.number)}
							{@const prev = moveTarget(col.id, -1)}
							{@const next = moveTarget(col.id, 1)}
							<li class="projects-board-card" class:projects-board-dropped={i.stateReason === 'not_planned'}>
								{#if editingIssue === i.number}
									<form method="POST" action="?/updateIssue" use:enhance={submit} class="projects-form">
										<input type="hidden" name="number" value={i.number} />
										{@render issueFields(i)}
										{#if err('updateIssue')}<p class="notice notice-error" role="alert">{err('updateIssue')}</p>{/if}
										<div class="projects-actions">
											<button class="btn" type="submit" disabled={busy}>Save</button>
											<button class="btn-ghost" type="button" onclick={closeAll}>Cancel</button>
										</div>
									</form>
									{#if i.state === 'open'}
										{#if confirmDrop === i.number}
											<form method="POST" action="?/drop" use:enhance={submit} class="projects-inline">
												<input type="hidden" name="number" value={i.number} />
												<span class="dim">Close #{i.number} as not planned?</span>
												<button class="btn-danger" type="submit" disabled={busy}>Close</button>
												<button class="btn-ghost" type="button" onclick={() => (confirmDrop = null)}>Keep</button>
											</form>
											{#if err('drop')}<p class="notice notice-error" role="alert">{err('drop')}</p>{/if}
										{:else}
											<button class="btn-ghost" type="button" onclick={() => (confirmDrop = i.number)}>Won't do…</button>
										{/if}
									{/if}
								{:else}
									<p class="projects-board-title">
										<a class="mono" href={i.url} target="_blank" rel="noopener noreferrer">#{i.number}</a>
										{i.title}
									</p>
									<div class="projects-board-meta">
										<span class="chip">size:{i.size}</span>
										{#if i.depth}<span class="chip projects-{i.depth}">{i.depth}</span>{/if}
										{#if i.stateReason === 'not_planned'}<span class="chip">not planned</span>{/if}
									</div>
									<div class="projects-board-moves">
										<form method="POST" action="?/move" use:enhance={quiet} class="projects-inline">
											<input type="hidden" name="number" value={i.number} />
											{#if prev}
												<button class="btn-ghost" name="to" value={prev} disabled={busy} aria-label="Move #{i.number} to {COLUMN_LABEL[prev]}">←</button>
											{/if}
											{#if next}
												<button class="btn-ghost" name="to" value={next} disabled={busy} aria-label="Move #{i.number} to {COLUMN_LABEL[next]}">→</button>
											{/if}
										</form>
										<button class="btn-ghost" type="button" onclick={() => { closeAll(); editingIssue = i.number; }}>Edit</button>
									</div>
								{/if}
							</li>
						{/each}
					</ul>
					{#if col.id === 'done' && data.doneHidden > 0}
						<p class="dim projects-board-empty">{data.doneHidden} more closed on GitHub</p>
					{/if}
				</section>
			{/each}
		</div>
	{/if}
</main>
