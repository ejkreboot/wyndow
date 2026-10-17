<script lang="ts">
	import { page } from '$app/state';

	const known: Record<number, string> = {
		404: 'That page does not exist.',
		403: 'You do not have access to this page.'
	};
	const message = $derived(
		known[page.status] ?? (page.status >= 500 ? 'Something went wrong on our side.' : 'This request could not be completed.')
	);
</script>

<svelte:head>
	<title>{page.status} · Wyndow</title>
</svelte:head>

<main class="error-screen">
	<div class="brand" aria-label="Wyndow">WYND<span class="hal">O</span>W</div>
	<p class="readout">{page.status}</p>
	<p class="label">{message}</p>
	<a class="btn" href="/season">Back to season</a>
</main>
