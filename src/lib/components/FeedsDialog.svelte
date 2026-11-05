<script lang="ts">
	import { enhance } from '$app/forms';
	import { refreshAll } from '$app/navigation';
	import { act } from '#lib/act.js';
	import type { FeedRow } from '#lib/types.js';
	import Modal from './Modal.svelte';

	let { open = $bindable(false), feeds }: { open: boolean; feeds: FeedRow[] } = $props();

	let message = $state<string | null>(null);
	let adding = $state(false);
	let working = $state<Record<string, boolean>>({});

	async function run(id: string, action: string, fields: Record<string, string | boolean>) {
		working[id] = true;
		message = null;
		try {
			await act(action, { id, ...fields });
			await refreshAll();
		} catch (e) {
			message = (e as Error).message;
		} finally {
			working[id] = false;
		}
	}

	async function rename(feed: FeedRow, name: string) {
		name = name.trim();
		if (!name || name === feed.name) return;
		await run(feed.id, 'updateFeed', { name });
	}

	const synced = (iso: string | null) =>
		iso
			? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
			: 'never';
</script>

<Modal bind:open label="Subscribed calendars" wide>
	{#if feeds.length}
		<ul class="feeds">
			{#each feeds as feed (feed.id)}
				<li class="feed" class:feed--hidden={!feed.visible}>
					<label class="toggle" title={feed.visible ? 'Shown on the calendar' : 'Hidden'}>
						<input
							type="checkbox"
							checked={feed.visible}
							disabled={working[feed.id]}
							onchange={(e) => run(feed.id, 'updateFeed', { visible: e.currentTarget.checked })}
						/>
						<span class="toggle__box" aria-hidden="true"></span>
						<span class="visually-hidden">Show {feed.name}</span>
					</label>
					<div class="feed__body">
						<input
							class="field field--inline"
							value={feed.name}
							aria-label="Calendar name"
							onblur={(e) => rename(feed, e.currentTarget.value)}
							onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
						/>
						<span class="feed__url" title={feed.url}>{feed.url}</span>
						<span class="feed__status" class:feed__status--error={!!feed.last_error}>
							{#if working[feed.id]}Working…{:else if feed.last_error}{feed.last_error}{:else}Synced {synced(feed.last_synced_at)}{/if}
						</span>
					</div>
					<button
						class="icon-button"
						aria-label={`Refresh ${feed.name}`}
						title="Refresh now"
						disabled={working[feed.id]}
						onclick={() => run(feed.id, 'syncFeeds', {})}
					>
						<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5V5h-2.5" /></svg>
					</button>
					<button
						class="icon-button icon-button--danger"
						aria-label={`Remove ${feed.name}`}
						title="Unsubscribe"
						disabled={working[feed.id]}
						onclick={() => confirm(`Unsubscribe from “${feed.name}”?`) && run(feed.id, 'deleteFeed', {})}
					>
						<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
					</button>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">No subscriptions yet.</p>
	{/if}

	<form
		class="form form--feed"
		method="POST"
		action="?/addFeed"
		use:enhance={() => {
			adding = true;
			message = null;
			return async ({ result, update }) => {
				adding = false;
				if (result.type === 'success') {
					message = (result.data?.feedMessage as string | null) ?? null;
					await update();
				} else if (result.type === 'failure') {
					message = (result.data?.feedMessage as string) ?? 'Could not add that calendar.';
				}
			};
		}}
	>
		<span class="label">Add a calendar</span>
		<input class="field" name="url" type="text" inputmode="url" placeholder="https://… or webcal://… .ics link" required autocomplete="off" />
		<div class="form__row">
			<input class="field" name="name" placeholder="Name (optional)" autocomplete="off" />
			<button type="submit" class="button button--primary" disabled={adding}>{adding ? 'Subscribing…' : 'Subscribe'}</button>
		</div>
		<p class="hint">
			Paste the secret or public iCal address from Google Calendar, iCloud, Outlook, etc. Feeds refresh every 30 minutes
			while you use Wyndow.
		</p>
	</form>

	{#if message}<p class="error" role="alert">{message}</p>{/if}
</Modal>
