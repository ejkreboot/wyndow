// Pure helpers for the Season view (no I/O).
import { addDays, weekStartOf, weekdayOf } from '$lib/planner/dates';
import type { Allocation, LocalDate } from '$lib/planner/types';

export const WEEKS_BEFORE = 4;
export const WEEKS_AFTER = 30;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sunday four weeks before today through the Saturday thirty weeks after today. */
export function seasonRange(today: LocalDate): { from: LocalDate; to: LocalDate } {
	const start = weekStartOf(today);
	return { from: addDays(start, -7 * WEEKS_BEFORE), to: addDays(start, 7 * WEEKS_AFTER + 6) };
}

/** True for a real calendar date in YYYY-MM-DD form. */
export function isValidDate(d: unknown): d is LocalDate {
	if (typeof d !== 'string' || !DATE_RE.test(d)) return false;
	const [y, m, day] = d.split('-').map(Number);
	const t = new Date(Date.UTC(y, m - 1, day));
	return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === day;
}

export function inRange(d: LocalDate, range: { from: LocalDate; to: LocalDate }): boolean {
	return isValidDate(d) && d >= range.from && d <= range.to;
}

/** Sundays starting every week row in the range. */
export function weekStarts(range: { from: LocalDate; to: LocalDate }): LocalDate[] {
	const out: LocalDate[] = [];
	for (let s = weekStartOf(range.from); s <= range.to; s = addDays(s, 7)) out.push(s);
	return out;
}

/**
 * Months ('YYYY-MM') whose heading belongs above a week row: any month that starts inside the
 * week, plus the week start's month on the first row.
 */
export function weekHeadings(start: LocalDate, first: boolean): string[] {
	const out: string[] = [];
	if (first) out.push(start.slice(0, 7));
	for (let i = 0; i < 7; i++) {
		const d = addDays(start, i);
		if (d.endsWith('-01') && !out.includes(d.slice(0, 7))) out.push(d.slice(0, 7));
	}
	return out;
}

const utc = (d: LocalDate) => {
	const [y, m, day] = d.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, day));
};

/** 'Fri 16 Oct'. */
export function formatDate(d: LocalDate): string {
	const parts = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'UTC',
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	}).formatToParts(utc(d));
	const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
	return `${get('weekday')} ${get('day')} ${get('month')}`;
}

/** 'October 2026' from 'YYYY-MM'. */
export function formatMonth(ym: string): string {
	return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(
		utc(`${ym}-01`)
	);
}

/** '12 Oct'. */
export function formatShort(d: LocalDate): string {
	return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(utc(d));
}

/** Day-of-month for the label under a bar. */
export const dayNumber = (d: LocalDate) => String(Number(d.slice(8)));

/** A copy of `alloc` (fitted to `blocks`) with block `index` set. Null when index is out of range. */
export function withBlock(
	alloc: Allocation,
	blocks: number,
	index: number,
	projectId: string | null
): Allocation | null {
	if (!Number.isInteger(index) || index < 0 || index >= blocks) return null;
	const out: Allocation = [];
	for (let i = 0; i < blocks; i++) out.push(alloc[i] ?? null);
	out[index] = projectId;
	return out;
}

/** Every block of a day given to one project (or all open). */
export function paintedDay(blocks: number, projectId: string | null): Allocation {
	return Array<string | null>(blocks).fill(projectId);
}

export const isWeekend = (d: LocalDate) => weekdayOf(d) >= 6;
