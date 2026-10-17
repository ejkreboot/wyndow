import { matchRule } from '../planner/rules';
import type { Rule } from '../planner/types';

export const BLOCK_HOURS = [1, 1.5, 2, 2.5, 3, 4] as const;
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

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
