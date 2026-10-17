import { serverEnv } from './env';
import { parseIssue, parseMilestone, REPO_PATTERN, type Issue, type Milestone } from '$lib/projects/issues';
import type { LocalDate } from '$lib/planner/types';

export type IssuesResult =
	| { status: 'ok'; issues: Issue[] }
	| { status: 'no-token' }
	| { status: 'error'; message: string };

export type MilestonesResult =
	| { status: 'ok'; milestones: Milestone[] }
	| { status: 'no-token' }
	| { status: 'error'; message: string };

export type WriteResult<T> = { ok: true; value: T } | { ok: false; message: string };

const API = 'https://api.github.com';
const TTL_MS = 5 * 60 * 1000;
const MAX_PAGES = 5;
const NOT_ACCESSIBLE = 'Repository not found or not accessible';
const NO_RESPONSE = "GitHub didn't respond";
const NO_TOKEN = 'Set GITHUB_TOKEN to use GitHub.';

// GitHub's list endpoints lag a few seconds behind writes. For SETTLE_MS after a write to a repo,
// lists for it are not cached, and the issues Wyndow just wrote are laid over what GitHub returns.
const SETTLE_MS = 60_000;

const cache = new Map<string, { at: number; value: unknown }>();
const knownLabels = new Set<string>();
const recent = new Map<string, { at: number; issues: Map<number, Issue> }>();

/** Plain-sentence message for a failed GitHub response. Never includes the token or raw bodies. */
export function githubErrorMessage(status: number, write: boolean): string {
	if (status === 401) return 'GitHub rejected the token. Check GITHUB_TOKEN.';
	if (write && status === 403) return "Your GitHub token can't write to this repo. It needs Issues: read and write.";
	if (status === 403 || status === 404) return NOT_ACCESSIBLE;
	if (status === 410) return 'Issues are turned off for this repo.';
	if (status === 422) return 'GitHub rejected those values. Check the fields and try again.';
	return NO_RESPONSE;
}

const validRepo = (repo: string) => REPO_PATTERN.test(repo) && !repo.split('/').some((p) => p === '.' || p === '..');

/** The `rel="next"` URL from a Link header, only when it points back at the GitHub API. */
export function nextPageUrl(link: string | null): string | null {
	if (!link) return null;
	for (const part of link.split(',')) {
		const m = /<([^>]+)>\s*;\s*rel="next"/.exec(part);
		if (m && m[1].startsWith(`${API}/`)) return m[1];
	}
	return null;
}

type GhResponse = { ok: true; data: unknown; link: string | null } | { ok: false; message: string };

async function gh(url: string, init: { method?: string; body?: unknown } = {}): Promise<GhResponse> {
	const token = serverEnv().GITHUB_TOKEN;
	if (!token) return { ok: false, message: NO_TOKEN };
	const write = (init.method ?? 'GET') !== 'GET';
	try {
		const res = await fetch(url.startsWith(API) ? url : `${API}${url}`, {
			method: init.method ?? 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28',
				...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {})
			},
			body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
			signal: AbortSignal.timeout(10_000)
		});
		if (!res.ok) return { ok: false, message: githubErrorMessage(res.status, write) };
		const data: unknown = res.status === 204 ? null : await res.json();
		return { ok: true, data, link: res.headers.get('link') };
	} catch {
		return { ok: false, message: NO_RESPONSE };
	}
}

/** Every page of a list endpoint (up to MAX_PAGES of 100). */
async function ghList(path: string): Promise<{ ok: true; items: unknown[] } | { ok: false; message: string }> {
	const items: unknown[] = [];
	let url: string | null = path;
	for (let page = 0; url && page < MAX_PAGES; page++) {
		const r = await gh(url);
		if (!r.ok) return r;
		if (!Array.isArray(r.data)) return { ok: false, message: NO_RESPONSE };
		items.push(...r.data);
		url = nextPageUrl(r.link);
	}
	return { ok: true, items };
}

function cached<T>(key: string): T | undefined {
	const hit = cache.get(key);
	return hit && Date.now() - hit.at < TTL_MS ? (hit.value as T) : undefined;
}

/** Drops every cached read for a repo after a write, and records a written issue for the overlay. */
export function invalidateRepo(repo: string, written?: Issue): void {
	for (const key of cache.keys()) if (key.startsWith(`${repo}|`)) cache.delete(key);
	const entry = recent.get(repo);
	const issues = entry && Date.now() - entry.at < SETTLE_MS ? entry.issues : new Map<number, Issue>();
	if (written) issues.set(written.number, written);
	recent.set(repo, { at: Date.now(), issues });
}

function settling(repo: string): Issue[] | null {
	const entry = recent.get(repo);
	if (!entry) return null;
	if (Date.now() - entry.at >= SETTLE_MS) {
		recent.delete(repo);
		return null;
	}
	return [...entry.issues.values()];
}

/**
 * `issues` with fresher copies laid over: each written issue replaces its listed copy, is added when the
 * list doesn't have it yet, or is removed when it no longer matches the list's filter.
 */
export function applyRecentWrites(
	issues: readonly Issue[],
	written: readonly Issue[],
	filter: { state: 'open' | 'all'; milestone?: number }
): Issue[] {
	const matches = (i: Issue) => (filter.state === 'all' || i.state === 'open') && (!filter.milestone || i.milestone === filter.milestone);
	const byNumber = new Map(written.map((i) => [i.number, i] as const));
	const out = issues.flatMap((i) => {
		const w = byNumber.get(i.number);
		if (!w) return [i];
		byNumber.delete(i.number);
		return matches(w) ? [w] : [];
	});
	const added = [...byNumber.values()].filter(matches).sort((a, b) => b.number - a.number);
	return [...added, ...out];
}

/** Issues (not pull requests) for `owner/name`, optionally limited to a milestone. The token never leaves the server. */
export async function listIssues(
	repo: string,
	opts: { state?: 'open' | 'all'; milestone?: number } = {}
): Promise<IssuesResult> {
	if (!validRepo(repo)) return { status: 'error', message: NOT_ACCESSIBLE };
	if (!serverEnv().GITHUB_TOKEN) return { status: 'no-token' };
	const state = opts.state ?? 'open';
	const query = `state=${state}&per_page=100${opts.milestone ? `&milestone=${opts.milestone}` : ''}`;
	const key = `${repo}|issues?${query}`;
	const written = settling(repo);
	const hit = written ? undefined : cached<Issue[]>(key);
	if (hit) return { status: 'ok', issues: hit };

	const r = await ghList(`/repos/${repo}/issues?${query}`);
	if (!r.ok) return { status: 'error', message: r.message };
	const issues = r.items.map(parseIssue).filter((i): i is Issue => i !== null);
	if (written) return { status: 'ok', issues: applyRecentWrites(issues, written, { state, milestone: opts.milestone }) };
	cache.set(key, { at: Date.now(), value: issues });
	return { status: 'ok', issues };
}

/** Open issues for the projects list. */
export function listOpenIssues(repo: string): Promise<IssuesResult> {
	return listIssues(repo, { state: 'open' });
}

export async function listMilestones(repo: string): Promise<MilestonesResult> {
	if (!validRepo(repo)) return { status: 'error', message: NOT_ACCESSIBLE };
	if (!serverEnv().GITHUB_TOKEN) return { status: 'no-token' };
	const key = `${repo}|milestones`;
	const fresh = settling(repo) !== null;
	const hit = fresh ? undefined : cached<Milestone[]>(key);
	if (hit) return { status: 'ok', milestones: hit };

	const r = await ghList(`/repos/${repo}/milestones?state=all&sort=due_on&per_page=100`);
	if (!r.ok) return { status: 'error', message: r.message };
	const milestones = r.items.map(parseMilestone).filter((m): m is Milestone => m !== null);
	if (!fresh) cache.set(key, { at: Date.now(), value: milestones });
	return { status: 'ok', milestones };
}

const LABEL_COLORS: Record<string, string> = { 'status:next': '5991c5', 'status:doing': 'e0a23a' };

/** Creates Wyndow's labels (status:*, size:N) on first use so they get a sensible color. */
async function ensureLabels(repo: string, names: string[]): Promise<void> {
	for (const name of names) {
		const lower = name.toLowerCase();
		if (!lower.startsWith('status:') && !lower.startsWith('size:')) continue;
		const key = `${repo}#${lower}`;
		if (knownLabels.has(key)) continue;
		// 422 means the label already exists, which is fine; other failures surface on the issue write.
		const r = await gh(`/repos/${repo}/labels`, {
			method: 'POST',
			body: { name, color: LABEL_COLORS[lower] ?? 'c5ccd3' }
		});
		if (r.ok || r.message === githubErrorMessage(422, true)) knownLabels.add(key);
	}
}

export interface IssueFields {
	title?: string;
	body?: string;
	state?: 'open' | 'closed';
	stateReason?: 'completed' | 'not_planned' | 'reopened';
	labels?: string[];
	milestone?: number | null;
}

async function writeIssue(repo: string, path: string, method: 'POST' | 'PATCH', fields: IssueFields): Promise<WriteResult<Issue>> {
	if (!validRepo(repo)) return { ok: false, message: NOT_ACCESSIBLE };
	if (fields.labels) await ensureLabels(repo, fields.labels);
	const body: Record<string, unknown> = {};
	if (fields.title !== undefined) body.title = fields.title;
	if (fields.body !== undefined) body.body = fields.body;
	if (fields.state !== undefined) body.state = fields.state;
	if (fields.stateReason !== undefined) body.state_reason = fields.stateReason;
	if (fields.labels !== undefined) body.labels = fields.labels;
	if (fields.milestone !== undefined) body.milestone = fields.milestone;
	const r = await gh(path, { method, body });
	const issue = r.ok ? parseIssue(r.data) : null;
	invalidateRepo(repo, issue ?? undefined);
	if (!r.ok) return r;
	return issue ? { ok: true, value: issue } : { ok: false, message: NO_RESPONSE };
}

export function createIssue(repo: string, fields: IssueFields & { title: string }): Promise<WriteResult<Issue>> {
	return writeIssue(repo, `/repos/${repo}/issues`, 'POST', fields);
}

export function updateIssue(repo: string, number: number, fields: IssueFields): Promise<WriteResult<Issue>> {
	return writeIssue(repo, `/repos/${repo}/issues/${number}`, 'PATCH', fields);
}

/** One issue, uncached (used to read current labels right before a write). */
export async function getIssue(repo: string, number: number): Promise<WriteResult<Issue>> {
	if (!validRepo(repo)) return { ok: false, message: NOT_ACCESSIBLE };
	const r = await gh(`/repos/${repo}/issues/${number}`);
	if (!r.ok) return r;
	const issue = parseIssue(r.data);
	return issue ? { ok: true, value: issue } : { ok: false, message: 'That issue was not found.' };
}

export interface MilestoneFields {
	title?: string;
	description?: string;
	state?: 'open' | 'closed';
	dueOn?: LocalDate | null;
}

async function writeMilestone(repo: string, path: string, method: 'POST' | 'PATCH', fields: MilestoneFields): Promise<WriteResult<Milestone>> {
	if (!validRepo(repo)) return { ok: false, message: NOT_ACCESSIBLE };
	const body: Record<string, unknown> = {};
	if (fields.title !== undefined) body.title = fields.title;
	if (fields.description !== undefined) body.description = fields.description;
	if (fields.state !== undefined) body.state = fields.state;
	// Noon UTC keeps the calendar date stable whatever timezone GitHub normalizes to.
	if (fields.dueOn !== undefined) body.due_on = fields.dueOn ? `${fields.dueOn}T12:00:00Z` : null;
	const r = await gh(path, { method, body });
	invalidateRepo(repo);
	if (!r.ok) return r;
	const m = parseMilestone(r.data);
	return m ? { ok: true, value: m } : { ok: false, message: NO_RESPONSE };
}

export function createMilestone(repo: string, fields: MilestoneFields & { title: string }): Promise<WriteResult<Milestone>> {
	return writeMilestone(repo, `/repos/${repo}/milestones`, 'POST', fields);
}

export function updateMilestone(repo: string, number: number, fields: MilestoneFields): Promise<WriteResult<Milestone>> {
	return writeMilestone(repo, `/repos/${repo}/milestones/${number}`, 'PATCH', fields);
}
