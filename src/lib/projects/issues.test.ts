import { describe, expect, it } from 'vitest';
import { packetStatus, parseLabels, formatDay, REPO_PATTERN } from './issues';

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
