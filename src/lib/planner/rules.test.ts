import { describe, expect, it } from 'vitest';
import { matchRule } from './rules';
import { rule } from './testing';

describe('matchRule', () => {
	it('returns null when nothing matches', () => {
		expect(matchRule('WDo', 's1', [rule('WDp', 'work')])).toBeNull();
		expect(matchRule('WDo', 's1', [])).toBeNull();
	});
	it('equals is exact and case-sensitive', () => {
		const rules = [rule('WDp', 'work')];
		expect(matchRule('WDp', 's1', rules)?.kindId).toBe('work');
		expect(matchRule('WDP', 's1', rules)).toBeNull();
		expect(matchRule('WDp extra', 's1', rules)).toBeNull();
	});
	it('prefix matches the start of the title', () => {
		const rules = [rule('WD', 'work', { match: 'prefix' })];
		expect(matchRule('WDp', 's1', rules)?.kindId).toBe('work');
		expect(matchRule('xWD', 's1', rules)).toBeNull();
	});
	it('equals beats prefix even with lower priority and shorter pattern', () => {
		const rules = [rule('WDp', 'prefix', { match: 'prefix', priority: 9 }), rule('WDp', 'equals')];
		expect(matchRule('WDp', 's1', rules)?.kindId).toBe('equals');
	});
	it('higher priority wins among the same match type', () => {
		const rules = [rule('WD', 'low', { match: 'prefix' }), rule('WDp', 'high', { match: 'prefix', priority: 1 })];
		expect(matchRule('WDp', 's1', rules)?.kindId).toBe('high');
		const flipped = [rule('WDp', 'longer', { match: 'prefix' }), rule('WD', 'prio', { match: 'prefix', priority: 5 })];
		expect(matchRule('WDp', 's1', flipped)?.kindId).toBe('prio');
	});
	it('longer pattern wins at equal priority', () => {
		const rules = [rule('W', 'short', { match: 'prefix' }), rule('WDp', 'long', { match: 'prefix' })];
		expect(matchRule('WDp1', 's1', rules)?.kindId).toBe('long');
	});
	it('source-specific beats global when otherwise tied', () => {
		const rules = [rule('WDp', 'global'), rule('WDp', 'mine', { sourceId: 's1' })];
		expect(matchRule('WDp', 's1', rules)?.kindId).toBe('mine');
		expect(matchRule('WDp', 's2', rules)?.kindId).toBe('global');
	});
	it('ignores rules scoped to another source', () => {
		expect(matchRule('WDp', 's1', [rule('WDp', 'other', { sourceId: 's2' })])).toBeNull();
	});
});
