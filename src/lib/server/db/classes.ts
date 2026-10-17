import type { SchoolClass } from '$lib/planner/types';
import { toClass } from './mappers';
import { fail, type Db, type Update } from './types';

export type ClassInput = Omit<SchoolClass, 'id' | 'sort' | 'packetsReady'> &
	Partial<Pick<SchoolClass, 'sort' | 'packetsReady'>>;

function toRow(c: Partial<ClassInput>) {
	const row: Update<'classes'> = {};
	if (c.name !== undefined) row.name = c.name;
	if (c.student !== undefined) row.student = c.student;
	if (c.wyrkbookRef !== undefined) row.wyrkbook_ref = c.wyrkbookRef;
	if (c.currentUnit !== undefined) row.current_unit = c.currentUnit;
	if (c.packetsReady !== undefined) row.packets_ready = c.packetsReady;
	if (c.sort !== undefined) row.sort = c.sort;
	return row;
}

export async function listClasses(db: Db): Promise<SchoolClass[]> {
	const { data, error } = await db.from('classes').select('*').order('sort').order('name');
	if (error) fail('Could not load classes', error);
	return data.map(toClass);
}

export async function createClass(db: Db, input: ClassInput): Promise<SchoolClass> {
	const { data, error } = await db
		.from('classes')
		.insert({ ...toRow(input), name: input.name, student: input.student })
		.select('*')
		.single();
	if (error) fail('Could not create class', error);
	return toClass(data);
}

export async function updateClass(db: Db, id: string, patch: Partial<ClassInput>): Promise<SchoolClass> {
	const { data, error } = await db.from('classes').update(toRow(patch)).eq('id', id).select('*').single();
	if (error) fail('Could not update class', error);
	return toClass(data);
}

export async function deleteClass(db: Db, id: string): Promise<void> {
	const { error } = await db.from('classes').delete().eq('id', id);
	if (error) fail('Could not delete class', error);
}
