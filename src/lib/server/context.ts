import { buildDays, zonedParts } from '$lib/planner';
import type {
	Allocations,
	CalEvent,
	Days,
	Kind,
	LocalDate,
	Minutes,
	Project,
	Rule,
	Settings
} from '$lib/planner';
import * as repo from './db';

/** Everything a planner view needs for a date range, loaded as the signed-in user (RLS applies). */
export interface PlannerContext {
	settings: Settings;
	kinds: Kind[];
	rules: Rule[];
	events: CalEvent[];
	projects: Project[];
	allocations: Allocations;
	days: Days;
	familyIds: string[];
	today: LocalDate;
	nowMinutes: Minutes;
	range: { from: LocalDate; to: LocalDate };
}

/**
 * Loads settings, kinds, rules, events, projects, and allocations for `range`, and builds the
 * per-day plans. Creates the account defaults on first use. `days` is a Map, which SvelteKit
 * serializes to the browser intact (devalue supports Map and Date).
 */
export async function loadPlannerContext(
	locals: App.Locals,
	range: { from: LocalDate; to: LocalDate }
): Promise<PlannerContext> {
	const db = locals.supabase;

	let [settings, kinds, rules, events, projects, allocations] = await Promise.all([
		repo.getSettings(db),
		repo.listKinds(db),
		repo.listRules(db),
		repo.listEvents(db, range),
		repo.listProjects(db),
		repo.listAllocations(db, range)
	]);

	if (!kinds.some((k) => k.builtin)) {
		await repo.ensureDefaults(db);
		[settings, kinds, projects] = await Promise.all([
			repo.getSettings(db),
			repo.listKinds(db),
			repo.listProjects(db)
		]);
	}

	const days = buildDays({ from: range.from, to: range.to, events, rules, kinds, settings });
	const { date: today, minutes: nowMinutes } = zonedParts(new Date(), settings.timezone);
	const familyIds = projects.filter((p) => p.area === 'family').map((p) => p.id);

	return {
		settings,
		kinds,
		rules,
		events,
		projects,
		allocations,
		days,
		familyIds,
		today,
		nowMinutes,
		range
	};
}
