// Builds the Day view's timeline from planner data. Pure: no I/O.
import { allocationSpans, blockWindow } from '$lib/planner/blocks';
import { addDays, formatTime, zonedParts } from '$lib/planner/dates';
import type {
	Allocations,
	DayPlan,
	Kind,
	Minutes,
	Project,
	SchoolClass,
	Settings
} from '$lib/planner/types';

export const SCHOOL_START: Minutes = 8 * 60 + 30;
export const LESSON_MINUTES = 45;
export const FAMILY_START: Minutes = 17 * 60;
const LESSON_GAP = 30;

export type TimelineCard =
	| {
			type: 'event';
			title: string;
			kindName: string | null; // null when the title matches no rule
			color: string | null;
			allDay: boolean;
			startMin: Minutes;
			range: string; // e.g. '19:00 → 07:00 next day'
			unrecognized: boolean;
	  }
	| { type: 'recovery'; kindName: string; color: string | null }
	| { type: 'lesson'; className: string; student: string; startMin: Minutes; endMin: Minutes }
	| { type: 'async'; classes: string[] }
	| {
			type: 'focus';
			projectId: string | null;
			name: string | null;
			color: string | null;
			family: boolean;
			start: Minutes;
			end: Minutes;
			blocks: number;
			fromIndex: number;
	  }
	| { type: 'small'; start: Minutes; hours: number }
	| { type: 'family' };

export interface TimelineItem {
	/** Sort key in minutes; all-day cards use -1. */
	at: number;
	label: string; // 'All day', 'School' or 'HH:MM' (set by the caller via formatTime)
	card: TimelineCard;
}


/** Start of the first lesson: 08:30, or earlier so lessons end 30 minutes before a busy event starting before 11:00. */
export function lessonStart(busyStarts: Minutes[], lessons: number): Minutes {
	const early = busyStarts.filter((s) => s < 11 * 60);
	if (!early.length) return SCHOOL_START;
	return Math.max(0, Math.min(SCHOOL_START, Math.min(...early) - LESSON_GAP - lessons * LESSON_MINUTES));
}

export interface TimelineInput {
	day: DayPlan;
	kinds: Kind[];
	projects: Project[];
	classes: SchoolClass[];
	allocations: Allocations;
	settings: Settings;
	familyIds: string[];
}

export function buildTimeline(input: TimelineInput): TimelineItem[] {
	const { day, kinds, projects, classes, allocations, settings } = input;
	const kindOf = (id: string | null) => kinds.find((k) => k.id === id) ?? null;
	const items: TimelineItem[] = [];
	const tz = settings.timezone;

	const busy = day.events.filter((e) => {
		const k = kindOf(e.kindId);
		return k && k.focusHours === 0 && !e.allDay;
	});

	for (const e of day.events) {
		const k = kindOf(e.kindId);
		const base = { title: e.event.title, kindName: k?.name ?? null, color: k?.color ?? null, unrecognized: !k };
		if (e.allDay) {
			items.push({ at: -1, label: 'All day', card: { type: 'event', ...base, allDay: true, startMin: 0, range: 'All day' } });
			continue;
		}
		const end = e.event.end ? zonedParts(e.event.end, tz) : null;
		const endsLocal = end ? end.minutes : e.endMin;
		const continues =
			end !== null && end.date > day.date && !(end.minutes === 0 && end.date === addDays(day.date, 1));
		let range: string;
		if (!e.startsToday) range = `until ${formatTime(endsLocal)}`;
		else if (continues) range = `${formatTime(e.startMin)} → ${formatTime(endsLocal)} next day`;
		else range = `${formatTime(e.startMin)}–${formatTime(e.endMin)}`;
		items.push({
			at: e.startMin,
			label: formatTime(e.startMin),
			card: { type: 'event', ...base, allDay: false, startMin: e.startMin, range }
		});
	}

	for (const id of day.derivedKindIds) {
		const k = kindOf(id);
		items.push({ at: -1, label: 'All day', card: { type: 'recovery', kindName: k?.name ?? 'Recovery', color: k?.color ?? null } });
	}

	if (day.school === 'live' && classes.length) {
		let at = lessonStart(
			busy.filter((e) => e.startsToday).map((e) => e.startMin),
			classes.length
		);
		for (const c of classes) {
			const end = at + LESSON_MINUTES;
			items.push({
				at,
				label: formatTime(at),
				card: { type: 'lesson', className: c.name, student: c.student, startMin: at, endMin: end }
			});
			at = end;
		}
	} else if (day.school === 'async') {
		items.push({
			at: 1,
			label: 'School',
			card: { type: 'async', classes: classes.map((c) => `${c.name} (${c.student})`) }
		});
	}

	if (day.focusWindow) {
		const familyIds = new Set(input.familyIds);
		const alloc = allocations[day.date];
		let index = 0;
		const spans = allocationSpans(day, alloc ?? [], settings);
		for (const s of spans) {
			const p = s.projectId ? projects.find((x) => x.id === s.projectId) ?? null : null;
			items.push({
				at: s.start,
				label: formatTime(s.start),
				card: {
					type: 'focus',
					projectId: s.projectId,
					name: p?.name ?? null,
					color: p?.color ?? null,
					family: s.projectId !== null && familyIds.has(s.projectId),
					start: s.start,
					end: s.end,
					blocks: s.blocks,
					fromIndex: index
				}
			});
			index += s.blocks;
		}
		const allFamily = spans.length > 0 && spans.every((s) => s.projectId !== null && familyIds.has(s.projectId));
		if (!allFamily) {
			const start = day.blocks > 0 ? blockWindow(day, day.blocks, settings).start : day.focusWindow.start;
			items.push({
				at: start,
				label: formatTime(start),
				card: { type: 'small', start, hours: day.looseHours > 0 ? day.looseHours : 1 }
			});
		}
	}

	const lateBusy = busy.some((e) => e.endMin > FAMILY_START);
	if (!lateBusy && day.derivedKindIds.length === 0) {
		items.push({ at: FAMILY_START, label: formatTime(FAMILY_START), card: { type: 'family' } });
	}

	return items.sort((a, b) => a.at - b.at);
}

export interface Readout {
	time: string; // 'HH:MM' or '--:--'
	sub: string; // e.g. 'SNAPVAL · 2 BLOCKS → 13:00'
}

/** The next non-family focus span: on today, one that has not ended; otherwise the first of the day. */
export function dayReadout(
	day: DayPlan,
	projects: Project[],
	allocations: Allocations,
	settings: Settings,
	familyIds: string[],
	nowMinutes: Minutes | null
): Readout {
	const family = new Set(familyIds);
	const next = allocationSpans(day, allocations[day.date] ?? [], settings).find(
		(s) => !(s.projectId && family.has(s.projectId)) && (nowMinutes === null || s.end > nowMinutes)
	);
	if (!next) return { time: '--:--', sub: day.blocks === 0 ? 'NO FOCUS BLOCKS' : 'NO MORE FOCUS TODAY' };
	const name = next.projectId ? projects.find((p) => p.id === next.projectId)?.name : null;
	const blocks = `${next.blocks} BLOCK${next.blocks === 1 ? '' : 'S'}`;
	return {
		time: formatTime(next.start),
		sub: `${(name ?? 'OPEN').toUpperCase()} · ${blocks} → ${formatTime(next.end)}`
	};
}
