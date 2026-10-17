// Burndown series for a milestone, in focus blocks (pure).
import { fitAllocation } from '$lib/planner/blocks';
import { addDays, diffDays, eachDate, weekStartOf, zonedParts } from '$lib/planner/dates';
import type { Allocations, Days, LocalDate } from '$lib/planner/types';
import type { Issue } from './issues';

export interface BurnPoint {
	date: LocalDate;
	value: number;
}

export interface Burndown {
	start: LocalDate;
	end: LocalDate;
	today: LocalDate;
	due: LocalDate | null;
	/** Blocks left at the end of each day, start through today. */
	actual: BurnPoint[];
	/** Total sized work in the milestone at the end of each day, start through today. */
	scope: BurnPoint[];
	/** From today, remaining blocks minus the blocks painted for this project on the Season calendar. */
	projected: BurnPoint[];
	/** Day the projected line reaches zero, or null when the planned blocks run out first. */
	finish: LocalDate | null;
	/** Blocks still unplanned at the end of the planning horizon. */
	shortBlocks: number;
	/** Sundays to label on the x axis. */
	ticks: LocalDate[];
	max: number;
	remaining: number;
	done: number;
}

export interface BurndownInput {
	issues: readonly Issue[];
	/** Milestone creation date; issues created earlier count from here. */
	start: LocalDate;
	due: LocalDate | null;
	today: LocalDate;
	timezone: string;
	projectId: string;
	days: Days;
	allocations: Allocations;
}

const MIN_AHEAD_DAYS = 14;
const MAX_SPAN_DAYS = 366;
const MAX_TICKS = 10;

const localDate = (iso: string, tz: string) => zonedParts(new Date(iso), tz).date;

export function burndownSeries(input: BurndownInput): Burndown {
	const { issues, due, today, timezone, projectId, days, allocations } = input;
	const start = input.start > today ? today : input.start;

	const items = issues.map((i) => ({
		size: i.size,
		created: localDate(i.createdAt, timezone),
		closed: i.state === 'closed' && i.closedAt ? localDate(i.closedAt, timezone) : null,
		// Closing as "not planned" takes the work out of scope rather than burning it down.
		dropped: i.state === 'closed' && i.stateReason === 'not_planned'
	}));

	const actual: BurnPoint[] = [];
	const scope: BurnPoint[] = [];
	for (const d of eachDate(start, today)) {
		let left = 0;
		let total = 0;
		for (const it of items) {
			if (it.created > d) continue;
			const closedBy = it.closed !== null && it.closed <= d;
			if (!(closedBy && it.dropped)) total += it.size;
			if (!closedBy) left += it.size;
		}
		actual.push({ date: d, value: left });
		scope.push({ date: d, value: total });
	}

	const remaining = actual[actual.length - 1]?.value ?? 0;
	const doneNow = items.filter((it) => it.closed !== null && !it.dropped).reduce((n, it) => n + it.size, 0);

	// Projected: walk forward through planned days, subtracting this project's blocks (same rule as forecast()).
	const projected: BurnPoint[] = [{ date: today, value: remaining }];
	let finish: LocalDate | null = remaining === 0 ? today : null;
	let left = remaining;
	const planned = [...days.keys()].filter((d) => d >= today).sort();
	const lastPlanned = planned[planned.length - 1] ?? today;
	for (let d = today; left > 0 && d <= lastPlanned; d = addDays(d, 1)) {
		const day = days.get(d);
		const blocks = day ? fitAllocation(day, allocations[d]).filter((p) => p === projectId).length : 0;
		if (blocks === 0) continue;
		left = Math.max(0, left - blocks);
		// Today's planned blocks drop at today: the line shows what is left once they are done.
		projected.push({ date: d, value: left });
		if (left === 0) finish = d;
	}

	let end = addDays(today, MIN_AHEAD_DAYS);
	if (due && due > end) end = due;
	if (finish && finish > end) end = finish;
	if (!finish && projected.length > 1 && projected[projected.length - 1].date > end) end = projected[projected.length - 1].date;
	if (diffDays(start, end) > MAX_SPAN_DAYS) end = addDays(start, MAX_SPAN_DAYS);
	const clipped = projected.filter((p) => p.date <= end);
	// Extend a stalled projection flat to the edge so a shortfall is visible.
	const lastProjected = clipped[clipped.length - 1];
	if (lastProjected && lastProjected.value > 0 && lastProjected.date < end) clipped.push({ date: end, value: lastProjected.value });

	const weeks: LocalDate[] = [];
	for (let s = weekStartOf(start) < start ? addDays(weekStartOf(start), 7) : start; s <= end; s = addDays(s, 7)) weeks.push(s);
	const step = Math.max(1, Math.ceil(weeks.length / MAX_TICKS));
	const ticks = weeks.filter((_, i) => i % step === 0);

	const max = Math.max(1, ...scope.map((p) => p.value), ...clipped.map((p) => p.value));

	return {
		start,
		end,
		today,
		due,
		actual,
		scope,
		projected: clipped,
		finish,
		shortBlocks: finish ? 0 : left,
		ticks,
		max,
		remaining,
		done: doneNow
	};
}
