import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';

/** Per-request (or admin) Supabase client scoped to the wyndow schema. */
export type Db = SupabaseClient<Database, 'wyndow'>;

type Tables = Database['wyndow']['Tables'];
export type Row<T extends keyof Tables> = Tables[T]['Row'];
export type Insert<T extends keyof Tables> = Tables[T]['Insert'];
export type Update<T extends keyof Tables> = Tables[T]['Update'];

/** Throws a clean Error carrying only the message, never PostgREST details/hints. */
export function fail(action: string, error: { message: string }): never {
	throw new Error(`${action}: ${error.message}`);
}

/** Unwraps a PostgREST response, throwing on error. */
export function unwrap<T>(action: string, res: { data: T | null; error: { message: string } | null }): T {
	if (res.error) fail(action, res.error);
	return res.data as T;
}
