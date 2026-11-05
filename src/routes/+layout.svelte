<script lang="ts">
	import '@fontsource-variable/jost';
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Wyndow</title>
</svelte:head>

{@render children()}
