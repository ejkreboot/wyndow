import type { Rule } from '$lib/planner/types';
import { toRule } from './mappers';
import { fail, type Db, type Update } from './types';

export type RuleInput = Omit<Rule, 'id'>;

export async function listRules(db: Db): Promise<Rule[]> {
	const { data, error } = await db.from('rules').select('*').order('priority', { ascending: false });
	if (error) fail('Could not load rules', error);
	return data.map(toRule);
}

export async function createRule(db: Db, input: RuleInput): Promise<Rule> {
	const { data, error } = await db
		.from('rules')
		.insert({
			source_id: input.sourceId,
			match: input.match,
			pattern: input.pattern,
			kind_id: input.kindId,
			priority: input.priority
		})
		.select('*')
		.single();
	if (error) fail('Could not create rule', error);
	return toRule(data);
}

export async function updateRule(db: Db, id: string, patch: Partial<RuleInput>): Promise<Rule> {
	const row: Update<'rules'> = {};
	if (patch.sourceId !== undefined) row.source_id = patch.sourceId;
	if (patch.match !== undefined) row.match = patch.match;
	if (patch.pattern !== undefined) row.pattern = patch.pattern;
	if (patch.kindId !== undefined) row.kind_id = patch.kindId;
	if (patch.priority !== undefined) row.priority = patch.priority;
	const { data, error } = await db.from('rules').update(row).eq('id', id).select('*').single();
	if (error) fail('Could not update rule', error);
	return toRule(data);
}

export async function deleteRule(db: Db, id: string): Promise<void> {
	const { error } = await db.from('rules').delete().eq('id', id);
	if (error) fail('Could not delete rule', error);
}
