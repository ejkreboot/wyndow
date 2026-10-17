import { describe, expect, it } from 'vitest';
import { buildDays } from '$lib/planner/days';
import { openWeekday, openWeekend, settings } from '$lib/planner/testing';
import { burndownSeries } from './burndown';
import type { Issue } from './issues';

function issue(n: number, size: number, created: string, closed: string | null = null, reason: Issue['stateReason'] = null): Issue {
	return {
		number: n,
		title: `#${n}`,
		url: `https://github.com/o/r/issues/${n}`,
		size,
		depth: null,
		state: closed ? 'closed' : 'open',
		stateReason: closed ? (reason ?? 'completed') : null,
		status: null,
		labels: [],
		milestone: 1,
		body: '',
		createdAt: created,
		closedAt: closed
	};
}

// Open weekdays have 2 blocks, open weekends 1 (2h blocks).
const days = buildDays({ from: '2026-10-11', to: '2026-11-30', events: [], rules: [], kinds: [openWeekday, openWeekend], settings });
const base = { start: '2026-10-11', due: null, today: '2026-10-15', timezone: 'America/Detroit', projectId: 'p', days, allocations: {} };

describe('burndownSeries', () => {
	it('tracks remaining and scope day by day, in local dates', () => {
		const b = burndownSeries({
			...base,
			issues: [
				issue(1, 3, '2026-10-01T12:00:00Z', '2026-10-13T15:00:00Z'), // before start: counted from start
				issue(2, 2, '2026-10-12T12:00:00Z'),
				// 02:00Z on the 14th is still the 13th in Detroit
				issue(3, 5, '2026-10-14T02:00:00Z', '2026-10-15T12:00:00Z', 'not_planned')
			]
		});
		expect(b.actual.map((p) => p.value)).toEqual([3, 5, 7, 7, 2]);
		expect(b.scope.map((p) => p.value)).toEqual([3, 5, 10, 10, 5]);
		expect(b.remaining).toBe(2);
		expect(b.done).toBe(3);
	});

	it('projects from today using blocks painted for the project', () => {
		const allocations = { '2026-10-15': ['p', null], '2026-10-16': ['p', 'p'], '2026-10-19': ['x', 'p'] };
		const b = burndownSeries({ ...base, allocations, issues: [issue(1, 4, '2026-10-11T12:00:00Z')] });
		expect(b.projected).toEqual([
			{ date: '2026-10-15', value: 4 },
			{ date: '2026-10-15', value: 3 },
			{ date: '2026-10-16', value: 1 },
			{ date: '2026-10-19', value: 0 }
		]);
		expect(b.finish).toBe('2026-10-19');
		expect(b.shortBlocks).toBe(0);
	});

	it('reports a shortfall and extends the line flat to the edge', () => {
		const b = burndownSeries({ ...base, due: '2026-11-01', allocations: { '2026-10-16': ['p', null] }, issues: [issue(1, 4, '2026-10-11T12:00:00Z')] });
		expect(b.finish).toBeNull();
		expect(b.shortBlocks).toBe(3);
		expect(b.end).toBe('2026-11-01');
		expect(b.projected.at(-1)).toEqual({ date: '2026-11-01', value: 3 });
	});

	it('labels Sundays and runs at least two weeks past today', () => {
		const b = burndownSeries({ ...base, issues: [] });
		expect(b.end).toBe('2026-10-29');
		expect(b.ticks).toEqual(['2026-10-11', '2026-10-18', '2026-10-25']);
		expect(b.finish).toBe('2026-10-15');
		expect(b.max).toBe(1);
	});
});
