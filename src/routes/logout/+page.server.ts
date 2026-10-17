import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// GET never changes state.
export const load: PageServerLoad = async () => {
	redirect(303, '/season');
};

export const actions: Actions = {
	default: async ({ locals }) => {
		await locals.supabase.auth.signOut();
		redirect(303, '/login');
	}
};
