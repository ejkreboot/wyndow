import { defineEnvVars } from '@sveltejs/kit/env';

const required = (name: string) => (value: string | undefined) => {
	if (!value) throw new Error(`${name} is not set. See .env.example.`);
	return value;
};

export const variables = defineEnvVars({
	SUPABASE_URL: { schema: required('SUPABASE_URL'), description: 'Supabase project URL' },
	SUPABASE_PUBLISHABLE_KEY: {
		schema: required('SUPABASE_PUBLISHABLE_KEY'),
		description: 'Supabase publishable key (used server-side with the user session)'
	},
	SUPABASE_SECRET_KEY: {
		schema: required('SUPABASE_SECRET_KEY'),
		description: 'Supabase secret key, used only by the feed-refresh cron'
	},
	ALLOWED_EMAILS: {
		schema: (value) => {
			const list = (value ?? '')
				.split(',')
				.map((e) => e.trim().toLowerCase())
				.filter(Boolean);
			if (list.length === 0) throw new Error('ALLOWED_EMAILS must list at least one email.');
			return list;
		},
		description: 'Comma-separated emails allowed to sign in'
	},
	CRON_SECRET: {
		schema: (value) => (value && value.length >= 16 ? value : undefined),
		description: 'Bearer token for the Vercel cron that refreshes calendar feeds (16+ chars)'
	}
});
