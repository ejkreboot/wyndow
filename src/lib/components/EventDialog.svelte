<script lang="ts">
	import { enhance } from '$app/forms';
	import { refreshAll } from '$app/navigation';
	import { act } from '#lib/act.js';
	import { focusOnMount } from '#lib/focus.js';
	import { addDays, formatDayLong, formatTime, startOfDay, toLocalInput } from '#lib/dates.js';
	import type { CalItem } from '#lib/types.js';
	import Modal from './Modal.svelte';

	let {
		open = $bindable(false),
		item,
		day
	}: { open: boolean; item: CalItem | null; day: string } = $props();

	const readonly = $derived(item?.source === 'feed');

	let title = $state('');
	let allDay = $state(false);
	let startDate = $state('');
	let startTime = $state('09:00');
	let endDate = $state('');
	let endTime = $state('10:00');
	let location = $state('');
	let notes = $state('');
	let message = $state<string | null>(null);
	let busy = $state(false);

	// Reset the fields whenever the dialog opens.
	$effect(() => {
		if (!open) return;
		message = null;
		busy = false;
		const own = item?.own;
		if (own) {
			title = own.title;
			allDay = own.all_day;
			location = own.location ?? '';
			notes = own.notes ?? '';
			if (own.all_day) {
				startDate = own.start_date!;
				endDate = own.end_date!;
				startTime = '09:00';
				endTime = '10:00';
			} else {
				const [sd, st] = toLocalInput(new Date(own.starts_at!)).split('T');
				const [ed, et] = toLocalInput(new Date(own.ends_at!)).split('T');
				startDate = sd;
				startTime = st;
				endDate = ed;
				endTime = et;
			}
		} else {
			title = '';
			allDay = false;
			location = '';
			notes = '';
			startDate = day;
			endDate = day;
			startTime = '09:00';
			endTime = '10:00';
		}
	});

	// Keep the span when the start date moves.
	let lastStart = '';
	function onStartDate() {
		if (lastStart && endDate) {
			const shift = (startOfDay(startDate).getTime() - startOfDay(lastStart).getTime()) / 86_400_000;
			endDate = addDays(endDate, Math.round(shift));
		}
		lastStart = startDate;
	}

	const local = (date: string, time: string) => new Date(`${date}T${time || '00:00'}`);

	async function remove() {
		if (!item?.own || busy) return;
		busy = true;
		try {
			await act('deleteEvent', { id: item.own.id });
			await refreshAll();
			open = false;
		} catch (e) {
			message = (e as Error).message;
			busy = false;
		}
	}

	const whenText = $derived.by(() => {
		if (!item) return '';
		if (item.allDay) {
			return item.firstDay === item.lastDay
				? `${formatDayLong(item.firstDay)} · all day`
				: `${formatDayLong(item.firstDay)} – ${formatDayLong(item.lastDay)}`;
		}
		const s = item.start!;
		const e = item.end!;
		return item.firstDay === item.lastDay
			? `${formatDayLong(item.firstDay)} · ${formatTime(s)} – ${formatTime(e)}`
			: `${formatDayLong(item.firstDay)} ${formatTime(s)} – ${formatDayLong(item.lastDay)} ${formatTime(e)}`;
	});
</script>

<Modal bind:open label={readonly ? (item?.feedName ?? 'Subscribed') : item ? 'Edit event' : 'New event'}>
	{#if readonly && item}
		<div class="readout">
			<h2 class="readout__title">{item.title}</h2>
			<p class="readout__when">{whenText}</p>
			{#if item.location}<p class="readout__meta">{item.location}</p>{/if}
			{#if item.notes}<p class="readout__notes">{item.notes}</p>{/if}
			<p class="hint">From a subscribed calendar. Edit it at the source.</p>
		</div>
	{:else}
		<form
			class="form"
			method="POST"
			action="?/saveEvent"
			use:enhance={({ formData, cancel }) => {
				if (!allDay) {
					const s = local(startDate, startTime);
					let e = local(endDate || startDate, endTime);
					if (e < s && (endDate || startDate) === startDate) e = new Date(e.getTime() + 86_400_000);
					if (e < s) {
						message = 'The event ends before it starts.';
						cancel();
						return;
					}
					formData.set('starts_at', s.toISOString());
					formData.set('ends_at', e.toISOString());
				}
				busy = true;
				return async ({ result, update }) => {
					busy = false;
					if (result.type === 'success') {
						open = false;
						await update();
					} else if (result.type === 'failure') {
						message = (result.data?.message as string) ?? 'Could not save.';
					} else {
						message = 'Could not save.';
					}
				};
			}}
		>
			{#if item?.own}<input type="hidden" name="id" value={item.own.id} />{/if}

			<input
				class="field field--title"
				name="title"
				placeholder="Title"
				autocomplete="off"
				required
				bind:value={title}
				use:focusOnMount
			/>

			<label class="toggle">
				<input type="checkbox" name="all_day" bind:checked={allDay} />
				<span class="toggle__box" aria-hidden="true"></span>
				<span>All day</span>
			</label>

			<div class="when">
				<span class="label">Start</span>
				<input
					class="field"
					type="date"
					name="start_date"
					required
					bind:value={startDate}
					onfocus={() => (lastStart = startDate)}
					onchange={onStartDate}
				/>
				{#if !allDay}<input class="field" type="time" bind:value={startTime} required />{/if}

				<span class="label">End</span>
				<input class="field" type="date" name="end_date" min={startDate} bind:value={endDate} />
				{#if !allDay}<input class="field" type="time" bind:value={endTime} required />{/if}
			</div>

			<input class="field" name="location" placeholder="Location" autocomplete="off" bind:value={location} />
			<textarea class="field" name="notes" rows="3" placeholder="Notes" bind:value={notes}></textarea>

			{#if message}<p class="error" role="alert">{message}</p>{/if}

			<div class="form__actions">
				{#if item?.own}
					<button type="button" class="button button--quiet button--danger" disabled={busy} onclick={remove}>
						Delete
					</button>
				{/if}
				<span class="spacer"></span>
				<button type="button" class="button button--quiet" onclick={() => (open = false)}>Cancel</button>
				<button type="submit" class="button button--primary" disabled={busy}>Save</button>
			</div>
		</form>
	{/if}
</Modal>
