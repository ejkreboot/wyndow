import { maskUrl, toDate } from './mappers';
import { fail, type Db, type Update } from './types';

export interface SourceSummary {
	id: string;
	name: string;
	lastSyncedAt: Date | null;
	lastError: string | null;
	urlMasked: string;
}

/** Lists sources WITHOUT the secret URL. Selects ics_url only to mask it server-side. */
export async function listSources(db: Db): Promise<SourceSummary[]> {
	const { data, error } = await db
		.from('calendar_sources')
		.select('id,name,ics_url,last_synced_at,last_error')
		.order('created_at');
	if (error) fail('Could not load calendar sources', error);
	return data.map((r) => ({
		id: r.id,
		name: r.name,
		lastSyncedAt: r.last_synced_at ? toDate(r.last_synced_at) : null,
		lastError: r.last_error,
		urlMasked: maskUrl(r.ics_url)
	}));
}

/** The only reader of the full ICS URL. Use for server-side fetching only. */
export async function getSourceUrl(db: Db, id: string): Promise<string> {
	const { data, error } = await db.from('calendar_sources').select('ics_url').eq('id', id).single();
	if (error) fail('Could not load calendar source', error);
	return data.ics_url;
}

export async function createSource(db: Db, input: { name: string; url: string }): Promise<string> {
	const { data, error } = await db
		.from('calendar_sources')
		.insert({ name: input.name, ics_url: input.url })
		.select('id')
		.single();
	if (error) fail('Could not add calendar source', error);
	return data.id;
}

export async function updateSource(
	db: Db,
	id: string,
	patch: { name?: string; url?: string }
): Promise<void> {
	const row: Update<'calendar_sources'> = {};
	if (patch.name !== undefined) row.name = patch.name;
	if (patch.url !== undefined) row.ics_url = patch.url;
	const { error } = await db.from('calendar_sources').update(row).eq('id', id);
	if (error) fail('Could not update calendar source', error);
}

export async function deleteSource(db: Db, id: string): Promise<void> {
	const { error } = await db.from('calendar_sources').delete().eq('id', id);
	if (error) fail('Could not delete calendar source', error);
}

/** Records the outcome of a sync. Pass error=null on success. */
export async function recordSync(db: Db, id: string, error: string | null): Promise<void> {
	const { error: e } = await db
		.from('calendar_sources')
		.update({ last_synced_at: new Date().toISOString(), last_error: error })
		.eq('id', id);
	if (e) fail('Could not record sync', e);
}
