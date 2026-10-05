<script lang="ts">
	let { onSignedIn }: { onSignedIn: () => void | Promise<void> } = $props();
	let email = $state('');
	let code = $state('');
	let sent = $state(false);
	let busy = $state(false);
	let failure = $state('');
	let message = $state('');
	async function submit() {
		busy = true;
		failure = '';
		message = '';
		try {
			const response = await fetch('/api/rehab/session', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					email,
					mode: sent ? 'verify' : 'send-code',
					...(sent ? { code } : {})
				})
			});
			const data = await response.json();
			if (!response.ok)
				throw new Error(data.message || 'Sign-in is temporarily unavailable. Please try again.');
			if (data.signedIn) {
				code = '';
				await onSignedIn();
			} else {
				sent = true;
				message = data.message;
			}
		} catch (e) {
			failure = (e as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<form
	class="surface auth-panel"
	onsubmit={(e) => {
		e.preventDefault();
		void submit();
	}}
>
	<p class="eyebrow">YOUR PRIVATE WORKSPACE</p>
	<h2>{sent ? 'Check your email.' : 'Sign in without a password.'}</h2>
	<p class="muted">
		{sent
			? 'Enter the sign-in code from your email.'
			: 'Use your workspace email. We’ll send you a one-time sign-in code.'}
	</p>
	<label
		>Email<input
			type="email"
			autocomplete="email"
			bind:value={email}
			readonly={sent}
			required
		/></label
	>
	{#if sent}<label
			>Sign-in code<input
				type="text"
				inputmode="numeric"
				autocomplete="one-time-code"
				pattern={'[0-9]{6,10}'}
				minlength="6"
				maxlength="10"
				bind:value={code}
				required
			/></label
		>{/if}
	{#if failure}<p class="notice error" role="alert">{failure}</p>{/if}
	{#if message}<p class="notice" role="status">{message}</p>{/if}
	<div class="button-row">
		<button class="primary-button" disabled={busy}
			>{busy ? 'Please wait…' : sent ? 'Open workspace' : 'Send sign-in code'}</button
		>
		{#if sent}<button
				type="button"
				class="secondary-button"
				disabled={busy}
				onclick={() => {
					sent = false;
					code = '';
					message = '';
					failure = '';
				}}>Use another email / resend</button
			>{/if}
	</div>
</form>

<style>
	input {
		width: 100%;
		background: white;
		color: var(--ink);
		border: 1px solid var(--border);
		border-radius: 6px;
		min-height: 44px;
		padding: 12px;
	}
	.primary-button {
		color: white;
	}
	.button-row {
		flex-wrap: wrap;
	}
</style>
