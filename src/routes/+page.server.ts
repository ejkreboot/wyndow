import { fail } from '@sveltejs/kit';
import { normalizeFeedUrl, STALE_AFTER_MS, syncFeed } from '#lib/server/ics.js';
import { gridRange, parseMonth } from '#lib/dates.js';
import type { Actions, PageServerLoad } from './$types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const optional = (form: FormData, key: string) => str(form, key) || null;

export const load: PageServerLoad = async ({ locals, url }) => {
	const db = locals.supabase;
	const month = parseMonth(url.searchParams.get('m'));
	const { first, last } = gridRange(month);

	// Pad a day each side so every viewer time zone sees whole days; the client places items.
	const from = new Date(Date.UTC(first.y, first.m - 1, first.d - 1)).toISOString();
	const to = new Date(Date.UTC(last.y, last.m - 1, last.d + 2)).toISOString();
	const fromDate = from.slice(0, 10);
	const toDate = to.slice(0, 10);

	const [timed, allDay, feeds, todos] = await Promise.all([
		db.from('events').select('*').eq('all_day', false).lt('starts_at', to).gte('ends_at', from),
		db.from('events').select('*').eq('all_day', true).lte('start_date', toDate).gte('end_date', fromDate),
		db.from('feeds').select('id, name, url, visible, last_synced_at, last_error').order('created_at'),
		db.from('todos').select('id, title, done, position').order('position')
	]);

	const visibleFeeds = (feeds.data ?? []).filter((f) => f.visible).map((f) => f.id);
	const [feedTimed, feedAllDay] = visibleFeeds.length
		? await Promise.all([
				db
					.from('feed_events')
					.select('id, feed_id, uid, title, location, notes, all_day, starts_at, ends_at, start_date, end_date')
					.in('feed_id', visibleFeeds)
					.eq('all_day', false)
					.lt('starts_at', to)
					.gte('ends_at', from)
					.limit(5000),
				db
					.from('feed_events')
					.select('id, feed_id, uid, title, location, notes, all_day, starts_at, ends_at, start_date, end_date')
					.in('feed_id', visibleFeeds)
					.eq('all_day', true)
					.lte('start_date', toDate)
					.gte('end_date', fromDate)
					.limit(5000)
			])
		: [{ data: [] }, { data: [] }];

	const now = Date.now();
	const staleFeeds = (feeds.data ?? []).some(
		(f) => !f.last_synced_at || now - Date.parse(f.last_synced_at) > STALE_AFTER_MS
	);

	return {
		month,
		events: [...(timed.data ?? []), ...(allDay.data ?? [])],
		feedEvents: [...(feedTimed.data ?? []), ...(feedAllDay.data ?? [])],
		feeds: feeds.data ?? [],
		staleFeeds,
		todos: todos.data ?? []
	};
};

/** Position between two neighbours; renumbers the list when the gap gets too small. */
async function positionBetween(db: App.Locals['supabase'], beforeId: string | null, afterId: string | null) {
	const ids = [beforeId, afterId].filter((x): x is string => !!x);
	const { data } = ids.length
		? await db.from('todos').select('id, position').in('id', ids)
		: { data: [] as { id: string; position: number }[] };
	const before = data?.find((r) => r.id === beforeId)?.position;
	const after = data?.find((r) => r.id === afterId)?.position;

	if (before == null && after == null) return 1024;
	if (before == null) return after! - 1024;
	if (after == null) return before + 1024;
	if (after - before > 1e-6) return (before + after) / 2;

	// Gap exhausted: spread everything out again, then retry once.
	const { data: all } = await db.from('todos').select('id, position').order('position');
	await Promise.all(
		(all ?? []).map((r, i) => db.from('todos').update({ position: (i + 1) * 1024 }).eq('id', r.id))
	);
	const bi = all!.findIndex((r) => r.id === beforeId);
	return (bi + 1) * 1024 + 512;
}

export const actions: Actions = {
	// --- events -------------------------------------------------------------
	saveEvent: async ({ request, locals }) => {
		const form = await request.formData();
		const id = optional(form, 'id');
		const title = str(form, 'title');
		const allDay = form.get('all_day') === 'on' || form.get('all_day') === 'true';
		if (!title) return fail(400, { message: 'Give the event a title.' });

		const row = {
			title,
			location: optional(form, 'location'),
			notes: optional(form, 'notes'),
			all_day: allDay,
			starts_at: null as string | null,
			ends_at: null as string | null,
			start_date: null as string | null,
			end_date: null as string | null
		};

		if (allDay) {
			const start = str(form, 'start_date');
			const end = str(form, 'end_date') || start;
			if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) return fail(400, { message: 'Pick a date.' });
			if (end < start) return fail(400, { message: 'The end date is before the start date.' });
			row.start_date = start;
			row.end_date = end;
		} else {
			const start = Date.parse(str(form, 'starts_at'));
			const end = Date.parse(str(form, 'ends_at'));
			if (Number.isNaN(start) || Number.isNaN(end)) return fail(400, { message: 'Pick a start and end time.' });
			if (end < start) return fail(400, { message: 'The event ends before it starts.' });
			row.starts_at = new Date(start).toISOString();
			row.ends_at = new Date(end).toISOString();
		}

		const { error } = id
			? await locals.supabase.from('events').update(row).eq('id', id)
			: await locals.supabase.from('events').insert(row);
		if (error) return fail(500, { message: error.message });
		return { saved: true };
	},

	deleteEvent: async ({ request, locals }) => {
		const id = str(await request.formData(), 'id');
		const { error } = await locals.supabase.from('events').delete().eq('id', id);
		if (error) return fail(500, { message: error.message });
		return { deleted: true };
	},

	// --- todos --------------------------------------------------------------
	addTodo: async ({ request, locals }) => {
		const title = str(await request.formData(), 'title');
		if (!title) return fail(400, { message: 'Type something to add.' });
		const { data: lastRow } = await locals.supabase
			.from('todos')
			.select('position')
			.order('position', { ascending: false })
			.limit(1)
			.maybeSingle();
		const position = (lastRow?.position ?? 0) + 1024;
		const { error } = await locals.supabase.from('todos').insert({ title, position });
		if (error) return fail(500, { message: error.message });
		return { added: true };
	},

	updateTodo: async ({ request, locals }) => {
		const form = await request.formData();
		const patch: { title?: string; done?: boolean } = {};
		if (form.has('title')) {
			const title = str(form, 'title');
			if (!title) return fail(400, { message: 'A to-do needs some text.' });
			patch.title = title;
		}
		if (form.has('done')) patch.done = form.get('done') === 'true';
		const { error } = await locals.supabase.from('todos').update(patch).eq('id', str(form, 'id'));
		if (error) return fail(500, { message: error.message });
		return { updated: true };
	},

	moveTodo: async ({ request, locals }) => {
		const form = await request.formData();
		const position = await positionBetween(locals.supabase, optional(form, 'before'), optional(form, 'after'));
		const { error } = await locals.supabase.from('todos').update({ position }).eq('id', str(form, 'id'));
		if (error) return fail(500, { message: error.message });
		return { moved: true };
	},

	deleteTodo: async ({ request, locals }) => {
		const { error } = await locals.supabase.from('todos').delete().eq('id', str(await request.formData(), 'id'));
		if (error) return fail(500, { message: error.message });
		return { deleted: true };
	},

	clearDone: async ({ locals }) => {
		const { error } = await locals.supabase.from('todos').delete().eq('done', true);
		if (error) return fail(500, { message: error.message });
		return { cleared: true };
	},

	// --- feeds --------------------------------------------------------------
	addFeed: async ({ request, locals }) => {
		const form = await request.formData();
		const url = normalizeFeedUrl(str(form, 'url'));
		const name = str(form, 'name') || (url ? new URL(url).hostname : '');
		if (!url) return fail(400, { feedMessage: 'That doesn’t look like a calendar link (https:// or webcal://).' });

		const { data: feed, error } = await locals.supabase
			.from('feeds')
			.insert({ name, url })
			.select('id, user_id, url')
			.single();
		if (error) {
			const message = error.code === '23505' ? 'You already subscribe to that calendar.' : error.message;
			return fail(400, { feedMessage: message });
		}
		const syncError = await syncFeed(locals.supabase, feed);
		return { feedAdded: true, feedMessage: syncError ? `Added, but the first sync failed: ${syncError}` : null };
	},

	updateFeed: async ({ request, locals }) => {
		const form = await request.formData();
		const patch: { name?: string; visible?: boolean } = {};
		if (form.has('name') && str(form, 'name')) patch.name = str(form, 'name');
		if (form.has('visible')) patch.visible = form.get('visible') === 'true';
		const { error } = await locals.supabase.from('feeds').update(patch).eq('id', str(form, 'id'));
		if (error) return fail(500, { feedMessage: error.message });
		return { feedUpdated: true };
	},

	deleteFeed: async ({ request, locals }) => {
		const { error } = await locals.supabase.from('feeds').delete().eq('id', str(await request.formData(), 'id'));
		if (error) return fail(500, { feedMessage: error.message });
		return { feedDeleted: true };
	},

	/** Refreshes one feed (id given), or every feed that is stale (force=true: every feed). */
	syncFeeds: async ({ request, locals }) => {
		const form = await request.formData();
		const id = optional(form, 'id');
		const force = form.get('force') === 'true';
		let query = locals.supabase.from('feeds').select('id, user_id, url, last_synced_at');
		if (id) query = query.eq('id', id);
		const { data: feeds, error } = await query;
		if (error) return fail(500, { feedMessage: error.message });

		const now = Date.now();
		const due = (feeds ?? []).filter(
			(f) => id || force || !f.last_synced_at || now - Date.parse(f.last_synced_at) > STALE_AFTER_MS
		);
		await Promise.all(due.map((f) => syncFeed(locals.supabase, f)));
		return { synced: due.length };
	}
};
