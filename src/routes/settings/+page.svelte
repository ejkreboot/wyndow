<script lang="ts">
	import { enhance } from '$app/forms';
	import Swatch from '$lib/components/Swatch.svelte';
	import { formatTime, weekdayOf, zonedParts } from '$lib/planner';
	import { BLOCK_HOURS, WEEKDAY_LABELS } from '$lib/settings/helpers';

	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

	function fmtDate(d: string): string {
		return `${DAYS[weekdayOf(d) - 1]} ${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
	}
	function fmtSynced(at: Date | null): string {
		if (!at) return 'Never';
		const p = zonedParts(at, data.settings.timezone);
		return `${fmtDate(p.date)} ${formatTime(p.minutes)}`;
	}
	function fmtHours(h: number): string {
		return `${h} ${h === 1 ? 'hour' : 'hours'}`;
	}

	const userKinds = $derived(data.kinds.filter((k) => !k.builtin));
	const kindName = (id: string) => data.kinds.find((k) => k.id === id)?.name ?? 'Unknown';
	const kindColor = (id: string) => data.kinds.find((k) => k.id === id)?.color ?? null;

	// In-page confirmation and busy state.
	let confirming = $state<string | null>(null);
	let busy = $state<string | null>(null);
	let newKindFor = $state<string | null>(null);

	type Msg = { section?: string; error?: string; ok?: boolean; message?: string };
	function msg(section: string): Msg | null {
		const f = form as Msg | null | undefined;
		return f?.section === section ? f : null;
	}

	/** enhance callback: tracks busy key, closes confirmations when done. */
	function track(key: string) {
		return () => {
			busy = key;
			return async ({ update }: { update: () => Promise<void> }) => {
				await update();
				busy = null;
				confirming = null;
				newKindFor = null;
			};
		};
	}
</script>

<svelte:head><title>Settings · Wyndow</title></svelte:head>

<main class="settings">
	<h1>Settings</h1>

	<!-- Calendar sources -->
	<section class="panel settings-section" aria-labelledby="s-sources">
		<h2 class="label" id="s-sources">Calendar sources</h2>
		{#if msg('sources')?.error}<p class="notice notice-error" role="alert">{msg('sources')?.error}</p>{/if}
		{#if msg('sources')?.message}<p class="notice" role="status">{msg('sources')?.message}</p>{/if}

		{#if data.sources.length === 0}
			<p class="dim">No calendars yet. Add an ICS feed below.</p>
		{:else}
			<ul class="list">
				{#each data.sources as s (s.id)}
					<li class="settings-source">
						<div class="settings-source-info">
							<strong class="settings-source-name">{s.name}</strong>
							<span class="mono dim">{s.urlMasked}</span>
							<span class="mono dim">Last synced: {fmtSynced(s.lastSyncedAt)}</span>
							{#if s.lastError}<span class="settings-error">{s.lastError}</span>{/if}
						</div>
						<div class="settings-actions">
							<form method="POST" action="?/syncSource" use:enhance={track('sync' + s.id)}>
								<input type="hidden" name="id" value={s.id} />
								<button class="btn-ghost" type="submit" disabled={busy === 'sync' + s.id}>
									{busy === 'sync' + s.id ? 'Syncing…' : 'Sync now'}
								</button>
							</form>
							{#if confirming === 'src' + s.id}
								<form method="POST" action="?/deleteSource" use:enhance={track('src' + s.id)}>
									<input type="hidden" name="id" value={s.id} />
									<button class="btn-danger" type="submit">Delete calendar and its events</button>
								</form>
								<button class="btn-ghost" type="button" onclick={() => (confirming = null)}>Cancel</button>
							{:else}
								<button class="btn-danger" type="button" onclick={() => (confirming = 'src' + s.id)}>Delete</button>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}

		<form class="settings-form" method="POST" action="?/addSource" use:enhance={track('addSource')}>
			<div class="field">
				<label class="label" for="src-name">Name</label>
				<input id="src-name" name="name" maxlength="60" required placeholder="Amion" />
			</div>
			<div class="field">
				<label class="label" for="src-url">Feed URL</label>
				<input id="src-url" name="url" type="url" maxlength="2000" required autocomplete="off" placeholder="https://…" />
			</div>
			<button class="btn" type="submit" disabled={busy === 'addSource'}>
				{busy === 'addSource' ? 'Adding…' : 'Add and sync'}
			</button>
		</form>
	</section>

	<!-- Inbox -->
	<section class="panel settings-section" aria-labelledby="s-inbox">
		<h2 class="label" id="s-inbox">Inbox</h2>
		<p class="dim">Event titles that no rule matches yet.</p>
		{#if msg('inbox')?.error}<p class="notice notice-error" role="alert">{msg('inbox')?.error}</p>{/if}
		{#if data.inbox.length === 0}
			<p class="dim">Nothing waiting. Every title has a rule.</p>
		{:else}
			<ul class="list">
				{#each data.inbox as t (t.sourceId + '\u0000' + t.title)}
					{@const key = t.sourceId + '\u0000' + t.title}
					<li class="settings-inbox">
						<div class="settings-inbox-info">
							<span class="mono settings-title">{t.title}</span>
							<span class="mono dim">
								{t.count}× · {fmtDate(t.first)}{t.last !== t.first ? ` – ${fmtDate(t.last)}` : ''}{t.typicalStart != null
									? ` · ${formatTime(t.typicalStart)}${t.typicalEnd != null ? `–${formatTime(t.typicalEnd)}` : ''}`
									: ' · all day'}
							</span>
						</div>
						<div class="settings-actions">
							{#if userKinds.length > 0}
								<form class="settings-inline" method="POST" action="?/assignKind" use:enhance={track('assign' + key)}>
									<input type="hidden" name="title" value={t.title} />
									<label class="visually-hidden" for={'assign-' + key}>Kind for {t.title}</label>
									<select id={'assign-' + key} name="kindId" required>
										{#each userKinds as k (k.id)}<option value={k.id}>{k.name}</option>{/each}
									</select>
									<button class="btn-ghost" type="submit">Assign to kind</button>
								</form>
							{/if}
							{#if newKindFor !== key}
								<button class="btn-ghost" type="button" onclick={() => (newKindFor = key)}>New kind</button>
							{/if}
						</div>
						{#if newKindFor === key}
							<form class="settings-inline settings-newkind" method="POST" action="?/newKindForTitle" use:enhance={track('nk' + key)}>
								<input type="hidden" name="title" value={t.title} />
								<label class="visually-hidden" for={'nk-name-' + key}>New kind name</label>
								<input id={'nk-name-' + key} name="name" maxlength="60" required placeholder="Kind name" />
								<label class="visually-hidden" for={'nk-color-' + key}>Color</label>
								<input id={'nk-color-' + key} class="settings-color" type="color" name="color" value="#5991c5" />
								<button class="btn" type="submit">Create and assign</button>
								<button class="btn-ghost" type="button" onclick={() => (newKindFor = null)}>Cancel</button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Planning -->
	<section class="panel settings-section" aria-labelledby="s-planning">
		<h2 class="label" id="s-planning">Planning</h2>
		{#if msg('planning')?.error}<p class="notice notice-error" role="alert">{msg('planning')?.error}</p>{/if}
		{#if msg('planning')?.ok}<p class="notice" role="status">Saved.</p>{/if}
		<form class="settings-form" method="POST" action="?/savePlanning" use:enhance={track('planning')}>
			<div class="field">
				<label class="label" for="p-block">Block length</label>
				<select id="p-block" name="blockHours">
					{#each BLOCK_HOURS as h (h)}
						<option value={h} selected={h === data.settings.blockHours}>{fmtHours(h)}</option>
					{/each}
				</select>
			</div>
			<div class="field">
				<label class="label" for="p-chunk">Minimum hours for next chunk</label>
				<input id="p-chunk" name="chunkMinHours" type="number" min="1" max="8" step="1" value={data.settings.chunkMinHours} required />
			</div>
			<fieldset class="settings-days">
				<legend class="label">School days</legend>
				<div class="settings-daylist">
					{#each WEEKDAY_LABELS as label, i (label)}
						<label class="check">
							<input type="checkbox" name="schoolDay" value={i + 1} checked={data.settings.schoolDays.includes((i + 1) as 1)} />
							<span class="mono">{label}</span>
						</label>
					{/each}
				</div>
			</fieldset>
			<div class="field">
				<label class="label" for="p-tz">Timezone</label>
				<input id="p-tz" name="timezone" maxlength="64" required value={data.settings.timezone} autocomplete="off" spellcheck="false" />
			</div>
			<button class="btn" type="submit" disabled={busy === 'planning'}>Save planning</button>
		</form>
	</section>

	<!-- Kinds -->
	<section class="panel settings-section" aria-labelledby="s-kinds">
		<h2 class="label" id="s-kinds">Kinds</h2>
		{#if msg('kinds')?.error}<p class="notice notice-error" role="alert">{msg('kinds')?.error}</p>{/if}
		{#if msg('kinds')?.ok}<p class="notice" role="status">Saved.</p>{/if}
		<ul class="list">
			{#each data.kinds as k (k.id)}
				<li class="settings-kind">
					<form class="settings-kind-form" method="POST" action="?/saveKind" use:enhance={track('kind' + k.id)}>
						<input type="hidden" name="id" value={k.id} />
						<div class="settings-kind-head">
							{#if k.builtin}
								<Swatch color={null} />
								<strong>{k.name}</strong>
								<span class="chip">built-in</span>
							{:else}
								<label class="visually-hidden" for={'kc-' + k.id}>Color for {k.name}</label>
								<input id={'kc-' + k.id} class="settings-color" type="color" name="color" value={k.color ?? '#5991c5'} />
								<label class="visually-hidden" for={'kn-' + k.id}>Name</label>
								<input id={'kn-' + k.id} name="name" maxlength="60" required value={k.name} />
							{/if}
						</div>
						<div class="settings-kind-fields">
							<div class="field">
								<label class="label" for={'kh-' + k.id}>Focus hours</label>
								<input id={'kh-' + k.id} name="focusHours" type="number" min="0" max="16" step="0.5" value={k.focusHours} required />
							</div>
							<div class="field">
								<label class="label" for={'ks-' + k.id}>Focus start</label>
								<input id={'ks-' + k.id} name="focusStart" type="time" value={k.focusStart != null ? formatTime(k.focusStart) : ''} />
							</div>
							<div class="field">
								<label class="label" for={'km-' + k.id}>School</label>
								<select id={'km-' + k.id} name="schoolMode">
									<option value="live" selected={k.schoolMode === 'live'}>Live</option>
									<option value="async" selected={k.schoolMode === 'async'}>Async</option>
								</select>
							</div>
							{#if !k.builtin}
								<div class="field">
									<label class="label" for={'kx-' + k.id}>Next day becomes</label>
									<select id={'kx-' + k.id} name="nextDayKindId">
										<option value="" selected={k.nextDayKindId == null}>None</option>
										{#each data.kinds.filter((o) => o.id !== k.id) as o (o.id)}
											<option value={o.id} selected={k.nextDayKindId === o.id}>{o.name}</option>
										{/each}
									</select>
								</div>
							{/if}
						</div>
						<div class="settings-actions">
							<button class="btn-ghost" type="submit" disabled={busy === 'kind' + k.id}>Save</button>
						</div>
					</form>
					{#if !k.builtin}
						{#if confirming === 'kind' + k.id}
							<div class="settings-confirm">
								<p>Delete {k.name}? Its rules go too, and those titles return to the inbox.</p>
								<form method="POST" action="?/deleteKind" use:enhance={track('delkind' + k.id)}>
									<input type="hidden" name="id" value={k.id} />
									<button class="btn-danger" type="submit">Delete kind</button>
								</form>
								<button class="btn-ghost" type="button" onclick={() => (confirming = null)}>Cancel</button>
							</div>
						{:else}
							<button class="btn-danger" type="button" onclick={() => (confirming = 'kind' + k.id)}>Delete</button>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>

		<h3 class="label">Add kind</h3>
		<form class="settings-form" method="POST" action="?/addKind" use:enhance={track('addKind')}>
			<div class="field">
				<label class="label" for="ak-name">Name</label>
				<input id="ak-name" name="name" maxlength="60" required placeholder="Night shift" />
			</div>
			<div class="field">
				<label class="label" for="ak-color">Color</label>
				<input id="ak-color" class="settings-color" type="color" name="color" value="#5991c5" />
			</div>
			<div class="field">
				<label class="label" for="ak-hours">Focus hours</label>
				<input id="ak-hours" name="focusHours" type="number" min="0" max="16" step="0.5" value="0" required />
			</div>
			<div class="field">
				<label class="label" for="ak-start">Focus start</label>
				<input id="ak-start" name="focusStart" type="time" />
			</div>
			<div class="field">
				<label class="label" for="ak-school">School</label>
				<select id="ak-school" name="schoolMode">
					<option value="live">Live</option>
					<option value="async">Async</option>
				</select>
			</div>
			<button class="btn" type="submit" disabled={busy === 'addKind'}>Add kind</button>
		</form>
	</section>

	<!-- Rules -->
	<section class="panel settings-section" aria-labelledby="s-rules">
		<h2 class="label" id="s-rules">Rules</h2>
		{#if msg('rules')?.error}<p class="notice notice-error" role="alert">{msg('rules')?.error}</p>{/if}
		{#if data.rules.length === 0}
			<p class="dim">No rules yet.</p>
		{:else}
			<ul class="list">
				{#each data.rules as r (r.id)}
					<li class="settings-rule">
						<span class="mono settings-title">{r.pattern}</span>
						<span class="chip">{r.match}</span>
						<span class="settings-rule-kind"><Swatch color={kindColor(r.kindId)} /> {kindName(r.kindId)}</span>
						{#if confirming === 'rule' + r.id}
							<form method="POST" action="?/deleteRule" use:enhance={track('rule' + r.id)}>
								<input type="hidden" name="id" value={r.id} />
								<button class="btn-danger" type="submit">Confirm delete</button>
							</form>
						{:else}
							<button class="btn-danger" type="button" onclick={() => (confirming = 'rule' + r.id)}>Delete</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<h3 class="label">Add rule</h3>
		<form class="settings-form" method="POST" action="?/addRule" use:enhance={track('addRule')}>
			<div class="field">
				<label class="label" for="ar-pattern">Pattern</label>
				<input id="ar-pattern" class="mono" name="pattern" maxlength="200" required />
			</div>
			<div class="field">
				<label class="label" for="ar-match">Match</label>
				<select id="ar-match" name="match">
					<option value="equals">equals</option>
					<option value="prefix">prefix</option>
				</select>
			</div>
			<div class="field">
				<label class="label" for="ar-kind">Kind</label>
				<select id="ar-kind" name="kindId" required>
					{#each data.kinds as k (k.id)}<option value={k.id}>{k.name}</option>{/each}
				</select>
			</div>
			<button class="btn" type="submit" disabled={busy === 'addRule'}>Add rule</button>
		</form>
	</section>
</main>
