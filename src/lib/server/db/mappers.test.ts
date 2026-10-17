import { describe, expect, it } from 'vitest';
import {
	maskUrl,
	medianMinutes,
	minutesToTime,
	shiftDate,
	timeToMinutes,
	toEvent,
	toKind,
	toSession,
	toSettings
} from './mappers';

describe('time helpers', () => {
	it('parses Postgres time', () => {
		expect(timeToMinutes('11:00:00')).toBe(660);
		expect(timeToMinutes('07:30')).toBe(450);
	});
	it('formats minutes', () => {
		expect(minutesToTime(660)).toBe('11:00:00');
		expect(minutesToTime(5)).toBe('00:05:00');
		expect(minutesToTime(1440)).toBe('23:59:00');
	});
});

describe('maskUrl', () => {
	it('keeps the host only', () => {
		expect(maskUrl('https://www.amion.com/cgi-bin/ocs/secret/773739.ics?x=1')).toBe('amion.com/…');
	});
	it('never throws', () => {
		expect(maskUrl('not a url')).toBe('…');
	});
});

describe('shiftDate', () => {
	it('crosses month boundaries', () => {
		expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
		expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
	});
});

describe('medianMinutes', () => {
	it('handles empty and odd lists', () => {
		expect(medianMinutes([])).toBeNull();
		expect(medianMinutes([420, 60, 480])).toBe(420);
	});
});

describe('row mappers', () => {
	it('maps settings', () => {
		const s = toSettings({
			user_id: 'u',
			timezone: 'America/Detroit',
			block_hours: 2,
			chunk_min_hours: 3,
			school_days: [5, 1, 3],
			created_at: '',
			updated_at: ''
		});
		expect(s).toEqual({
			timezone: 'America/Detroit',
			blockHours: 2,
			chunkMinHours: 3,
			schoolDays: [1, 3, 5]
		});
	});
	it('maps kinds with focus start', () => {
		const k = toKind({
			id: 'k',
			user_id: 'u',
			name: 'Day',
			color: '#112233',
			focus_hours: 4,
			focus_start: '11:00:00',
			school_mode: 'async',
			next_day_kind_id: null,
			builtin: null,
			sort: 1
		});
		expect(k.focusStart).toBe(660);
		expect(k.schoolMode).toBe('async');
	});
	it('maps events to Dates and keeps all-day strings', () => {
		const e = toEvent({
			id: 'e',
			user_id: 'u',
			source_id: 's',
			uid: 'x',
			title: 'T',
			description: null,
			starts_at: '2026-03-01T12:00:00+00:00',
			ends_at: null,
			all_day_start: null,
			all_day_end: null,
			updated_at: ''
		});
		expect(e.start).toBeInstanceOf(Date);
		expect(e.start?.toISOString()).toBe('2026-03-01T12:00:00.000Z');
		expect(e.end).toBeNull();
	});
	it('maps sessions', () => {
		const s = toSession({
			id: 'x',
			user_id: 'u',
			project_id: 'p',
			day: '2026-03-01',
			started_at: '2026-03-01T12:00:00Z',
			ended_at: null,
			note: null
		});
		expect(s.day).toBe('2026-03-01');
		expect(s.endedAt).toBeNull();
	});
});

import { localParts } from './mappers';
describe('localParts', () => {
	it('converts to the zone (EST, UTC-5)', () => {
		expect(localParts(new Date('2026-01-15T03:30:00Z'), 'America/Detroit')).toEqual({
			date: '2026-01-14',
			minutes: 22 * 60 + 30
		});
	});
});
