import { error, fail } from '@sveltejs/kit';
import { failLoad } from '$lib/server/errors';
import { z } from 'zod';
import { addDays, forecast } from '$lib/planner';
import type { Forecast, LocalDate, Project, SchoolClass, SchoolMode } from '$lib/planner';
import { REPO_PATTERN, type Issue } from '$lib/projects/issues';
import * as repo from '$lib/server/db';
import { loadPlannerContext } from '$lib/server/context';
import { listOpenIssues } from '$lib/server/github';
import { todayIn } from '$lib/planner/dates';
import type { Actions, PageServerLoad } from './$types';

export type IssuesState =
	| { status: 'none' }
	| { status: 'no-token' }
	| { status: 'error'; message: string }
	| { status: 'ok'; issues: Issue[] };

export interface VentureView {
	project: Project;
	issues: IssuesState;
	remaining: number;
	done: number;
	forecast: Forecast;
	note: string | null;
}

export interface ClassView {
	cls: SchoolClass;
	strip: { date: LocalDate; mode: SchoolMode | 'unknown' }[];
	asyncDays: LocalDate[];
}

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const settings = await repo.getSettings(locals.supabase);
		const from = todayIn(settings.timezone);
		const ctx = await loadPlannerContext(locals, { from, to: addDays(from, 120) });
		const [all, classes, notes] = await Promise.all([
			repo.listProjects(locals.supabase, { includeArchived: true }),
			repo.listClasses(locals.supabase),
			repo.latestNotes(locals.supabase)
		]);

		const ventures = all.filter((p) => p.area === 'venture' && !p.archived);
		const results = await Promise.all(
			ventures.map(async (p): Promise<IssuesState> => {
				if (!p.githubRepo) return { status: 'none' };
				return listOpenIssues(p.githubRepo);
			})
		);

		const ventureViews: VentureView[] = ventures.map((project, i) => {
			const issues = results[i];
			const remaining = issues.status === 'ok' ? issues.issues.reduce((n, x) => n + x.size, 0) : 0;
			return {
				project,
				issues,
				remaining,
				done: project.blocksDone,
				forecast: forecast({
					projectId: project.id,
					remainingBlocks: remaining,
					days: ctx.days,
					allocations: ctx.allocations,
					from
				}),
				note: notes[project.id] ?? null
			};
		});

		const schoolDays = [...ctx.days.values()]
			.filter((d) => d.date >= from && d.school !== null)
			.sort((a, b) => (a.date < b.date ? -1 : 1))
			.slice(0, 10);
		const strip = schoolDays.map((d) => ({ date: d.date, mode: d.school as SchoolMode | 'unknown' }));
		const asyncDays = strip.filter((s) => s.mode === 'async').map((s) => s.date);
		const classViews: ClassView[] = classes.map((cls) => ({ cls, strip, asyncDays }));

		return {
			today: from,
			blockHours: settings.blockHours,
			ventures: ventureViews,
			others: all.filter((p) => p.area !== 'venture' && !p.archived),
			archived: all.filter((p) => p.archived),
			classes: classViews
		};
	} catch (e) {
		failLoad('Could not load your projects.', e);
	}
};

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const optText = (max: number) =>
	z.preprocess(blank, z.string().trim().max(max).nullable().default(null));

const projectFields = {
	name: z.string().trim().min(1, 'Give the project a name.').max(80, 'That name is too long.'),
	color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a valid color.'),
	area: z.enum(['venture', 'family']),
	githubRepo: z.preprocess(
		blank,
		z
			.string()
			.trim()
			.max(140)
			.regex(REPO_PATTERN, 'Use the form owner/name for the GitHub repo.')
			.refine((v) => v.split('/').every((p) => p !== '.' && p !== '..'), 'Use the form owner/name for the GitHub repo.')
			.nullable()
			.default(null)
	),
	milestone: optText(120)
};
const uuid = z.string().uuid();
const createProjectSchema = z.object(projectFields);
const updateProjectSchema = z.object({
	id: uuid,
	...projectFields,
	blocksDone: z.coerce.number().int('Blocks done must be a whole number.').min(0).max(10000, 'Blocks done is too large.')
});
const archiveSchema = z.object({ id: uuid, archived: z.enum(['true', 'false']) });

const classFields = {
	name: z.string().trim().min(1, 'Give the class a name.').max(80, 'That name is too long.'),
	student: z.string().trim().min(1, 'Add the student’s name.').max(60, 'That name is too long.'),
	wyrkbookRef: optText(200),
	currentUnit: optText(200)
};
const createClassSchema = z.object(classFields);
const updateClassSchema = z.object({ id: uuid, ...classFields });
const idSchema = z.object({ id: uuid });
const packetsSchema = z.object({ id: uuid, delta: z.enum(['-1', '1']) });

function data(form: FormData) {
	return Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string'));
}
const invalid = (scope: string, issues: z.ZodError) =>
	fail(400, { scope, error: issues.issues[0]?.message ?? 'Check the form and try again.' });
const failed = (scope: string, message: string) => fail(500, { scope, error: message });

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const p = createProjectSchema.safeParse(data(await request.formData()));
		if (!p.success) return invalid('create', p.error);
		try {
			await repo.createProject(locals.supabase, p.data);
		} catch {
			return failed('create', 'Could not add the project.');
		}
		return { scope: 'create', ok: true };
	},
	update: async ({ request, locals }) => {
		const p = updateProjectSchema.safeParse(data(await request.formData()));
		if (!p.success) return invalid('update', p.error);
		const { id, ...patch } = p.data;
		try {
			await repo.updateProject(locals.supabase, id, patch);
		} catch {
			return failed('update', 'Could not save the project.');
		}
		return { scope: 'update', ok: true };
	},
	archive: async ({ request, locals }) => {
		const p = archiveSchema.safeParse(data(await request.formData()));
		if (!p.success) return invalid('archive', p.error);
		try {
			await repo.updateProject(locals.supabase, p.data.id, { archived: p.data.archived === 'true' });
		} catch {
			return failed('archive', 'Could not update the project.');
		}
		return { scope: 'archive', ok: true };
	},
	createClass: async ({ request, locals }) => {
		const p = createClassSchema.safeParse(data(await request.formData()));
		if (!p.success) return invalid('createClass', p.error);
		try {
			await repo.createClass(locals.supabase, p.data);
		} catch {
			return failed('createClass', 'Could not add the class.');
		}
		return { scope: 'createClass', ok: true };
	},
	updateClass: async ({ request, locals }) => {
		const p = updateClassSchema.safeParse(data(await request.formData()));
		if (!p.success) return invalid('updateClass', p.error);
		const { id, ...patch } = p.data;
		try {
			await repo.updateClass(locals.supabase, id, patch);
		} catch {
			return failed('updateClass', 'Could not save the class.');
		}
		return { scope: 'updateClass', ok: true };
	},
	deleteClass: async ({ request, locals }) => {
		const p = idSchema.safeParse(data(await request.formData()));
		if (!p.success) return invalid('deleteClass', p.error);
		try {
			await repo.deleteClass(locals.supabase, p.data.id);
		} catch {
			return failed('deleteClass', 'Could not delete the class.');
		}
		return { scope: 'deleteClass', ok: true };
	},
	packets: async ({ request, locals }) => {
		const p = packetsSchema.safeParse(data(await request.formData()));
		if (!p.success) return invalid('packets', p.error);
		try {
			const cls = (await repo.listClasses(locals.supabase)).find((c) => c.id === p.data.id);
			if (!cls) return failed('packets', 'That class no longer exists.');
			const next = Math.min(1000, Math.max(0, cls.packetsReady + Number(p.data.delta)));
			await repo.updateClass(locals.supabase, cls.id, { packetsReady: next });
		} catch {
			return failed('packets', 'Could not update the packets.');
		}
		return { scope: 'packets', ok: true };
	}
};
