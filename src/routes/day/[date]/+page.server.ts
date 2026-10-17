import { error, fail } from '@sveltejs/kit';
import { failLoad } from '$lib/server/errors';
import { z } from 'zod';
import { buildTimeline, dayReadout } from '$lib/day/timeline';
import { isValidDayParam, packetNeeds } from '$lib/day/format';
import { addDays, allocationSpans, asyncDaysAhead, fitAllocation, todayIn } from '$lib/planner';
import { loadPlannerContext } from '$lib/server/context';
import { listIssues } from '$lib/server/github';
import {
	activeSession,
	endSession,
	getSettings,
	latestNotes,
	listClasses,
	setDayAllocation,
	startSession
} from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const idSchema = z.uuid();

async function todayFor(locals: App.Locals): Promise<string> {
	return todayIn((await getSettings(locals.supabase)).timezone);
}

export const load: PageServerLoad = async ({ locals, params }) => {
	try {
		const today = await todayFor(locals);
		if (!isValidDayParam(params.date, today)) error(404, 'That is not a day Wyndow can show.');
		const date = params.date;

		const from = date < today ? date : today;
		const to = addDays(date > today ? date : today, 21);
		const ctx = await loadPlannerContext(locals, { from, to });
		const [classes, session, notes] = await Promise.all([
			listClasses(locals.supabase),
			activeSession(locals.supabase),
			latestNotes(locals.supabase)
		]);

		const day = ctx.days.get(date);
		if (!day) error(404, 'That is not a day Wyndow can show.');
		const kind = ctx.kinds.find((k) => k.id === day.kindId) ?? null;
		const isToday = date === today;
		const colorOf = (id: string | null) => (id ? (ctx.projects.find((p) => p.id === id)?.color ?? null) : null);

		const spans = allocationSpans(day, ctx.allocations[date] ?? [], ctx.settings).map((s) => ({
			start: s.start,
			end: s.end,
			color: colorOf(s.projectId)
		}));

		const timeline = buildTimeline({
			day,
			kinds: ctx.kinds,
			projects: ctx.projects,
			classes,
			allocations: ctx.allocations,
			settings: ctx.settings,
			familyIds: ctx.familyIds
		});
		// "Doing" cards from GitHub for the projects in today's focus blocks and the running session.
		const doingIds = new Set(timeline.flatMap((i) => (i.card.type === 'focus' ? [i.card.projectId] : [])));
		if (session) doingIds.add(session.projectId);
		const doingEntries = await Promise.all(
			[...doingIds].map(async (id) => {
				const project = ctx.projects.find((p) => p.id === id);
				if (!project?.githubRepo) return null;
				const r = await listIssues(project.githubRepo, project.githubMilestone ? { state: 'all', milestone: project.githubMilestone } : {});
				if (r.status !== 'ok') return null;
				const doing = r.issues
					.filter((i) => i.state === 'open' && i.status === 'doing')
					.slice(0, 5)
					.map((i) => ({ number: i.number, title: i.title, url: i.url }));
				return [id, doing] as const;
			})
		);
		const doing = Object.fromEntries(doingEntries.filter((e) => e !== null && e[1].length > 0) as (readonly [string, { number: number; title: string; url: string }[]])[]);

		const readout = dayReadout(day, ctx.projects, ctx.allocations, ctx.settings, ctx.familyIds, isToday ? ctx.nowMinutes : null);

		const asyncDays = asyncDaysAhead(ctx.days, today, 10);
		const upcoming = [];
		for (let i = 1; i <= 10; i++) {
			const d = addDays(today, i);
			const p = ctx.days.get(d);
			if (!p) continue;
			const k = ctx.kinds.find((x) => x.id === p.kindId) ?? null;
			const alloc = fitAllocation(p, ctx.allocations[d]);
			const colors = [...new Set(alloc.filter((x): x is string => x !== null))]
				.map((id) => colorOf(id))
				.filter((c): c is string => c !== null);
			upcoming.push({
				date: d,
				kindName: k?.name ?? 'Unrecognized',
				kindColor: k ? k.color : '#e0a24a',
				async: p.school === 'async',
				blocks: p.blocks,
				colors
			});
		}

		return {
			date,
			today,
			isToday,
			prev: addDays(date, -1),
			next: addDays(date, 1),
			nowMinutes: isToday ? ctx.nowMinutes : null,
			kindName: kind?.name ?? 'Unrecognized',
			segments: day.segments,
			spans,
			readout,
			timeline,
			notes,
			doing,
			session: session
				? { id: session.id, projectId: session.projectId, startedAt: session.startedAt }
				: null,
			sessionProjectName: session
				? (ctx.projects.find((p) => p.id === session.projectId)?.name ?? 'a project')
				: null,
			ventures: ctx.projects
				.filter((p) => p.area === 'venture' && !p.archived)
				.map((p) => ({ id: p.id, name: p.name, color: p.color })),
			needs: packetNeeds(classes, asyncDays),
			asyncCount: asyncDays.length,
			upcoming
		};
	} catch (e) {
		failLoad('Could not load your plan.', e);
	}
};

const startSchema = z.object({ projectId: idSchema });
const stopSchema = z.object({
	sessionId: idSchema,
	note: z.string().trim().min(1, 'Write a short note about where you left off.').max(2000, 'Keep the note under 2000 characters.')
});
const giveSchema = z.object({
	date: dateSchema,
	fromIndex: z.coerce.number().int().min(0).max(15),
	count: z.coerce.number().int().min(1).max(16),
	projectId: idSchema
});

export const actions: Actions = {
	start: async ({ request, locals, params }) => {
		const form = await request.formData();
		const parsed = startSchema.safeParse({ projectId: form.get('projectId') });
		if (!parsed.success) return fail(400, { action: 'start', error: 'Choose a project to start a session.' });
		try {
			const today = await todayFor(locals);
			if (!isValidDayParam(params.date, today)) return fail(400, { action: 'start', error: 'That day is not valid.' });
			await startSession(locals.supabase, parsed.data.projectId, params.date);
		} catch {
			return fail(400, { action: 'start', error: 'Could not start the session.' });
		}
		return { action: 'start', ok: true };
	},

	stop: async ({ request, locals }) => {
		const form = await request.formData();
		const parsed = stopSchema.safeParse({ sessionId: form.get('sessionId'), note: form.get('note') });
		if (!parsed.success) {
			return fail(400, { action: 'stop', error: parsed.error.issues[0]?.message ?? 'Check the note and try again.' });
		}
		try {
			await endSession(locals.supabase, parsed.data.sessionId, parsed.data.note);
		} catch {
			return fail(400, { action: 'stop', error: 'Could not end the session.' });
		}
		return { action: 'stop', ok: true };
	},

	give: async ({ request, locals, params }) => {
		const form = await request.formData();
		const parsed = giveSchema.safeParse({
			date: form.get('date'),
			fromIndex: form.get('fromIndex'),
			count: form.get('count'),
			projectId: form.get('projectId')
		});
		if (!parsed.success || parsed.data.date !== params.date) {
			return fail(400, { action: 'give', error: 'Those blocks could not be assigned.' });
		}
		const { date, fromIndex, count, projectId } = parsed.data;
		try {
			const today = await todayFor(locals);
			if (!isValidDayParam(date, today)) return fail(400, { action: 'give', error: 'That day is not valid.' });
			const ctx = await loadPlannerContext(locals, { from: date, to: date });
			const day = ctx.days.get(date);
			const project = ctx.projects.find((p) => p.id === projectId && !p.archived);
			if (!day || !project) return fail(400, { action: 'give', error: 'Those blocks could not be assigned.' });
			const alloc = fitAllocation(day, ctx.allocations[date]);
			if (fromIndex + count > alloc.length) {
				return fail(400, { action: 'give', error: 'Those blocks are not on this day.' });
			}
			for (let i = fromIndex; i < fromIndex + count; i++) {
				if (alloc[i] !== null) return fail(400, { action: 'give', error: 'Those blocks are already assigned. Reload the day.' });
				alloc[i] = projectId;
			}
			await setDayAllocation(locals.supabase, date, alloc);
		} catch {
			return fail(400, { action: 'give', error: 'Could not save the blocks.' });
		}
		return { action: 'give', ok: true };
	}
};
