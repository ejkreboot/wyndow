import { describe, expect, it } from 'vitest';
import { eventSpan, isPrivateAddress, validateFeedUrl } from './sync';

describe('isPrivateAddress', () => {
	it('flags private, loopback, link-local and metadata addresses', () => {
		for (const ip of ['10.1.2.3', '127.0.0.1', '169.254.169.254', '172.20.0.1', '192.168.1.1', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1'])
			expect(isPrivateAddress(ip), ip).toBe(true);
	});
	it('allows public addresses', () => {
		for (const ip of ['104.18.2.3', '8.8.8.8', '2606:4700::6810:1'])
			expect(isPrivateAddress(ip), ip).toBe(false);
	});
});

describe('validateFeedUrl', () => {
	it('accepts a normal https feed', () => {
		expect(validateFeedUrl('https://www.amion.com/cgi-bin/ocs?File=abc').hostname).toBe('www.amion.com');
	});
	it.each([
		'http://example.com/a.ics',
		'ftp://example.com/a.ics',
		'https://user:pw@example.com/a.ics',
		'https://user@example.com/a.ics',
		'https://localhost/a.ics',
		'https://foo.localhost/a.ics',
		'https://printer.local/a.ics',
		'https://db.internal/a.ics',
		'https://127.0.0.1/a.ics',
		'https://10.0.0.5/a.ics',
		'https://2130706433/a.ics',
		'https://[::1]/a.ics',
		'https://intranet/a.ics',
		'not a url',
		''
	])('rejects %s', (u) => {
		expect(() => validateFeedUrl(u)).toThrow();
	});
	it('rejects over-long URLs', () => {
		expect(() => validateFeedUrl('https://example.com/' + 'a'.repeat(2000))).toThrow();
	});
	it('never puts the URL in the error', () => {
		try {
			validateFeedUrl('https://user:secret@example.com/a.ics');
		} catch (e) {
			expect((e as Error).message).not.toContain('secret');
		}
	});
});

describe('eventSpan', () => {
	it('spans timed and all-day events', () => {
		const e = (start: Date | null, d: string | null) => ({
			uid: 'x',
			title: '',
			description: '',
			start,
			end: start,
			allDayStart: d,
			allDayEnd: d
		});
		expect(
			eventSpan([e(new Date('2026-10-05T10:00:00Z'), null), e(null, '2026-09-30'), e(null, '2026-10-20')])
		).toEqual({ from: '2026-09-30', to: '2026-10-20' });
		expect(eventSpan([])).toBeNull();
	});
});
