<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let busy = $state(false);
</script>

<svelte:head>
	<title>Sign in · Wyndow</title>
</svelte:head>

<main class="login">
	<div class="login-brand brand" aria-label="Wyndow">WYND<span class="hal">O</span>W</div>
	<form
		class="login-form"
		method="POST"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update({ reset: false });
				busy = false;
			};
		}}
	>
		<input type="hidden" name="next" value={data.next} />
		<label class="field">
			<span class="label">Email</span>
			<input
				type="email"
				name="email"
				autocomplete="username"
				required
				maxlength="254"
				value={form?.email ?? ''}
			/>
		</label>
		<label class="field">
			<span class="label">Password</span>
			<input
				type="password"
				name="password"
				autocomplete="current-password"
				required
				maxlength="256"
			/>
		</label>
		{#if form?.error}
			<p class="notice notice-error" role="alert">{form.error}</p>
		{/if}
		<button class="btn" type="submit" disabled={busy}>{busy ? 'Signing in' : 'Sign in'}</button>
	</form>
</main>
