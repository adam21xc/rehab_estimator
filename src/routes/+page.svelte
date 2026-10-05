<script lang="ts">
	let dryResult: unknown = null;
	let sendResult: unknown = null;
	let scanResult: unknown = null;
	let gmailResult: unknown = null;
	let sendSecret = '';
	let scanSecret = '';

	// Inputs for the Gmail test endpoint
	let toEmail: string = '';
	let testSubject: string = 'Test email from SvelteKit';
	let testMessage: string = 'Hello, this is a test from the admin page.';

	async function dryRun() {
		dryResult = await (
			await fetch('/api/send-due?dry=1', {
				method: 'POST',
				headers: { Authorization: `Bearer ${sendSecret}` }
			})
		).json();
	}
	async function sendDue() {
		sendResult = await (
			await fetch('/api/send-due', {
				method: 'POST',
				headers: { Authorization: `Bearer ${sendSecret}` }
			})
		).json();
	}
	async function scanReplies() {
		scanResult = await (
			await fetch('/api/scan-replies', {
				method: 'POST',
				headers: { Authorization: `Bearer ${scanSecret}` }
			})
		).json();
	}

	async function gmailTest() {
		try {
			const res = await fetch('/api/gmail-test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sendSecret}` },
				body: JSON.stringify({
					to: toEmail || 'your@email.com',
					subject: testSubject,
					message: testMessage
				})
			});
			gmailResult = await res.json();
		} catch (err) {
			gmailResult = { ok: false, error: String(err) };
		}
	}
</script>

<svelte:head><title>Email outreach · Apex</title></svelte:head>
<main class="email-workspace">
	<div class="email-heading">
		<p class="eyebrow">COMMUNICATIONS</p>
		<h1>Email outreach</h1>
		<p class="muted">Preview scheduled outreach, send emails, and keep replies in sync.</p>
	</div>
	<section class="email-panel">
		<div class="panel-title">
			<span class="email-icon">✉</span>
			<div>
				<h2>Outreach controls</h2>
				<p class="muted small">Connect your admin access and manage delivery.</p>
			</div>
		</div>

		<div class="email-fields">
			<p>
				Enter the configured admin secrets to use outreach. They stay in this page's memory and are
				cleared on reload.
			</p>
			<label class="flex flex-col gap-1">
				<span>Send secret (SEND_DUE_SECRET)</span>
				<input
					class="border rounded px-3 py-2"
					type="password"
					autocomplete="off"
					bind:value={sendSecret}
				/>
			</label>
			<label class="flex flex-col gap-1">
				<span>Reply scan secret (SCAN_REPLIES_SECRET)</span>
				<input
					class="border rounded px-3 py-2"
					type="password"
					autocomplete="off"
					bind:value={scanSecret}
				/>
			</label>
			<label class="flex flex-col gap-1">
				<span class="text-sm font-medium">Test email recipient</span>
				<input
					class="border rounded px-3 py-2"
					type="email"
					bind:value={toEmail}
					placeholder="you@domain.com"
					aria-label="Gmail test recipient email"
				/>
			</label>

			<label class="flex flex-col gap-1">
				<span class="text-sm font-medium">Test subject</span>
				<input
					class="border rounded px-3 py-2"
					type="text"
					bind:value={testSubject}
					aria-label="Gmail test subject"
				/>
			</label>

			<label class="flex flex-col gap-1">
				<span class="text-sm font-medium">Test message</span>
				<!-- svelte-ignore element_invalid_self_closing_tag -->
				<textarea
					class="border rounded px-3 py-2"
					rows="3"
					bind:value={testMessage}
					aria-label="Gmail test message"
				/>
			</label>
		</div>
	</section>
	<div class="email-actions">
		<button class="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300" on:click={dryRun}
			>Dry Run (preview)</button
		>
		<button class="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700" on:click={sendDue}
			>Send Due</button
		>
		<button
			class="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700"
			on:click={scanReplies}>Scan Replies</button
		>
		<button
			class="px-4 py-2 rounded bg-purple-600 text-white hover:bg-purple-700"
			on:click={gmailTest}>Gmail Test</button
		>
	</div>

	{#if dryResult}
		<section class="border rounded p-4">
			<h2 class="font-medium mb-2">Dry Run</h2>
			<pre class="text-sm overflow-auto">{JSON.stringify(dryResult, null, 2)}</pre>
		</section>
	{/if}

	{#if sendResult}
		<section class="border rounded p-4">
			<h2 class="font-medium mb-2">Send Result</h2>
			<pre class="text-sm overflow-auto">{JSON.stringify(sendResult, null, 2)}</pre>
		</section>
	{/if}

	{#if scanResult}
		<section class="border rounded p-4">
			<h2 class="font-medium mb-2">Scan Replies</h2>
			<pre class="text-sm overflow-auto">{JSON.stringify(scanResult, null, 2)}</pre>
		</section>
	{/if}

	{#if gmailResult}
		<section class="border rounded p-4">
			<h2 class="font-medium mb-2">Gmail Test</h2>
			<pre class="text-sm overflow-auto">{JSON.stringify(gmailResult, null, 2)}</pre>
		</section>
	{/if}
</main>

<style>
	.email-workspace {
		max-width: 1200px;
		padding: 32px;
		margin: auto;
	}
	.email-heading {
		margin-bottom: 28px;
	}
	h1 {
		font-size: 30px;
		font-weight: 650;
		letter-spacing: -0.8px;
		margin: 7px 0 10px;
	}
	h2 {
		font-size: 18px;
		font-weight: 600;
	}
	.email-panel {
		background: white;
		border: 1px solid var(--border);
		border-radius: 10px;
		overflow: hidden;
	}
	.panel-title {
		display: flex;
		gap: 14px;
		align-items: center;
		padding: 22px 26px;
		border-bottom: 1px solid var(--border);
	}
	.email-icon {
		display: grid;
		place-items: center;
		width: 42px;
		height: 42px;
		background: #eee9ff;
		color: #7955c8;
		border-radius: 9px;
		font-size: 24px;
	}
	.email-fields {
		padding: 26px;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 20px;
		font-size: 13px;
	}
	.email-fields > p,
	.email-fields > label:last-child {
		grid-column: 1/-1;
	}
	.email-fields > p {
		background: #f0f5ff;
		color: #47608b;
		padding: 14px;
		border-radius: 6px;
		line-height: 1.6;
	}
	input,
	textarea {
		background: white;
		border: 1px solid var(--border);
		min-height: 44px;
		width: 100%;
		margin-top: 5px;
	}
	.email-actions {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		margin: 20px 0;
	}
	button {
		min-height: 44px;
		font-size: 13px;
	}
	section:not(.email-panel) {
		background: white;
		border-color: var(--border);
		margin-top: 16px;
	}
	@media (max-width: 760px) {
		.email-workspace {
			padding: 24px 16px;
		}
		.email-fields {
			grid-template-columns: 1fr;
			padding: 18px;
		}
		.panel-title {
			padding: 18px;
		}
	}
</style>
