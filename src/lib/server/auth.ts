import { timingSafeEqual } from 'node:crypto';
import { serverEnv } from './env';

const FALLBACK = '/season';

/** Returns `next` only if it is a same-origin relative path; otherwise '/season'. */
export function safeNext(next: string | null | undefined): string {
	if (!next) return FALLBACK;
	if (!next.startsWith('/')) return FALLBACK;
	if (next.startsWith('//') || next.startsWith('/\\')) return FALLBACK;
	// control characters, backslashes or whitespace could be normalised by browsers into '//'
	if (/[\u0000-\u001f\u007f\\]/.test(next)) return FALLBACK;
	return next;
}

/** Constant-time string comparison; false (not throw) on length mismatch. */
export function timingSafeEqualStr(a: string, b: string): boolean {
	const enc = new TextEncoder();
	const x = enc.encode(a);
	const y = enc.encode(b);
	if (x.length !== y.length) return false;
	return timingSafeEqual(x, y);
}

export function isAllowedEmail(email: string | null | undefined): boolean {
	if (!email) return false;
	return serverEnv().ALLOWED_EMAILS.has(email.trim().toLowerCase());
}
