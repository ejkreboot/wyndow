import { describe, expect, it } from 'vitest';
import { addDays, diffDays, eachDate, formatTime, instantFromZoned, mondayOf, parseTime, todayIn, weekdayOf, zonedParts } from './dates';

describe('date arithmetic', () => {
	it('adds days across month and year boundaries', () => {
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
		expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
	});
	it('diffDays is signed', () => {
		expect(diffDays('2026-10-16', '2026-10-20')).toBe(4);
		expect(diffDays('2026-10-20', '2026-10-16')).toBe(-4);
	});
	it('weekdayOf uses ISO numbering', () => {
		expect(weekdayOf('2026-10-16')).toBe(5); // Friday
		expect(weekdayOf('2026-10-18')).toBe(7); // Sunday
		expect(weekdayOf('2026-10-19')).toBe(1); // Monday
	});
	it('eachDate is inclusive and empty when reversed', () => {
		expect(eachDate('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
		expect(eachDate('2026-10-02', '2026-10-01')).toEqual([]);
	});
	it('mondayOf finds the Monday on or before', () => {
		expect(mondayOf('2026-10-19')).toBe('2026-10-19');
		expect(mondayOf('2026-10-18')).toBe('2026-10-12');
		expect(mondayOf('2026-10-16')).toBe('2026-10-12');
	});
});

describe('time formatting', () => {
	it('round-trips HH:MM', () => {
		expect(formatTime(0)).toBe('00:00');
		expect(formatTime(11 * 60 + 5)).toBe('11:05');
		expect(parseTime('07:30')).toBe(450);
		expect(parseTime('7:30')).toBe(450);
		expect(parseTime('13:00:00')).toBe(780);
	});
	it('rejects junk', () => {
		expect(() => parseTime('noon')).toThrow();
	});
});

describe('zonedParts', () => {
	it('converts an instant to local date and minutes', () => {
		expect(zonedParts(new Date('2026-10-16T21:00:00Z'), 'America/Detroit')).toEqual({ date: '2026-10-16', minutes: 17 * 60 });
	});
	it('rolls the date over when UTC is already tomorrow', () => {
		expect(zonedParts(new Date('2026-10-17T02:30:00Z'), 'America/Detroit')).toEqual({ date: '2026-10-16', minutes: 22 * 60 + 30 });
	});
	it('handles midnight as 00:00 (not 24:00)', () => {
		expect(zonedParts(new Date('2026-10-16T04:00:00Z'), 'America/Detroit')).toEqual({ date: '2026-10-16', minutes: 0 });
	});
	it('respects the DST change', () => {
		// 17:00 EDT on Oct 31, and 13:00 EST on Nov 1.
		expect(zonedParts(new Date('2026-10-31T21:00:00Z'), 'America/Detroit')).toEqual({ date: '2026-10-31', minutes: 1020 });
		expect(zonedParts(new Date('2026-11-01T18:00:00Z'), 'America/Detroit')).toEqual({ date: '2026-11-01', minutes: 780 });
	});
	it('todayIn uses the given zone', () => {
		const now = new Date('2026-10-17T03:00:00Z');
		expect(todayIn('America/Detroit', now)).toBe('2026-10-16');
		expect(todayIn('UTC', now)).toBe('2026-10-17');
	});
});

describe('instantFromZoned', () => {
	it('is the inverse of zonedParts, including across DST', () => {
		for (const [date, minutes] of [['2026-10-31', 1020], ['2026-11-01', 780], ['2026-03-08', 600], ['2026-07-04', 0]] as const) {
			expect(zonedParts(instantFromZoned(date, minutes, 'America/Detroit'), 'America/Detroit')).toEqual({ date, minutes });
		}
	});
	it('gives the right UTC offsets', () => {
		expect(instantFromZoned('2026-10-31', 1020, 'America/Detroit').toISOString()).toBe('2026-10-31T21:00:00.000Z');
		expect(instantFromZoned('2026-11-01', 780, 'America/Detroit').toISOString()).toBe('2026-11-01T18:00:00.000Z');
	});
	it('throws for an unknown timezone', () => {
		expect(() => instantFromZoned('2026-10-31', 0, 'Not/AZone')).toThrow();
	});
});
