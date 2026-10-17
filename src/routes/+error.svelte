<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
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
	<div class="brand" role="img" aria-label="Wyndow"><Logo /><span class="brand-word" aria-hidden="true">WYND<span class="hal">O</span>W</span></div>
	<p class="readout">{page.status}</p>
	<p class="label">{message}</p>
	<a class="btn" href="/season">Back to season</a>
</main>
