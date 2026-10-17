// Kanban board helpers (pure). Columns are derived from GitHub state and `status:*` labels.
import { STATUS_LABELS, type Issue, type IssueStatus } from './issues';

export type Column = 'backlog' | 'next' | 'doing' | 'done';

export const COLUMNS: readonly { id: Column; label: string }[] = [
	{ id: 'backlog', label: 'Backlog' },
	{ id: 'next', label: 'Next' },
	{ id: 'doing', label: 'Doing' },
	{ id: 'done', label: 'Done' }
];

export function columnOf(issue: Pick<Issue, 'state' | 'status'>): Column {
	if (issue.state === 'closed') return 'done';
	return issue.status ?? 'backlog';
}

/** The neighboring column, or null at either end. */
export function moveTarget(from: Column, dir: -1 | 1): Column | null {
	const i = COLUMNS.findIndex((c) => c.id === from) + dir;
	return COLUMNS[i]?.id ?? null;
}

/** GitHub state and Wyndow status that put an issue in a column. */
export function columnFields(col: Column): { state: 'open' | 'closed'; status: IssueStatus } {
	if (col === 'done') return { state: 'closed', status: null };
	return { state: 'open', status: col === 'backlog' ? null : col };
}

const isSize = (l: string) => /^size:\s*\d+$/i.test(l.trim());
const isDepth = (l: string) => ['deep', 'shallow'].includes(l.trim().toLowerCase());
const isStatus = (l: string) => l.trim().toLowerCase().startsWith('status:');

/**
 * The label list after changing only the fields given. Wyndow's own labels (`size:N`, `deep` / `shallow`,
 * `status:*`) are replaced; every other label on the issue is kept as it is.
 */
export function labelsFor(
	current: readonly string[],
	want: { size?: number; depth?: 'deep' | 'shallow' | null; status?: IssueStatus }
): string[] {
	let out = [...current];
	if (want.size !== undefined) out = out.filter((l) => !isSize(l)).concat(`size:${want.size}`);
	if (want.depth !== undefined) out = out.filter((l) => !isDepth(l)).concat(want.depth ? [want.depth] : []);
	if (want.status !== undefined)
		out = out.filter((l) => !isStatus(l)).concat(want.status ? [STATUS_LABELS[want.status]] : []);
	return out;
}

/** Issues grouped by column; Done shows the most recently closed first. */
export function groupByColumn(issues: readonly Issue[]): Record<Column, Issue[]> {
	const out: Record<Column, Issue[]> = { backlog: [], next: [], doing: [], done: [] };
	for (const i of issues) out[columnOf(i)].push(i);
	out.done.sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''));
	return out;
}
