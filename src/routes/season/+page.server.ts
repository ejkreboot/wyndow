import { error, fail } from '@sveltejs/kit';
import { failLoad } from '$lib/server/errors';
import { z } from 'zod';
import { addDays, fitAllocation, suggestStretches, todayIn } from '$lib/planner';
import type { Allocations, LocalDate } from '$lib/planner';
import { loadPlannerContext } from '$lib/server/context';
import * as repo from '$lib/server/db';
import { DATE_RE, UUID_RE, inRange, paintedDay, seasonRange, withBlock } from '$lib/season/season';
import type { Actions, PageServerLoad } from './$types';

const LOAD_ERROR = 'Could not load your plan.';
const SAVE_ERROR = 'Could not save that change. Try again.';

async function currentRange(locals: App.Locals) {
	const settings = await repo.getSettings(locals.supabase);
	return seasonRange(todayIn(settings.timezone));
}

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const range = await currentRange(locals);
		const ctx = await loadPlannerContext(locals, range);
		return {
			range,
			today: ctx.today,
			settings: ctx.settings,
			kinds: ctx.kinds,
			projects: ctx.projects,
			allocations: ctx.allocations,
			days: ctx.days,
			familyIds: ctx.familyIds
		};
	} catch (e) {
		failLoad(LOAD_ERROR, e);
	}
};

const dateField = z.string().regex(DATE_RE, 'Pick a valid date.');
const projectField = z.union([z.literal(''), z.string().regex(UUID_RE, 'Pick a valid project.')]);

const paintSchema = z.object({ date: dateField, projectId: projectField });
const blockSchema = z.object({
	date: dateField,
	index: z.coerce.number().int().min(0).max(15),
	projectId: projectField
});

/** Rebuilds a single date (with the week before it, for derived kinds) as the signed-in user. */
async function loadOneDay(locals: App.Locals, date: LocalDate) {
	const ctx = await loadPlannerContext(locals, { from: addDays(date, -7), to: date });
	const day = ctx.days.get(date);
	if (!day) throw new Error('missing day');
	return { ctx, day };
}

export const actions: Actions = {
	paint: async ({ request, locals }) => {
		const form = await request.formData();
		const parsed = paintSchema.safeParse({ date: form.get('date'), projectId: form.get('projectId') });
		if (!parsed.success) return fail(400, { error: 'That change was not valid.' });
		const { date, projectId } = parsed.data;
		try {
			const range = await currentRange(locals);
			if (!inRange(date, range)) return fail(400, { error: 'That date is outside the season.' });
			const { ctx, day } = await loadOneDay(locals, date);
			if (projectId && !ctx.projects.some((p) => p.id === projectId)) {
				return fail(400, { error: 'That project is not available.' });
			}
			if (day.blocks === 0) return fail(400, { error: 'That day has no focus blocks.' });
			await repo.setDayAllocation(locals.supabase, date, paintedDay(day.blocks, projectId || null));
			return { ok: true, message: 'Saved.' };
		} catch {
			return fail(500, { error: SAVE_ERROR });
		}
	},

	setBlock: async ({ request, locals }) => {
		const form = await request.formData();
		const parsed = blockSchema.safeParse({
			date: form.get('date'),
			index: form.get('index'),
			projectId: form.get('projectId')
		});
		if (!parsed.success) return fail(400, { error: 'That change was not valid.' });
		const { date, index, projectId } = parsed.data;
		try {
			const range = await currentRange(locals);
			if (!inRange(date, range)) return fail(400, { error: 'That date is outside the season.' });
			const { ctx, day } = await loadOneDay(locals, date);
			if (projectId && !ctx.projects.some((p) => p.id === projectId)) {
				return fail(400, { error: 'That project is not available.' });
			}
			const next = withBlock(fitAllocation(day, ctx.allocations[date]), day.blocks, index, projectId || null);
			if (!next) return fail(400, { error: 'That block does not exist on this day.' });
			await repo.setDayAllocation(locals.supabase, date, next);
			return { ok: true, message: 'Saved.' };
		} catch {
			return fail(500, { error: SAVE_ERROR });
		}
	},

	// Recomputed on the server from stored data; nothing but the click comes from the browser.
	suggest: async ({ locals }) => {
		try {
			const range = await currentRange(locals);
			const ctx = await loadPlannerContext(locals, range);
			const ventureIds = ctx.projects.filter((p) => p.area === 'venture').map((p) => p.id);
			const familyId = ctx.projects.find((p) => p.area === 'family')?.id ?? null;
			if (ventureIds.length === 0 && !familyId) {
				return fail(400, { error: 'Add a venture or family project first.' });
			}
			const NONE = '00000000-0000-0000-0000-000000000000';
			const raw = suggestStretches({
				days: ctx.days,
				from: ctx.today,
				to: range.to,
				ventureIds,
				familyId: familyId ?? NONE
			});
			const out: Allocations = {};
			// Replace every future day: suggested days get the suggestion, others are cleared.
			for (const [date, day] of ctx.days) {
				if (date < ctx.today) continue;
				const suggested = raw[date]?.map((p) => (p === NONE ? null : p));
				if (suggested && suggested.some((p) => p !== null)) out[date] = suggested;
				else if (day.blocks > 0 || (ctx.allocations[date]?.length ?? 0) > 0) out[date] = [];
			}
			await repo.setAllocations(locals.supabase, out);
			return { ok: true, message: 'Stretches suggested.' };
		} catch {
			return fail(500, { error: SAVE_ERROR });
		}
	}
};
