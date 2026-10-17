// Parses an iCalendar feed (Amion and friends) into plain events using ical.js.
import ICAL from 'ical.js';
import { addDays, instantFromZoned } from '../planner/dates';
import type { LocalDate } from '../planner/types';

export const MAX_ICS_BYTES = 2 * 1024 * 1024;

export interface ParsedEvent {
	uid: string;
	title: string;
	description: string;
	start: Date | null;
	end: Date | null;
	allDayStart: LocalDate | null;
	allDayEnd: LocalDate | null; // exclusive; always set for all-day events (missing DTEND = one day)
}

export interface ParseResult {
	events: ParsedEvent[];
	/** Events left out: no UID, recurring, cancelled, or no usable start. */
	skipped: number;
	/** Events whose times were floating or used an unknown TZID, and were read as UTC. */
	warnings: number;
}

type ParsedMoment =
	| { allDay: true; date: LocalDate }
	| { allDay: false; instant: Date; assumedUtc: boolean };

/** Parse ICS text. Throws a plain Error for oversized or non-calendar input. */
export function parseIcs(text: string): ParseResult {
	if (new TextEncoder().encode(text).length > MAX_ICS_BYTES) {
		throw new Error('Calendar feed is larger than 2 MB');
	}
	let root: ICAL.Component;
	try {
		root = new ICAL.Component(ICAL.parse(text));
	} catch {
		throw new Error('Calendar feed is not a valid iCalendar file');
	}
	if (root.name !== 'vcalendar') throw new Error('Calendar feed is not a VCALENDAR');

	// Let ical.js resolve TZIDs that the file defines itself; reset so nothing leaks between parses.
	ICAL.TimezoneService.reset();
	try {
		for (const tz of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(tz);
		return readEvents(root);
	} finally {
		ICAL.TimezoneService.reset();
	}
}

function readEvents(root: ICAL.Component): ParseResult {
	const events: ParsedEvent[] = [];
	let skipped = 0;
	let warnings = 0;
	for (const vevent of root.getAllSubcomponents('vevent')) {
		const uid = stringValue(vevent, 'uid').trim();
		const startProp = vevent.getFirstProperty('dtstart');
		const status = stringValue(vevent, 'status').toUpperCase();
		const recurring = vevent.hasProperty('rrule') || vevent.hasProperty('recurrence-id');
		if (!uid || !startProp || recurring || status === 'CANCELLED') {
			skipped++;
			continue;
		}
		const start = readMoment(startProp);
		const endProp = vevent.getFirstProperty('dtend');
		const endMoment = endProp ? readMoment(endProp) : null;
		const duration = vevent.getFirstPropertyValue('duration');
		const base = {
			uid,
			title: stringValue(vevent, 'summary').trim(),
			description: stringValue(vevent, 'description')
		};
		if (start.allDay) {
			const explicitEnd = endMoment?.allDay && endMoment.date > start.date ? endMoment.date : null;
			const days = duration instanceof ICAL.Duration ? Math.max(1, Math.floor(duration.toSeconds() / 86400)) : 1;
			events.push({
				...base,
				start: null,
				end: null,
				allDayStart: start.date,
				allDayEnd: explicitEnd ?? addDays(start.date, days)
			});
			continue;
		}
		let end = start.instant;
		let assumedUtc = start.assumedUtc;
		if (endMoment && !endMoment.allDay) {
			end = endMoment.instant;
			assumedUtc ||= endMoment.assumedUtc;
		} else if (duration instanceof ICAL.Duration) {
			end = new Date(start.instant.getTime() + duration.toSeconds() * 1000);
		}
		if (end < start.instant) end = start.instant;
		if (assumedUtc) warnings++;
		events.push({ ...base, start: start.instant, end, allDayStart: null, allDayEnd: null });
	}
	return { events, skipped, warnings };
}

function stringValue(component: ICAL.Component, name: string): string {
	const v = component.getFirstPropertyValue(name);
	return typeof v === 'string' ? v : '';
}

function pad(n: number, width = 2): string {
	return String(n).padStart(width, '0');
}

function readMoment(prop: ICAL.Property): ParsedMoment {
	const t = prop.getFirstValue() as ICAL.Time;
	if (t.isDate) return { allDay: true, date: `${pad(t.year, 4)}-${pad(t.month)}-${pad(t.day)}` };

	const utcMs = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
	if (t.zone === ICAL.Timezone.utcTimezone) return { allDay: false, instant: new Date(utcMs), assumedUtc: false };

	const tzid = prop.getParameter('tzid');
	if (typeof tzid === 'string' && tzid) {
		if (ICAL.TimezoneService.has(tzid)) {
			// Defined by a VTIMEZONE in the file (or built in): ical.js applies its offsets.
			return { allDay: false, instant: t.toJSDate(), assumedUtc: false };
		}
		try {
			// Not defined in the file: treat the TZID as an IANA zone name.
			const date = `${pad(t.year, 4)}-${pad(t.month)}-${pad(t.day)}`;
			const instant = instantFromZoned(date, t.hour * 60 + t.minute, tzid);
			return { allDay: false, instant: new Date(instant.getTime() + t.second * 1000), assumedUtc: false };
		} catch {
			// Unknown zone name: fall through to the floating treatment.
		}
	}
	return { allDay: false, instant: new Date(utcMs), assumedUtc: true };
}
