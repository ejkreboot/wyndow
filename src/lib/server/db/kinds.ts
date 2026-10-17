import type { Kind } from '$lib/planner/types';
import { minutesToTime, toKind } from './mappers';
import { fail, type Db, type Update } from './types';

export type KindInput = Omit<Kind, 'id' | 'builtin' | 'sort'> & { sort?: number };

export async function listKinds(db: Db): Promise<Kind[]> {
	const { data, error } = await db.from('kinds').select('*').order('sort').order('name');
	if (error) fail('Could not load kinds', error);
	return data.map(toKind);
}

function toRow(k: Partial<KindInput>) {
	const row: Update<'kinds'> = {};
	if (k.name !== undefined) row.name = k.name;
	if (k.color !== undefined) row.color = k.color;
	if (k.focusHours !== undefined) row.focus_hours = k.focusHours;
	if (k.focusStart !== undefined) row.focus_start = k.focusStart === null ? null : minutesToTime(k.focusStart);
	if (k.schoolMode !== undefined) row.school_mode = k.schoolMode;
	if (k.nextDayKindId !== undefined) row.next_day_kind_id = k.nextDayKindId;
	if (k.sort !== undefined) row.sort = k.sort;
	return row;
}

export async function createKind(db: Db, input: KindInput): Promise<Kind> {
	const { data, error } = await db
		.from('kinds')
		.insert({ ...toRow(input), name: input.name })
		.select('*')
		.single();
	if (error) fail('Could not create kind', error);
	return toKind(data);
}

export async function updateKind(db: Db, id: string, patch: Partial<KindInput>): Promise<Kind> {
	const { data, error } = await db.from('kinds').update(toRow(patch)).eq('id', id).select('*').single();
	if (error) fail('Could not update kind', error);
	return toKind(data);
}

/** Deletes a user kind. Its rules cascade, returning those titles to the inbox. Built-ins are protected. */
export async function deleteKind(db: Db, id: string): Promise<void> {
	const { error } = await db.from('kinds').delete().eq('id', id).is('builtin', null);
	if (error) fail('Could not delete kind', error);
}
