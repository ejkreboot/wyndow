import { deserialize } from '$app/forms';

/** Calls a form action on the home page without a <form>. Throws with the action's message on failure. */
export async function act(action: string, fields: Record<string, string | boolean | null | undefined> = {}) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		if (value !== undefined && value !== null) body.set(key, String(value));
	}
	const res = await fetch(`/?/${action}`, {
		method: 'POST',
		body,
		headers: { 'x-sveltekit-action': 'true' }
	});
	const result = deserialize(await res.text());
	if (result.type === 'failure') {
		const data = result.data as { message?: string; feedMessage?: string } | undefined;
		throw new Error(data?.message ?? data?.feedMessage ?? 'Something went wrong.');
	}
	if (result.type === 'error') throw new Error(result.error?.message ?? 'Something went wrong.');
	if (result.type === 'redirect') window.location.href = result.location;
	return result.type === 'success' ? (result.data ?? {}) : {};
}
