<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		label,
		wide = false,
		children
	}: { open: boolean; label: string; wide?: boolean; children: Snippet } = $props();

	let dialog: HTMLDialogElement | undefined = $state();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	class="modal"
	class:modal--wide={wide}
	aria-label={label}
	onclose={() => (open = false)}
	onclick={(e) => {
		if (e.target === dialog) open = false;
	}}
>
	{#if open}
		<div class="modal__body">
			<header class="modal__head">
				<span class="label">{label}</span>
				<button type="button" class="icon-button" aria-label="Close" onclick={() => (open = false)}>
					<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
				</button>
			</header>
			{@render children()}
		</div>
	{/if}
</dialog>
