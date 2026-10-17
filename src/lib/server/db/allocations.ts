import type { Allocation, Allocations, LocalDate } from '$lib/planner/types';
import { fail, type Db } from './types';

export async function listAllocations(
	db: Db,
	range: { from: LocalDate; to: LocalDate }
): Promise<Allocations> {
	const { data, error } = await db
		.from('block_allocations')
		.select('day,block_index,project_id')
		.gte('day', range.from)
		.lte('day', range.to)
		.order('day')
		.order('block_index');
	if (error) fail('Could not load allocations', error);
	const out: Allocations = {};
	for (const r of data) {
		const a = (out[r.day] ??= []);
		while (a.length <= r.block_index) a.push(null);
		a[r.block_index] = r.project_id;
	}
	return out;
}

/** Atomically replaces all rows for each given day with its non-null entries. */
export async function setAllocations(db: Db, allocs: Allocations): Promise<void> {
	const p: Record<LocalDate, (string | null)[]> = {};
	for (const [day, alloc] of Object.entries(allocs)) p[day] = alloc.slice(0, 16);
	const { error } = await db.rpc('set_allocations', { p });
	if (error) fail('Could not save allocations', error);
}

/** Atomically replaces all rows for a day with the non-null entries of alloc. */
export async function setDayAllocation(db: Db, day: LocalDate, alloc: Allocation): Promise<void> {
	await setAllocations(db, { [day]: alloc });
}
