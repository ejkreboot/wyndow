import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import { addDays, zonedParts } from '$lib/planner';
import type { Project } from '$lib/planner';
import { columnFields, groupByColumn, labelsFor, type Column } from '$lib/projects/board';
import { burndownSeries, type Burndown } from '$lib/projects/burndown';
import type { Issue, Milestone } from '$lib/projects/issues';
import * as repo from '$lib/server/db';
import { failLoad } from '$lib/server/errors';
import { loadPlannerContext } from '$lib/server/context';
import * as github from '$lib/server/github';
import type { Actions, PageServerLoad } from './$types';

/** How far ahead the projected line looks for painted blocks. */
const HORIZON_DAYS = 180;
const DONE_SHOWN = 12;

const uuid = z.string().uuid();

async function linkedProject(locals: App.Locals, id: string): Promise<Project & { githubRepo: string }> {
	if (!uuid.safeParse(id).success) error(404, 'Project not found.');
	const project = await repo.getProject(locals.supabase, id);
	if (!project) error(404, 'Project not found.');
	if (!project.githubRepo) error(404, 'This project has no GitHub repo.');
	return project as Project & { githubRepo: string };
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const project = await linkedProject(locals, params.id);
	try {
		const settings = await repo.getSettings(locals.supabase);
		const today = zonedParts(new Date(), settings.timezone).date;
		const [ctx, milestones] = await Promise.all([
			loadPlannerContext(locals, { from: today, to: addDays(today, HORIZON_DAYS) }),
			github.listMilestones(project.githubRepo)
		]);

		const milestone: Milestone | null =
			milestones.status === 'ok' && project.githubMilestone
				? (milestones.milestones.find((m) => m.number === project.githubMilestone) ?? null)
				: null;

		const issues = await github.listIssues(
			project.githubRepo,
			milestone ? { state: 'all', milestone: milestone.number } : { state: 'open' }
		);

		let burndown: Burndown | null = null;
		let board: Record<Column, Issue[]> | null = null;
		let doneHidden = 0;
		if (issues.status === 'ok') {
			board = groupByColumn(issues.issues);
			doneHidden = Math.max(0, board.done.length - DONE_SHOWN);
			board.done = board.done.slice(0, DONE_SHOWN);
			if (milestone) {
				burndown = burndownSeries({
					issues: issues.issues,
					start: zonedParts(new Date(milestone.createdAt), settings.timezone).date,
					due: milestone.dueOn,
					today,
					timezone: settings.timezone,
					projectId: project.id,
					days: ctx.days,
					allocations: ctx.allocations
				});
			}
		}

		return {
			project,
			today,
			blockHours: settings.blockHours,
			milestones:
				milestones.status === 'ok'
					? { status: 'ok' as const, list: milestones.milestones }
					: milestones.status === 'no-token'
						? { status: 'no-token' as const }
						: { status: 'error' as const, message: milestones.message },
			milestone,
			issuesError: issues.status === 'ok' ? null : issues.status === 'no-token' ? 'Set GITHUB_TOKEN to load issues.' : issues.message,
			board,
			doneHidden,
			burndown
		};
	} catch (e) {
		failLoad('Could not load this project.', e);
	}
};

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const issueNumber = z.coerce.number().int().positive().max(10_000_000);
const size = z.coerce.number().int().min(1, 'Size is 1 to 20 blocks.').max(20, 'Size is 1 to 20 blocks.');
const depth = z.preprocess(blank, z.enum(['deep', 'shallow']).nullable().default(null));
const column = z.enum(['backlog', 'next', 'doing', 'done']);
const title = z.string().trim().min(1, 'Give it a title.').max(256, 'Keep the title under 256 characters.');
const body = z.string().max(20_000, 'Keep the description under 20,000 characters.').default('');
const dueOn = z.preprocess(
	blank,
	z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid due date.')
		.nullable()
		.default(null)
);

const createIssueSchema = z.object({ title, body, size, depth, column });
const updateIssueSchema = z.object({ number: issueNumber, title, body, size, depth });
const moveSchema = z.object({ number: issueNumber, to: column });
const dropSchema = z.object({ number: issueNumber });
const linkSchema = z.object({ milestone: z.preprocess(blank, issueNumber.nullable().default(null)) });
const milestoneFields = {
	title: z.string().trim().min(1, 'Give the milestone a title.').max(120, 'Keep the title under 120 characters.'),
	description: z.string().max(2000, 'Keep the description under 2,000 characters.').default(''),
	dueOn
};
const createMilestoneSchema = z.object(milestoneFields);
const updateMilestoneSchema = z.object({ ...milestoneFields, state: z.enum(['open', 'closed']) });

function data(form: FormData) {
	return Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string'));
}
const invalid = (scope: string, issues: z.ZodError) =>
	fail(400, { scope, error: issues.issues[0]?.message ?? 'Check the form and try again.' });
const failed = (scope: string, message: string) => fail(500, { scope, error: message });

export const actions: Actions = {
	createIssue: async ({ request, locals, params }) => {
		const project = await linkedProject(locals, params.id);
		const p = createIssueSchema.safeParse(data(await request.formData()));
		if (!p.success) return invalid('createIssue', p.error);
		const { status } = columnFields(p.data.column === 'done' ? 'backlog' : p.data.column);
		const r = await github.createIssue(project.githubRepo, {
			title: p.data.title,
			body: p.data.body,
			labels: labelsFor([], { size: p.data.size, depth: p.data.depth, status }),
			...(project.githubMilestone ? { milestone: project.githubMilestone } : {})
		});
		if (!r.ok) return failed('createIssue', r.message);
		return { scope: 'createIssue', ok: true };
	},

	updateIssue: async ({ request, locals, params }) => {
		const project = await linkedProject(locals, params.id);
		const p = updateIssueSchema.safeParse(data(await request.formData()));
		if (!p.success) return invalid('updateIssue', p.error);
		const current = await github.getIssue(project.githubRepo, p.data.number);
		if (!current.ok) return failed('updateIssue', current.message);
		const r = await github.updateIssue(project.githubRepo, p.data.number, {
			title: p.data.title,
			body: p.data.body,
			labels: labelsFor(current.value.labels, { size: p.data.size, depth: p.data.depth })
		});
		if (!r.ok) return failed('updateIssue', r.message);
		return { scope: 'updateIssue', ok: true };
	},

	move: async ({ request, locals, params }) => {
		const project = await linkedProject(locals, params.id);
		const p = moveSchema.safeParse(data(await request.formData()));
		if (!p.success) return invalid('move', p.error);
		const current = await github.getIssue(project.githubRepo, p.data.number);
		if (!current.ok) return failed('move', current.message);
		const { state, status } = columnFields(p.data.to);
		const was = current.value.state;
		const r = await github.updateIssue(project.githubRepo, p.data.number, {
			labels: labelsFor(current.value.labels, { status }),
			...(state !== was ? { state, stateReason: state === 'closed' ? 'completed' : 'reopened' } : {})
		});
		if (!r.ok) return failed('move', r.message);
		return { scope: 'move', ok: true };
	},

	drop: async ({ request, locals, params }) => {
		const project = await linkedProject(locals, params.id);
		const p = dropSchema.safeParse(data(await request.formData()));
		if (!p.success) return invalid('drop', p.error);
		const current = await github.getIssue(project.githubRepo, p.data.number);
		if (!current.ok) return failed('drop', current.message);
		const r = await github.updateIssue(project.githubRepo, p.data.number, {
			state: 'closed',
			stateReason: 'not_planned',
			labels: labelsFor(current.value.labels, { status: null })
		});
		if (!r.ok) return failed('drop', r.message);
		return { scope: 'drop', ok: true };
	},

	linkMilestone: async ({ request, locals, params }) => {
		const project = await linkedProject(locals, params.id);
		const p = linkSchema.safeParse(data(await request.formData()));
		if (!p.success) return invalid('milestone', p.error);
		if (p.data.milestone !== null) {
			const list = await github.listMilestones(project.githubRepo);
			if (list.status !== 'ok') return failed('milestone', list.status === 'error' ? list.message : 'Set GITHUB_TOKEN to use GitHub.');
			if (!list.milestones.some((m) => m.number === p.data.milestone)) return failed('milestone', 'That milestone no longer exists.');
		}
		try {
			await repo.updateProject(locals.supabase, project.id, { githubMilestone: p.data.milestone });
		} catch {
			return failed('milestone', 'Could not link the milestone.');
		}
		return { scope: 'milestone', ok: true };
	},

	createMilestone: async ({ request, locals, params }) => {
		const project = await linkedProject(locals, params.id);
		const p = createMilestoneSchema.safeParse(data(await request.formData()));
		if (!p.success) return invalid('milestone', p.error);
		const r = await github.createMilestone(project.githubRepo, p.data);
		if (!r.ok) return failed('milestone', r.message);
		try {
			await repo.updateProject(locals.supabase, project.id, { githubMilestone: r.value.number });
		} catch {
			return failed('milestone', 'The milestone was created on GitHub but could not be linked here.');
		}
		return { scope: 'milestone', ok: true };
	},

	updateMilestone: async ({ request, locals, params }) => {
		const project = await linkedProject(locals, params.id);
		if (!project.githubMilestone) return failed('milestone', 'Link a milestone first.');
		const p = updateMilestoneSchema.safeParse(data(await request.formData()));
		if (!p.success) return invalid('milestone', p.error);
		const r = await github.updateMilestone(project.githubRepo, project.githubMilestone, p.data);
		if (!r.ok) return failed('milestone', r.message);
		return { scope: 'milestone', ok: true };
	}
};

