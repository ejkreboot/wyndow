import type { CalEvent, LocalDate, Minutes } from '$lib/planner/types';
import { localParts, medianMinutes, shiftDate, toEvent } from './mappers';
import { fail, type Db } from './types';

/** Structurally matches ParsedEvent from src/lib/server/ics.ts. */
export interface EventInput {
	uid: string;
	title: string;
	description?: string | null;
	start: Date | null;
	end: Date | null;
	allDayStart: LocalDate | null;
	allDayEnd: LocalDate | null;
}

const PAGE = 1000;
const BATCH = 500;

export function eventRow(e: EventInput, sourceId: string, userId?: string) {
	return {
		...(userId ? { user_id: userId } : {}),
		source_id: sourceId,
		uid: e.uid,
		title: e.title,
		description: e.description ?? null,
		starts_at: e.start ? e.start.toISOString() : null,
		ends_at: e.end ? e.end.toISOString() : null,
		all_day_start: e.allDayStart,
		all_day_end: e.allDayEnd
	};
}

/** Upserts on (source_id, uid) in batches; later duplicates of a uid win. */
export async function upsertEventRows(
	db: Db,
	rows: ReturnType<typeof eventRow>[]
): Promise<void> {
	const byUid = new Map(rows.map((r) => [r.uid + '\u0000' + r.source_id, r]));
	const unique = [...byUid.values()];
	for (let i = 0; i < unique.length; i += BATCH) {
		const { error } = await db
			.from('calendar_events')
			.upsert(unique.slice(i, i + BATCH), { onConflict: 'source_id,uid' });
		if (error) fail('Could not save events', error);
	}
}

export async function upsertEvents(db: Db, sourceId: string, events: EventInput[]): Promise<void> {
	await upsertEventRows(
		db,
		events.map((e) => eventRow(e, sourceId))
	);
}

/** Events overlapping [from - 1 day, to + 1 day] (dates inclusive). */
export async function listEvents(
	db: Db,
	range: { from: LocalDate; to: LocalDate }
): Promise<CalEvent[]> {
	const lo = shiftDate(range.from, -1);
	const hi = shiftDate(range.to, 2); // exclusive
	const loTs = `${lo}T00:00:00.000Z`;
	const hiTs = `${hi}T00:00:00.000Z`;
	const filter = [
		`and(starts_at.lt.${hiTs},ends_at.gt.${loTs})`,
		`and(starts_at.gte.${loTs},starts_at.lt.${hiTs},ends_at.is.null)`,
		`and(all_day_start.lt.${hi},all_day_end.gt.${lo})`,
		`and(all_day_start.gte.${lo},all_day_start.lt.${hi},all_day_end.is.null)`
	].join(',');
	const out: CalEvent[] = [];
	for (let offset = 0; ; offset += PAGE) {
		const { data, error } = await db
			.from('calendar_events')
			.select('*')
			.or(filter)
			.order('id')
			.range(offset, offset + PAGE - 1);
		if (error) fail('Could not load events', error);
		out.push(...data.map(toEvent));
		if (data.length < PAGE) break;
	}
	return out;
}

/**
 * Deletes a source's events inside span (inclusive local dates) whose uid is not in `uids`.
 * `userId` is for the admin client, which bypasses RLS and must filter explicitly.
 */
export async function deleteEventsNotIn(
	db: Db,
	sourceId: string,
	uids: string[],
	span: { from: LocalDate; to: LocalDate },
	userId?: string
): Promise<number> {
	const keep = new Set(uids);
	const loTs = `${span.from}T00:00:00.000Z`;
	const hiTs = `${shiftDate(span.to, 1)}T00:00:00.000Z`;
	const stale: string[] = [];
	for (let offset = 0; ; offset += PAGE) {
		let q = db
			.from('calendar_events')
			.select('id,uid')
			.eq('source_id', sourceId)
			.or(
				`and(starts_at.gte.${loTs},starts_at.lt.${hiTs}),and(all_day_start.gte.${span.from},all_day_start.lte.${span.to})`
			)
			.order('id')
			.range(offset, offset + PAGE - 1);
		if (userId) q = q.eq('user_id', userId);
		const { data, error } = await q;
		if (error) fail('Could not check events', error);
		for (const r of data) if (!keep.has(r.uid)) stale.push(r.id);
		if (data.length < PAGE) break;
	}
	for (let i = 0; i < stale.length; i += 100) {
		let q = db.from('calendar_events').delete().in('id', stale.slice(i, i + 100));
		if (userId) q = q.eq('user_id', userId);
		const { error } = await q;
		if (error) fail('Could not delete events', error);
	}
	return stale.length;
}

export interface TitleSummary {
	title: string;
	sourceId: string;
	count: number;
	first: LocalDate;
	last: LocalDate;
	typicalStart: Minutes | null;
	typicalEnd: Minutes | null;
}

/** Distinct (title, source) pairs with counts and typical local times, for the settings inbox. */
export async function distinctTitles(db: Db, tz = 'America/Detroit'): Promise<TitleSummary[]> {
	const groups = new Map<
		string,
		{ title: string; sourceId: string; dates: LocalDate[]; starts: number[]; ends: number[] }
	>();
	for (let offset = 0; ; offset += PAGE) {
		const { data, error } = await db
			.from('calendar_events')
			.select('title,source_id,starts_at,ends_at,all_day_start')
			.order('id')
			.range(offset, offset + PAGE - 1);
		if (error) fail('Could not load event titles', error);
		for (const r of data) {
			const key = r.source_id + '\u0000' + r.title;
			let g = groups.get(key);
			if (!g) groups.set(key, (g = { title: r.title, sourceId: r.source_id, dates: [], starts: [], ends: [] }));
			if (r.starts_at) {
				const s = localParts(new Date(r.starts_at), tz);
				g.dates.push(s.date);
				g.starts.push(s.minutes);
				if (r.ends_at) g.ends.push(localParts(new Date(r.ends_at), tz).minutes);
			} else if (r.all_day_start) {
				g.dates.push(r.all_day_start);
			}
		}
		if (data.length < PAGE) break;
	}
	return [...groups.values()]
		.filter((g) => g.dates.length > 0)
		.map((g) => {
			const dates = [...g.dates].sort();
			return {
				title: g.title,
				sourceId: g.sourceId,
				count: dates.length,
				first: dates[0],
				last: dates[dates.length - 1],
				typicalStart: medianMinutes(g.starts),
				typicalEnd: medianMinutes(g.ends)
			};
		})
		.sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
}
