import { describe, expect, it, vi } from 'vitest';

vi.mock('./env', () => ({
	serverEnv: () => ({ ALLOWED_EMAILS: new Set(['me@example.com']) })
}));

import { isAllowedEmail, safeNext, timingSafeEqualStr } from './auth';

describe('safeNext', () => {
	it('allows same-origin paths', () => {
		expect(safeNext('/day')).toBe('/day');
		expect(safeNext('/day/2026-10-16?x=1#a')).toBe('/day/2026-10-16?x=1#a');
	});
	it('falls back for empty values', () => {
		expect(safeNext(null)).toBe('/season');
		expect(safeNext('')).toBe('/season');
	});
	it('rejects open-redirect attempts', () => {
		for (const bad of [
			'//evil.com',
			'/\\evil.com',
			'https://evil.com',
			'http://evil.com/x',
			'javascript:alert(1)',
			'evil.com',
			'\\\\evil.com',
			'/\t/evil.com',
			'/\n/evil.com',
			' //evil.com'
		]) {
			expect(safeNext(bad)).toBe('/season');
		}
	});
});

describe('timingSafeEqualStr', () => {
	it('compares equal and unequal strings', () => {
		expect(timingSafeEqualStr('abc', 'abc')).toBe(true);
		expect(timingSafeEqualStr('abc', 'abd')).toBe(false);
	});
	it('returns false on different lengths without throwing', () => {
		expect(timingSafeEqualStr('abc', 'abcd')).toBe(false);
		expect(timingSafeEqualStr('', 'a')).toBe(false);
	});
});

describe('isAllowedEmail', () => {
	it('is case-insensitive and rejects others', () => {
		expect(isAllowedEmail('Me@Example.com')).toBe(true);
		expect(isAllowedEmail('x@example.com')).toBe(false);
		expect(isAllowedEmail(null)).toBe(false);
	});
});
