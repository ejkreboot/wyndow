// Shared builders for planner tests. Not exported from index.ts.
import type { CalEvent, Kind, Rule, Settings } from './types';

export const settings: Settings = {
	timezone: 'America/Detroit',
	blockHours: 2,
	chunkMinHours: 3,
	schoolDays: [1, 2, 3, 4, 5]
};

export function kind(id: string, over: Partial<Kind> = {}): Kind {
	return {
		id,
		name: id,
		color: '#888888',
		focusHours: 0,
		focusStart: null,
		schoolMode: 'live',
		nextDayKindId: null,
		builtin: null,
		sort: 0,
		...over
	};
}

export const openWeekday = kind('open_weekday', { name: 'Open weekday', color: null, focusHours: 4, focusStart: 660, builtin: 'open_weekday' });
export const openWeekend = kind('open_weekend', { name: 'Open weekend', color: null, focusHours: 2, focusStart: 840, builtin: 'open_weekend' });

export function rule(pattern: string, kindId: string, over: Partial<Rule> = {}): Rule {
	return { id: `${pattern}->${kindId}:${JSON.stringify(over)}`, sourceId: null, match: 'equals', pattern, kindId, priority: 0, ...over };
}

let counter = 0;
/** Timed event; times are ISO strings with an explicit offset or Z. */
export function timed(title: string, startIso: string, endIso: string, sourceId = 's1'): CalEvent {
	return { id: `e${counter++}`, sourceId, title, start: new Date(startIso), end: new Date(endIso), allDayStart: null, allDayEnd: null };
}

export function allDay(title: string, start: string, end: string | null = null, sourceId = 's1'): CalEvent {
	return { id: `e${counter++}`, sourceId, title, start: null, end: null, allDayStart: start, allDayEnd: end };
}
