import { addDays, nextChunk, todayIn } from '$lib/planner';
import { nextChunkLabel } from '$lib/day/format';
import { loadPlannerContext } from '$lib/server/context';
import { getSettings } from '$lib/server/db';
import type { LayoutServerLoad } from './$types';

/** Top bar readout. Any failure yields null so it can never break a page. */
async function loadNextChunk(locals: App.Locals): Promise<{ label: string; href: string } | null> {
	if (!locals.user) return null;
	try {
		const today = todayIn((await getSettings(locals.supabase)).timezone);
		const ctx = await loadPlannerContext(locals, { from: today, to: addDays(today, 30) });
		const chunk = nextChunk({
			days: ctx.days,
			allocations: ctx.allocations,
			settings: ctx.settings,
			from: ctx.today,
			nowMinutes: ctx.nowMinutes,
			familyIds: ctx.familyIds
		});
		if (!chunk) return null;
		return { label: nextChunkLabel(chunk, ctx.today, ctx.projects), href: `/day/${chunk.date}` };
	} catch (e) {
		console.warn(`[wyndow] next chunk unavailable: ${e instanceof Error ? e.message : String(e)}`);
		return null;
	}
}

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		email: locals.user?.email ?? null,
		nextChunk: await loadNextChunk(locals)
	};
};
