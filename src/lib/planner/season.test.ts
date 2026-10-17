// Integration test: the owner's real shift schedule (Aug 2026 - Feb 2027, America/Detroit),
// run through rules and kinds shaped like the owner's configuration.
import { describe, expect, it } from 'vitest';
import { buildDays } from './days';
import { instantFromZoned } from './dates';
import { nextChunk, weekFocusHours, weekMode } from './queries';
import type { CalEvent, Kind, Rule } from './types';
import { kind, openWeekday, openWeekend, rule, settings } from './testing';

/** [date, code] for all-day entries; [date, code, start, end, hours] for timed shifts. */
type Raw = readonly [string, string] | readonly [string, string, string, string, number];
const RAW: readonly Raw[] = [["2026-08-19","WDN","17:00","13:00",20],["2026-08-21","WEp","08:00","20:00",12],["2026-08-22","WEp","08:00","20:00",12],["2026-08-23","WEp","08:00","20:00",12],["2026-08-27","WDa","07:30","17:30",10],["2026-08-31","WDp","07:30","19:30",12],["2026-09-01","WDp","07:30","19:30",12],["2026-09-02","WDp","07:30","19:30",12],["2026-09-03","WDp","07:30","19:30",12],["2026-09-05","WEp","08:00","20:00",12],["2026-09-06","WEp","08:00","20:00",12],["2026-09-09","WDa","07:30","17:30",10],["2026-09-10","WDa","07:30","17:30",10],["2026-09-11","WEa","08:00","18:00",10],["2026-09-14","WDg","07:30","19:30",12],["2026-09-15","WDg","07:30","19:30",12],["2026-09-16","WDg","07:30","19:30",12],["2026-09-21","WDN","17:00","13:00",20],["2026-09-25","WEo","08:00","20:00",12],["2026-09-26","WEo","08:00","20:00",12],["2026-09-27","WEo","08:00","20:00",12],["2026-09-30","WDa","07:30","17:30",10],["2026-10-01","WDa","07:30","17:30",10],["2026-10-02","WEa","08:00","18:00",10],["2026-10-03","WEa","08:00","18:00",10],["2026-10-04","WEa","08:00","18:00",10],["2026-10-07","SWING","10:00","20:00",10],["2026-10-09","WEp","08:00","20:00",12],["2026-10-10","WEp","08:00","20:00",12],["2026-10-11","WEp","08:00","20:00",12],["2026-10-13","SWING","10:00","20:00",10],["2026-10-14","WDN","17:00","13:00",20],["2026-10-16","Unavailable"],["2026-10-17","Unavailable"],["2026-10-18","Unavailable"],["2026-10-19","WDN","17:00","13:00",20],["2026-10-21","Backup","09:00","12:00",3],["2026-10-22","SWING","10:00","20:00",10],["2026-10-23","WEa","08:00","18:00",10],["2026-10-27","Backup","09:00","12:00",3],["2026-10-30","WDN","17:00","13:00",20],["2026-11-03","WDN","17:00","13:00",20],["2026-11-06","WEo","08:00","20:00",12],["2026-11-07","WEo","08:00","20:00",12],["2026-11-08","WEo","08:00","20:00",12],["2026-11-12","SWING","10:00","20:00",10],["2026-11-13","SWING","10:00","20:00",10],["2026-11-16","WDg","07:30","19:30",12],["2026-11-17","WDg","07:30","19:30",12],["2026-11-18","Backup","09:00","12:00",3],["2026-11-19","WDN","17:00","13:00",20],["2026-11-23","WDp","07:30","19:30",12],["2026-11-24","WDp","07:30","19:30",12],["2026-11-25","WDp","07:30","19:30",12],["2026-11-26","WDp","07:30","19:30",12],["2026-11-27","Unavailable"],["2026-12-01","Unavailable"],["2026-12-03","WDN","17:00","13:00",20],["2026-12-07","WDg","07:30","19:30",12],["2026-12-08","WDg","07:30","19:30",12],["2026-12-09","WDg","07:30","19:30",12],["2026-12-10","WDg","07:30","19:30",12],["2026-12-14","Backup","09:00","12:00",3],["2026-12-18","WEo","08:00","20:00",12],["2026-12-19","WEo","08:00","20:00",12],["2026-12-20","WEo","08:00","20:00",12],["2026-12-25","Unavailable"],["2026-12-28","WDN","17:00","13:00",20],["2026-12-30","Unavailable"],["2027-01-01","WEp","08:00","20:00",12],["2027-01-02","WEp","08:00","20:00",12],["2027-01-03","WEp","08:00","20:00",12],["2027-01-06","Unavailable"],["2027-01-07","Unavailable"],["2027-01-08","Unavailable"],["2027-01-09","Unavailable"],["2027-01-10","Unavailable"],["2027-01-13","SWING","10:00","20:00",10],["2027-01-14","Backup","09:00","12:00",3],["2027-01-15","Backup","09:00","12:00",3],["2027-01-18","WDa","07:30","17:30",10],["2027-01-19","WDa","07:30","17:30",10],["2027-01-22","WEo","08:00","20:00",12],["2027-01-23","WEo","08:00","20:00",12],["2027-01-24","WEo","08:00","20:00",12],["2027-01-26","Backup","09:00","12:00",3],["2027-01-28","SWING","10:00","20:00",10],["2027-01-29","Unavailable"],["2027-01-30","Unavailable"],["2027-01-31","Unavailable"],["2027-02-02","Backup","09:00","12:00",3],["2027-02-05","WEp","08:00","20:00",12],["2027-02-06","WEp","08:00","20:00",12],["2027-02-07","WEp","08:00","20:00",12],["2027-02-09","Unavailable"],["2027-02-10","Unavailable"],["2027-02-11","Unavailable"],["2027-02-12","Unavailable"],["2027-02-13","Unavailable"],["2027-02-14","Unavailable"],["2027-02-15","WDo","07:30","19:30",12],["2027-02-16","WDo","07:30","19:30",12],["2027-02-17","WDo","07:30","19:30",12],["2027-02-18","WDo","07:30","19:30",12],["2027-02-19","Unavailable"],["2027-02-20","Unavailable"],["2027-02-21","Unavailable"],["2027-02-22","Unavailable"],["2027-02-26","WEg","08:00","18:00",10],["2027-02-27","WEg","08:00","18:00",10],["2027-02-28","WEg","08:00","18:00",10]];

const TZ = 'America/Detroit';

function detroitInstant(date: string, hhmm: string): Date {
	const [h, m] = hhmm.split(':').map(Number);
	return instantFromZoned(date, h * 60 + m, TZ);
}

function nextDate(date: string): string {
	const [y, m, d] = date.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

const events: CalEvent[] = RAW.map((r, i) => {
	const [date, code] = r;
	if (r.length === 2) {
		return { id: `ev${i}`, sourceId: 'amion', title: code, start: null, end: null, allDayStart: date, allDayEnd: null };
	}
	const [, , st, en] = r;
	const endDate = en <= st ? nextDate(date) : date;
	return { id: `ev${i}`, sourceId: 'amion', title: code, start: detroitInstant(date, st), end: detroitInstant(endDate, en), allDayStart: null, allDayEnd: null };
});

const kinds: Kind[] = [
	kind('work', { name: 'Working all day', schoolMode: 'async' }),
	kind('night', { name: 'Night', schoolMode: 'live', nextDayKindId: 'recovery' }),
	kind('recovery', { name: 'Recovery', schoolMode: 'async' }),
	kind('swing', { name: 'Swing', schoolMode: 'live' }),
	kind('oncall', { name: 'On call', focusHours: 2, focusStart: 13 * 60 }),
	kind('off', { name: 'Time off', focusHours: 5, focusStart: 11 * 60 }),
	openWeekday,
	openWeekend
];
const workRules: Rule[] = ['WDp', 'WDg', 'WDa', 'WEp', 'WEo', 'WEa', 'WEg'].map((c) => rule(c, 'work'));
const baseRules: Rule[] = [
	...workRules,
	rule('WDN', 'night'),
	rule('SWING', 'swing'),
	rule('Backup', 'oncall'),
	rule('Unavailable', 'off')
];
// The owner has not yet decided what WDo means, so it has no rule.
const rules = baseRules.filter((r) => r.pattern !== 'WDo');

const days = buildDays({ from: '2026-08-17', to: '2027-02-28', events, rules, kinds, settings });
const day = (d: string) => days.get(d)!;

describe('season from real schedule', () => {
	it('builds every date in the range', () => {
		expect(days.size).toBe(196);
		expect(day('2026-08-17').kindId).toBe('open_weekday');
	});

	it('2026-10-16 is Time off: 2 blocks of 2h and 1 loose hour', () => {
		expect(day('2026-10-16')).toMatchObject({ kindId: 'off', focusHours: 5, blocks: 2, looseHours: 1, school: 'live' });
		expect(day('2026-10-16').focusWindow).toEqual({ start: 660, end: 960 });
	});

	it('Time off all-day entries cover a Saturday without school', () => {
		expect(day('2026-10-17')).toMatchObject({ kindId: 'off', school: null, blocks: 2 });
	});

	it('2026-10-20 is Recovery after the Monday night shift', () => {
		expect(day('2026-10-19').kindId).toBe('night');
		expect(day('2026-10-19').school).toBe('live');
		expect(day('2026-10-20')).toMatchObject({ kindId: 'recovery', focusHours: 0, blocks: 0, school: 'async', derivedKindIds: ['recovery'] });
		expect(day('2026-10-20').segments).toEqual([
			{ start: 0, end: 13 * 60, type: 'shift' },
			{ start: 13 * 60, end: 22 * 60, type: 'recovery' }
		]);
	});

	it('2026-10-21 is On call with one 2h block from 13:00', () => {
		expect(day('2026-10-21')).toMatchObject({ kindId: 'oncall', focusHours: 2, blocks: 1, looseHours: 0, school: 'live' });
		expect(day('2026-10-21').focusWindow).toEqual({ start: 780, end: 900 });
		expect(day('2026-10-21').segments).toEqual([{ start: 9 * 60, end: 12 * 60, type: 'oncall' }]);
	});

	it('a Swing day is a live-school shift with no focus', () => {
		expect(day('2026-10-22')).toMatchObject({ kindId: 'swing', blocks: 0, school: 'live' });
		expect(day('2026-10-22').segments).toEqual([{ start: 600, end: 1200, type: 'shift' }]);
	});

	it('the night shift of 2026-10-30 ends 13:00 on the 31st', () => {
		expect(day('2026-10-31').events[0]).toMatchObject({ startsToday: false, endMin: 780 });
		expect(day('2026-10-31').kindId).toBe('recovery');
	});

	it('the night shift spanning the fall-back DST change keeps wall-clock times', () => {
		const extra: CalEvent[] = [
			{ id: 'dst', sourceId: 'amion', title: 'WDN', start: detroitInstant('2026-10-31', '17:00'), end: detroitInstant('2026-11-01', '13:00'), allDayStart: null, allDayEnd: null }
		];
		const d = buildDays({ from: '2026-10-31', to: '2026-11-01', events: extra, rules, kinds, settings });
		expect(d.get('2026-10-31')!.events[0]).toMatchObject({ startMin: 1020, endMin: 1440 });
		expect(d.get('2026-11-01')!.events[0]).toMatchObject({ startMin: 0, endMin: 780, startsToday: false });
		expect(d.get('2026-11-01')!.kindId).toBe('recovery');
	});

	it('WDo days are unrecognized when no rule covers WDo', () => {
		for (const date of ['2027-02-15', '2027-02-16', '2027-02-17', '2027-02-18']) {
			expect(day(date)).toMatchObject({ kindId: 'unrecognized', blocks: 0, school: 'unknown' });
			expect(day(date).segments).toEqual([{ start: 450, end: 1170, type: 'unknown' }]);
		}
		const unrecognized = [...days.values()].filter((d) => d.kindId === 'unrecognized').map((d) => d.date);
		expect(unrecognized).toContain('2027-02-15');
		// Only WDo (Feb 15-18) is unrecognized, plus the WEo weekends only if WEo lacked a rule (it has one).
		expect(unrecognized).toEqual(['2027-02-15', '2027-02-16', '2027-02-17', '2027-02-18']);
	});

	it('adding a WDo rule resolves them', () => {
		const withWdo = buildDays({ from: '2027-02-15', to: '2027-02-18', events, rules: baseRules.concat(rule('WDo', 'work')), kinds, settings });
		expect([...withWdo.values()].every((d) => d.kindId === 'work' && d.school === 'async')).toBe(true);
	});

	it('days without events use the built-in open kinds', () => {
		expect(day('2026-08-18')).toMatchObject({ kindId: 'open_weekday', blocks: 2 }); // Tuesday
		expect(day('2026-08-20')).toMatchObject({ kindId: 'recovery' });
	});

	it('weeks classify as sprint or keep-alive', () => {
		expect(weekFocusHours(days, '2026-10-12')).toBe(19);
		expect(weekMode(weekFocusHours(days, '2026-10-12'))).toBe('sprint');
		expect(weekFocusHours(days, '2026-10-19')).toBe(6);
		expect(weekMode(weekFocusHours(days, '2026-10-19'))).toBe('keep-alive');
	});

	it('next chunk from the Time off Friday is the whole 4h of blocks', () => {
		const chunk = nextChunk({ days, allocations: {}, settings, from: '2026-10-16', familyIds: [] });
		expect(chunk).toMatchObject({ date: '2026-10-16', blockCount: 2, window: { start: 660, end: 900 } });
	});
});
