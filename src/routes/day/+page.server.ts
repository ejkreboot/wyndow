import { error, redirect } from '@sveltejs/kit';
import { failLoad } from '$lib/server/errors';
import { todayIn } from '$lib/planner';
import { getSettings } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	let today: string;
	try {
		today = todayIn((await getSettings(locals.supabase)).timezone);
	} catch (e) {
		failLoad('Could not load your plan.', e);
	}
	redirect(307, `/day/${today}`);
};
