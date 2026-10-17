import { serverEnv } from './env';
import { parseLabels, REPO_PATTERN, type Issue } from '$lib/projects/issues';

export type IssuesResult =
	| { status: 'ok'; issues: Issue[] }
	| { status: 'no-token' }
	| { status: 'error'; message: string };

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; issues: Issue[] }>();

/** Open issues (not pull requests) for `owner/name`. The token never leaves the server. */
export async function listOpenIssues(repo: string): Promise<IssuesResult> {
	if (!REPO_PATTERN.test(repo) || repo.split('/').some((p) => p === '.' || p === '..')) return { status: 'error', message: 'Repository not found or not accessible' };
	const token = serverEnv().GITHUB_TOKEN;
	if (!token) return { status: 'no-token' };

	const hit = cache.get(repo);
	if (hit && Date.now() - hit.at < TTL_MS) return { status: 'ok', issues: hit.issues };

	try {
		const res = await fetch(`https://api.github.com/repos/${repo}/issues?state=open&per_page=100`, {
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28'
			},
			signal: AbortSignal.timeout(10_000)
		});
		if (res.status === 404 || res.status === 403 || res.status === 401) {
			return { status: 'error', message: 'Repository not found or not accessible' };
		}
		if (!res.ok) return { status: 'error', message: "GitHub didn't respond" };
		const body: unknown = await res.json();
		if (!Array.isArray(body)) return { status: 'error', message: "GitHub didn't respond" };
		const issues: Issue[] = [];
		for (const raw of body) {
			const i = raw as Record<string, unknown>;
			if (i.pull_request || typeof i.number !== 'number' || typeof i.title !== 'string') continue;
			const url = typeof i.html_url === 'string' ? i.html_url : '';
			if (!url.startsWith('https://github.com/')) continue;
			issues.push({ number: i.number, title: i.title, url, ...parseLabels(i.labels) });
		}
		cache.set(repo, { at: Date.now(), issues });
		return { status: 'ok', issues };
	} catch {
		return { status: 'error', message: "GitHub didn't respond" };
	}
}
