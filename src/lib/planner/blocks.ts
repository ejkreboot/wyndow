import type { Allocation, DayPlan, Settings, Window } from './types';

const DEFAULT_FOCUS_START = 11 * 60;

/** Resize a stored allocation to the day's block count, padding with null (open). */
export function fitAllocation(day: DayPlan, stored?: Allocation | null): Allocation {
	const out: Allocation = [];
	for (let i = 0; i < day.blocks; i++) out.push(stored?.[i] ?? null);
	return out;
}

/** Time window of block `index` within the day's focus window. */
export function blockWindow(day: DayPlan, index: number, settings: Settings): Window {
	const base = day.focusWindow?.start ?? DEFAULT_FOCUS_START;
	const len = settings.blockHours * 60;
	return { start: base + index * len, end: base + (index + 1) * len };
}

export interface AllocationSpan {
	start: number;
	end: number;
	projectId: string | null;
	blocks: number;
}

/** Merge consecutive blocks with the same project (or all open) into spans. */
export function allocationSpans(day: DayPlan, alloc: Allocation, settings: Settings): AllocationSpan[] {
	const spans: AllocationSpan[] = [];
	const fitted = fitAllocation(day, alloc);
	fitted.forEach((projectId, i) => {
		const w = blockWindow(day, i, settings);
		const last = spans[spans.length - 1];
		if (last && last.projectId === projectId) {
			last.end = w.end;
			last.blocks += 1;
		} else {
			spans.push({ start: w.start, end: w.end, projectId, blocks: 1 });
		}
	});
	return spans;
}
