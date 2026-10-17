import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { isAllowedEmail, safeNext } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

const GENERIC = 'Email or password is incorrect.';

const schema = z.object({
	email: z.string().trim().min(1).max(254).pipe(z.email()),
	password: z.string().min(1).max(256)
});

export const load: PageServerLoad = async ({ url }) => {
	return { next: safeNext(url.searchParams.get('next')) };
};

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		const form = await request.formData();
		const parsed = schema.safeParse({
			email: form.get('email'),
			password: form.get('password')
		});
		const email = typeof form.get('email') === 'string' ? String(form.get('email')).trim() : '';
		if (!parsed.success) return fail(400, { error: GENERIC, email });

		const { data, error } = await locals.supabase.auth.signInWithPassword({
			email: parsed.data.email,
			password: parsed.data.password
		});
		if (error || !data.user) return fail(400, { error: GENERIC, email });

		if (!isAllowedEmail(data.user.email)) {
			await locals.supabase.auth.signOut();
			return fail(400, { error: GENERIC, email });
		}

		const posted = form.get('next');
		redirect(
			303,
			safeNext(typeof posted === 'string' ? posted : url.searchParams.get('next'))
		);
	}
};
