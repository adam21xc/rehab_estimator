<script lang="ts">
	import { onMount } from 'svelte';
	import BotOfficeFloor from './BotOfficeFloor.svelte';
	import { botColor, relativeTime, sortBots, waitingOnAdam, type BotRow } from '$lib/office/bots';

	let {
		bots,
		phase,
		link,
		problem = '',
		now
	}: {
		bots: BotRow[];
		phase: 'loading' | 'ready' | 'unconfigured';
		link: 'connecting' | 'live' | 'reconnecting';
		problem?: string;
		now?: number;
	} = $props();

	let clock = $state(0);
	let mounted = $state(false);
	const waiting = $derived(waitingOnAdam(bots));
	const rows = $derived(sortBots(bots));
	const stamp = $derived(now ?? (mounted ? clock : null));
	const badge = $derived(
		phase === 'unconfigured' ? 'Setup needed' : link === 'live' ? 'Live' : 'Reconnecting'
	);

	onMount(() => {
		mounted = true;
		clock = Date.now();
		if (now != null) return;
		const id = setInterval(() => {
			clock = Date.now();
		}, 15000);
		return () => clearInterval(id);
	});

	function title(value: string) {
		return value.slice(0, 1).toUpperCase() + value.slice(1);
	}
</script>

<main class="office-page">
	<header class="office-head">
		<div>
			<p class="eyebrow">TEAM</p>
			<h1>Bot team office</h1>
			<p class="lede">
				Jarvis works in the private office. Everyone else has a desk. Idle bots lie down in the
				lounge. Blocked and waiting bots stay put until you clear them.
			</p>
		</div>
		<p
			class="badge"
			data-state={phase === 'unconfigured' ? 'setup' : link === 'live' ? 'live' : 'reconnecting'}
			role="status"
		>
			<span class="dot" aria-hidden="true"></span>{badge}
		</p>
	</header>
	{#if phase === 'unconfigured'}
		<p class="office-notice">
			Add <code>PUBLIC_SUPABASE_ANON_KEY</code> (anon or publishable key, not the service role) and
			reload. Writes stay on the service role. See <code>docs/bot-status.md</code>.
		</p>
	{:else if problem}
		<p class="office-notice problem" role="status">{problem}</p>
	{:else if phase === 'ready' && link === 'reconnecting'}
		<p class="office-notice">
			Reconnecting. The roster refreshes every 30 seconds until live updates return.
		</p>
	{/if}
	<div class="floor-card">
		<div class="floor-wide"><BotOfficeFloor {bots} mode="wide" {phase} /></div>
		<div class="floor-narrow"><BotOfficeFloor {bots} mode="narrow" {phase} /></div>
	</div>
	<section class="panel" aria-labelledby="waiting-heading">
		<h2 id="waiting-heading">Waiting on Adam</h2>
		{#if phase === 'loading'}
			<p class="empty">Loading the office…</p>
		{:else if waiting.length === 0}
			<p class="empty">Nobody is waiting on Adam.</p>
		{:else}
			<ul class="wait-list">
				{#each waiting as bot (bot.bot_id)}
					<li>
						<div class="wait-top">
							<span class="swatch" style:background={botColor(bot.color)} aria-hidden="true"></span>
							<strong>{bot.name}</strong>
							<span class="pill" data-status={bot.status}>{title(bot.status)}</span>
						</div>
						<p>{bot.doing || 'No note yet'}</p>
						{#if bot.message}<p class="says">{bot.message}</p>{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
	<section class="panel" aria-labelledby="status-heading">
		<h2 id="status-heading">Status</h2>
		<div class="table-wrap">
			<table>
				<caption class="sr-only">What each bot is doing and when it last checked in</caption>
				<thead>
					<tr>
						<th scope="col">Bot</th>
						<th scope="col">Status</th>
						<th scope="col">Doing</th>
						<th scope="col">Updated</th>
					</tr>
				</thead>
				<tbody>
					{#if rows.length === 0}
						<tr>
							<td colspan="4"
								>{phase === 'loading' ? 'Loading the office…' : 'No bots have checked in yet.'}</td
							>
						</tr>
					{:else}
						{#each rows as bot (bot.bot_id)}
							<tr>
								<th scope="row">{bot.name}</th>
								<td data-label="Status"
									><span class="pill" data-status={bot.status}>{title(bot.status)}</span></td
								>
								<td data-label="Doing">
									{bot.doing || '—'}
									{#if bot.message}<span class="says">{bot.message}</span>{/if}
								</td>
								<td data-label="Updated">
									{#if stamp != null}
										<time datetime={bot.updated_at}
											>updated {relativeTime(bot.updated_at, stamp)}</time
										>
									{:else}
										…
									{/if}
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</section>
</main>

<style>
	.office-page {
		--building: #f6f1e6;
		--jarvis-floor: #e7eef8;
		--lounge-floor: #f3ebe0;
		--hall: #e7dcc8;
		--rug: #efe2cb;
		--wall: #2c354c;
		--desk: #d7b07a;
		--desk-top: #8d6233;
		--slab: #8a5a32;
		--plank: #ddc39a;
		--neon: #1493c7;
		--monitor: #243044;
		--screen: #c5e4ff;
		--chair: #66738c;
		--couch: #6d7c96;
		--couch-back: #55637a;
		--blanket: #e4c39a;
		--pillow: #f7f2e8;
		--plant: #2f9d62;
		--plant-dark: #1d7a48;
		--pot: #b5835a;
		--ink: #292f4c;
		--muted: #5c6578;
		--bubble: #ffffff;
		--bubble-ink: #1d2436;
		--card: #ffffff;
		--line: #dce1eb;
		--good: #17815c;
		--warn: #9a5b00;
		--blocked: #b42341;
		--plaque: #fffaf3;
		min-height: calc(100dvh - 64px);
		padding: 28px 32px 72px;
		color: var(--ink);
		background: var(--canvas, #f6f7fb);
	}
	.office-head {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		align-items: flex-end;
		margin-bottom: 16px;
	}
	h1 {
		margin: 4px 0 0;
		font-size: clamp(28px, 4vw, 36px);
		letter-spacing: -0.8px;
		font-weight: 650;
	}
	h2 {
		margin: 0 0 12px;
		font-size: 20px;
	}
	.lede,
	.empty {
		color: var(--muted);
		max-width: 68ch;
		line-height: 1.5;
	}
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
		border: 1px solid var(--line);
		background: var(--card);
		border-radius: 999px;
		padding: 6px 12px;
		font-size: 13px;
		font-weight: 650;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--muted);
	}
	.badge[data-state='live'] .dot {
		background: var(--good);
		box-shadow: 0 0 0 0 color-mix(in srgb, var(--good) 55%, transparent);
		animation: pulse 1.8s ease-out infinite;
	}
	.badge[data-state='reconnecting'] .dot {
		background: var(--warn);
	}
	.badge[data-state='setup'] .dot {
		background: var(--blocked);
	}
	.office-notice {
		background: var(--card);
		border: 1px solid var(--line);
		border-left: 4px solid var(--warn);
		border-radius: 10px;
		padding: 12px 14px;
		margin: 0 0 14px;
		line-height: 1.45;
	}
	.office-notice.problem {
		border-left-color: var(--blocked);
	}
	code {
		font-size: 0.92em;
	}
	.floor-card,
	.panel {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 18px;
		padding: 12px;
		margin-bottom: 18px;
		box-shadow: 0 16px 40px #1b140c14;
	}
	.floor-card {
		background:
			radial-gradient(
				ellipse at 20% 0%,
				color-mix(in srgb, var(--neon) 16%, transparent),
				transparent 42%
			),
			radial-gradient(ellipse at 80% 100%, #e7b56a22, transparent 46%), var(--card);
	}
	.floor-narrow {
		display: none;
	}
	.wait-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 10px;
	}
	.wait-list li,
	.table-wrap {
		background: color-mix(in srgb, var(--building) 55%, var(--card));
		border: 1px solid var(--line);
		border-radius: 12px;
	}
	.wait-list li {
		padding: 12px 14px;
	}
	.wait-top {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
	}
	.swatch {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 1px solid var(--line);
		flex-shrink: 0;
	}
	.pill {
		border-radius: 999px;
		padding: 2px 8px;
		font-size: 12px;
		font-weight: 650;
		background: var(--card);
		border: 1px solid var(--line);
	}
	.pill[data-status='active'] {
		color: var(--good);
	}
	.pill[data-status='blocked'] {
		color: var(--blocked);
	}
	.pill[data-status='waiting'] {
		color: var(--warn);
	}
	.says {
		display: block;
		margin-top: 4px;
		color: var(--muted);
	}
	.table-wrap {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 14px;
	}
	th,
	td {
		text-align: left;
		padding: 8px 10px;
		border-bottom: 1px solid var(--line);
		vertical-align: top;
		overflow-wrap: anywhere;
	}
	thead th {
		font-size: 11px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		border: 0;
	}
	@media (max-width: 760px) {
		.office-page {
			padding: 18px 14px 48px;
		}
		thead {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
		}
		tbody tr {
			display: block;
			padding: 10px 12px;
			border-bottom: 1px solid var(--line);
		}
		tbody th,
		tbody td {
			display: block;
			border: 0;
			padding: 2px 0;
		}
		td[data-label]::before {
			content: attr(data-label);
			display: block;
			margin-top: 6px;
			font-size: 11px;
			letter-spacing: 0.04em;
			text-transform: uppercase;
			color: var(--muted);
		}
		.office-head {
			flex-direction: column;
			align-items: flex-start;
		}
		.floor-wide {
			display: none;
		}
		.floor-narrow {
			display: block;
		}
		h1 {
			font-size: 28px;
		}
	}
	@media (prefers-color-scheme: dark) {
		.office-page {
			--building: #1c2233;
			--jarvis-floor: #243044;
			--lounge-floor: #2a2636;
			--hall: #32384c;
			--rug: #4a4034;
			--wall: #c5cbe0;
			--desk: #8a6240;
			--desk-top: #e2c091;
			--slab: #4a3018;
			--plank: #2a3348;
			--neon: #7ee7ff;
			--monitor: #101722;
			--screen: #7ec8ff;
			--chair: #8b97b0;
			--couch: #4e5d78;
			--couch-back: #3c4a63;
			--blanket: #a68462;
			--pillow: #d9d3c8;
			--plant: #3dbe78;
			--plant-dark: #1f8a52;
			--pot: #8d6848;
			--ink: #e7ebf8;
			--muted: #b4bdd4;
			--bubble: #121826;
			--bubble-ink: #f4f7ff;
			--card: #171d2c;
			--line: #343c54;
			--good: #5ddeaf;
			--warn: #f0b45a;
			--blocked: #ff8b9d;
			--plaque: #242b3d;
			background: #121722;
			color: var(--ink);
			color-scheme: dark;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.dot {
			animation: none;
		}
	}
	@keyframes pulse {
		70% {
			box-shadow: 0 0 0 6px transparent;
		}
		100% {
			box-shadow: 0 0 0 0 transparent;
		}
	}
</style>
