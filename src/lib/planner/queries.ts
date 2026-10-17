// Questions the UI asks of the planned days and block allocations.
import { blockWindow, fitAllocation } from './blocks';
import { addDays, mondayOf } from './dates';
import type {
	Allocations,
	Chunk,
	DayPlan,
	Days,
	FindTimeResult,
	Forecast,
	LocalDate,
	Minutes,
	Settings
} from './types';

export type FamilyIds = Iterable<string>;

/** Days on or after `from` (and on or before `to`, if given), in date order. */
function daysFrom(days: Days, from: LocalDate, to?: LocalDate): DayPlan[] {
	return [...days.values()]
		.filter((d) => d.date >= from && (to === undefined || d.date <= to))
		.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface NextChunkInput {
	days: Days;
	allocations: Allocations;
	settings: Settings;
	from: LocalDate;
	nowMinutes?: Minutes;
	familyIds: FamilyIds;
}

/**
 * The first run of consecutive non-family blocks that totals at least
 * `chunkMinHours`. On `from`, blocks that have already ended are skipped.
 */
export function nextChunk(input: NextChunkInput): Chunk | null {
	const { days, allocations, settings, from, nowMinutes } = input;
	const family = new Set(input.familyIds);
	for (const day of daysFrom(days, from)) {
		if (day.blocks === 0) continue;
		const alloc = fitAllocation(day, allocations[day.date]);
		const usable = alloc.map((projectId, i) => {
			const ended = day.date === from && nowMinutes !== undefined && blockWindow(day, i, settings).end <= nowMinutes;
			return !ended && !(projectId !== null && family.has(projectId));
		});
		let i = 0;
		while (i < alloc.length) {
			if (!usable[i]) {
				i++;
				continue;
			}
			let j = i;
			while (j < alloc.length && usable[j]) j++;
			if ((j - i) * settings.blockHours >= settings.chunkMinHours - 1e-9) {
				const projectIds = [...new Set(alloc.slice(i, j).filter((p): p is string => p !== null))];
				return {
					date: day.date,
					window: { start: blockWindow(day, i, settings).start, end: blockWindow(day, j - 1, settings).end },
					blockCount: j - i,
					projectIds
				};
			}
			i = j;
		}
	}
	return null;
}

export interface FindTimeInput {
	hours: number;
	projectId: string | null; // null = any non-family project
	by: LocalDate;
	from: LocalDate;
	days: Days;
	allocations: Allocations;
	settings: Settings;
	familyIds: FamilyIds;
}

/**
 * Cover `hours` of focus time by `by`: blocks already assigned to the project come
 * first (any non-family project when projectId is null), then open blocks; earliest first.
 */
export function findTime(input: FindTimeInput): FindTimeResult {
	const { hours, projectId, by, from, days, allocations, settings } = input;
	const family = new Set(input.familyIds);
	const candidates: { date: LocalDate; blocks: number; assigned: boolean }[] = [];
	for (const day of daysFrom(days, from, by)) {
		const alloc = fitAllocation(day, allocations[day.date]);
		const mine = alloc.filter((p) => p !== null && (projectId === null ? !family.has(p) : p === projectId)).length;
		const open = alloc.filter((p) => p === null).length;
		if (mine > 0) candidates.push({ date: day.date, blocks: mine, assigned: true });
		if (open > 0) candidates.push({ date: day.date, blocks: open, assigned: false });
	}
	// Assigned blocks first, then open ones; each group in date order (sort is stable).
	candidates.sort((a, b) => Number(b.assigned) - Number(a.assigned) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

	const rows: FindTimeResult['rows'] = [];
	let found = 0;
	for (const c of candidates) {
		if (found >= hours - 1e-9) break;
		const needed = Math.ceil((hours - found) / settings.blockHours - 1e-9);
		const take = Math.min(c.blocks, needed);
		rows.push({ date: c.date, blocks: take, assigned: c.assigned });
		found += take * settings.blockHours;
	}
	rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : Number(b.assigned) - Number(a.assigned)));
	const covered = found >= hours - 1e-9;
	return {
		covered,
		hoursFound: found,
		shortBy: covered ? 0 : hours - found,
		lastDate: rows.length > 0 ? rows[rows.length - 1].date : null,
		rows
	};
}

export interface ForecastInput {
	projectId: string;
	remainingBlocks: number;
	days: Days;
	allocations: Allocations;
	from: LocalDate;
}

/** The date by which the project's allocated blocks cover its remaining blocks. */
export function forecast(input: ForecastInput): Forecast {
	const { projectId, remainingBlocks, days, allocations, from } = input;
	if (remainingBlocks <= 0) return { date: null, remainingBlocks: 0, shortBlocks: 0 };
	let allocated = 0;
	for (const day of daysFrom(days, from)) {
		allocated += fitAllocation(day, allocations[day.date]).filter((p) => p === projectId).length;
		if (allocated >= remainingBlocks) return { date: day.date, remainingBlocks, shortBlocks: 0 };
	}
	return { date: null, remainingBlocks, shortBlocks: remainingBlocks - allocated };
}

export interface SuggestInput {
	days: Days;
	from: LocalDate;
	to: LocalDate;
	ventureIds: readonly string[];
	familyId: string;
}

const STRETCH_MIN_BLOCKS = 3;

/**
 * Propose allocations: each run of consecutive days with focus blocks goes to the next
 * venture in rotation when it holds at least 3 blocks; open-weekend days go to family.
 */
export function suggestStretches(input: SuggestInput): Allocations {
	const { days, from, to, ventureIds, familyId } = input;
	const out: Allocations = {};
	const fill = (day: DayPlan, projectId: string) => {
		out[day.date] = Array<string | null>(day.blocks).fill(projectId);
	};
	// A weekend day with nothing starting and nothing derived is governed by the open-weekend kind.
	const isOpenWeekend = (d: DayPlan) =>
		d.weekday >= 6 && d.derivedKindIds.length === 0 && !d.events.some((e) => e.startsToday);

	let turn = 0;
	let run: DayPlan[] = [];
	const flush = () => {
		if (run.length === 0) return;
		const total = run.reduce((n, d) => n + d.blocks, 0);
		const venture = ventureIds.length > 0 && total >= STRETCH_MIN_BLOCKS ? ventureIds[turn++ % ventureIds.length] : null;
		for (const d of run) {
			if (isOpenWeekend(d)) fill(d, familyId);
			else if (venture) fill(d, venture);
		}
		run = [];
	};
	for (const day of daysFrom(days, from, to)) {
		const consecutive = run.length === 0 || addDays(run[run.length - 1].date, 1) === day.date;
		if (day.blocks > 0 && consecutive) run.push(day);
		else {
			flush();
			if (day.blocks > 0) run.push(day);
		}
	}
	flush();
	return out;
}

/** Total focus hours across the seven days starting at `monday`. */
export function weekFocusHours(days: Days, monday: LocalDate): number {
	let total = 0;
	for (let i = 0; i < 7; i++) total += days.get(addDays(mondayOf(monday), i))?.focusHours ?? 0;
	return total;
}

export type WeekMode = 'sprint' | 'steady' | 'keep-alive';

export function weekMode(hours: number): WeekMode {
	if (hours >= 16) return 'sprint';
	if (hours <= 6) return 'keep-alive';
	return 'steady';
}

/** The next `count` school days (days where school is not null) on or after `from`. */
export function schoolDaysAhead(days: Days, from: LocalDate, count: number): LocalDate[] {
	return daysFrom(days, from)
		.filter((d) => d.school !== null)
		.slice(0, count)
		.map((d) => d.date);
}

/** Of the next `count` school days, the ones that are async. */
export function asyncDaysAhead(days: Days, from: LocalDate, count: number): LocalDate[] {
	const ahead = new Set(schoolDaysAhead(days, from, count));
	return daysFrom(days, from)
		.filter((d) => ahead.has(d.date) && d.school === 'async')
		.map((d) => d.date);
}
