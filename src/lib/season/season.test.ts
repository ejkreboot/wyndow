import { describe, expect, it } from 'vitest';
import {
	dayNumber,
	formatDate,
	formatMonth,
	inRange,
	isValidDate,
	paintedDay,
	seasonRange,
	weekHeadings,
	weekStarts,
	withBlock
} from './season';

describe('seasonRange', () => {
	it('runs from the Sunday 4 weeks back to the Saturday 30 weeks ahead', () => {
		const r = seasonRange('2026-10-16'); // Friday
		expect(r.from).toBe('2026-09-13');
		expect(r.to).toBe('2027-05-15');
		expect(weekStarts(r)).toHaveLength(35);
		expect(weekStarts(r)[0]).toBe('2026-09-13');
	});
});

describe('dates', () => {
	it('validates real calendar dates', () => {
		expect(isValidDate('2026-02-30')).toBe(false);
		expect(isValidDate('2026-2-3')).toBe(false);
		expect(isValidDate('2026-10-16')).toBe(true);
		expect(isValidDate(5)).toBe(false);
	});
	it('checks range', () => {
		const r = { from: '2026-09-14', to: '2027-05-16' };
		expect(inRange('2026-09-14', r)).toBe(true);
		expect(inRange('2027-05-17', r)).toBe(false);
		expect(inRange('nope', r)).toBe(false);
	});
	it('formats labels', () => {
		expect(formatDate('2026-10-16')).toBe('Fri 16 Oct');
		expect(formatMonth('2026-10')).toBe('October 2026');
		expect(dayNumber('2026-10-06')).toBe('6');
	});
});

describe('weekHeadings', () => {
	it('headings for the first row and weeks containing the 1st', () => {
		expect(weekHeadings('2026-09-13', true)).toEqual(['2026-09']);
		expect(weekHeadings('2026-09-20', false)).toEqual([]);
		expect(weekHeadings('2026-09-27', false)).toEqual(['2026-10']);
		expect(weekHeadings('2026-09-27', true)).toEqual(['2026-09', '2026-10']);
	});
});

describe('block edits', () => {
	it('sets one block and pads', () => {
		expect(withBlock(['a'], 3, 2, 'b')).toEqual(['a', null, 'b']);
		expect(withBlock(['a', 'a'], 2, 0, null)).toEqual([null, 'a']);
	});
	it('rejects out-of-range indexes', () => {
		expect(withBlock([], 2, 2, 'a')).toBeNull();
		expect(withBlock([], 2, -1, 'a')).toBeNull();
		expect(withBlock([], 2, 0.5, 'a')).toBeNull();
	});
	it('paints a whole day', () => {
		expect(paintedDay(3, 'p')).toEqual(['p', 'p', 'p']);
		expect(paintedDay(2, null)).toEqual([null, null]);
	});
});
