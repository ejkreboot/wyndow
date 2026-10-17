// SECURITY: this module holds the Supabase secret key (bypasses RLS).
// Import it only from src/routes/api/cron/** and never from anything a user request can reach.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import { serverEnv } from './env';

export function createAdminClient(): SupabaseClient<Database, 'wyndow'> {
	const env = serverEnv();
	if (!env.SUPABASE_SECRET_KEY) throw new Error('SUPABASE_SECRET_KEY is not configured');
	return createClient<Database, 'wyndow'>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
		db: { schema: 'wyndow' },
		auth: { persistSession: false, autoRefreshToken: false }
	}) as unknown as SupabaseClient<Database, 'wyndow'>;
}
