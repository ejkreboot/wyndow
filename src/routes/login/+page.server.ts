import { fail, redirect } from '@sveltejs/kit';
import { isAllowed } from '#lib/server/auth.js';
import type { Actions, PageServerLoad } from './$types';

const readEmail = (form: FormData) => String(form.get('email') ?? '').trim().toLowerCase();

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/');
};

export const actions: Actions = {
	/** Step 1: email a one-time code. */
	send: async ({ request, locals }) => {
		const email = readEmail(await request.formData());
		if (!email) return fail(400, { email, message: 'Enter your email.' });

		// Same response whether or not the address is allowed, so the form can't be used to probe the list.
		if (isAllowed(email)) {
			const { error } = await locals.supabase.auth.signInWithOtp({ email });
			if (error) return fail(error.status === 429 ? 429 : 500, { email, sent: false, message: error.message });
		}
		return { email, sent: true };
	},

	/** Step 2: exchange the code for a session. */
	verify: async ({ request, locals }) => {
		const form = await request.formData();
		const email = readEmail(form);
		const token = String(form.get('token') ?? '').replace(/\s+/g, '');
		if (!/^\d{6,10}$/.test(token)) return fail(400, { email, sent: true, message: 'Enter the code from the email.' });
		if (!isAllowed(email)) return fail(400, { email, sent: true, message: 'That code is invalid or has expired.' });

		const { data, error } = await locals.supabase.auth.verifyOtp({ email, token, type: 'email' });
		if (error || !data.session) {
			return fail(400, { email, sent: true, message: 'That code is invalid or has expired.' });
		}
		if (!isAllowed(data.user?.email)) {
			await locals.supabase.auth.signOut();
			return fail(403, { email: '', sent: false, message: 'This account is not allowed.' });
		}
		redirect(303, '/');
	}
};
