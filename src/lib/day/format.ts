// Pure helpers for the Day view and the top bar's next-chunk readout.
import { addDays, diffDays, formatTime, weekdayOf } from '$lib/planner/dates';
import type { Chunk, LocalDate, Project, SchoolClass } from '$lib/planner/types';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = [
	'January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December'
];

function parts(d: LocalDate) {
	const [, m, day] = d.split('-').map(Number);
	return { weekday: WEEKDAYS[weekdayOf(d) - 1], month: MONTHS[m - 1], day };
}

/** 'Friday 16 October' */
export function longDate(d: LocalDate): string {
	const p = parts(d);
	return `${p.weekday} ${p.day} ${p.month}`;
}

/** 'Fri 16 Oct' */
export function shortDate(d: LocalDate): string {
	const p = parts(d);
	return `${p.weekday.slice(0, 3)} ${p.day} ${p.month.slice(0, 3)}`;
}

/** True for a real 'YYYY-MM-DD' date within `maxDays` of `today`. */
export function isValidDayParam(value: string, today: LocalDate, maxDays = 400): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const [y, m, d] = value.split('-').map(Number);
	const dt = new Date(Date.UTC(y, m - 1, d));
	if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return false;
	return Math.abs(diffDays(today, value)) <= maxDays;
}

/** Top bar text, e.g. 'TODAY 11:00–15:00 · SNAPVAL + VOISEE'. */
export function nextChunkLabel(chunk: Chunk, today: LocalDate, projects: Pick<Project, 'id' | 'name'>[]): string {
	const when =
		chunk.date === today ? 'TODAY' : chunk.date === addDays(today, 1) ? 'TOMORROW' : shortDate(chunk.date).toUpperCase();
	const names = chunk.projectIds
		.map((id) => projects.find((p) => p.id === id)?.name)
		.filter((n): n is string => !!n);
	const range = `${formatTime(chunk.window.start)}–${formatTime(chunk.window.end)}`;
	return `${when} ${range}${names.length ? ` · ${names.join(' + ').toUpperCase()}` : ''}`;
}

export interface PacketNeed {
	classId: string;
	label: string; // 'Math (Older)'
	missing: number; // async days not yet covered by ready packets
	dueBy: LocalDate | null; // the day before the first uncovered async day
}

/** Compares each class's ready packets with the upcoming async days (one packet per async day). */
export function packetNeeds(classes: SchoolClass[], asyncDays: LocalDate[]): PacketNeed[] {
	return classes.map((c) => {
		const missing = Math.max(0, asyncDays.length - c.packetsReady);
		return {
			classId: c.id,
			label: `${c.name} (${c.student})`,
			missing,
			dueBy: missing > 0 ? addDays(asyncDays[c.packetsReady], -1) : null
		};
	});
}

/** Whole minutes from `startedAt` to `now`, never negative. */
export function elapsedMinutes(startedAt: Date, now: number): number {
	return Math.max(0, Math.floor((now - startedAt.getTime()) / 60_000));
}
