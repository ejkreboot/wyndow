import type { Rule } from './types';

/**
 * Find the rule that governs an event title.
 * Precedence: equals beats prefix; then higher priority; then longer pattern;
 * then a source-specific rule beats a global one. Matching is case-sensitive
 * (calendar codes like WDp and WDP can mean different things).
 */
export function matchRule(title: string, sourceId: string | null, rules: readonly Rule[]): Rule | null {
	const text = title.trim();
	let best: Rule | null = null;
	for (const rule of rules) {
		if (rule.sourceId !== null && rule.sourceId !== sourceId) continue;
		const hit = rule.match === 'equals' ? text === rule.pattern : text.startsWith(rule.pattern);
		if (!hit) continue;
		if (best === null || outranks(rule, best)) best = rule;
	}
	return best;
}

function outranks(a: Rule, b: Rule): boolean {
	if (a.match !== b.match) return a.match === 'equals';
	if (a.priority !== b.priority) return a.priority > b.priority;
	if (a.pattern.length !== b.pattern.length) return a.pattern.length > b.pattern.length;
	return a.sourceId !== null && b.sourceId === null;
}
