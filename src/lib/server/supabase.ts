import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Cookies } from '@sveltejs/kit';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, SUPABASE_URL } from '$app/env/private';
import type { Database } from './database.types.js';

export type Db = SupabaseClient<Database, 'wyndow'>;

/** A client that acts as the signed-in user (RLS applies). Session lives in httpOnly cookies. */
export function userClient(cookies: Cookies): Db {
	return createServerClient<Database, 'wyndow'>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
		db: { schema: 'wyndow' },
		cookies: {
			getAll: () => cookies.getAll(),
			setAll: (list) => {
				for (const { name, value, options } of list) {
					cookies.set(name, value, { ...options, path: '/', httpOnly: true });
				}
			}
		}
	});
}

/** Bypasses RLS. Used only by the feed-refresh cron. */
export function adminClient(): Db {
	return createClient<Database, 'wyndow'>(SUPABASE_URL, SUPABASE_SECRET_KEY, {
		db: { schema: 'wyndow' },
		auth: { persistSession: false, autoRefreshToken: false }
	});
}
