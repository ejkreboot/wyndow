// Calendar feed fetching and syncing. Error messages here are user-safe: they never include the feed URL.
import {
	deleteEventsNotIn,
	deleteMissingEvents,
	getSourceUrl,
	listAllSources,
	markSourceSynced,
	recordSync,
	upsertEvents,
	upsertEventsForSource,
	type Db
} from './db';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { MAX_ICS_BYTES, parseIcs, type ParseResult } from './ics';
import type { LocalDate } from '../planner/types';

const MAX_URL_CHARS = 2000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15_000;

/** An error whose message is safe to show the user and store in last_error. */
export class FeedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'FeedError';
	}
}

/** Validates a feed URL. Returns the parsed URL or throws FeedError. */
/** True for loopback, private, link-local, CGNAT, multicast, reserved, and unspecified addresses. */
export function isPrivateAddress(ip: string): boolean {
	const v = isIP(ip);
	if (v === 4) {
		const [a, b] = ip.split('.').map(Number);
		return (
			a === 0 || a === 10 || a === 127 || a >= 224 ||
			(a === 100 && b >= 64 && b <= 127) ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			(a === 198 && (b === 18 || b === 19))
		);
	}
	if (v === 6) {
		const x = ip.toLowerCase();
		const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
		if (mapped) return isPrivateAddress(mapped[1]);
		return (
			x === '::' || x === '::1' ||
			/^f[cd]/.test(x) || /^fe[89ab]/.test(x) || /^ff/.test(x)
		);
	}
	return true;
}

/** Resolves the host and refuses to connect when any address is non-public (SSRF / DNS tricks). */
async function assertPublicHost(url: URL): Promise<void> {
	let addresses: { address: string }[];
	try {
		addresses = await lookup(url.hostname, { all: true, verbatim: true });
	} catch {
		throw new FeedError('Could not find the calendar server.');
	}
	if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
		throw new FeedError('That calendar address is not allowed.');
	}
}

export function validateFeedUrl(input: string): URL {
	if (typeof input !== 'string' || input.length === 0 || input.length > MAX_URL_CHARS) {
		throw new FeedError('The calendar URL is missing or too long.');
	}
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		throw new FeedError('The calendar URL is not valid.');
	}
	if (url.protocol !== 'https:') throw new FeedError('The calendar URL must start with https://.');
	if (url.username || url.password) throw new FeedError('The calendar URL must not contain a login.');
	const host = url.hostname.toLowerCase().replace(/\.$/, '');
	const blocked =
		host === '' ||
		host.startsWith('[') || // IPv6 literal
		/^[\d.]+$/.test(host) || // IPv4 literal
		!host.includes('.') ||
		host === 'localhost' ||
		host.endsWith('.localhost') ||
		host.endsWith('.local') ||
		host.endsWith('.internal');
	if (blocked) throw new FeedError('That calendar address is not allowed.');
	return url;
}

async function readLimited(res: Response): Promise<string> {
	if (!res.body) throw new FeedError('The calendar feed was empty.');
	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > MAX_ICS_BYTES) {
			await reader.cancel().catch(() => {});
			throw new FeedError('The calendar feed is larger than 2 MB.');
		}
		chunks.push(value);
	}
	const all = new Uint8Array(total);
	let offset = 0;
	for (const c of chunks) {
		all.set(c, offset);
		offset += c.byteLength;
	}
	return new TextDecoder('utf-8').decode(all);
}

/** Fetches the feed text. Throws FeedError with a short message (never the URL). */
export async function fetchFeed(url: string): Promise<string> {
	let current = validateFeedUrl(url);
	const signal = AbortSignal.timeout(TIMEOUT_MS);
	try {
		for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
			await assertPublicHost(current);
			const res = await fetch(current, {
				redirect: 'manual',
				signal,
				headers: { accept: 'text/calendar, text/plain;q=0.9, */*;q=0.1' }
			});
			if (res.status >= 300 && res.status < 400) {
				await res.body?.cancel().catch(() => {});
				const location = res.headers.get('location');
				if (!location) throw new FeedError('The calendar server sent a bad redirect.');
				if (hop === MAX_REDIRECTS) throw new FeedError('The calendar address redirects too many times.');
				try {
					current = validateFeedUrl(new URL(location, current).href);
				} catch {
					throw new FeedError('The calendar server redirected somewhere that is not allowed.');
				}
				continue;
			}
			if (!res.ok) {
				await res.body?.cancel().catch(() => {});
				throw new FeedError(`The calendar server answered with an error (${res.status}).`);
			}
			const type = (res.headers.get('content-type') ?? '').toLowerCase();
			const typeOk = type.includes('text/calendar') || type.includes('text/plain');
			const text = await readLimited(res);
			if (!typeOk && !text.trimStart().startsWith('BEGIN:VCALENDAR')) {
				throw new FeedError('That address did not return a calendar.');
			}
			return text;
		}
		throw new FeedError('The calendar address redirects too many times.');
	} catch (e) {
		if (e instanceof FeedError) throw e;
		if (signal.aborted) throw new FeedError('The calendar server took too long to answer.');
		throw new FeedError('Could not reach the calendar server.');
	}
}

export type SyncResult = { ok: true; count: number; skipped: number } | { ok: false; error: string };

function isoDate(d: Date): LocalDate {
	return d.toISOString().slice(0, 10);
}

/** Inclusive date span covered by the parsed events (UTC dates for timed events), or null if none. */
export function eventSpan(events: ParseResult['events']): { from: LocalDate; to: LocalDate } | null {
	let from: LocalDate | null = null;
	let to: LocalDate | null = null;
	for (const e of events) {
		const dates = e.start ? [isoDate(e.start)] : e.allDayStart ? [e.allDayStart] : [];
		for (const d of dates) {
			if (from === null || d < from) from = d;
			if (to === null || d > to) to = d;
		}
	}
	return from && to ? { from, to } : null;
}

function safeMessage(e: unknown): string {
	if (e instanceof FeedError) return e.message;
	if (e instanceof Error && e.message.startsWith('Calendar feed')) return e.message;
	return 'Sync failed. Try again later.';
}

interface Store {
	upsert(events: ParseResult['events']): Promise<void>;
	prune(uids: string[], span: { from: LocalDate; to: LocalDate }): Promise<unknown>;
	record(error: string | null): Promise<void>;
}

async function runSync(readUrl: () => Promise<string>, store: Store): Promise<SyncResult> {
	let result: SyncResult;
	try {
		const url = await readUrl();
		const parsed = parseIcs(await fetchFeed(url));
		await store.upsert(parsed.events);
		const span = eventSpan(parsed.events);
		if (span) {
			await store.prune(
				parsed.events.map((e) => e.uid),
				span
			);
		}
		result = { ok: true, count: parsed.events.length, skipped: parsed.skipped };
	} catch (e) {
		result = { ok: false, error: safeMessage(e) };
	}
	try {
		await store.record(result.ok ? null : result.error);
	} catch {
		// Recording failed; the sync result itself still stands.
	}
	return result;
}

/** Syncs one source as the signed-in user (RLS applies). */
export function syncSourceAsUser(db: Db, sourceId: string): Promise<SyncResult> {
	return runSync(() => getSourceUrl(db, sourceId), {
		upsert: (events) => upsertEvents(db, sourceId, events),
		prune: (uids, span) => deleteEventsNotIn(db, sourceId, uids, span),
		record: (error) => recordSync(db, sourceId, error)
	});
}

/** Syncs every source of every user, for the cron. One failing source does not stop the others. */
export async function syncAllSources(admin: Db): Promise<{ sources: number; ok: number; failed: number }> {
	const sources = await listAllSources(admin);
	let ok = 0;
	let failed = 0;
	for (const s of sources) {
		const r = await runSync(async () => s.url, {
			upsert: (events) => upsertEventsForSource(admin, s.userId, s.id, events),
			prune: (uids, span) => deleteMissingEvents(admin, s.userId, s.id, uids, span),
			record: (error) => markSourceSynced(admin, s.userId, s.id, error)
		});
		if (r.ok) ok++;
		else failed++;
	}
	return { sources: sources.length, ok, failed };
}
