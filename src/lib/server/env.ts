import { env } from '$env/dynamic/private';
import { z } from 'zod';

const schema = z.object({
	SUPABASE_URL: z.url(),
	SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
	SUPABASE_SECRET_KEY: z.string().min(1).optional(),
	ALLOWED_EMAILS: z.string().min(1),
	CRON_SECRET: z.string().min(16).optional(),
	GITHUB_TOKEN: z.string().min(1).optional()
});

export interface ServerEnv {
	SUPABASE_URL: string;
	SUPABASE_PUBLISHABLE_KEY: string;
	SUPABASE_SECRET_KEY: string | undefined;
	ALLOWED_EMAILS: Set<string>;
	CRON_SECRET: string | undefined;
	GITHUB_TOKEN: string | undefined;
}

let cached: ServerEnv | undefined;

/** Validated server environment, parsed on first use. Throws a generic error naming only the bad keys. */
export function serverEnv(): ServerEnv {
	if (cached) return cached;
	const blank = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : undefined);
	const parsed = schema.safeParse({
		SUPABASE_URL: blank(env.SUPABASE_URL),
		SUPABASE_PUBLISHABLE_KEY: blank(env.SUPABASE_PUBLISHABLE_KEY),
		SUPABASE_SECRET_KEY: blank(env.SUPABASE_SECRET_KEY),
		ALLOWED_EMAILS: blank(env.ALLOWED_EMAILS),
		CRON_SECRET: blank(env.CRON_SECRET),
		GITHUB_TOKEN: blank(env.GITHUB_TOKEN)
	});
	if (!parsed.success) {
		const keys = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))].join(', ');
		throw new Error(`Invalid server environment: ${keys}`);
	}
	const v = parsed.data;
	cached = {
		SUPABASE_URL: v.SUPABASE_URL,
		SUPABASE_PUBLISHABLE_KEY: v.SUPABASE_PUBLISHABLE_KEY,
		SUPABASE_SECRET_KEY: v.SUPABASE_SECRET_KEY,
		ALLOWED_EMAILS: new Set(
			v.ALLOWED_EMAILS.split(',')
				.map((e) => e.trim().toLowerCase())
				.filter(Boolean)
		),
		CRON_SECRET: v.CRON_SECRET,
		GITHUB_TOKEN: v.GITHUB_TOKEN
	};
	return cached;
}
