import { ALLOWED_EMAILS } from '$app/env/private';

export const isAllowed = (email: string | undefined | null) =>
	!!email && ALLOWED_EMAILS.includes(email.toLowerCase());
