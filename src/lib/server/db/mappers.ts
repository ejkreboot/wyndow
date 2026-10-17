import type {
	CalEvent,
	FocusSession,
	IsoWeekday,
	Kind,
	LocalDate,
	Minutes,
	Project,
	Rule,
	SchoolClass,
	Settings
} from '$lib/planner/types';
import type { Row } from './types';

/** 'HH:MM' or 'HH:MM:SS' -> minutes after midnight. */
export function timeToMinutes(t: string): Minutes {
	const [h, m] = t.split(':');
	return Number(h) * 60 + Number(m);
}

/** Minutes -> 'HH:MM:00' for a Postgres time column. */
export function minutesToTime(m: Minutes): string {
	const clamped = Math.max(0, Math.min(1439, Math.round(m)));
	const h = String(Math.floor(clamped / 60)).padStart(2, '0');
	const mm = String(clamped % 60).padStart(2, '0');
	return `${h}:${mm}:00`;
}

export function toDate(s: string): Date {
	return new Date(s);
}

export function toSettings(r: Row<'settings'>): Settings {
	return {
		timezone: r.timezone,
		blockHours: Number(r.block_hours),
		chunkMinHours: Number(r.chunk_min_hours),
		schoolDays: [...r.school_days].sort((a, b) => a - b) as IsoWeekday[]
	};
}

export function toKind(r: Row<'kinds'>): Kind {
	return {
		id: r.id,
		name: r.name,
		color: r.color,
		focusHours: Number(r.focus_hours),
		focusStart: r.focus_start == null ? null : timeToMinutes(r.focus_start),
		schoolMode: r.school_mode as Kind['schoolMode'],
		nextDayKindId: r.next_day_kind_id,
		builtin: r.builtin as Kind['builtin'],
		sort: r.sort
	};
}

export function toRule(r: Row<'rules'>): Rule {
	return {
		id: r.id,
		sourceId: r.source_id,
		match: r.match as Rule['match'],
		pattern: r.pattern,
		kindId: r.kind_id,
		priority: r.priority
	};
}

export function toEvent(r: Row<'calendar_events'>): CalEvent {
	return {
		id: r.id,
		sourceId: r.source_id,
		title: r.title,
		start: r.starts_at ? toDate(r.starts_at) : null,
		end: r.ends_at ? toDate(r.ends_at) : null,
		allDayStart: r.all_day_start,
		allDayEnd: r.all_day_end
	};
}

export function toProject(r: Row<'projects'>): Project {
	return {
		id: r.id,
		name: r.name,
		color: r.color,
		area: r.area as Project['area'],
		githubRepo: r.github_repo,
		githubMilestone: r.github_milestone,
		milestone: r.milestone,
		blocksDone: r.blocks_done,
		archived: r.archived,
		sort: r.sort
	};
}

export function toClass(r: Row<'classes'>): SchoolClass {
	return {
		id: r.id,
		name: r.name,
		student: r.student,
		wyrkbookRef: r.wyrkbook_ref,
		currentUnit: r.current_unit,
		packetsReady: r.packets_ready,
		sort: r.sort
	};
}

export function toSession(r: Row<'focus_sessions'>): FocusSession {
	return {
		id: r.id,
		projectId: r.project_id,
		day: r.day,
		startedAt: toDate(r.started_at),
		endedAt: r.ended_at ? toDate(r.ended_at) : null,
		note: r.note
	};
}

/** Masks an ICS URL for display: host + '/…/' + last path segment. Never throws. */
export function maskUrl(url: string): string {
	try {
		const u = new URL(url);
		// Host only: path segments and query strings can carry feed tokens or staff ids.
		return `${u.hostname.replace(/^www\./, '')}/…`;
	} catch {
		return '…';
	}
}

/** Shifts a 'YYYY-MM-DD' date by n days (UTC arithmetic; dates carry no zone). */
export function shiftDate(d: LocalDate, n: number): LocalDate {
	const t = new Date(`${d}T00:00:00Z`);
	t.setUTCDate(t.getUTCDate() + n);
	return t.toISOString().slice(0, 10);
}

/** Median of numbers (rounded); null when empty. */
export function medianMinutes(values: number[]): number | null {
	if (!values.length) return null;
	const s = [...values].sort((a, b) => a - b);
	return Math.round(s[Math.floor(s.length / 2)]);
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function formatterFor(tz: string): Intl.DateTimeFormat {
	let f = partsCache.get(tz);
	if (!f) {
		f = new Intl.DateTimeFormat('en-CA', {
			timeZone: tz,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
		partsCache.set(tz, f);
	}
	return f;
}

/** Local date and minutes-after-midnight of an instant in the given IANA zone. */
export function localParts(d: Date, tz: string): { date: LocalDate; minutes: Minutes } {
	const p: Record<string, string> = {};
	for (const part of formatterFor(tz).formatToParts(d)) p[part.type] = part.value;
	return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
