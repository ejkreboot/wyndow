import { describe, expect, it } from 'vitest';
import { buildDays } from '$lib/planner/days';
import { allDay, kind, openWeekday, openWeekend, rule, settings, timed } from '$lib/planner/testing';
import type { Project, SchoolClass } from '$lib/planner/types';
import { elapsedMinutes, isValidDayParam, longDate, nextChunkLabel, packetNeeds, shortDate } from './format';
import { buildTimeline, dayReadout, lessonStart } from './timeline';

const proj = (id: string, name: string, area: Project['area'] = 'venture'): Project => ({
	id, name, color: '#112233', area, githubRepo: null, githubMilestone: null, milestone: null, blocksDone: 0, archived: false, sort: 0
});
const cls = (id: string, name: string, ready: number): SchoolClass => ({
	id, name, student: 'Older', wyrkbookRef: null, currentUnit: null, packetsReady: ready, sort: 0
});

describe('format', () => {
	it('formats dates', () => {
		expect(longDate('2026-10-16')).toBe('Friday 16 October');
		expect(shortDate('2026-10-16')).toBe('Fri 16 Oct');
	});
	it('validates the date param', () => {
		const t = '2026-10-16';
		expect(isValidDayParam('2026-10-16', t)).toBe(true);
		expect(isValidDayParam('2026-02-30', t)).toBe(false);
		expect(isValidDayParam('2026-1-16', t)).toBe(false);
		expect(isValidDayParam('2028-10-16', t)).toBe(false);
		expect(isValidDayParam('2025-09-16', t)).toBe(true);
	});
	it('labels the next chunk', () => {
		const ps = [proj('a', 'Snapval'), proj('b', 'Voisee')];
		const chunk = { date: '2026-10-16', window: { start: 660, end: 900 }, blockCount: 2, projectIds: ['a', 'b'] };
		expect(nextChunkLabel(chunk, '2026-10-16', ps)).toBe('TODAY 11:00–15:00 · SNAPVAL + VOISEE');
		expect(nextChunkLabel({ ...chunk, date: '2026-10-17', projectIds: [] }, '2026-10-16', ps)).toBe('TOMORROW 11:00–15:00');
		expect(nextChunkLabel({ ...chunk, date: '2026-10-20' }, '2026-10-16', ps)).toMatch(/^TUE 20 OCT 11:00/);
	});
	it('computes packet needs', () => {
		const async = ['2026-10-19', '2026-10-21'];
		const [a, b] = packetNeeds([cls('m', 'Math', 1), cls('s', 'Sci', 2)], async);
		expect(a).toMatchObject({ missing: 1, dueBy: '2026-10-20' });
		expect(b).toMatchObject({ missing: 0, dueBy: null });
	});
	it('elapsed minutes', () => {
		expect(elapsedMinutes(new Date(0), 125_000)).toBe(2);
		expect(elapsedMinutes(new Date(10_000), 0)).toBe(0);
	});
});

describe('timeline', () => {
	const work = kind('work', { name: 'Work', focusHours: 0 });
	const kinds = [openWeekday, openWeekend, work];
	const rules = [rule('DAY', 'work')];
	const mk = (events: ReturnType<typeof timed>[]) =>
		buildDays({ from: '2026-10-14', to: '2026-10-16', events, rules, kinds, settings }).get('2026-10-16')!;

	it('starts lessons earlier before a busy early event', () => {
		expect(lessonStart([], 3)).toBe(510);
		expect(lessonStart([8 * 60], 2)).toBe(8 * 60 - 30 - 90);
		expect(lessonStart([12 * 60], 3)).toBe(510);
	});

	it('builds a plain open weekday', () => {
		const day = mk([]);
		const items = buildTimeline({
			day, kinds, projects: [proj('a', 'Snapval')], classes: [cls('m', 'Math', 0)],
			allocations: { '2026-10-16': ['a', null] }, settings, familyIds: []
		});
		expect(items.map((i) => i.card.type)).toEqual(['lesson', 'focus', 'focus', 'small', 'family']);
		const readout = dayReadout(day, [proj('a', 'Snapval')], { '2026-10-16': ['a', null] }, settings, [], null);
		expect(readout).toEqual({ time: '11:00', sub: 'SNAPVAL · 1 BLOCK → 13:00' });
	});

	it('drops family time when a shift runs late and marks unrecognized titles', () => {
		const day = mk([timed('DAY', '2026-10-16T12:00:00-04:00', '2026-10-16T20:00:00-04:00'), allDay('???', '2026-10-16')]);
		const items = buildTimeline({ day, kinds, projects: [], classes: [], allocations: {}, settings, familyIds: [] });
		expect(items.some((i) => i.card.type === 'family')).toBe(false);
		expect(items.some((i) => i.card.type === 'event' && i.card.unrecognized)).toBe(true);
		expect(items[0].label).toBe('All day');
	});

	it('shows overnight events with next-day end', () => {
		const day = mk([timed('DAY', '2026-10-16T19:00:00-04:00', '2026-10-17T07:00:00-04:00')]);
		const items = buildTimeline({ day, kinds, projects: [], classes: [], allocations: {}, settings, familyIds: [] });
		const ev = items.find((i) => i.card.type === 'event')!.card;
		expect(ev.type === 'event' && ev.range).toBe('19:00 → 07:00 next day');
	});
});
