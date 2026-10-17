import { describe, expect, it } from 'vitest';
import { parseLabels } from '$lib/projects/issues';

describe('github label parsing', () => {
	it('parses size and depth labels from API label objects', () => {
		expect(parseLabels([{ name: 'size:5' }, { name: 'shallow' }])).toEqual({ size: 5, depth: 'shallow' });
	});
	it('falls back to size 1', () => {
		expect(parseLabels([{ name: 'enhancement' }])).toEqual({ size: 1, depth: null });
	});
});
