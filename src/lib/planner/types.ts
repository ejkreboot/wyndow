// Shared domain types for the planner. This file is the contract between the
// database layer (src/lib/server/db), the planner core (src/lib/planner), and the UI.
// Change it only deliberately; every layer compiles against it.

/** Calendar date in the user's timezone, formatted 'YYYY-MM-DD'. */
export type LocalDate = string;

/** Minutes after local midnight, 0..1440. */
export type Minutes = number;

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type SchoolMode = 'live' | 'async';
export type BuiltinKind = 'open_weekday' | 'open_weekend';
export type ProjectArea = 'venture' | 'family' | 'homeschool';
export type RuleMatch = 'equals' | 'prefix';

export interface Settings {
	timezone: string; // IANA, e.g. 'America/Detroit'
	blockHours: number; // length of one focus block, e.g. 2
	chunkMinHours: number; // minimum contiguous hours for "next chunk", e.g. 3
	schoolDays: IsoWeekday[]; // e.g. [1,2,3,4,5]
}

/** A user-defined meaning for calendar events (or one of the two built-in open-day kinds). */
export interface Kind {
	id: string;
	name: string;
	color: string | null; // '#RRGGBB'; null for built-in open kinds
	focusHours: number; // focus time a day of this kind leaves
	focusStart: Minutes | null; // when that focus time starts; null means 11:00
	schoolMode: SchoolMode;
	nextDayKindId: string | null; // e.g. Night -> Recovery
	builtin: BuiltinKind | null;
	sort: number;
}

/** Maps a calendar event title to a kind. */
export interface Rule {
	id: string;
	sourceId: string | null; // null applies to every source
	match: RuleMatch;
	pattern: string;
	kindId: string;
	priority: number; // higher wins when several rules match
}

/** One event as stored from a calendar feed. Timed events use start/end; all-day events use allDay*. */
export interface CalEvent {
	id: string;
	sourceId: string;
	title: string;
	start: Date | null;
	end: Date | null;
	allDayStart: LocalDate | null;
	allDayEnd: LocalDate | null; // exclusive
}

export interface Project {
	id: string;
	name: string;
	color: string; // '#RRGGBB'
	area: ProjectArea;
	githubRepo: string | null; // 'owner/name'
	githubMilestone: number | null; // GitHub milestone number in githubRepo
	milestone: string | null;
	blocksDone: number;
	archived: boolean;
	sort: number;
}

export interface SchoolClass {
	id: string;
	name: string;
	student: string;
	wyrkbookRef: string | null;
	currentUnit: string | null;
	packetsReady: number;
	sort: number;
}

/** Per-day block assignments: index i holds the project id for block i, or null if open. */
export type Allocation = (string | null)[];
export type Allocations = Record<LocalDate, Allocation>;

export interface FocusSession {
	id: string;
	projectId: string;
	day: LocalDate;
	startedAt: Date;
	endedAt: Date | null;
	note: string | null;
}

// ---------- Derived (computed by the planner core, never stored) ----------

/** The part of an event that falls on one local date. */
export interface DayEvent {
	event: CalEvent;
	kindId: string | null; // null when no rule matches
	startsToday: boolean; // false for the continuation of an overnight event
	startMin: Minutes; // clipped to this date
	endMin: Minutes; // clipped to this date (1440 if it continues past midnight)
	allDay: boolean;
}

/** One painted span on the 24-hour day bar (midnight at the top). */
export interface BarSegment {
	start: Minutes;
	end: Minutes;
	type: 'shift' | 'recovery' | 'oncall' | 'unknown';
}

export interface Window {
	start: Minutes;
	end: Minutes;
}

export interface DayPlan {
	date: LocalDate;
	weekday: IsoWeekday;
	events: DayEvent[];
	derivedKindIds: string[]; // from the previous day's kinds' nextDayKindId
	kindId: string | 'unrecognized'; // the governing kind for the day
	focusHours: number;
	focusWindow: Window | null;
	blocks: number; // whole focus blocks that fit
	looseHours: number; // focus hours left after whole blocks
	school: SchoolMode | 'unknown' | null; // null when not a school day
	segments: BarSegment[];
}

export type Days = Map<LocalDate, DayPlan>;

export interface Chunk {
	date: LocalDate;
	window: Window;
	blockCount: number;
	projectIds: string[]; // distinct projects assigned in the chunk (may be empty)
}

export interface FindTimeResult {
	covered: boolean;
	hoursFound: number;
	shortBy: number;
	lastDate: LocalDate | null;
	rows: { date: LocalDate; blocks: number; assigned: boolean }[]; // assigned=false means open blocks
}

export interface Forecast {
	date: LocalDate | null; // when remaining blocks are covered by allocated blocks
	remainingBlocks: number;
	shortBlocks: number; // blocks still missing within the planning horizon
}
