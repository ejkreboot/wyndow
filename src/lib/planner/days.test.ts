import { describe, expect, it } from 'vitest';
import { buildDays } from './days';
import type { CalEvent, Kind, Rule, Settings } from './types';
import { allDay, kind, openWeekday, openWeekend, rule, settings, timed } from './testing';

const work = kind('work', { schoolMode: 'async' });
const night = kind('night', { nextDayKindId: 'recovery' });
const recovery = kind('recovery', { schoolMode: 'async' });
const oncall = kind('oncall', { focusHours: 2, focusStart: 13 * 60 });
const off = kind('off', { focusHours: 5, focusStart: 11 * 60 });
const kinds: Kind[] = [work, night, recovery, oncall, off, openWeekday, openWeekend];
const rules: Rule[] = [
	rule('WDp', 'work'),
	rule('WDN', 'night'),
	rule('Backup', 'oncall'),
	rule('Unavailable', 'off')
];

function plan(events: CalEvent[], from: string, to: string, over: { s?: Settings; k?: Kind[]; r?: Rule[] } = {}) {
	return buildDays({ from, to, events, rules: over.r ?? rules, kinds: over.k ?? kinds, settings: over.s ?? settings });
}

describe('event clipping', () => {
	// 17:00 EDT Oct 31 -> 13:00 EST Nov 1 crosses the DST change (Nov 1, 2026).
	const nightShift = timed('WDN', '2026-10-31T21:00:00Z', '2026-11-01T18:00:00Z');

	it('clips an overnight event onto both dates with startsToday flags', () => {
		const days = plan([nightShift], '2026-10-31', '2026-11-02');
		const first = days.get('2026-10-31')!.events;
		const second = days.get('2026-11-01')!.events;
		expect(first).toHaveLength(1);
		expect(first[0]).toMatchObject({ startsToday: true, startMin: 17 * 60, endMin: 1440, allDay: false });
		expect(second).toHaveLength(1);
		expect(second[0]).toMatchObject({ startsToday: false, startMin: 0, endMin: 13 * 60 });
		expect(days.get('2026-11-02')!.events).toHaveLength(0);
	});

	it('does not touch the next date when an event ends exactly at midnight', () => {
		const e = timed('WDp', '2026-10-14T22:00:00Z', '2026-10-15T04:00:00Z'); // 18:00 - 24:00 EDT
		const days = plan([e], '2026-10-14', '2026-10-16');
		expect(days.get('2026-10-14')!.events[0]).toMatchObject({ startMin: 18 * 60, endMin: 1440 });
		expect(days.get('2026-10-15')!.events).toHaveLength(0);
	});

	it('keeps a zero-length event on its date', () => {
		const at = '2026-10-14T14:00:00Z';
		const days = plan([timed('WDp', at, at)], '2026-10-14', '2026-10-14');
		expect(days.get('2026-10-14')!.events[0]).toMatchObject({ startMin: 600, endMin: 600 });
	});

	it('all-day event without an end covers one day', () => {
		const days = plan([allDay('Unavailable', '2026-10-16')], '2026-10-15', '2026-10-18');
		expect(days.get('2026-10-15')!.events).toHaveLength(0);
		expect(days.get('2026-10-16')!.events).toHaveLength(1);
		expect(days.get('2026-10-16')!.events[0]).toMatchObject({ allDay: true, startMin: 0, endMin: 1440, startsToday: true });
		expect(days.get('2026-10-17')!.events).toHaveLength(0);
	});

	it('all-day event with an exclusive end covers each date up to it', () => {
		const days = plan([allDay('Unavailable', '2026-10-16', '2026-10-19')], '2026-10-15', '2026-10-20');
		const covered = [...days.values()].filter((d) => d.events.length > 0).map((d) => d.date);
		expect(covered).toEqual(['2026-10-16', '2026-10-17', '2026-10-18']);
		expect(days.get('2026-10-17')!.kindId).toBe('off');
	});

	it('uses the single day when an all-day end is not after the start', () => {
		const days = plan([allDay('Unavailable', '2026-10-16', '2026-10-16')], '2026-10-16', '2026-10-17');
		expect(days.get('2026-10-16')!.events).toHaveLength(1);
		expect(days.get('2026-10-17')!.events).toHaveLength(0);
	});

	it('ignores events outside the range', () => {
		const days = plan([timed('WDp', '2026-09-01T11:00:00Z', '2026-09-01T23:00:00Z')], '2026-10-01', '2026-10-02');
		expect([...days.values()].every((d) => d.events.length === 0)).toBe(true);
	});
});

describe('day kind resolution', () => {
	it('is unrecognized when a starting event has no rule', () => {
		const days = plan([timed('WDo', '2026-10-14T11:30:00Z', '2026-10-14T23:30:00Z')], '2026-10-14', '2026-10-14');
		const d = days.get('2026-10-14')!;
		expect(d.kindId).toBe('unrecognized');
		expect(d.focusHours).toBe(0);
		expect(d.focusWindow).toBeNull();
		expect(d.blocks).toBe(0);
		expect(d.events[0].kindId).toBeNull();
	});

	it('uses the built-in open kinds when nothing starts', () => {
		const days = plan([], '2026-10-16', '2026-10-18');
		const fri = days.get('2026-10-16')!;
		expect(fri).toMatchObject({ kindId: 'open_weekday', focusHours: 4, blocks: 2, looseHours: 0, weekday: 5 });
		expect(fri.focusWindow).toEqual({ start: 660, end: 900 });
		const sat = days.get('2026-10-17')!;
		expect(sat).toMatchObject({ kindId: 'open_weekend', focusHours: 2, blocks: 1 });
		expect(sat.focusWindow).toEqual({ start: 840, end: 960 });
	});

	it('defaults the focus start to 11:00 when the kind has none', () => {
		const flexible = kind('flex', { focusHours: 3, focusStart: null });
		const days = plan([timed('F', '2026-10-14T14:00:00Z', '2026-10-14T15:00:00Z')], '2026-10-14', '2026-10-14', {
			k: [...kinds, flexible],
			r: [rule('F', 'flex')]
		});
		expect(days.get('2026-10-14')!.focusWindow).toEqual({ start: 660, end: 840 });
	});

	it('picks the candidate with the fewest focus hours (ties: first)', () => {
		const day = [
			timed('Backup', '2026-10-14T13:00:00Z', '2026-10-14T16:00:00Z'),
			timed('WDN', '2026-10-14T21:00:00Z', '2026-10-15T18:00:00Z')
		];
		expect(plan(day, '2026-10-14', '2026-10-14').get('2026-10-14')!.kindId).toBe('night');
		const tie = [
			timed('WDp', '2026-10-14T11:30:00Z', '2026-10-14T23:30:00Z'),
			timed('WDN', '2026-10-14T21:00:00Z', '2026-10-15T18:00:00Z')
		];
		expect(plan(tie, '2026-10-14', '2026-10-14').get('2026-10-14')!.kindId).toBe('work');
	});

	it('derives Recovery the day after a Night shift', () => {
		const e = timed('WDN', '2026-10-14T21:00:00Z', '2026-10-15T17:00:00Z');
		const days = plan([e], '2026-10-14', '2026-10-16');
		expect(days.get('2026-10-14')!.derivedKindIds).toEqual([]);
		expect(days.get('2026-10-15')!.derivedKindIds).toEqual(['recovery']);
		expect(days.get('2026-10-15')!.kindId).toBe('recovery');
		expect(days.get('2026-10-15')!.focusHours).toBe(0);
		// The continuation itself does not make a candidate; the day after is open again.
		expect(days.get('2026-10-16')!.kindId).toBe('open_weekday');
	});

	it('derives from the day before `from`', () => {
		const e = timed('WDN', '2026-10-14T21:00:00Z', '2026-10-15T17:00:00Z');
		const days = plan([e], '2026-10-15', '2026-10-15');
		expect(days.get('2026-10-15')!.kindId).toBe('recovery');
	});

	it('a derived kind competes with starting events on the same day', () => {
		const events = [
			timed('WDN', '2026-10-14T21:00:00Z', '2026-10-15T17:00:00Z'),
			allDay('Unavailable', '2026-10-15')
		];
		const d = plan(events, '2026-10-15', '2026-10-15').get('2026-10-15')!;
		expect(d.kindId).toBe('recovery'); // 0 focus beats Time off's 5
		expect(d.derivedKindIds).toEqual(['recovery']);
	});

	it('falls back to unrecognized if the open kinds are missing', () => {
		const d = plan([], '2026-10-14', '2026-10-14', { k: [work] }).get('2026-10-14')!;
		expect(d.kindId).toBe('unrecognized');
	});

	it('treats a rule pointing at a missing kind as unrecognized', () => {
		const d = plan([timed('WDp', '2026-10-14T11:00:00Z', '2026-10-14T12:00:00Z')], '2026-10-14', '2026-10-14', {
			r: [rule('WDp', 'gone')]
		}).get('2026-10-14')!;
		expect(d.kindId).toBe('unrecognized');
	});
});

describe('focus window, blocks and loose hours', () => {
	const offDay = [allDay('Unavailable', '2026-10-16')];
	it('2-hour blocks: 5h = 2 blocks + 1 loose hour', () => {
		const d = plan(offDay, '2026-10-16', '2026-10-16').get('2026-10-16')!;
		expect(d).toMatchObject({ focusHours: 5, blocks: 2, looseHours: 1 });
		expect(d.focusWindow).toEqual({ start: 660, end: 960 });
	});
	it('3-hour blocks: 5h = 1 block + 2 loose hours', () => {
		const d = plan(offDay, '2026-10-16', '2026-10-16', { s: { ...settings, blockHours: 3 } }).get('2026-10-16')!;
		expect(d).toMatchObject({ blocks: 1, looseHours: 2 });
	});
	it('has no blocks when focus is shorter than a block', () => {
		const d = plan([], '2026-10-17', '2026-10-17', { s: { ...settings, blockHours: 3 } }).get('2026-10-17')!;
		expect(d).toMatchObject({ focusHours: 2, blocks: 0, looseHours: 2 });
	});
	it('handles fractional block lengths without float drift', () => {
		const d = plan([], '2026-10-16', '2026-10-16', { s: { ...settings, blockHours: 0.5 } }).get('2026-10-16')!;
		expect(d).toMatchObject({ blocks: 8, looseHours: 0 });
		const e = plan(offDay, '2026-10-16', '2026-10-16', { s: { ...settings, blockHours: 1.5 } }).get('2026-10-16')!;
		expect(e).toMatchObject({ blocks: 3, looseHours: 0.5 });
	});
});

describe('school mode', () => {
	it('is null on days outside settings.schoolDays', () => {
		const days = plan([], '2026-10-17', '2026-10-18');
		expect(days.get('2026-10-17')!.school).toBeNull();
		expect(days.get('2026-10-18')!.school).toBeNull();
	});
	it('is live for ordinary open weekdays', () => {
		expect(plan([], '2026-10-16', '2026-10-16').get('2026-10-16')!.school).toBe('live');
	});
	it('is async when any candidate is async', () => {
		const e = [
			timed('WDp', '2026-10-14T11:30:00Z', '2026-10-14T23:30:00Z'),
			timed('Backup', '2026-10-14T13:00:00Z', '2026-10-14T16:00:00Z')
		];
		const d = plan(e, '2026-10-14', '2026-10-14').get('2026-10-14')!;
		expect(d.kindId).toBe('work');
		expect(d.school).toBe('async');
	});
	it('is async on a derived Recovery day', () => {
		const e = timed('WDN', '2026-10-14T21:00:00Z', '2026-10-15T17:00:00Z');
		expect(plan([e], '2026-10-14', '2026-10-15').get('2026-10-15')!.school).toBe('async');
	});
	it('is unknown when unrecognized', () => {
		const d = plan([timed('???', '2026-10-14T12:00:00Z', '2026-10-14T13:00:00Z')], '2026-10-14', '2026-10-14').get('2026-10-14')!;
		expect(d.school).toBe('unknown');
	});
	it('respects a custom school-day list', () => {
		const s: Settings = { ...settings, schoolDays: [1, 2, 3, 4] };
		expect(plan([], '2026-10-16', '2026-10-16', { s }).get('2026-10-16')!.school).toBeNull();
	});
});

describe('bar segments', () => {
	it('paints a shift for zero-focus events', () => {
		const d = plan([timed('WDp', '2026-10-14T11:30:00Z', '2026-10-14T23:30:00Z')], '2026-10-14', '2026-10-14').get('2026-10-14')!;
		expect(d.segments).toEqual([{ start: 450, end: 1170, type: 'shift' }]);
	});
	it('paints on-call for timed events whose kind has focus time', () => {
		const d = plan([timed('Backup', '2026-10-21T13:00:00Z', '2026-10-21T16:00:00Z')], '2026-10-21', '2026-10-21').get('2026-10-21')!;
		expect(d.segments).toEqual([{ start: 9 * 60, end: 12 * 60, type: 'oncall' }]);
	});
	it('paints nothing for all-day events with focus time', () => {
		expect(plan([allDay('Unavailable', '2026-10-16')], '2026-10-16', '2026-10-16').get('2026-10-16')!.segments).toEqual([]);
	});
	it('paints unknown for unmatched events', () => {
		const d = plan([timed('???', '2026-10-14T12:00:00Z', '2026-10-14T13:00:00Z')], '2026-10-14', '2026-10-14').get('2026-10-14')!;
		expect(d.segments).toEqual([{ start: 480, end: 540, type: 'unknown' }]);
	});
	it('adds recovery from the end of the last shift segment to 22:00', () => {
		const e = timed('WDN', '2026-10-14T21:00:00Z', '2026-10-15T17:00:00Z'); // ends 13:00 on the 15th
		const days = plan([e], '2026-10-14', '2026-10-15');
		expect(days.get('2026-10-14')!.segments).toEqual([{ start: 1020, end: 1440, type: 'shift' }]);
		expect(days.get('2026-10-15')!.segments).toEqual([
			{ start: 0, end: 780, type: 'shift' },
			{ start: 780, end: 1320, type: 'recovery' }
		]);
	});
	it('starts recovery at midnight when there is no shift that day', () => {
		const e = timed('WDN', '2026-10-14T21:00:00Z', '2026-10-15T04:00:00Z'); // ends 00:00 exactly
		const days = plan([e], '2026-10-14', '2026-10-15');
		expect(days.get('2026-10-15')!.segments).toEqual([{ start: 0, end: 1320, type: 'recovery' }]);
	});
	it('spans the DST night correctly', () => {
		const e = timed('WDN', '2026-10-31T21:00:00Z', '2026-11-01T18:00:00Z');
		const days = plan([e], '2026-10-31', '2026-11-01');
		expect(days.get('2026-11-01')!.segments[0]).toEqual({ start: 0, end: 780, type: 'shift' });
		expect(days.get('2026-11-01')!.kindId).toBe('recovery');
	});
});
