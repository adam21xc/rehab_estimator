<script lang="ts">
	import { onMount } from 'svelte';
	let { signedIn }: { signedIn: boolean } = $props();
	type Message = {
		id: string;
		phone: string;
		body: string;
		direction: string;
		status: string;
		error_code: string | null;
		created_at: string;
	};
	let configured = $state(false);
	let missing = $state<string[]>([]);
	let sender = $state('');
	let messages = $state<Message[]>([]);
	let to = $state('');
	let body = $state('');
	let consent = $state(false);
	let filter = $state('');
	let busy = $state(false);
	let notice = $state('');
	let failure = $state('');
	let suppressed = $state(false);
	let page = $state(0);
	let more = $state(false);
	let requestId = '';
	let previousPayload = '';
	async function load(reset = true) {
		if (!signedIn) return;
		busy = true;
		failure = '';
		try {
			const next = reset ? 0 : page + 1;
			const response = await fetch(
				`/api/rehab/sms?phone=${encodeURIComponent(filter)}&page=${next}`
			);
			const data = await response.json();
			if (!response.ok) throw new Error(data.message || 'Unable to load SMS.');
			configured = data.configured;
			missing = data.missing;
			sender = data.sender;
			messages = reset ? data.messages : [...messages, ...data.messages];
			page = next;
			more = data.messages.length === 30;
			suppressed = data.suppressed;
		} catch (e) {
			failure = (e as Error).message;
		} finally {
			busy = false;
		}
	}
	onMount(() => {
		void load();
	});
	async function send() {
		busy = true;
		failure = '';
		notice = '';
		const payload = JSON.stringify({ to, body });
		if (payload !== previousPayload || !requestId) {
			requestId = crypto.randomUUID();
			previousPayload = payload;
		}
		try {
			const response = await fetch('/api/rehab/sms', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ requestId, to, body, consentConfirmed: consent })
			});
			const data = await response.json();
			if (!response.ok)
				throw new Error(data.message || 'Message was not accepted. Check history for its status.');
			notice = ['unknown', 'submitting'].includes(data.status)
				? 'Delivery is uncertain. Check Twilio and refresh history before attempting another send.'
				: `Twilio status: ${data.status}. Delivery updates will appear in history.`;
			if (!['unknown', 'submitting'].includes(data.status)) {
				body = '';
				consent = false;
				requestId = '';
				previousPayload = '';
			}
		} catch (e) {
			failure = (e as Error).message;
		} finally {
			busy = false;
			const sendFailure = failure;
			await load();
			if (sendFailure) failure = sendFailure;
		}
	}
</script>

<section class="workspace-section">
	<p class="eyebrow">STAY IN THE CONVERSATION</p>
	<h2>SMS outreach.</h2>
	<p class="muted">One shared inbox. Every text and reply in view.</p>
	{#if !signedIn}<div class="empty-state">Sign in to open your SMS workspace.</div>{:else}
		{#if !configured}<p class="notice">
				Twilio setup required: {missing.join(', ') || 'checking connection…'}. Sending stays
				disabled until configured.
			</p>{:else}<p class="notice">
				Sending through {sender} · Twilio messaging charges apply.
			</p>{/if}
		{#if notice}<p role="status" class="notice">{notice}</p>{/if}{#if failure}<p
				role="alert"
				class="notice error"
			>
				{failure}
			</p>{/if}
		<form
			class="surface design-form"
			onsubmit={(e) => {
				e.preventDefault();
				send();
			}}
		>
			<label
				>Recipient phone<input
					type="tel"
					autocomplete="off"
					placeholder="+13175550123"
					pattern={'\\+[1-9][0-9]{7,14}'}
					bind:value={to}
					required
					disabled={busy}
				/></label
			>
			<label
				>Message<textarea
					rows="4"
					maxlength="1600"
					bind:value={body}
					required
					disabled={busy}
					placeholder="Write your message…"
				></textarea></label
			>
			<p class="muted small">
				{body.length} / 1,600 characters. Longer texts and some characters can use multiple billable
				SMS segments.
			</p>
			<label class="sms-consent"
				><input type="checkbox" bind:checked={consent} disabled={busy} required />I have permission
				to text this recipient.</label
			>
			<button
				class="primary-button"
				disabled={!configured || busy || !consent || !body.trim() || !to}
			>
				{busy ? 'Working…' : 'Send text'} ↗</button
			>
		</form>
		<div class="section-heading">
			<h3>Message history</h3>
			<button class="quiet-button" disabled={busy} onclick={() => load()}>Refresh</button>
		</div>
		<form
			class="sms-filter"
			onsubmit={(e) => {
				e.preventDefault();
				load();
			}}
		>
			<label
				>Filter by phone<input type="tel" bind:value={filter} placeholder="All recipients" /></label
			><button class="secondary-button" disabled={busy}>Apply</button>
		</form>
		{#if suppressed}<p class="notice error">This number opted out. Sending is blocked.</p>{/if}
		{#if !messages.length}<div class="empty-state">
				No messages yet.<span>Texts and incoming replies will appear here.</span>
			</div>{/if}
		<div class="sms-history">
			{#each messages as message (message.id)}<article class="surface sms-message">
					<div class="section-heading">
						<strong>{message.phone}</strong><span class="eyebrow"
							>{message.direction} · {message.status}</span
						>
					</div>
					<p>{message.body}</p>
					<div class="muted small">
						{new Date(message.created_at).toLocaleString()}{message.error_code
							? ` · Twilio error ${message.error_code}`
							: ''}
					</div>
				</article>{/each}
		</div>
		{#if more}<button class="secondary-button" disabled={busy} onclick={() => load(false)}
				>Older messages</button
			>{/if}
	{/if}
</section>

<style>
	.sms-consent {
		display: flex !important;
		align-items: center;
		gap: 10px;
	}
	.sms-consent input {
		width: 18px !important;
		min-height: 18px !important;
		margin: 0 !important;
		flex-shrink: 0;
	}
	.sms-filter {
		display: flex;
		align-items: end;
		gap: 12px;
	}
	.sms-filter label {
		flex: 1;
	}
	.sms-filter input {
		display: block;
		width: 100%;
		margin-top: 8px;
	}
	.sms-history {
		display: grid;
		gap: 12px;
		margin-top: 20px;
	}
	.sms-message {
		padding: 20px;
	}
	.sms-message .section-heading {
		margin: 0 0 12px;
		gap: 12px;
		flex-wrap: wrap;
	}
	.sms-message p {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		margin-bottom: 16px;
	}
</style>
