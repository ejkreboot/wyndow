import { redirect, type Handle, type HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { isAllowedEmail } from '$lib/server/auth';

const supabaseHandle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createSupabaseServerClient(event);
	event.locals.user = null;
	return resolve(event, {
		filterSerializedResponseHeaders: (name) =>
			name === 'content-range' || name === 'x-supabase-api-version'
	});
};

function isPublicPath(pathname: string): boolean {
	return (
		pathname === '/login' ||
		pathname === '/logout' ||
		pathname === '/api/cron' ||
		pathname.startsWith('/api/cron/')
	);
}

const authGuard: Handle = async ({ event, resolve }) => {
	const { supabase } = event.locals;
	const {
		data: { user }
	} = await supabase.auth.getUser();

	if (user && isAllowedEmail(user.email)) {
		event.locals.user = { id: user.id, email: user.email as string };
	} else {
		if (user) await supabase.auth.signOut();
		event.locals.user = null;
	}

	const { pathname, search } = event.url;
	if (!event.locals.user && !isPublicPath(pathname)) {
		redirect(303, `/login?next=${encodeURIComponent(pathname + search)}`);
	}
	if (event.locals.user && pathname === '/login') {
		redirect(303, '/season');
	}
	return resolve(event);
};

const securityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	const type = response.headers.get('content-type') ?? '';
	if (type.includes('text/html')) {
		response.headers.set('Cache-Control', 'no-store');
	}
	return response;
};

export const handle: Handle = sequence(supabaseHandle, authGuard, securityHeaders);

/** Logs unexpected server errors with a short id; the page shows only the id, never details. */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	const id = crypto.randomUUID().slice(0, 8);
	if (status !== 404) {
		const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
		console.error(`[wyndow] ${id} ${event.request.method} ${event.url.pathname}: ${detail}`);
	}
	return { message: status === 404 ? message : `Something went wrong (ref ${id}).` };
};
