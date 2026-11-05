import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { isAllowed } from '#lib/server/auth.js';
import { userClient } from '#lib/server/supabase.js';

const PUBLIC_PATHS = ['/login', '/api/cron/'];

export const handle: Handle = async ({ event, resolve }) => {
	const supabase = userClient(event.cookies);
	event.locals.supabase = supabase;

	const { data } = await supabase.auth.getClaims();
	const claims = data?.claims;
	event.locals.user =
		claims && isAllowed(claims.email as string | undefined)
			? { id: claims.sub, email: claims.email as string }
			: null;

	const path = event.url.pathname;
	const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p));
	if (!event.locals.user && !isPublic) redirect(303, '/login');

	return resolve(event, {
		filterSerializedResponseHeaders: (name) => name === 'content-range' || name === 'x-supabase-api-version'
	});
};
