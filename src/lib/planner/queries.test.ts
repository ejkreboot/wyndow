import { describe, expect, it } from 'vitest';
import { buildDays } from './days';
import {
	asyncDaysAhead,
	findTime,
	forecast,
	nextChunk,
	schoolDaysAhead,
	suggestStretches,
	weekFocusHours,
	weekMode
} from './queries';
import type { Allocations } from './types';
import { allDay, kind, openWeekday, openWeekend, rule, settings, timed } from './testing';

const work = kind('work', { schoolMode: 'async' });
const kinds = [work, openWeekday, openWeekend];
const rules = [rule('WDp', 'work')];

/** Mon 2026-10-19 .. Sun 2026-10-25: open weekdays have 2 blocks (11:00-15:00), weekend 1 block (14:00-16:00). */
function openWeek(extra = [] as ReturnType<typeof timed>[], s = settings) {
	return buildDays({ from: '2026-10-19', to: '2026-10-25', events: extra, rules, kinds, settings: s });
}
const family = ['fam'];

describe('nextChunk', () => {
	it('returns the first run of >= chunkMinHours (3h needs two 2h blocks)', () => {
		const days = openWeek();
		const chunk = nextChunk({ days, allocations: {}, settings, from: '2026-10-19', familyIds: family });
		expect(chunk).toEqual({ date: '2026-10-19', window: { start: 660, end: 900 }, blockCount: 2, projectIds: [] });
	});

	it('skips family blocks and reports distinct project ids', () => {
		const days = openWeek();
		const allocations: Allocations = { '2026-10-19': ['fam', 'fam'], '2026-10-20': ['a', 'b'] };
		const chunk = nextChunk({ days, allocations, settings, from: '2026-10-19', familyIds: family });
		expect(chunk?.date).toBe('2026-10-20');
		expect(chunk?.projectIds).toEqual(['a', 'b']);
	});

	it('breaks a run at a family block', () => {
		const days = openWeek([], { ...settings, blockHours: 1 }); // 4 blocks per weekday
		const allocations: Allocations = { '2026-10-19': [null, 'fam', null, null] };
		const chunk = nextChunk({ days, allocations, settings: { ...settings, blockHours: 1 }, from: '2026-10-19', familyIds: family });
		// Blocks 2-3 are only 2h; the next qualifying run is on the 20th.
		expect(chunk?.date).toBe('2026-10-20');
		expect(chunk?.blockCount).toBe(4);
	});

	it('honours chunkMinHours', () => {
		const days = openWeek();
		const strict = { ...settings, chunkMinHours: 5 };
		// weekdays only hold 4h; the weekend 2h
		expect(nextChunk({ days, allocations: {}, settings: strict, from: '2026-10-19', familyIds: family })).toBeNull();
		const lax = { ...settings, chunkMinHours: 2 };
		expect(nextChunk({ days, allocations: {}, settings: lax, from: '2026-10-19', familyIds: family })?.blockCount).toBe(2);
	});

	it('on the start date ignores blocks that already ended', () => {
		const days = openWeek();
		// Blocks are 11:00-13:00 and 13:00-15:00. At 13:30 only the second remains (2h < 3h).
		const chunk = nextChunk({ days, allocations: {}, settings, from: '2026-10-19', nowMinutes: 13 * 60 + 30, familyIds: family });
		expect(chunk?.date).toBe('2026-10-20');
	});

	it('keeps a block that is still in progress; later dates ignore nowMinutes', () => {
		const days = openWeek();
		const chunk = nextChunk({ days, allocations: {}, settings, from: '2026-10-19', nowMinutes: 12 * 60, familyIds: family });
		expect(chunk?.date).toBe('2026-10-19');
		const later = nextChunk({ days, allocations: {}, settings, from: '2026-10-19', nowMinutes: 23 * 60, familyIds: family });
		expect(later?.date).toBe('2026-10-20');
	});

	it('returns null when nothing qualifies', () => {
		const days = openWeek();
		const allocations: Allocations = {};
		for (const d of days.keys()) allocations[d] = ['fam', 'fam'];
		expect(nextChunk({ days, allocations, settings, from: '2026-10-19', familyIds: family })).toBeNull();
		expect(nextChunk({ days, allocations: {}, settings, from: '2026-11-01', familyIds: family })).toBeNull();
	});
});

describe('findTime', () => {
	const days = openWeek();
	const base = { projectId: 'a', from: '2026-10-19', by: '2026-10-23', days, settings, familyIds: family };

	it('uses assigned blocks first, then open blocks, and reports rows by date', () => {
		const allocations: Allocations = { '2026-10-21': ['a', 'b'], '2026-10-22': ['a', 'a'] };
		const r = findTime({ ...base, hours: 6, allocations });
		// 3 assigned blocks (6h) cover it; no open blocks needed even though earlier dates are open.
		expect(r.covered).toBe(true);
		expect(r.rows).toEqual([
			{ date: '2026-10-21', blocks: 1, assigned: true },
			{ date: '2026-10-22', blocks: 2, assigned: true }
		]);
		expect(r.lastDate).toBe('2026-10-22');
		expect(r.hoursFound).toBe(6);
		expect(r.shortBy).toBe(0);
	});

	it('falls back to open blocks after the assigned ones', () => {
		const allocations: Allocations = { '2026-10-21': ['a', 'b'] };
		const r = findTime({ ...base, hours: 4, allocations });
		expect(r.rows).toEqual([
			{ date: '2026-10-19', blocks: 1, assigned: false },
			{ date: '2026-10-21', blocks: 1, assigned: true }
		]);
		expect(r.covered).toBe(true);
	});

	it('takes only as many blocks as needed (rounding up)', () => {
		const r = findTime({ ...base, hours: 3, allocations: {} });
		expect(r.rows).toEqual([{ date: '2026-10-19', blocks: 2, assigned: false }]);
		expect(r.hoursFound).toBe(4);
	});

	it('reports how short it is when blocks run out', () => {
		const allocations: Allocations = {};
		for (const d of days.keys()) allocations[d] = ['b', 'b'];
		const r = findTime({ ...base, hours: 4, allocations });
		expect(r).toMatchObject({ covered: false, hoursFound: 0, shortBy: 4, lastDate: null, rows: [] });
	});

	it('respects the by date', () => {
		const r = findTime({ ...base, hours: 100, by: '2026-10-20', allocations: {} });
		expect(r.hoursFound).toBe(8);
		expect(r.shortBy).toBe(92);
		expect(r.covered).toBe(false);
	});

	it('with no project, counts any non-family project as assigned', () => {
		const allocations: Allocations = { '2026-10-19': ['fam', 'fam'], '2026-10-20': ['b', 'fam'] };
		const r = findTime({ ...base, projectId: null, hours: 2, allocations });
		expect(r.rows).toEqual([{ date: '2026-10-20', blocks: 1, assigned: true }]);
	});
});

describe('forecast', () => {
	const days = openWeek();
	it('finds the date the allocated blocks reach the remaining count', () => {
		const allocations: Allocations = { '2026-10-19': ['a', null], '2026-10-21': ['a', 'a'] };
		expect(forecast({ projectId: 'a', remainingBlocks: 3, days, allocations, from: '2026-10-19' })).toEqual({
			date: '2026-10-21',
			remainingBlocks: 3,
			shortBlocks: 0
		});
	});
	it('reports missing blocks when allocation is not enough', () => {
		const allocations: Allocations = { '2026-10-19': ['a', null] };
		expect(forecast({ projectId: 'a', remainingBlocks: 4, days, allocations, from: '2026-10-19' })).toEqual({
			date: null,
			remainingBlocks: 4,
			shortBlocks: 3
		});
	});
	it('only counts from the given date', () => {
		const allocations: Allocations = { '2026-10-19': ['a', 'a'] };
		expect(forecast({ projectId: 'a', remainingBlocks: 1, days, allocations, from: '2026-10-20' }).date).toBeNull();
	});
	it('needs nothing when no blocks remain', () => {
		expect(forecast({ projectId: 'a', remainingBlocks: 0, days, allocations: {}, from: '2026-10-19' })).toEqual({
			date: null,
			remainingBlocks: 0,
			shortBlocks: 0
		});
	});
});

describe('suggestStretches', () => {
	const ventures = ['v1', 'v2'];

	it('gives a long run to a venture and open-weekend days to family', () => {
		const days = openWeek();
		const out = suggestStretches({ days, from: '2026-10-19', to: '2026-10-25', ventureIds: ventures, familyId: 'fam' });
		expect(out['2026-10-19']).toEqual(['v1', 'v1']);
		expect(out['2026-10-23']).toEqual(['v1', 'v1']);
		expect(out['2026-10-24']).toEqual(['fam']);
		expect(out['2026-10-25']).toEqual(['fam']);
	});

	it('rotates ventures across separate runs', () => {
		// Shifts on Wed break the week into runs: Mon-Tue (4 blocks), Thu-Sun (6 blocks).
		const wed = timed('WDp', '2026-10-21T11:30:00Z', '2026-10-21T23:30:00Z');
		const days = openWeek([wed]);
		const out = suggestStretches({ days, from: '2026-10-19', to: '2026-10-25', ventureIds: ventures, familyId: 'fam' });
		expect(out['2026-10-20']).toEqual(['v1', 'v1']);
		expect(out['2026-10-21']).toBeUndefined();
		expect(out['2026-10-22']).toEqual(['v2', 'v2']);
		expect(out['2026-10-24']).toEqual(['fam']);
	});

	it('leaves runs shorter than 3 blocks to nobody (except open weekends)', () => {
		// Work Mon-Thu, Sat, Sun; Friday is the only open weekday: 2 blocks, run of 1 day.
		const shifts = ['19', '20', '21', '22'].map((d) => timed('WDp', `2026-10-${d}T11:30:00Z`, `2026-10-${d}T23:30:00Z`));
		const days = openWeek(shifts);
		const out = suggestStretches({ days, from: '2026-10-19', to: '2026-10-22', ventureIds: ventures, familyId: 'fam' });
		expect(out).toEqual({});
		const wide = suggestStretches({ days, from: '2026-10-19', to: '2026-10-25', ventureIds: ventures, familyId: 'fam' });
		// Fri (2 blocks) + Sat + Sun (1 each) form a 4-block run: venture on Fri, family on the weekend.
		expect(wide['2026-10-23']).toEqual(['v1', 'v1']);
		expect(wide['2026-10-24']).toEqual(['fam']);
	});

	it('a short run containing an open weekend still gives that weekend to family', () => {
		const shifts = ['19', '20', '21', '22', '23'].map((d) => timed('WDp', `2026-10-${d}T11:30:00Z`, `2026-10-${d}T23:30:00Z`));
		const days = openWeek(shifts);
		const out = suggestStretches({ days, from: '2026-10-19', to: '2026-10-25', ventureIds: ventures, familyId: 'fam' });
		expect(out).toEqual({ '2026-10-24': ['fam'], '2026-10-25': ['fam'] });
	});

	it('exactly 3 blocks qualifies for a venture', () => {
		const shifts = ['19', '20', '21', '22'].map((d) => timed('WDp', `2026-10-${d}T11:30:00Z`, `2026-10-${d}T23:30:00Z`));
		const days = buildDays({
			from: '2026-10-19',
			to: '2026-10-25',
			events: [...shifts, timed('WDp', '2026-10-25T11:30:00Z', '2026-10-25T23:30:00Z')],
			rules,
			kinds,
			settings: { ...settings, blockHours: 2 }
		});
		// Fri 2 + Sat 1 = 3 blocks, Sunday is a shift.
		const out = suggestStretches({ days, from: '2026-10-19', to: '2026-10-25', ventureIds: ventures, familyId: 'fam' });
		expect(out['2026-10-23']).toEqual(['v1', 'v1']);
		expect(out['2026-10-24']).toEqual(['fam']);
	});

	it('does not treat a weekend day with a shift as open', () => {
		const sat = timed('Backup', '2026-10-24T13:00:00Z', '2026-10-24T16:00:00Z'); // unmatched -> unrecognized, 0 blocks
		const days = openWeek([sat]);
		const out = suggestStretches({ days, from: '2026-10-24', to: '2026-10-25', ventureIds: ventures, familyId: 'fam' });
		expect(out['2026-10-24']).toBeUndefined();
	});

	it('works without ventures', () => {
		const days = openWeek();
		const out = suggestStretches({ days, from: '2026-10-19', to: '2026-10-25', ventureIds: [], familyId: 'fam' });
		expect(Object.keys(out)).toEqual(['2026-10-24', '2026-10-25']);
	});
});

describe('week helpers', () => {
	it('sums focus hours across the Sunday-Saturday week', () => {
		const days = openWeek(); // Mon 19 .. Sun 25
		expect(weekFocusHours(days, '2026-10-19')).toBe(5 * 4 + 2); // Sun 18 (not built) .. Sat 24
		expect(weekFocusHours(days, '2026-10-24')).toBe(5 * 4 + 2);
		expect(weekFocusHours(days, '2026-10-25')).toBe(2); // Sun 25 starts the next week
		expect(weekFocusHours(days, '2026-11-01')).toBe(0);
	});
	it('classifies weeks by thresholds', () => {
		expect(weekMode(24)).toBe('sprint');
		expect(weekMode(16)).toBe('sprint');
		expect(weekMode(15.5)).toBe('steady');
		expect(weekMode(7)).toBe('steady');
		expect(weekMode(6)).toBe('keep-alive');
		expect(weekMode(0)).toBe('keep-alive');
	});
});

describe('school days ahead', () => {
	// Mon-Wed are async work days, the rest of the week is open (live).
	const shifts = ['19', '20', '21'].map((d) => timed('WDp', `2026-10-${d}T11:30:00Z`, `2026-10-${d}T23:30:00Z`));
	const days = buildDays({ from: '2026-10-19', to: '2026-11-06', events: [...shifts, allDay('WDp', '2026-10-26')], rules, kinds, settings });

	it('lists the next school days, skipping weekends', () => {
		expect(schoolDaysAhead(days, '2026-10-22', 4)).toEqual(['2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27']);
		expect(schoolDaysAhead(days, '2026-10-24', 1)).toEqual(['2026-10-26']);
	});
	it('lists only async days among the next N school days', () => {
		expect(asyncDaysAhead(days, '2026-10-19', 5)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21']);
		expect(asyncDaysAhead(days, '2026-10-19', 2)).toEqual(['2026-10-19', '2026-10-20']);
		expect(asyncDaysAhead(days, '2026-10-22', 5)).toEqual(['2026-10-26']);
	});
	it('stops at the end of the built range', () => {
		expect(schoolDaysAhead(days, '2026-11-05', 10)).toEqual(['2026-11-05', '2026-11-06']);
	});
});
