import ICAL from 'ical.js';
import type { Db } from './supabase.js';

/** How far around "now" recurring feed events are expanded and stored. */
const WINDOW_PAST_DAYS = 400;
const WINDOW_FUTURE_DAYS = 760;
const MAX_OCCURRENCES_PER_FEED = 8000;
const MAX_BYTES = 15 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12_000;
/** Feeds older than this are refreshed when the calendar loads. */
export const STALE_AFTER_MS = 30 * 60 * 1000;

export type Occurrence = {
	uid: string;
	title: string;
	location: string | null;
	notes: string | null;
	all_day: boolean;
	starts_at: string | null;
	ends_at: string | null;
	start_date: string | null;
	end_date: string | null;
};

export function normalizeFeedUrl(raw: string): string | null {
	const trimmed = raw.trim().replace(/^webcals?:\/\//i, 'https://');
	try {
		const url = new URL(trimmed);
		if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
		return url.toString();
	} catch {
		return null;
	}
}

export async function fetchIcs(url: string): Promise<string> {
	const res = await fetch(url, {
		headers: { accept: 'text/calendar, */*;q=0.5', 'user-agent': 'Wyndow/1.0 (calendar subscription)' },
		redirect: 'follow',
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
	});
	if (!res.ok) throw new Error(`Feed responded ${res.status} ${res.statusText}`.trim());
	const length = Number(res.headers.get('content-length') ?? 0);
	if (length > MAX_BYTES) throw new Error('Feed is too large');
	const text = await res.text();
	if (text.length > MAX_BYTES) throw new Error('Feed is too large');
	if (!text.includes('BEGIN:VCALENDAR')) throw new Error('That link did not return an iCalendar (.ics) file');
	return text;
}

// ---------------------------------------------------------------------------
// Time conversion

const pad = (n: number) => String(n).padStart(2, '0');
const dateString = (t: ICAL.Time) => `${t.year}-${pad(t.month)}-${pad(t.day)}`;

function isIanaZone(tzid: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tzid });
		return true;
	} catch {
		return false;
	}
}

/** Wall-clock time in an IANA zone → UTC instant. */
function zonedToUtc(t: ICAL.Time, tzid: string): Date {
	const asUtc = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
	const fmt = new Intl.DateTimeFormat('en-US', {
		timeZone: tzid,
		hourCycle: 'h23',
		year: 'numeric',
		month: 'numeric',
		day: 'numeric',
		hour: 'numeric',
		minute: 'numeric',
		second: 'numeric'
	});
	const offsetAt = (ms: number) => {
		const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
		const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
		return wall - ms;
	};
	// Two passes settle DST transitions.
	let guess = asUtc - offsetAt(asUtc);
	guess = asUtc - offsetAt(guess);
	return new Date(guess);
}

/**
 * Converts an ICAL.Time to an instant. Uses the feed's VTIMEZONE when present;
 * otherwise falls back to the TZID name (if it's an IANA zone), else UTC.
 */
function toInstant(t: ICAL.Time, fallbackTzid: string | null): Date {
	const zone = t.zone;
	const floating = !zone || zone === ICAL.Timezone.localTimezone || zone.tzid === 'floating';
	if (!floating) return t.toJSDate();
	if (fallbackTzid && isIanaZone(fallbackTzid)) return zonedToUtc(t, fallbackTzid);
	return new Date(Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second));
}

// ---------------------------------------------------------------------------
// Expansion

function text(component: ICAL.Component, name: string): string | null {
	const value = component.getFirstPropertyValue(name);
	if (value == null) return null;
	const s = String(value).trim();
	return s.length ? s : null;
}

function occurrence(
	uid: string,
	item: ICAL.Event,
	start: ICAL.Time,
	end: ICAL.Time | null,
	tzid: string | null
): Occurrence {
	const base = {
		uid,
		title: item.summary?.trim() || '(untitled)',
		location: item.location?.trim() || null,
		notes: text(item.component, 'description')
	};
	if (start.isDate) {
		// DTEND is exclusive for all-day events; store an inclusive end date.
		let last = start.clone();
		if (end && end.compare(start) > 0) {
			last = end.clone();
			last.adjust(-1, 0, 0, 0);
		}
		return {
			...base,
			all_day: true,
			starts_at: null,
			ends_at: null,
			start_date: dateString(start),
			end_date: dateString(last)
		};
	}
	const s = toInstant(start, tzid);
	const e = end ? toInstant(end, tzid) : s;
	return {
		...base,
		all_day: false,
		starts_at: s.toISOString(),
		ends_at: (e < s ? s : e).toISOString(),
		start_date: null,
		end_date: null
	};
}

export function expandIcs(icsText: string, now = new Date()): Occurrence[] {
	const root = new ICAL.Component(ICAL.parse(icsText));
	for (const vtz of root.getAllSubcomponents('vtimezone')) {
		try {
			ICAL.TimezoneService.register(vtz);
		} catch {
			/* malformed zone: times fall back to the TZID name */
		}
	}

	const windowStart = now.getTime() - WINDOW_PAST_DAYS * 86_400_000;
	const windowEnd = now.getTime() + WINDOW_FUTURE_DAYS * 86_400_000;
	const windowEndTime = ICAL.Time.fromJSDate(new Date(windowEnd), true);

	// Group by UID so RECURRENCE-ID overrides attach to their series.
	const masters = new Map<string, ICAL.Component>();
	const exceptions: ICAL.Component[] = [];
	for (const vevent of root.getAllSubcomponents('vevent')) {
		if (String(vevent.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED') continue;
		if (vevent.hasProperty('recurrence-id')) exceptions.push(vevent);
		else masters.set(String(vevent.getFirstPropertyValue('uid') ?? crypto.randomUUID()), vevent);
	}

	const out: Occurrence[] = [];
	const inWindow = (o: Occurrence) => {
		const startMs = o.all_day ? Date.parse(o.start_date! + 'T00:00:00Z') : Date.parse(o.starts_at!);
		const endMs = o.all_day ? Date.parse(o.end_date! + 'T23:59:59Z') : Date.parse(o.ends_at!);
		return endMs >= windowStart && startMs <= windowEnd;
	};

	for (const [uid, vevent] of masters) {
		if (out.length >= MAX_OCCURRENCES_PER_FEED) break;
		const event = new ICAL.Event(vevent);
		const tzid = (vevent.getFirstProperty('dtstart')?.getParameter('tzid') as string | undefined) ?? null;
		for (const ex of exceptions) {
			if (String(ex.getFirstPropertyValue('uid')) === uid) {
				try {
					event.relateException(ex);
				} catch {
					/* exception that doesn't belong to this series */
				}
			}
		}

		if (!event.startDate) continue;

		if (!event.isRecurring()) {
			const o = occurrence(uid, event, event.startDate, event.endDate, tzid);
			if (inWindow(o)) out.push(o);
			continue;
		}

		const it = event.iterator();
		let next: ICAL.Time | null;
		let guard = 0;
		while ((next = it.next()) && guard++ < 20_000) {
			if (next.compare(windowEndTime) > 0) break;
			const details = event.getOccurrenceDetails(next);
			const o = occurrence(uid, details.item, details.startDate, details.endDate, tzid);
			if (inWindow(o)) out.push(o);
			if (out.length >= MAX_OCCURRENCES_PER_FEED) break;
		}
	}

	// Overrides whose series wasn't in the file.
	for (const ex of exceptions) {
		const uid = String(ex.getFirstPropertyValue('uid'));
		if (masters.has(uid)) continue;
		const event = new ICAL.Event(ex);
		if (!event.startDate) continue;
		const tzid = (ex.getFirstProperty('dtstart')?.getParameter('tzid') as string | undefined) ?? null;
		const o = occurrence(uid, event, event.startDate, event.endDate, tzid);
		if (inWindow(o)) out.push(o);
	}

	return out;
}

// ---------------------------------------------------------------------------
// Sync

type FeedRow = { id: string; user_id: string; url: string };

/** Fetches a feed and replaces its stored occurrences. Never throws; records the error on the feed. */
export async function syncFeed(db: Db, feed: FeedRow): Promise<string | null> {
	try {
		const occurrences = expandIcs(await fetchIcs(feed.url));
		const { error: delError } = await db.from('feed_events').delete().eq('feed_id', feed.id);
		if (delError) throw new Error(delError.message);
		for (let i = 0; i < occurrences.length; i += 1000) {
			const rows = occurrences
				.slice(i, i + 1000)
				.map((o) => ({ ...o, feed_id: feed.id, user_id: feed.user_id }));
			const { error } = await db.from('feed_events').insert(rows);
			if (error) throw new Error(error.message);
		}
		await db
			.from('feeds')
			.update({ last_synced_at: new Date().toISOString(), last_error: null })
			.eq('id', feed.id);
		return null;
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		await db
			.from('feeds')
			.update({ last_synced_at: new Date().toISOString(), last_error: message.slice(0, 500) })
			.eq('id', feed.id);
		return message;
	}
}
