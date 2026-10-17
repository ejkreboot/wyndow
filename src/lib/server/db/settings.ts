import type { IsoWeekday, Settings } from '$lib/planner/types';
import { toSettings } from './mappers';
import { fail, type Db } from './types';

export const DEFAULT_SETTINGS: Settings = {
	timezone: 'America/Detroit',
	blockHours: 2,
	chunkMinHours: 3,
	schoolDays: [1, 2, 3, 4, 5] as IsoWeekday[]
};

/** Returns the user's settings, or the defaults if the row does not exist yet. */
export async function getSettings(db: Db): Promise<Settings> {
	const { data, error } = await db.from('settings').select('*').maybeSingle();
	if (error) fail('Could not load settings', error);
	return data ? toSettings(data) : { ...DEFAULT_SETTINGS };
}

export async function updateSettings(db: Db, patch: Partial<Settings>): Promise<Settings> {
	const row: Record<string, unknown> = {};
	if (patch.timezone !== undefined) row.timezone = patch.timezone;
	if (patch.blockHours !== undefined) row.block_hours = patch.blockHours;
	if (patch.chunkMinHours !== undefined) row.chunk_min_hours = patch.chunkMinHours;
	if (patch.schoolDays !== undefined) row.school_days = patch.schoolDays;
	const { data, error } = await db
		.from('settings')
		.upsert(row, { onConflict: 'user_id' })
		.select('*')
		.single();
	if (error) fail('Could not save settings', error);
	return toSettings(data);
}
