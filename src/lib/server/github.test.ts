import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./env', () => ({ serverEnv: () => ({ GITHUB_TOKEN: 'test-token' }) }));

import { parseLabels } from '$lib/projects/issues';
import { applyRecentWrites, createIssue, githubErrorMessage, listIssues, nextPageUrl, updateIssue } from './github';
import { parseIssue, type Issue } from '$lib/projects/issues';

const issueJson = (n: number) => ({
	number: n,
	title: `Issue ${n}`,
	html_url: `https://github.com/o/r/issues/${n}`,
	state: 'open',
	labels: [],
	created_at: '2026-10-01T12:00:00Z'
});

function respond(body: unknown, init: { status?: number; link?: string } = {}) {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		headers: init.link ? { link: init.link } : {}
	});
}

afterEach(() => vi.unstubAllGlobals());

describe('github label parsing', () => {
	it('parses size and depth labels from API label objects', () => {
		expect(parseLabels([{ name: 'size:5' }, { name: 'shallow' }])).toEqual({ size: 5, depth: 'shallow' });
	});
	it('falls back to size 1', () => {
		expect(parseLabels([{ name: 'enhancement' }])).toEqual({ size: 1, depth: null });
	});
});

describe('github errors', () => {
	it('maps statuses to plain sentences', () => {
		expect(githubErrorMessage(404, false)).toBe('Repository not found or not accessible');
		expect(githubErrorMessage(403, true)).toMatch(/can't write/);
		expect(githubErrorMessage(422, true)).toMatch(/rejected those values/);
		expect(githubErrorMessage(500, false)).toBe("GitHub didn't respond");
	});
	it('only follows next links back to the GitHub API', () => {
		expect(nextPageUrl('<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=3>; rel="last"')).toBe(
			'https://api.github.com/x?page=2'
		);
		expect(nextPageUrl('<https://evil.example/x?page=2>; rel="next"')).toBeNull();
		expect(nextPageUrl(null)).toBeNull();
	});
});

describe('listIssues', () => {
	it('follows pagination, skips pull requests, and sends the token only to GitHub', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(respond([issueJson(1), { ...issueJson(2), pull_request: {} }], { link: '<https://api.github.com/repos/o/pg/issues?page=2>; rel="next"' }))
			.mockResolvedValueOnce(respond([issueJson(3)]));
		vi.stubGlobal('fetch', fetchMock);
		const r = await listIssues('o/pg', { state: 'all', milestone: 4 });
		expect(r.status === 'ok' && r.issues.map((i) => i.number)).toEqual([1, 3]);
		expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/o/pg/issues?state=all&per_page=100&milestone=4');
		for (const [url] of fetchMock.mock.calls) expect(String(url).startsWith('https://api.github.com/')).toBe(true);
	});
	it('rejects malformed repos without calling GitHub', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		expect(await listIssues('../x')).toEqual({ status: 'error', message: 'Repository not found or not accessible' });
		expect(fetchMock).not.toHaveBeenCalled();
	});
	it('serves from cache until a write, then reads fresh while GitHub settles', async () => {
		const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
			if (init?.method === 'PATCH') return respond(issueJson(1));
			return respond([issueJson(1)]);
		});
		vi.stubGlobal('fetch', fetchMock);
		await listIssues('o/cache');
		await listIssues('o/cache');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		await updateIssue('o/cache', 1, { title: 'x' });
		await listIssues('o/cache');
		await listIssues('o/cache');
		expect(fetchMock).toHaveBeenCalledTimes(4);
	});
	it('shows a just-created issue even when GitHub lists it late', async () => {
		const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
			if (init?.method === 'POST') return respond({ ...issueJson(9), milestone: { number: 2 } });
			return respond([issueJson(1)]); // stale: no #9 yet
		});
		vi.stubGlobal('fetch', fetchMock);
		await createIssue('o/lag', { title: 'New', milestone: 2 });
		const r = await listIssues('o/lag', { state: 'all', milestone: 2 });
		expect(r.status === 'ok' && r.issues.map((i) => i.number)).toEqual([9, 1]);
	});
});

describe('applyRecentWrites', () => {
	const base = parseIssue(issueJson(1)) as Issue;
	it('replaces, adds, and drops issues by the list filter', () => {
		const closed = { ...base, number: 1, state: 'closed' as const };
		const fresh = { ...base, number: 5, milestone: 3 };
		expect(applyRecentWrites([base], [closed], { state: 'open' })).toEqual([]);
		expect(applyRecentWrites([base], [closed], { state: 'all' })).toEqual([closed]);
		expect(applyRecentWrites([base], [fresh], { state: 'all', milestone: 3 }).map((i) => i.number)).toEqual([5, 1]);
		expect(applyRecentWrites([], [fresh], { state: 'all', milestone: 4 })).toEqual([]);
	});
});

describe('writes', () => {
	it('creates missing Wyndow labels before writing and reports permission errors plainly', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(respond({ message: 'already_exists' }, { status: 422 })) // label exists
			.mockResolvedValueOnce(respond({ message: 'Resource not accessible by personal access token' }, { status: 403 }));
		vi.stubGlobal('fetch', fetchMock);
		const r = await createIssue('o/w', { title: 'New', labels: ['size:2', 'bug'] });
		expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/o/w/labels');
		expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ title: 'New', labels: ['size:2', 'bug'] });
		expect(r).toEqual({ ok: false, message: "Your GitHub token can't write to this repo. It needs Issues: read and write." });
	});
});
