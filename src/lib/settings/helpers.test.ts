import { describe, expect, it } from 'vitest';
import { isValidTimezone, normalizeFeedInput, unmatchedTitles } from './helpers';
import type { Rule } from '../planner/types';

describe('isValidTimezone', () => {
	it('accepts IANA names and rejects junk', () => {
		expect(isValidTimezone('America/Detroit')).toBe(true);
		expect(isValidTimezone('UTC')).toBe(true);
		expect(isValidTimezone('Mars/Olympus')).toBe(false);
		expect(isValidTimezone('')).toBe(false);
	});
});

describe('unmatchedTitles', () => {
	const rules: Rule[] = [
		{ id: 'r1', sourceId: null, match: 'equals', pattern: 'WDP', kindId: 'k', priority: 0 },
		{ id: 'r2', sourceId: null, match: 'prefix', pattern: 'Night', kindId: 'k', priority: 0 }
	];
	it('keeps only titles no rule matches', () => {
		const titles = [
			{ title: 'WDP', sourceId: 's' },
			{ title: 'Night Float', sourceId: 's' },
			{ title: 'wdp', sourceId: 's' },
			{ title: 'Clinic', sourceId: 's' }
		];
		expect(unmatchedTitles(titles, rules).map((t) => t.title)).toEqual(['wdp', 'Clinic']);
	});
});

describe('normalizeFeedInput', () => {
	it('maps webcal to https', () => {
		expect(normalizeFeedInput(' webcal://x.com/a.ics ')).toBe('https://x.com/a.ics');
	});
});
