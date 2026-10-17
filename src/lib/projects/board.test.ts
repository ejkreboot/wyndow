import { describe, expect, it } from 'vitest';
import { columnFields, columnOf, groupByColumn, labelsFor, moveTarget } from './board';
import type { Issue } from './issues';

function issue(over: Partial<Issue> = {}): Issue {
	return {
		number: 1,
		title: 't',
		url: 'https://github.com/o/r/issues/1',
		size: 1,
		depth: null,
		state: 'open',
		stateReason: null,
		status: null,
		labels: [],
		milestone: null,
		body: '',
		createdAt: '2026-10-01T12:00:00Z',
		closedAt: null,
		...over
	};
}

describe('columns', () => {
	it('derives the column from state and status', () => {
		expect(columnOf(issue())).toBe('backlog');
		expect(columnOf(issue({ status: 'next' }))).toBe('next');
		expect(columnOf(issue({ status: 'doing' }))).toBe('doing');
		expect(columnOf(issue({ state: 'closed', status: 'doing' }))).toBe('done');
	});
	it('moves one column at a time and stops at the ends', () => {
		expect(moveTarget('backlog', 1)).toBe('next');
		expect(moveTarget('doing', 1)).toBe('done');
		expect(moveTarget('done', -1)).toBe('doing');
		expect(moveTarget('backlog', -1)).toBeNull();
		expect(moveTarget('done', 1)).toBeNull();
	});
	it('maps columns to GitHub state and status', () => {
		expect(columnFields('backlog')).toEqual({ state: 'open', status: null });
		expect(columnFields('doing')).toEqual({ state: 'open', status: 'doing' });
		expect(columnFields('done')).toEqual({ state: 'closed', status: null });
	});
	it('groups issues and lists Done newest first', () => {
		const g = groupByColumn([
			issue({ number: 1, state: 'closed', closedAt: '2026-10-02T00:00:00Z' }),
			issue({ number: 2, state: 'closed', closedAt: '2026-10-05T00:00:00Z' }),
			issue({ number: 3, status: 'next' })
		]);
		expect(g.done.map((i) => i.number)).toEqual([2, 1]);
		expect(g.next.map((i) => i.number)).toEqual([3]);
		expect(g.backlog).toEqual([]);
	});
});

describe('labelsFor', () => {
	it('replaces only Wyndow labels and keeps the rest', () => {
		const current = ['bug', 'size:3', 'deep', 'status:next', 'help wanted'];
		expect(labelsFor(current, { size: 5 })).toEqual(['bug', 'deep', 'status:next', 'help wanted', 'size:5']);
		expect(labelsFor(current, { depth: null, status: 'doing' })).toEqual(['bug', 'size:3', 'help wanted', 'status:doing']);
		expect(labelsFor(current, { status: null })).toEqual(['bug', 'size:3', 'deep', 'help wanted']);
	});
	it('leaves labels alone when no field is given', () => {
		expect(labelsFor(['a', 'Size:2'], {})).toEqual(['a', 'Size:2']);
	});
	it('handles mixed-case Wyndow labels', () => {
		expect(labelsFor(['Size: 2', 'Shallow', 'Status:Doing'], { size: 1, depth: 'deep', status: 'next' })).toEqual([
			'size:1',
			'deep',
			'status:next'
		]);
	});
});
