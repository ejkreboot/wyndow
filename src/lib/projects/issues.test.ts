import { describe, expect, it } from 'vitest';
import { packetStatus, parseIssue, parseLabels, parseMilestone, parseStatus, formatDay, REPO_PATTERN } from './issues';

describe('parseLabels', () => {
	it('defaults to size 1 and no depth', () => {
		expect(parseLabels([])).toEqual({ size: 1, depth: null });
		expect(parseLabels(undefined)).toEqual({ size: 1, depth: null });
	});
	it('reads size and depth', () => {
		expect(parseLabels([{ name: 'size:3' }, { name: 'deep' }, { name: 'bug' }])).toEqual({ size: 3, depth: 'deep' });
		expect(parseLabels(['Size:20', 'shallow'])).toEqual({ size: 20, depth: 'shallow' });
	});
	it('ignores out-of-range sizes', () => {
		expect(parseLabels([{ name: 'size:0' }]).size).toBe(1);
		expect(parseLabels([{ name: 'size:21' }]).size).toBe(1);
		expect(parseLabels([{ name: 'size:x' }]).size).toBe(1);
	});
});

describe('repo pattern', () => {
	it('accepts owner/name only', () => {
		expect(REPO_PATTERN.test('a-b/c_d.e')).toBe(true);
		expect(REPO_PATTERN.test('a/b/c')).toBe(false);
		expect(REPO_PATTERN.test('a b/c')).toBe(false);
	});
});

describe('packetStatus', () => {
	it('is covered when ready >= needed', () => {
		expect(packetStatus(['2026-10-17'], 1).covered).toBe(true);
		expect(packetStatus([], 0).covered).toBe(true);
	});
	it('names the day before the first uncovered async day', () => {
		const s = packetStatus(['2026-10-14', '2026-10-19', '2026-10-21'], 1);
		expect(s).toMatchObject({ covered: false, prep: 2, by: '2026-10-18' });
		expect(formatDay('2026-10-18')).toBe('Sun 18 Oct');
	});
});

describe('parseIssue', () => {
	const raw = {
		number: 7,
		title: 'Add export',
		html_url: 'https://github.com/o/r/issues/7',
		state: 'closed',
		state_reason: 'completed',
		labels: [{ name: 'size:3' }, { name: 'status:doing' }, { name: 'bug' }],
		milestone: { number: 2 },
		body: null,
		created_at: '2026-10-01T12:00:00Z',
		closed_at: '2026-10-05T12:00:00Z'
	};
	it('reads fields, labels, status and milestone', () => {
		expect(parseIssue(raw)).toEqual({
			number: 7,
			title: 'Add export',
			url: 'https://github.com/o/r/issues/7',
			size: 3,
			depth: null,
			state: 'closed',
			stateReason: 'completed',
			status: 'doing',
			labels: ['size:3', 'status:doing', 'bug'],
			milestone: 2,
			body: '',
			createdAt: '2026-10-01T12:00:00Z',
			closedAt: '2026-10-05T12:00:00Z'
		});
	});
	it('skips pull requests and foreign urls', () => {
		expect(parseIssue({ ...raw, pull_request: {} })).toBeNull();
		expect(parseIssue({ ...raw, html_url: 'https://evil.example/x' })).toBeNull();
		expect(parseIssue(null)).toBeNull();
	});
	it('reads status with doing winning over next', () => {
		expect(parseStatus([{ name: 'Status:Next' }])).toBe('next');
		expect(parseStatus(['status:next', 'status:doing'])).toBe('doing');
		expect(parseStatus([])).toBeNull();
	});
});

describe('parseMilestone', () => {
	it('keeps the due date as a calendar date', () => {
		expect(
			parseMilestone({
				number: 2,
				title: 'v1',
				description: null,
				state: 'open',
				due_on: '2026-11-01T07:00:00Z',
				created_at: '2026-10-01T12:00:00Z',
				open_issues: 3,
				closed_issues: 1,
				html_url: 'https://github.com/o/r/milestone/2'
			})
		).toEqual({
			number: 2,
			title: 'v1',
			description: '',
			state: 'open',
			dueOn: '2026-11-01',
			createdAt: '2026-10-01T12:00:00Z',
			openIssues: 3,
			closedIssues: 1,
			url: 'https://github.com/o/r/milestone/2'
		});
	});
});
