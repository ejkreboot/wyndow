// Pure helpers for GitHub issues and homeschool packets (no server imports).
import { addDays, weekdayOf } from '$lib/planner/dates';
import type { LocalDate } from '$lib/planner/types';

export type IssueStatus = 'next' | 'doing' | null;

export interface Issue {
	number: number;
	title: string;
	url: string;
	size: number;
	depth: 'deep' | 'shallow' | null;
	state: 'open' | 'closed';
	stateReason: 'completed' | 'not_planned' | 'reopened' | null;
	/** Board column for open issues, from `status:next` / `status:doing`. */
	status: IssueStatus;
	/** Every label name, including the ones Wyndow reads. */
	labels: string[];
	milestone: number | null;
	body: string;
	createdAt: string; // ISO instant
	closedAt: string | null;
}

export interface Milestone {
	number: number;
	title: string;
	description: string;
	state: 'open' | 'closed';
	dueOn: LocalDate | null;
	createdAt: string; // ISO instant
	openIssues: number;
	closedIssues: number;
	url: string;
}

export const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export const STATUS_LABELS = { next: 'status:next', doing: 'status:doing' } as const;

function labelNames(labels: unknown): string[] {
	if (!Array.isArray(labels)) return [];
	const out: string[] = [];
	for (const l of labels) {
		const raw = typeof l === 'string' ? l : (l as { name?: unknown } | null)?.name;
		if (typeof raw === 'string' && raw.trim() !== '') out.push(raw.trim());
	}
	return out;
}

/** Board status from `status:next` / `status:doing` (doing wins when both are present). */
export function parseStatus(labels: unknown): IssueStatus {
	const names = labelNames(labels).map((n) => n.toLowerCase());
	if (names.includes(STATUS_LABELS.doing)) return 'doing';
	if (names.includes(STATUS_LABELS.next)) return 'next';
	return null;
}

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const isoOrNull = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);

/** An issue from the GitHub REST API, or null for pull requests and malformed entries. */
export function parseIssue(raw: unknown): Issue | null {
	if (!raw || typeof raw !== 'object') return null;
	const i = raw as Record<string, unknown>;
	if (i.pull_request || typeof i.number !== 'number' || typeof i.title !== 'string') return null;
	const url = str(i.html_url);
	if (!url.startsWith('https://github.com/')) return null;
	const createdAt = isoOrNull(i.created_at);
	if (!createdAt) return null;
	const reason = i.state_reason;
	const ms = i.milestone as { number?: unknown } | null | undefined;
	return {
		number: i.number,
		title: i.title,
		url,
		...parseLabels(i.labels),
		state: i.state === 'closed' ? 'closed' : 'open',
		stateReason: reason === 'completed' || reason === 'not_planned' || reason === 'reopened' ? reason : null,
		status: parseStatus(i.labels),
		labels: labelNames(i.labels),
		milestone: typeof ms?.number === 'number' ? ms.number : null,
		body: str(i.body),
		createdAt,
		closedAt: isoOrNull(i.closed_at)
	};
}

/** A milestone from the GitHub REST API, or null when malformed. */
export function parseMilestone(raw: unknown): Milestone | null {
	if (!raw || typeof raw !== 'object') return null;
	const m = raw as Record<string, unknown>;
	if (typeof m.number !== 'number' || typeof m.title !== 'string') return null;
	const url = str(m.html_url);
	const createdAt = isoOrNull(m.created_at);
	if (!url.startsWith('https://github.com/') || !createdAt) return null;
	const due = isoOrNull(m.due_on);
	return {
		number: m.number,
		title: m.title,
		description: str(m.description),
		state: m.state === 'closed' ? 'closed' : 'open',
		dueOn: due ? due.slice(0, 10) : null,
		createdAt,
		openIssues: typeof m.open_issues === 'number' ? m.open_issues : 0,
		closedIssues: typeof m.closed_issues === 'number' ? m.closed_issues : 0,
		url
	};
}

/** Size from `size:N` (1..20, default 1) and depth from `deep` / `shallow`. */
export function parseLabels(labels: unknown): { size: number; depth: 'deep' | 'shallow' | null } {
	let size = 1;
	let depth: 'deep' | 'shallow' | null = null;
	if (Array.isArray(labels)) {
		for (const l of labels) {
			const raw = typeof l === 'string' ? l : (l as { name?: unknown } | null)?.name;
			if (typeof raw !== 'string') continue;
			const name = raw.trim().toLowerCase();
			const m = /^size:\s*(\d{1,3})$/.exec(name);
			if (m) {
				const n = Number(m[1]);
				if (n >= 1 && n <= 20) size = n;
			} else if (name === 'deep' || name === 'shallow') depth = name;
		}
	}
	return { size, depth };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** 'Fri 16 Oct' */
export function formatDay(d: LocalDate): string {
	return `${WEEKDAYS[weekdayOf(d) - 1]} ${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
}

/** '21 Dec' */
export function formatShort(d: LocalDate): string {
	return `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
}

export interface PacketStatus {
	needed: number;
	ready: number;
	covered: boolean;
	prep: number;
	by: LocalDate | null;
}

/** Packets needed for the async days ahead, and (when short) the day before the first uncovered one. */
export function packetStatus(asyncDays: LocalDate[], ready: number): PacketStatus {
	const needed = asyncDays.length;
	if (ready >= needed) return { needed, ready, covered: true, prep: 0, by: null };
	return { needed, ready, covered: false, prep: needed - ready, by: addDays(asyncDays[ready], -1) };
}
