import { fail, type Db } from './types';

/** Idempotently creates the signed-in user's settings, built-in kinds, and Family project. */
export async function ensureDefaults(db: Db): Promise<void> {
	const { error } = await db.rpc('ensure_defaults');
	if (error) fail('Could not initialise your account', error);
}
