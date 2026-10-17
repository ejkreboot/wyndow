// Turns calendar events, rules and kinds into one DayPlan per local date.
import { addDays, eachDate, weekdayOf, zonedParts } from './dates';
import { matchRule } from './rules';
import type {
	BarSegment,
	CalEvent,
	DayEvent,
	DayPlan,
	Days,
	Kind,
	LocalDate,
	Rule,
	SchoolMode,
	Settings
} from './types';

const DEFAULT_FOCUS_START = 11 * 60;
const RECOVERY_END = 22 * 60;
const FLOAT_EPSILON = 1e-9;

/** A DayEvent before its kind is known, keyed by the date it falls on. */
interface Clip {
	date: LocalDate;
	event: CalEvent;
	startsToday: boolean;
	startMin: number;
	endMin: number;
	allDay: boolean;
}

/**
 * Split one event into the per-date pieces that fall inside [rangeFrom, rangeTo].
 * Timed events are clipped at local midnight (an end exactly at midnight does not
 * touch the next date). All-day events cover [allDayStart, allDayEnd); no end = one day.
 */
function clipEvent(event: CalEvent, tz: string, rangeFrom: LocalDate, rangeTo: LocalDate): Clip[] {
	const clips: Clip[] = [];
	if (event.allDayStart) {
		const first = event.allDayStart;
		const lastExclusive =
			event.allDayEnd && event.allDayEnd > first ? event.allDayEnd : addDays(first, 1);
		for (let d = first; d < lastExclusive && d <= rangeTo; d = addDays(d, 1)) {
			if (d < rangeFrom) continue;
			// An all-day event counts as "starting" on every date it covers.
			clips.push({ date: d, event, startsToday: true, startMin: 0, endMin: 1440, allDay: true });
		}
		return clips;
	}
	if (!event.start) return clips;
	const s = zonedParts(event.start, tz);
	const e = event.end && event.end > event.start ? zonedParts(event.end, tz) : s;
	let lastDate = e.date;
	let lastEndMin = e.minutes;
	if (e.minutes === 0 && e.date > s.date) {
		lastDate = addDays(e.date, -1);
		lastEndMin = 1440;
	}
	for (let d = s.date; d <= lastDate && d <= rangeTo; d = addDays(d, 1)) {
		if (d < rangeFrom) continue;
		clips.push({
			date: d,
			event,
			startsToday: d === s.date,
			startMin: d === s.date ? s.minutes : 0,
			endMin: d === lastDate ? lastEndMin : 1440,
			allDay: false
		});
	}
	return clips;
}

export interface BuildDaysInput {
	from: LocalDate;
	to: LocalDate;
	events: readonly CalEvent[];
	rules: readonly Rule[];
	kinds: readonly Kind[];
	settings: Settings;
}

/** Build a DayPlan for every date from `from` to `to` inclusive. */
export function buildDays(input: BuildDaysInput): Days {
	const { from, to, events, rules, kinds, settings } = input;
	const kindsById = new Map(kinds.map((k) => [k.id, k]));
	const openWeekday = kinds.find((k) => k.builtin === 'open_weekday') ?? null;
	const openWeekend = kinds.find((k) => k.builtin === 'open_weekend') ?? null;

	// Start one day early so the first day knows what the previous day derived.
	const rangeFrom = addDays(from, -1);
	const byDate = new Map<LocalDate, DayEvent[]>();
	for (const event of events) {
		const kindId = resolveKindId(event, rules, kindsById);
		for (const clip of clipEvent(event, settings.timezone, rangeFrom, to)) {
			const list = byDate.get(clip.date) ?? [];
			list.push({
				event,
				kindId,
				startsToday: clip.startsToday,
				startMin: clip.startMin,
				endMin: clip.endMin,
				allDay: clip.allDay
			});
			byDate.set(clip.date, list);
		}
	}
	for (const list of byDate.values()) list.sort((a, b) => a.startMin - b.startMin);

	const days: Days = new Map();
	let derived = derivedFrom(byDate.get(rangeFrom) ?? [], kindsById);
	for (const date of eachDate(from, to)) {
		const dayEvents = byDate.get(date) ?? [];
		days.set(date, planDay(date, dayEvents, derived, kindsById, openWeekday, openWeekend, settings));
		derived = derivedFrom(dayEvents, kindsById);
	}
	return days;
}

function resolveKindId(
	event: CalEvent,
	rules: readonly Rule[],
	kindsById: ReadonlyMap<string, Kind>
): string | null {
	const rule = matchRule(event.title, event.sourceId, rules);
	return rule && kindsById.has(rule.kindId) ? rule.kindId : null;
}

/** Kinds that the next day inherits (Night -> Recovery), from events that started today. */
function derivedFrom(dayEvents: readonly DayEvent[], kindsById: ReadonlyMap<string, Kind>): string[] {
	const out: string[] = [];
	for (const ev of dayEvents) {
		if (!ev.startsToday || !ev.kindId) continue;
		const next = kindsById.get(ev.kindId)?.nextDayKindId;
		if (next && kindsById.has(next) && !out.includes(next)) out.push(next);
	}
	return out;
}

function planDay(
	date: LocalDate,
	events: DayEvent[],
	derivedKindIds: string[],
	kindsById: ReadonlyMap<string, Kind>,
	openWeekday: Kind | null,
	openWeekend: Kind | null,
	settings: Settings
): DayPlan {
	const weekday = weekdayOf(date);
	const starting = events.filter((e) => e.startsToday);
	const hasUnrecognized = starting.some((e) => e.kindId === null);

	const candidateIds = [
		...starting.flatMap((e) => (e.kindId ? [e.kindId] : [])),
		...derivedKindIds
	];
	let governing: Kind | null = null;
	if (!hasUnrecognized) {
		if (candidateIds.length === 0) {
			governing = weekday >= 6 ? openWeekend : openWeekday;
			if (governing) candidateIds.push(governing.id);
		} else {
			for (const id of candidateIds) {
				const k = kindsById.get(id);
				if (k && (governing === null || k.focusHours < governing.focusHours)) governing = k;
			}
		}
	}

	const focusHours = governing?.focusHours ?? 0;
	const focusStart = governing?.focusStart ?? DEFAULT_FOCUS_START;
	const blocks = Math.floor(focusHours / settings.blockHours + FLOAT_EPSILON);
	const looseHours = roundHours(focusHours - blocks * settings.blockHours);

	return {
		date,
		weekday,
		events,
		derivedKindIds,
		kindId: governing ? governing.id : 'unrecognized',
		focusHours,
		focusWindow: focusHours > 0 ? { start: focusStart, end: focusStart + focusHours * 60 } : null,
		blocks,
		looseHours,
		school: schoolMode(weekday, governing === null, candidateIds, kindsById, settings),
		segments: buildSegments(events, derivedKindIds.length > 0, kindsById)
	};
}

function roundHours(h: number): number {
	return Math.round(h * 1e6) / 1e6;
}

function schoolMode(
	weekday: number,
	unrecognized: boolean,
	candidateIds: readonly string[],
	kindsById: ReadonlyMap<string, Kind>,
	settings: Settings
): SchoolMode | 'unknown' | null {
	if (!settings.schoolDays.includes(weekday as Settings['schoolDays'][number])) return null;
	if (unrecognized) return 'unknown';
	const anyAsync = candidateIds.some((id) => kindsById.get(id)?.schoolMode === 'async');
	return anyAsync ? 'async' : 'live';
}

function buildSegments(
	events: readonly DayEvent[],
	hasDerived: boolean,
	kindsById: ReadonlyMap<string, Kind>
): BarSegment[] {
	const segments: BarSegment[] = [];
	let lastShiftEnd = 0;
	for (const ev of events) {
		const kind = ev.kindId ? kindsById.get(ev.kindId) : undefined;
		let type: BarSegment['type'] | null;
		if (!kind) type = 'unknown';
		else if (kind.focusHours === 0) type = 'shift';
		else type = ev.allDay ? null : 'oncall'; // all-day events with focus time paint nothing
		if (type === null) continue;
		segments.push({ start: ev.startMin, end: ev.endMin, type });
		if (type === 'shift') lastShiftEnd = Math.max(lastShiftEnd, ev.endMin);
	}
	if (hasDerived && lastShiftEnd < RECOVERY_END) {
		segments.push({ start: lastShiftEnd, end: RECOVERY_END, type: 'recovery' });
	}
	return segments.sort((a, b) => a.start - b.start || a.end - b.end);
}
