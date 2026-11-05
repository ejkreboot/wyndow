import { error } from '@sveltejs/kit';
import { CRON_SECRET } from '$app/env/private';
import { syncFeed } from '#lib/server/ics.js';
import { adminClient } from '#lib/server/supabase.js';
import type { RequestHandler } from './$types';

/** Vercel cron: refreshes every subscribed feed. Authorised by `Authorization: Bearer $CRON_SECRET`. */
export const GET: RequestHandler = async ({ request }) => {
	if (!CRON_SECRET || request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) error(401, 'Unauthorized');

	const db = adminClient();
	const { data: feeds, error: dbError } = await db.from('feeds').select('id, user_id, url');
	if (dbError) error(500, dbError.message);

	const results = await Promise.all((feeds ?? []).map(async (f) => ({ id: f.id, error: await syncFeed(db, f) })));
	return Response.json({ synced: results.length, failed: results.filter((r) => r.error).length });
};
