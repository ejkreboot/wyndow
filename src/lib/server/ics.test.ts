import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/amion-sample.ics?raw';
import { MAX_ICS_BYTES, parseIcs } from './ics';

/** Wrap VEVENT bodies in a calendar, with CRLF line endings. */
function calendar(body: string, extra = ''): string {
	return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//EN', extra, body, 'END:VCALENDAR']
		.filter(Boolean)
		.join('\r\n');
}
function vevent(...lines: string[]): string {
	return ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
}

describe('amion-style sample feed', () => {
	const result = parseIcs(fixture);
	const byUid = (n: string) => result.events.find((e) => e.uid === `${n}@www.example-scheduler.test`)!;

	it('parses every event and skips nothing', () => {
		expect(result.events).toHaveLength(6);
		expect(result.skipped).toBe(0);
		expect(result.warnings).toBe(0);
	});
	it('reads UTC times', () => {
		const night = byUid('10000000001');
		expect(night.title).toBe('WDN');
		expect(night.start?.toISOString()).toBe('2026-10-19T21:00:00.000Z');
		expect(night.end?.toISOString()).toBe('2026-10-20T17:00:00.000Z');
		expect(night.allDayStart).toBeNull();
	});
	it('unfolds long descriptions and unescapes commas', () => {
		expect(byUid('10000000001').description).toBe('Night float, main hospital. Sign-out at 06:45 through the morning handoff.');
	});
	it('reads DATE-only entries without DTEND as one all-day event', () => {
		const e = byUid('10000000004');
		expect(e).toMatchObject({ title: 'Unavailable', start: null, end: null, allDayStart: '2026-10-16', allDayEnd: '2026-10-17' });
	});
});

describe('time handling', () => {
	it('uses the VTIMEZONE defined in the file', () => {
		const tz = [
			'BEGIN:VTIMEZONE',
			'TZID:Custom/Zone',
			'BEGIN:STANDARD',
			'DTSTART:19700101T000000',
			'TZOFFSETFROM:+0300',
			'TZOFFSETTO:+0300',
			'END:STANDARD',
			'END:VTIMEZONE'
		].join('\r\n');
		const ics = calendar(vevent('UID:a', 'SUMMARY:X', 'DTSTART;TZID=Custom/Zone:20261016T090000', 'DTEND;TZID=Custom/Zone:20261016T120000'), tz);
		const { events, warnings } = parseIcs(ics);
		expect(events[0].start?.toISOString()).toBe('2026-10-16T06:00:00.000Z');
		expect(events[0].end?.toISOString()).toBe('2026-10-16T09:00:00.000Z');
		expect(warnings).toBe(0);
	});

	it('resolves an IANA TZID that the file does not define, with DST', () => {
		const ics = calendar(
			[
				vevent('UID:a', 'SUMMARY:X', 'DTSTART;TZID=America/Detroit:20261031T170000', 'DTEND;TZID=America/Detroit:20261101T130000')
			].join('\r\n')
		);
		const { events, warnings } = parseIcs(ics);
		expect(events[0].start?.toISOString()).toBe('2026-10-31T21:00:00.000Z');
		expect(events[0].end?.toISOString()).toBe('2026-11-01T18:00:00.000Z');
		expect(warnings).toBe(0);
	});

	it('treats floating times as UTC and counts a warning', () => {
		const ics = calendar(vevent('UID:a', 'SUMMARY:X', 'DTSTART:20261016T090000', 'DTEND:20261016T100000'));
		const { events, warnings } = parseIcs(ics);
		expect(events[0].start?.toISOString()).toBe('2026-10-16T09:00:00.000Z');
		expect(warnings).toBe(1);
	});

	it('treats an unknown TZID as floating UTC with a warning', () => {
		const ics = calendar(vevent('UID:a', 'SUMMARY:X', 'DTSTART;TZID=Nowhere/Land:20261016T090000'));
		const { events, warnings } = parseIcs(ics);
		expect(events[0].start?.toISOString()).toBe('2026-10-16T09:00:00.000Z');
		expect(warnings).toBe(1);
	});

	it('sets end = start when a timed event has no DTEND', () => {
		const { events } = parseIcs(calendar(vevent('UID:a', 'SUMMARY:X', 'DTSTART:20261016T090000Z')));
		expect(events[0].start?.toISOString()).toBe('2026-10-16T09:00:00.000Z');
		expect(events[0].end?.getTime()).toBe(events[0].start?.getTime());
	});

	it('uses DURATION when there is no DTEND', () => {
		const { events } = parseIcs(calendar(vevent('UID:a', 'SUMMARY:X', 'DTSTART:20261016T090000Z', 'DURATION:PT2H30M')));
		expect(events[0].end?.toISOString()).toBe('2026-10-16T11:30:00.000Z');
	});

	it('keeps an explicit all-day DTEND (exclusive)', () => {
		const { events } = parseIcs(calendar(vevent('UID:a', 'SUMMARY:Out', 'DTSTART;VALUE=DATE:20261016', 'DTEND;VALUE=DATE:20261019')));
		expect(events[0]).toMatchObject({ allDayStart: '2026-10-16', allDayEnd: '2026-10-19', start: null, end: null });
	});

	it('moves a missing all-day end across a month boundary', () => {
		const { events } = parseIcs(calendar(vevent('UID:a', 'SUMMARY:Out', 'DTSTART;VALUE=DATE:20261231')));
		expect(events[0].allDayEnd).toBe('2027-01-01');
	});
});

describe('text and line handling', () => {
	it('accepts CRLF and bare LF line endings', () => {
		const body = vevent('UID:a', 'SUMMARY:Hello', 'DTSTART:20261016T090000Z');
		expect(parseIcs(calendar(body))).toMatchObject({ events: [{ title: 'Hello' }] });
		expect(parseIcs(calendar(body).replace(/\r\n/g, '\n')).events).toHaveLength(1);
	});
	it('unfolds folded lines in titles', () => {
		const ics = calendar(vevent('UID:a', 'SUMMARY:Long sum', ' mary here', 'DTSTART:20261016T090000Z'));
		expect(parseIcs(ics).events[0].title).toBe('Long summary here');
	});
	it('defaults a missing title and description to empty strings', () => {
		const e = parseIcs(calendar(vevent('UID:a', 'DTSTART:20261016T090000Z'))).events[0];
		expect(e.title).toBe('');
		expect(e.description).toBe('');
	});
});

describe('skipping', () => {
	it('skips and counts events without UID, recurring, cancelled and without start', () => {
		const ics = calendar(
			[
				vevent('UID:keep', 'SUMMARY:Keep', 'DTSTART:20261016T090000Z'),
				vevent('SUMMARY:No uid', 'DTSTART:20261016T090000Z'),
				vevent('UID:rec', 'SUMMARY:Weekly', 'DTSTART:20261016T090000Z', 'RRULE:FREQ=WEEKLY'),
				vevent('UID:rec', 'SUMMARY:Override', 'RECURRENCE-ID:20261023T090000Z', 'DTSTART:20261023T100000Z'),
				vevent('UID:gone', 'SUMMARY:Gone', 'DTSTART:20261016T090000Z', 'STATUS:CANCELLED'),
				vevent('UID:nostart', 'SUMMARY:Nothing')
			].join('\r\n')
		);
		const { events, skipped } = parseIcs(ics);
		expect(events.map((e) => e.uid)).toEqual(['keep']);
		expect(skipped).toBe(5);
	});
	it('returns an empty list for a calendar with no events', () => {
		expect(parseIcs(calendar(''))).toEqual({ events: [], skipped: 0, warnings: 0 });
	});
});

describe('rejection', () => {
	it('throws when the input is over 2 MB', () => {
		const huge = calendar(vevent('UID:a', `DESCRIPTION:${'x'.repeat(MAX_ICS_BYTES)}`, 'DTSTART:20261016T090000Z'));
		expect(() => parseIcs(huge)).toThrow(/2 MB/);
	});
	it('counts bytes, not characters', () => {
		const multibyte = calendar(vevent('UID:a', `DESCRIPTION:${'é'.repeat(MAX_ICS_BYTES / 2 + 10)}`, 'DTSTART:20261016T090000Z'));
		expect(multibyte.length).toBeLessThan(MAX_ICS_BYTES);
		expect(() => parseIcs(multibyte)).toThrow(/2 MB/);
	});
	it('throws on garbage', () => {
		expect(() => parseIcs('hello world')).toThrow(/not a valid/i);
		expect(() => parseIcs('')).toThrow();
	});
	it('throws when the top-level component is not a VCALENDAR', () => {
		expect(() => parseIcs('BEGIN:VEVENT\r\nUID:a\r\nEND:VEVENT')).toThrow(/VCALENDAR/);
	});
	it('does not leak registered timezones between parses', () => {
		const tz = 'BEGIN:VTIMEZONE\r\nTZID:Custom/Zone\r\nBEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+0300\r\nTZOFFSETTO:+0300\r\nEND:STANDARD\r\nEND:VTIMEZONE';
		parseIcs(calendar(vevent('UID:a', 'DTSTART;TZID=Custom/Zone:20261016T090000'), tz));
		const again = parseIcs(calendar(vevent('UID:a', 'DTSTART;TZID=Custom/Zone:20261016T090000')));
		expect(again.warnings).toBe(1); // unknown zone again -> floating
	});
});
