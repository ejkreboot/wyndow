<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { focusOnMount } from '#lib/focus.js';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();

	let busy = $state(false);
	let changingEmail = $state(false);
	let resent = $state(false);

	const codeStep = $derived(!!form?.sent && !changingEmail);
	const email = $derived(form?.email ?? '');

	const submit =
		(kind: 'send' | 'resend' | 'verify'): SubmitFunction =>
		() => {
			busy = true;
			resent = false;
			return async ({ result, update }) => {
				await update({ reset: false });
				busy = false;
				if (kind !== 'verify' && result.type === 'success') changingEmail = false;
				if (kind === 'resend' && result.type === 'success') resent = true;
			};
		};
</script>

<main class="airlock">
	<div class="airlock__door">
		<div class="airlock__port" aria-hidden="true"><span></span></div>
		<span class="wordmark">Wyndow</span>

		{#if codeStep}
			<form class="form" method="POST" action="?/verify" use:enhance={submit('verify')}>
				<p class="airlock__note">
					If <strong>{email}</strong> is on the list, a sign-in code is on its way.
				</p>
				<input type="hidden" name="email" value={email} />
				<label class="label" for="token">Code</label>
				<input
					id="token"
					class="field field--code"
					name="token"
					inputmode="numeric"
					autocomplete="one-time-code"
					pattern="[0-9 ]*"
					maxlength="12"
					required
					use:focusOnMount
				/>
				<button class="button button--primary button--block" disabled={busy}>
					{busy ? 'Checking…' : 'Sign in'}
				</button>
			</form>

			<div class="airlock__links">
				<form method="POST" action="?/send" use:enhance={submit('resend')}>
					<input type="hidden" name="email" value={email} />
					<button class="button button--quiet button--small" disabled={busy}>
						{resent ? 'Code sent again' : 'Resend code'}
					</button>
				</form>
				<button class="button button--quiet button--small" onclick={() => (changingEmail = true)}>
					Different email
				</button>
			</div>
		{:else}
			<form class="form" method="POST" action="?/send" use:enhance={submit('send')}>
				<label class="label" for="email">Email</label>
				<input
					id="email"
					class="field"
					name="email"
					type="email"
					autocomplete="email"
					required
					value={email}
					use:focusOnMount
				/>
				<button class="button button--primary button--block" disabled={busy}>
					{busy ? 'Sending…' : 'Email me a code'}
				</button>
			</form>
		{/if}

		{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
	</div>
</main>
