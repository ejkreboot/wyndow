<script lang="ts">
	import { onMount } from 'svelte';
	import { refreshAll } from '$app/navigation';
	import { act } from '#lib/act.js';
	import Calendar from '#lib/components/Calendar.svelte';
	import FeedsDialog from '#lib/components/FeedsDialog.svelte';
	import TodoList from '#lib/components/TodoList.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let feedsOpen = $state(false);
	let view = $state<'calendar' | 'todos'>('calendar');
	let syncing = $state(false);

	// Subscriptions refresh in the background so the page never waits on a slow feed.
	onMount(async () => {
		if (!data.staleFeeds) return;
		syncing = true;
		try {
			const result = (await act('syncFeeds')) as { synced?: number };
			if (result.synced) await refreshAll();
		} catch {
			/* the error is recorded on the feed and shown in the Calendars dialog */
		} finally {
			syncing = false;
		}
	});
</script>

<div class="shell" data-view={view}>
	<header class="topbar">
		<span class="wordmark">Wyndow</span>
		{#if syncing}<span class="status-light" title="Refreshing subscribed calendars">Syncing</span>{/if}
		<div class="segmented" role="tablist" aria-label="View">
			<button role="tab" aria-selected={view === 'calendar'} onclick={() => (view = 'calendar')}>Calendar</button>
			<button role="tab" aria-selected={view === 'todos'} onclick={() => (view = 'todos')}>To do</button>
		</div>
		<span class="spacer"></span>
		<form method="POST" action="/logout">
			<button class="button button--quiet button--small" type="submit">Sign out</button>
		</form>
	</header>

	<main class="deck">
		<Calendar
			month={data.month}
			events={data.events}
			feedEvents={data.feedEvents}
			feeds={data.feeds}
			onfeeds={() => (feedsOpen = true)}
		/>
		<TodoList todos={data.todos} />
	</main>
</div>

<FeedsDialog bind:open={feedsOpen} feeds={data.feeds} />
