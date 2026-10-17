import { json } from '@sveltejs/kit';
import { timingSafeEqualStr } from '$lib/server/auth';
import { serverEnv } from '$lib/server/env';
import { createAdminClient } from '$lib/server/supabaseAdmin';
import { syncAllSources } from '$lib/server/sync';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 60 };

export const GET: RequestHandler = async ({ request }) => {
	let secret: string | undefined;
	try {
		secret = serverEnv().CRON_SECRET;
	} catch {
		secret = undefined;
	}
	const header = request.headers.get('authorization') ?? '';
	if (!secret || !timingSafeEqualStr(header, `Bearer ${secret}`)) {
		return new Response(null, { status: 401 });
	}
	try {
		const counts = await syncAllSources(createAdminClient());
		return json(counts);
	} catch {
		return json({ error: 'Sync failed' }, { status: 500 });
	}
};
