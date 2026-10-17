// Functions for the cron/admin (secret key) client. The admin client bypasses RLS,
// so every query here filters by userId explicitly.
import type { LocalDate } from '$lib/planner/types';
import { deleteEventsNotIn, eventRow, upsertEventRows, type EventInput } from './events';
import { fail, type Db } from './types';

export interface SourceRef {
	id: string;
	userId: string;
	url: string;
}

export async function listAllSources(admin: Db): Promise<SourceRef[]> {
	const { data, error } = await admin.from('calendar_sources').select('id,user_id,ics_url');
	if (error) fail('Could not list calendar sources', error);
	return data.map((r) => ({ id: r.id, userId: r.user_id, url: r.ics_url }));
}

export async function upsertEventsForSource(
	admin: Db,
	userId: string,
	sourceId: string,
	events: EventInput[]
): Promise<void> {
	await upsertEventRows(
		admin,
		events.map((e) => eventRow(e, sourceId, userId))
	);
}

export async function deleteMissingEvents(
	admin: Db,
	userId: string,
	sourceId: string,
	uids: string[],
	span: { from: LocalDate; to: LocalDate }
): Promise<number> {
	return deleteEventsNotIn(admin, sourceId, uids, span, userId);
}

/** Records a sync outcome; error=null on success. */
export async function markSourceSynced(
	admin: Db,
	userId: string,
	sourceId: string,
	error: string | null
): Promise<void> {
	const { error: e } = await admin
		.from('calendar_sources')
		.update({ last_synced_at: new Date().toISOString(), last_error: error })
		.eq('id', sourceId)
		.eq('user_id', userId);
	if (e) fail('Could not record sync', e);
}
