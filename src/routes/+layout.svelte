<script lang="ts">
	import '@fontsource/jost/200.css';
	import '@fontsource/jost/300.css';
	import '@fontsource/jost/400.css';
	import '@fontsource/jost/500.css';
	import '@fontsource/michroma/400.css';
	import '@fontsource/ibm-plex-mono/300.css';
	import '@fontsource/ibm-plex-mono/400.css';
	import '../app.css';
	import Logo from '$lib/components/Logo.svelte';
	import { page } from '$app/state';

	let { data, children } = $props();

	const nav = [
		{ href: '/season', label: 'Season' },
		{ href: '/day', label: 'Day' },
		{ href: '/projects', label: 'Projects' },
		{ href: '/settings', label: 'Settings' }
	];

	const signedIn = $derived(data.email != null && page.route.id !== '/login');
	const path = $derived(page.url.pathname);
	const isActive = (href: string) => path === href || path.startsWith(href + '/');
</script>

<div class="chrome">
	<div class="screen">
		{#if signedIn}
			<header class="topbar">
				<a class="brand" href="/season" aria-label="Wyndow"><Logo /><span class="brand-word" aria-hidden="true">WYND<span class="hal">O</span>W</span></a>
				{#if data.nextChunk}
					<a class="next-chunk" href={data.nextChunk.href}>{data.nextChunk.label}</a>
				{/if}
				<nav class="topnav" aria-label="Main">
					{#each nav as item (item.href)}
						<a href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}
							>{item.label}</a
						>
					{/each}
				</nav>
				<form class="signout" method="POST" action="/logout">
					<button class="btn-ghost" type="submit">Sign out</button>
				</form>
			</header>
		{/if}
		{@render children()}
	</div>
</div>
