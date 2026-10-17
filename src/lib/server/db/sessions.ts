import type { FocusSession, LocalDate } from '$lib/planner/types';
import { toSession } from './mappers';
import { fail, type Db } from './types';

/** Starts a session, ending any open one first (at most one is open per user). */
export async function startSession(db: Db, projectId: string, day: LocalDate): Promise<FocusSession> {
	const { error: endErr } = await db
		.from('focus_sessions')
		.update({ ended_at: new Date().toISOString() })
		.is('ended_at', null);
	if (endErr) fail('Could not end the open session', endErr);
	const { data, error } = await db
		.from('focus_sessions')
		.insert({ project_id: projectId, day })
		.select('*')
		.single();
	if (error) fail('Could not start session', error);
	return toSession(data);
}

export async function endSession(db: Db, id: string, note: string | null): Promise<FocusSession> {
	const trimmed = note?.trim() ? note.trim().slice(0, 2000) : null;
	const { data, error } = await db
		.from('focus_sessions')
		.update({ ended_at: new Date().toISOString(), note: trimmed })
		.eq('id', id)
		.select('*')
		.single();
	if (error) fail('Could not end session', error);
	return toSession(data);
}

export async function activeSession(db: Db): Promise<FocusSession | null> {
	const { data, error } = await db.from('focus_sessions').select('*').is('ended_at', null).maybeSingle();
	if (error) fail('Could not load active session', error);
	return data ? toSession(data) : null;
}

/** Most recent non-empty note per project ("where you left off"). */
export async function latestNotes(db: Db): Promise<Record<string, string>> {
	const { data, error } = await db
		.from('focus_sessions')
		.select('project_id,note,started_at')
		.not('note', 'is', null)
		.order('started_at', { ascending: false })
		.limit(1000);
	if (error) fail('Could not load session notes', error);
	const out: Record<string, string> = {};
	for (const r of data) if (r.note && !(r.project_id in out)) out[r.project_id] = r.note;
	return out;
}
