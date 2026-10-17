// Date helpers. 'YYYY-MM-DD' strings are manipulated with plain UTC arithmetic;
// instants are converted to a user's timezone with Intl.DateTimeFormat (no date library).
import type { IsoWeekday, LocalDate, Minutes } from './types';

const MS_PER_DAY = 86_400_000;

function toUtcMs(d: LocalDate): number {
	const [y, m, day] = d.split('-').map(Number);
	return Date.UTC(y, m - 1, day);
}

function fromUtcMs(ms: number): LocalDate {
	const dt = new Date(ms);
	const y = String(dt.getUTCFullYear()).padStart(4, '0');
	const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
	const day = String(dt.getUTCDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/** Shift a date by a whole number of days (negative goes back). */
export function addDays(d: LocalDate, n: number): LocalDate {
	return fromUtcMs(toUtcMs(d) + n * MS_PER_DAY);
}

/** Number of days from a to b (positive when b is later). */
export function diffDays(a: LocalDate, b: LocalDate): number {
	return Math.round((toUtcMs(b) - toUtcMs(a)) / MS_PER_DAY);
}

export function weekdayOf(d: LocalDate): IsoWeekday {
	const js = new Date(toUtcMs(d)).getUTCDay(); // 0 = Sunday
	return (js === 0 ? 7 : js) as IsoWeekday;
}

/** Every date from `from` to `to`, inclusive. Empty when `to` is before `from`. */
export function eachDate(from: LocalDate, to: LocalDate): LocalDate[] {
	const out: LocalDate[] = [];
	for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
	return out;
}

/** The Sunday on or before the given date (weeks run Sunday to Saturday). */
export function weekStartOf(d: LocalDate): LocalDate {
	return addDays(d, -(weekdayOf(d) % 7));
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
	let f = formatters.get(timeZone);
	if (!f) {
		f = new Intl.DateTimeFormat('en-US', {
			timeZone,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
		formatters.set(timeZone, f);
	}
	return f;
}

/** Local calendar date and minutes after local midnight for an instant in a timezone. */
export function zonedParts(instant: Date, tz: string): { date: LocalDate; minutes: Minutes } {
	const parts: Record<string, string> = {};
	for (const p of formatterFor(tz).formatToParts(instant)) parts[p.type] = p.value;
	const date = `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`;
	const minutes = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
	return { date, minutes };
}

/** Today's date in the timezone. `now` is injectable for tests. */
export function todayIn(tz: string, now: Date = new Date()): LocalDate {
	return zonedParts(now, tz).date;
}

/** 'HH:MM' (24-hour). 1440 renders as '24:00'. */
export function formatTime(m: Minutes): string {
	const h = Math.floor(m / 60);
	const mm = Math.round(m % 60);
	return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Parse 'H:MM' or 'HH:MM' (also accepts 'HH:MM:SS') into minutes after midnight. */
export function parseTime(t: string): Minutes {
	const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t.trim());
	if (!match) throw new Error(`Invalid time: ${t}`);
	return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * The instant at which the wall clock in `tz` shows `date` at `minutes` after midnight.
 * Iterates to converge across DST offsets; a time skipped by spring-forward lands just after the gap.
 */
export function instantFromZoned(date: LocalDate, minutes: Minutes, tz: string): Date {
	const [y, m, d] = date.split('-').map(Number);
	const wallMs = Date.UTC(y, m - 1, d) + minutes * 60_000;
	let guess = wallMs;
	for (let i = 0; i < 3; i++) {
		const shown = zonedParts(new Date(guess), tz);
		const shownMs = toUtcMs(shown.date) + shown.minutes * 60_000;
		if (shownMs === wallMs) break;
		guess += wallMs - shownMs;
	}
	return new Date(guess);
}
