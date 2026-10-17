// Pure helpers for GitHub issues and homeschool packets (no server imports).
import { addDays, weekdayOf } from '$lib/planner/dates';
import type { LocalDate } from '$lib/planner/types';

export interface Issue {
	number: number;
	title: string;
	url: string;
	size: number;
	depth: 'deep' | 'shallow' | null;
}

export const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

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
