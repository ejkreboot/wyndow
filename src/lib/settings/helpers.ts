import { matchRule } from '../planner/rules';
import type { Rule } from '../planner/types';

export const BLOCK_HOURS = [1, 1.5, 2, 2.5, 3, 4] as const;
/** Weekdays in display order (Sunday first); `value` is the ISO weekday stored in settings. */
export const WEEKDAY_LABELS = [
	{ value: 7, label: 'Sun' },
	{ value: 1, label: 'Mon' },
	{ value: 2, label: 'Tue' },
	{ value: 3, label: 'Wed' },
	{ value: 4, label: 'Thu' },
	{ value: 5, label: 'Fri' },
	{ value: 6, label: 'Sat' }
] as const;

/** True if `tz` is an IANA timezone name the runtime knows. */
export function isValidTimezone(tz: string): boolean {
	if (!tz || tz.length > 64) return false;
	try {
		new Intl.DateTimeFormat('en', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

/** Inbox entries: titles that no rule matches. */
export function unmatchedTitles<T extends { title: string; sourceId: string }>(
	titles: readonly T[],
	rules: readonly Rule[]
): T[] {
	return titles.filter((t) => t.title.trim() !== '' && matchRule(t.title, t.sourceId, rules) === null);
}

/** Accepts webcal:// as https:// (the common way calendar apps hand out feed links). */
export function normalizeFeedInput(url: string): string {
	return url.trim().replace(/^webcals?:\/\//i, 'https://');
}
