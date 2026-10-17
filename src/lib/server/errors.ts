import { error, isHttpError, isRedirect } from '@sveltejs/kit';

const SCHEMA_NOT_EXPOSED =
	'Wyndow cannot reach its database tables. In Supabase, add "wyndow" under Settings → Data API → Exposed schemas.';

/**
 * Logs a failed load on the server, then throws a user-facing error. SvelteKit redirects and
 * HTTP errors pass through unchanged. Repository errors carry only PostgREST's message (no
 * keys, URLs, or row data), so logging them is safe.
 */
export function failLoad(message: string, cause: unknown): never {
	if (isHttpError(cause) || isRedirect(cause)) throw cause;
	const detail = cause instanceof Error ? cause.message : String(cause);
	console.error(`[wyndow] ${message} ${detail}`);
	if (detail.includes('Invalid schema')) error(503, SCHEMA_NOT_EXPOSED);
	error(500, message);
}
