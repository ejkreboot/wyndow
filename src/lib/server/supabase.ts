import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { Database } from '$lib/types/database';
import { serverEnv } from './env';

/** Per-request Supabase client using the publishable key; session cookies are httpOnly. */
export function createSupabaseServerClient(
	event: Pick<RequestEvent, 'cookies'>
): SupabaseClient<Database, 'wyndow'> {
	const env = serverEnv();
	return createServerClient<Database, 'wyndow'>(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
		db: { schema: 'wyndow' },
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookies) => {
				for (const { name, value, options } of cookies) {
					event.cookies.set(name, value, {
						...options,
						path: '/',
						httpOnly: true,
						secure: !dev,
						sameSite: 'lax'
					});
				}
			}
		}
	});
}
