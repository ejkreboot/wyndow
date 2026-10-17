import { error, fail } from '@sveltejs/kit';
import { failLoad } from '$lib/server/errors';
import { z } from 'zod';
import { parseTime } from '$lib/planner';
import type { IsoWeekday } from '$lib/planner';
import { BLOCK_HOURS, isValidTimezone, normalizeFeedInput, unmatchedTitles } from '$lib/settings/helpers';
import * as repo from '$lib/server/db';
import { FeedError, syncSourceAsUser, validateFeedUrl } from '$lib/server/sync';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const db = locals.supabase;
	try {
		let [settings, kinds] = await Promise.all([repo.getSettings(db), repo.listKinds(db)]);
		if (!kinds.some((k) => k.builtin)) {
			await repo.ensureDefaults(db);
			[settings, kinds] = await Promise.all([repo.getSettings(db), repo.listKinds(db)]);
		}
		const [rules, sources, titles] = await Promise.all([
			repo.listRules(db),
			repo.listSources(db),
			repo.distinctTitles(db, settings.timezone)
		]);
		return { settings, kinds, rules, sources, inbox: unmatchedTitles(titles, rules) };
	} catch (e) {
		failLoad('Could not load your settings.', e);
	}
};

// ---------- validation ----------

const id = z.uuid();
const name = z.string().trim().min(1, 'Enter a name.').max(60, 'Names can be up to 60 characters.');
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a color.');
const hours = z.coerce
	.number()
	.min(0, 'Focus hours must be between 0 and 16.')
	.max(16, 'Focus hours must be between 0 and 16.')
	.refine((n) => (n * 2) % 1 === 0, 'Focus hours go in steps of 0.5.');
const timeField = z
	.string()
	.trim()
	.regex(/^(?:[01]?\d|2[0-3]):[0-5]\d$/, 'Enter a time like 11:00.')
	.or(z.literal(''));
const pattern = z.string().trim().min(1, 'Enter a pattern.').max(200, 'Patterns can be up to 200 characters.');

function fields(form: FormData): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of form.entries()) if (typeof v === 'string') out[k] = v;
	return out;
}

function firstIssue(e: z.ZodError): string {
	return e.issues[0]?.message && !e.issues[0].message.startsWith('Invalid')
		? e.issues[0].message
		: 'Check the highlighted fields and try again.';
}

type Section = 'sources' | 'inbox' | 'planning' | 'kinds' | 'rules';

/** Parses the form with `schema` or returns a 400 failure. */
async function read<T extends z.ZodType>(
	request: Request,
	schema: T,
	section: Section
): Promise<{ data: z.infer<T> } | { failure: ReturnType<typeof fail> }> {
	const parsed = schema.safeParse(fields(await request.formData()));
	if (!parsed.success) return { failure: fail(400, { section, error: firstIssue(parsed.error) }) };
	return { data: parsed.data };
}

async function attempt(section: Section, message: string, fn: () => Promise<unknown>) {
	try {
		await fn();
		return { section, ok: true as const };
	} catch {
		return fail(500, { section, error: message });
	}
}

const kindFields = {
	focusHours: hours,
	focusStart: timeField,
	schoolMode: z.enum(['live', 'async'])
};

export const actions = {
	addSource: async ({ request, locals }) => {
		const r = await read(
			request,
			z.object({ name, url: z.string().max(2000, 'That URL is too long.') }),
			'sources'
		);
		if ('failure' in r) return r.failure;
		const url = normalizeFeedInput(r.data.url);
		try {
			validateFeedUrl(url);
		} catch (e) {
			return fail(400, { section: 'sources', error: e instanceof FeedError ? e.message : 'The calendar URL is not valid.' });
		}
		let sourceId: string;
		try {
			sourceId = await repo.createSource(locals.supabase, { name: r.data.name, url });
		} catch {
			return fail(500, { section: 'sources', error: 'Could not add the calendar.' });
		}
		const sync = await syncSourceAsUser(locals.supabase, sourceId);
		if (!sync.ok) {
			return fail(400, { section: 'sources', error: `Calendar added, but the first sync failed: ${sync.error}` });
		}
		return { section: 'sources', ok: true as const, message: `Synced ${sync.count} events.` };
	},

	syncSource: async ({ request, locals }) => {
		const r = await read(request, z.object({ id }), 'sources');
		if ('failure' in r) return r.failure;
		const sync = await syncSourceAsUser(locals.supabase, r.data.id);
		if (!sync.ok) return fail(400, { section: 'sources', error: sync.error });
		return { section: 'sources', ok: true as const, message: `Synced ${sync.count} events.` };
	},

	deleteSource: async ({ request, locals }) => {
		const r = await read(request, z.object({ id }), 'sources');
		if ('failure' in r) return r.failure;
		return attempt('sources', 'Could not delete the calendar.', () => repo.deleteSource(locals.supabase, r.data.id));
	},

	assignKind: async ({ request, locals }) => {
		const r = await read(request, z.object({ title: pattern, kindId: id }), 'inbox');
		if ('failure' in r) return r.failure;
		return attempt('inbox', 'Could not create the rule.', () =>
			repo.createRule(locals.supabase, {
				sourceId: null,
				match: 'equals',
				pattern: r.data.title,
				kindId: r.data.kindId,
				priority: 0
			})
		);
	},

	newKindForTitle: async ({ request, locals }) => {
		const r = await read(request, z.object({ title: pattern, name, color }), 'inbox');
		if ('failure' in r) return r.failure;
		return attempt('inbox', 'Could not create the kind.', async () => {
			const kind = await repo.createKind(locals.supabase, {
				name: r.data.name,
				color: r.data.color,
				focusHours: 0,
				focusStart: null,
				schoolMode: 'live',
				nextDayKindId: null
			});
			await repo.createRule(locals.supabase, {
				sourceId: null,
				match: 'equals',
				pattern: r.data.title,
				kindId: kind.id,
				priority: 0
			});
		});
	},

	savePlanning: async ({ request, locals }) => {
		const form = await request.formData();
		const parsed = z
			.object({
				blockHours: z.coerce.number().refine((n) => (BLOCK_HOURS as readonly number[]).includes(n), 'Pick a block length from the list.'),
				chunkMinHours: z.coerce.number().int('Use a whole number of hours.').min(1, 'Minimum hours must be 1 to 8.').max(8, 'Minimum hours must be 1 to 8.'),
				timezone: z.string().trim().refine(isValidTimezone, 'That timezone is not recognized. Use a name like America/Detroit.'),
				schoolDays: z.array(z.coerce.number().int().min(1).max(7)).max(7)
			})
			.safeParse({
				blockHours: form.get('blockHours'),
				chunkMinHours: form.get('chunkMinHours'),
				timezone: form.get('timezone'),
				schoolDays: form.getAll('schoolDay')
			});
		if (!parsed.success) return fail(400, { section: 'planning', error: firstIssue(parsed.error) });
		const schoolDays = [...new Set(parsed.data.schoolDays)].sort() as IsoWeekday[];
		return attempt('planning', 'Could not save your planning settings.', () =>
			repo.updateSettings(locals.supabase, { ...parsed.data, schoolDays })
		);
	},

	saveKind: async ({ request, locals }) => {
		const r = await read(
			request,
			z.object({
				id,
				...kindFields,
				name: name.optional(),
				color: color.optional(),
				nextDayKindId: z.union([id, z.literal('')]).optional()
			}),
			'kinds'
		);
		if ('failure' in r) return r.failure;
		const d = r.data;
		const db = locals.supabase;
		try {
			const kinds = await repo.listKinds(db);
			const kind = kinds.find((k) => k.id === d.id);
			if (!kind) return fail(404, { section: 'kinds', error: 'That kind no longer exists.' });
			const patch: Parameters<typeof repo.updateKind>[2] = {
				focusHours: d.focusHours,
				focusStart: d.focusStart === '' ? null : parseTime(d.focusStart),
				schoolMode: d.schoolMode
			};
			if (!kind.builtin) {
				if (d.name) patch.name = d.name;
				if (d.color) patch.color = d.color;
				const next = d.nextDayKindId || null;
				if (next === kind.id || (next && !kinds.some((k) => k.id === next))) {
					return fail(400, { section: 'kinds', error: 'Pick a different kind for the next day.' });
				}
				patch.nextDayKindId = next;
			}
			await repo.updateKind(db, d.id, patch);
			return { section: 'kinds', ok: true as const };
		} catch {
			return fail(500, { section: 'kinds', error: 'Could not save the kind.' });
		}
	},

	addKind: async ({ request, locals }) => {
		const r = await read(request, z.object({ name, color, ...kindFields }), 'kinds');
		if ('failure' in r) return r.failure;
		const d = r.data;
		return attempt('kinds', 'Could not add the kind.', () =>
			repo.createKind(locals.supabase, {
				name: d.name,
				color: d.color,
				focusHours: d.focusHours,
				focusStart: d.focusStart === '' ? null : parseTime(d.focusStart),
				schoolMode: d.schoolMode,
				nextDayKindId: null
			})
		);
	},

	deleteKind: async ({ request, locals }) => {
		const r = await read(request, z.object({ id }), 'kinds');
		if ('failure' in r) return r.failure;
		return attempt('kinds', 'Could not delete the kind.', () => repo.deleteKind(locals.supabase, r.data.id));
	},

	addRule: async ({ request, locals }) => {
		const r = await read(
			request,
			z.object({ pattern, match: z.enum(['equals', 'prefix']), kindId: id }),
			'rules'
		);
		if ('failure' in r) return r.failure;
		return attempt('rules', 'Could not add the rule.', () =>
			repo.createRule(locals.supabase, { sourceId: null, priority: 0, ...r.data })
		);
	},

	deleteRule: async ({ request, locals }) => {
		const r = await read(request, z.object({ id }), 'rules');
		if ('failure' in r) return r.failure;
		return attempt('rules', 'Could not delete the rule.', () => repo.deleteRule(locals.supabase, r.data.id));
	}
} satisfies Actions;
