import { describe, expect, it } from 'vitest';
import { allocationSpans, blockWindow, fitAllocation } from './blocks';
import { buildDays } from './days';
import { allDay, kind, openWeekday, openWeekend, rule, settings } from './testing';

const off = kind('off', { focusHours: 5, focusStart: 660 });
const days = buildDays({
	from: '2026-10-16',
	to: '2026-10-17',
	events: [allDay('Unavailable', '2026-10-16')],
	rules: [rule('Unavailable', 'off')],
	kinds: [off, openWeekday, openWeekend],
	settings
});
const friday = days.get('2026-10-16')!; // 2 blocks from 11:00
const open = buildDays({ from: '2026-10-19', to: '2026-10-19', events: [], rules: [], kinds: [openWeekday], settings }).get('2026-10-19')!; // 2 blocks

describe('fitAllocation', () => {
	it('pads a missing allocation with null', () => {
		expect(fitAllocation(friday)).toEqual([null, null]);
	});
	it('pads a short allocation', () => {
		expect(fitAllocation(friday, ['a'])).toEqual(['a', null]);
	});
	it('truncates a long allocation when blocks shrink', () => {
		expect(fitAllocation(friday, ['a', 'b', 'c'])).toEqual(['a', 'b']);
	});
	it('returns an empty allocation for a day without blocks', () => {
		const sat = days.get('2026-10-17')!;
		expect(fitAllocation({ ...sat, blocks: 0 }, ['a'])).toEqual([]);
	});
});

describe('blockWindow', () => {
	it('lays blocks out from the start of the focus window', () => {
		expect(blockWindow(friday, 0, settings)).toEqual({ start: 660, end: 780 });
		expect(blockWindow(friday, 1, settings)).toEqual({ start: 780, end: 900 });
	});
	it('follows the block length', () => {
		expect(blockWindow(friday, 1, { ...settings, blockHours: 3 })).toEqual({ start: 840, end: 1020 });
	});
});

describe('allocationSpans', () => {
	it('merges consecutive equal entries', () => {
		expect(allocationSpans(friday, ['a', 'a'], settings)).toEqual([{ start: 660, end: 900, projectId: 'a', blocks: 2 }]);
	});
	it('keeps different entries separate, including open blocks', () => {
		expect(allocationSpans(friday, ['a', null], settings)).toEqual([
			{ start: 660, end: 780, projectId: 'a', blocks: 1 },
			{ start: 780, end: 900, projectId: null, blocks: 1 }
		]);
	});
	it('merges open blocks together', () => {
		expect(allocationSpans(open, [], settings)).toEqual([{ start: 660, end: 900, projectId: null, blocks: 2 }]);
	});
	it('does not merge across a different project in between', () => {
		const d = { ...friday, blocks: 3 };
		expect(allocationSpans(d, ['a', 'b', 'a'], settings).map((s) => s.projectId)).toEqual(['a', 'b', 'a']);
	});
});
