<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		addMonths,
		formatDayLong,
		formatMonth,
		formatTime,
		gridDays,
		monthKey,
		ymd,
		type Month
	} from '#lib/dates.js';
	import type { CalItem, EventRow, FeedEventRow, FeedRow } from '#lib/types.js';
	import EventDialog from './EventDialog.svelte';
	import Modal from './Modal.svelte';

	let {
		month,
		events,
		feedEvents,
		feeds,
		onfeeds
	}: {
		month: Month;
		events: EventRow[];
		feedEvents: FeedEventRow[];
		feeds: FeedRow[];
		onfeeds: () => void;
	} = $props();

	const today = ymd(new Date());
	const days = $derived(gridDays(month));
	const monthPrefix = $derived(monthKey(month));
	const weekdays = $derived(
		days.slice(0, 7).map((d) => new Date(`${d}T12:00`).toLocaleDateString(undefined, { weekday: 'short' }))
	);

	const lastDayOf = (start: Date, end: Date) =>
		ymd(end > start ? new Date(end.getTime() - 1) : start);

	const items = $derived.by((): CalItem[] => {
		const feedName = new Map(feeds.map((f) => [f.id, f.name]));
		const own: CalItem[] = events.map((e) => {
			if (e.all_day) {
				return {
					key: `e:${e.id}`,
					source: 'own',
					own: e,
					title: e.title,
					location: e.location,
					notes: e.notes,
					allDay: true,
					firstDay: e.start_date!,
					lastDay: e.end_date!
				};
			}
			const start = new Date(e.starts_at!);
			const end = new Date(e.ends_at!);
			return {
				key: `e:${e.id}`,
				source: 'own',
				own: e,
				title: e.title,
				location: e.location,
				notes: e.notes,
				allDay: false,
				firstDay: ymd(start),
				lastDay: lastDayOf(start, end),
				start,
				end
			};
		});
		const subscribed: CalItem[] = feedEvents.map((e) => {
			const base = {
				key: `f:${e.id}`,
				source: 'feed' as const,
				feedName: feedName.get(e.feed_id),
				title: e.title,
				location: e.location,
				notes: e.notes
			};
			if (e.all_day) return { ...base, allDay: true, firstDay: e.start_date!, lastDay: e.end_date! };
			const start = new Date(e.starts_at!);
			const end = new Date(e.ends_at!);
			return { ...base, allDay: false, firstDay: ymd(start), lastDay: lastDayOf(start, end), start, end };
		});
		return [...own, ...subscribed];
	});

	const byDay = $derived.by(() => {
		const map = new Map<string, CalItem[]>();
		for (const day of days) map.set(day, []);
		for (const item of items) {
			for (const day of days) {
				if (day >= item.firstDay && day <= item.lastDay) map.get(day)!.push(item);
			}
		}
		for (const list of map.values()) {
			list.sort((a, b) => {
				if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
				if (a.allDay) return a.firstDay.localeCompare(b.firstDay) || b.lastDay.localeCompare(a.lastDay) || a.title.localeCompare(b.title);
				return a.start!.getTime() - b.start!.getTime() || a.title.localeCompare(b.title);
			});
		}
		return map;
	});

	// How many chips fit in a cell; measured from the grid.
	let gridHeight = $state(600);
	const perCell = $derived(Math.max(1, Math.floor((gridHeight / 6 - 30) / 20)));

	// Dialog state
	let eventOpen = $state(false);
	let eventItem = $state<CalItem | null>(null);
	let eventDay = $state(today);
	let dayOpen = $state(false);
	let dayShown = $state(today);

	function newEvent(day: string) {
		eventItem = null;
		eventDay = day;
		dayOpen = false;
		eventOpen = true;
	}
	function openItem(item: CalItem) {
		eventItem = item;
		eventDay = item.firstDay;
		dayOpen = false;
		eventOpen = true;
	}
	function openDay(day: string) {
		dayShown = day;
		dayOpen = true;
	}
	function onCell(day: string) {
		if (window.matchMedia('(max-width: 860px)').matches) openDay(day);
		else newEvent(day);
	}

	const go = (m: Month) => goto(`?m=${monthKey(m)}`, { reset: false });
	const thisMonth = (): Month => ({ y: new Date().getFullYear(), m: new Date().getMonth() + 1 });

	const isWeekStart = (i: number) => i % 7 === 0;
	const isWeekEnd = (i: number) => i % 7 === 6;
</script>

<section class="panel calendar" aria-label="Calendar">
	<header class="calendar__head">
		<div class="screen screen--title">
			<span class="screen__lights" aria-hidden="true"><i></i><i></i><i></i></span>
			<h1 class="screen__text">{formatMonth(month)}</h1>
		</div>
		<nav class="calendar__nav" aria-label="Month">
			<button class="icon-button" aria-label="Previous month" onclick={() => go(addMonths(month, -1))}>
				<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" /></svg>
			</button>
			<button class="button button--quiet" onclick={() => go(thisMonth())}>
				Today
			</button>
			<button class="icon-button" aria-label="Next month" onclick={() => go(addMonths(month, 1))}>
				<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" /></svg>
			</button>
		</nav>
		<span class="spacer"></span>
		<button class="button button--quiet" onclick={onfeeds}>
			<span class="grille" aria-hidden="true"></span>
			Calendars
		</button>
		<button class="button button--primary" onclick={() => newEvent(today.startsWith(monthPrefix) ? today : `${monthPrefix}-01`)}>
			New event
		</button>
	</header>

	<div class="calendar__weekdays" aria-hidden="true">
		{#each weekdays as w}<span class="label">{w}</span>{/each}
	</div>

	<div class="calendar__grid" bind:clientHeight={gridHeight}>
		{#each days as day, i (day)}
			{@const list = byDay.get(day) ?? []}
			{@const shown = list.length > perCell ? list.slice(0, perCell - 1) : list}
			{@const hidden = list.length - shown.length}
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<div
				class="cell"
				class:cell--out={!day.startsWith(monthPrefix)}
				class:cell--today={day === today}
				onclick={(e) => {
					if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('cell__items')) onCell(day);
				}}
			>
				<div class="cell__head">
					<button
						class="cell__date"
						aria-label={`${formatDayLong(day)}${list.length ? `, ${list.length} ${list.length === 1 ? 'event' : 'events'}` : ''}`}
						onclick={() => openDay(day)}
					>
						{Number(day.slice(8))}
					</button>
					<button class="cell__add" aria-label={`New event on ${formatDayLong(day)}`} onclick={() => newEvent(day)}>
						<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
					</button>
				</div>
				<div class="cell__items">
					{#each shown as item (item.key)}
						{#if item.allDay}
							<button
								class="bar"
								class:bar--feed={item.source === 'feed'}
								class:bar--from={day > item.firstDay && !isWeekStart(i)}
								class:bar--to={day < item.lastDay && !isWeekEnd(i)}
								title={item.title}
								onclick={() => openItem(item)}
							>
								{#if day === item.firstDay || isWeekStart(i)}{item.title}{:else}&nbsp;{/if}
							</button>
						{:else}
							<button
								class="chip"
								class:chip--feed={item.source === 'feed'}
								title={item.title}
								onclick={() => openItem(item)}
							>
								<span class="chip__time">{day === item.firstDay ? formatTime(item.start!) : '…'}</span>
								<span class="chip__title">{item.title}</span>
							</button>
						{/if}
					{/each}
					{#if hidden > 0}
						<button class="more" onclick={() => openDay(day)}>+{hidden} more</button>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</section>

<Modal bind:open={dayOpen} label={formatDayLong(dayShown)}>
	{@const list = byDay.get(dayShown) ?? []}
	{#if list.length}
		<ul class="agenda">
			{#each list as item (item.key)}
				<li>
					<button class="agenda__item" class:agenda__item--feed={item.source === 'feed'} onclick={() => openItem(item)}>
						<span class="agenda__time">
							{#if item.allDay}All day{:else if dayShown === item.firstDay}{formatTime(item.start!)}{:else}…{/if}
						</span>
						<span class="agenda__title">{item.title}</span>
						{#if item.feedName}<span class="agenda__source">{item.feedName}</span>{/if}
					</button>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">Nothing scheduled.</p>
	{/if}
	<div class="form__actions">
		<span class="spacer"></span>
		<button class="button button--primary" onclick={() => newEvent(dayShown)}>New event</button>
	</div>
</Modal>

<EventDialog bind:open={eventOpen} item={eventItem} day={eventDay} />
