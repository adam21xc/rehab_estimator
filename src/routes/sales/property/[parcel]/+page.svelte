<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { analyzeSales } from '$lib/sales/analytics';
	type Analysis = ReturnType<typeof analyzeSales>;
	type Property = {
		parcel: string;
		address: string;
		selectedId: string;
		transactions: Analysis['transactions'];
		matches: Analysis['matches'];
		cutoff: string | null;
		capturedAt: string;
	};
	let property = $state<Property | null>(null);
	let busy = $state(true),
		problem = $state(''),
		needsLogin = $state(false),
		retry = $state(0);
	const selected = $derived(property?.transactions.find((r) => r.id === property?.selectedId));
	const money = (n: number | null) =>
		n === null
			? 'Not reported'
			: new Intl.NumberFormat('en-US', {
					style: 'currency',
					currency: 'USD',
					maximumFractionDigits: 0
				}).format(n);
	$effect(() => {
		const parcel = page.params.parcel;
		const record = page.url.searchParams.get('record') || '';
		void retry;
		const controller = new AbortController();
		busy = true;
		problem = '';
		property = null;
		needsLogin = false;
		fetch(
			`/api/rehab/properties/${encodeURIComponent(parcel || '')}?record=${encodeURIComponent(record)}`,
			{ signal: controller.signal }
		)
			.then(async (res) => {
				if (res.status === 401) {
					needsLogin = true;
					return;
				}
				const result = await res.json();
				if (!res.ok) throw new Error(result.message || 'Unable to load this property.');
				property = result;
			})
			.catch((e) => {
				if (!controller.signal.aborted) problem = e.message;
			})
			.finally(() => {
				if (!controller.signal.aborted) busy = false;
			});
		return () => controller.abort();
	});
</script>

<svelte:head
	><title>{property?.address || 'Property detail'} · Apex CRM</title><meta
		name="theme-color"
		content="#101113"
	/></svelte:head
>
<div class="shell">
	<main>
		<a class="back-link" href={resolve('/sales')}>← Sales intelligence</a>
		{#if busy}<p role="status">Loading property…</p>
		{:else if needsLogin}<section>
				<h1>Your property workspace.</h1>
				<p>Sign in to view this property’s sales records.</p>
				<a class="button" href={resolve('/leads')}>Sign in →</a>
			</section>
		{:else if problem}<section role="alert">
				<h1>Property unavailable</h1>
				<p>{problem}</p>
				<button onclick={() => retry++}>Retry</button>
			</section>
		{:else if property}
			<p class="eyebrow">MARION COUNTY / PROPERTY PROFILE</p>
			<h1>{property.address || 'Address unavailable'}</h1>
			<p class="sub">Parcel {property.parcel}</p>
			<div class="notice">
				Sales data through <strong>{property.cutoff || 'an unknown date'}</strong>. This snapshot
				does not verify current ownership, availability, or pending contracts.
			</div>
			<div class="overview">
				<section class="map">
					<h2>Explore the property</h2>
					{#if property.address}
						<iframe
							title="Property location on Google Maps"
							src={`https://www.google.com/maps?q=${encodeURIComponent(property.address)}&output=embed`}
							loading="lazy"
							referrerpolicy="no-referrer-when-downgrade"
							allowfullscreen
						></iframe>
						<div class="links">
							<a
								class="button"
								target="_blank"
								rel="noreferrer"
								href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(property.address)}`}
								>Open Google Maps ↗</a
							><a
								class="button"
								target="_blank"
								rel="noreferrer"
								href={`https://www.zillow.com/homes/${encodeURIComponent(property.address)}_rb/`}
								>Search this address on Zillow ↗</a
							>
						</div>
						<p class="note">
							Map location is an address match, not a parcel boundary. If the map does not load,
							open Google Maps. The Zillow link is an address lookup; a matching property page or
							active listing is not verified.
						</p>
					{:else}<p>No street address is available for a map or Zillow lookup.</p>{/if}
				</section>
				<section class="record">
					<p class="eyebrow">SELECTED DISCLOSURE</p>
					<h2>{selected?.date || 'Sale date unavailable'}</h2>
					{#if selected}<p class="price">{money(selected.price)}</p>
						<dl>
							<dt>Buyer</dt>
							<dd>{selected.buyer || 'Not listed'}</dd>
							<dt>Seller</dt>
							<dd>{selected.seller || 'Not listed'}</dd>
							<dt>Record</dt>
							<dd>{selected.id}</dd>
						</dl>
						{#if selected.multi}<p class="notice">
								Multi-parcel disclosure: the price may cover several properties.
							</p>{/if}
						{#if selected.ambiguous}<p class="notice">
								Conflicting source rows; price withheld.
							</p>{/if}
						<a
							class="button"
							target="_blank"
							rel="noreferrer"
							href={`https://gatewaysdf.ifionline.org/GatewaySalesAppReport/PrintForm?SDF_ID=${encodeURIComponent(selected.id)}&type=3`}
							>View original disclosure ↗</a
						>{/if}
				</section>
			</div>
			<section>
				<p class="eyebrow">RECORDED TRANSFERS</p>
				<h2>History in this snapshot</h2>
				<p class="note">
					Newest sale first. Earlier years and later filings may be missing. Same-day records do not
					establish closing order.
				</p>
				<div class="table-wrap">
					<table>
						<thead
							><tr
								><th>Sale date</th><th>Buyer</th><th>Seller</th><th>Reported price</th><th
									>Record</th
								></tr
							></thead
						><tbody>
							{#each property.transactions as sale (sale.id)}<tr
									class:selected={sale.id === property.selectedId}
									><td>{sale.date || 'Unknown'}</td><td>{sale.buyer || 'Not listed'}</td><td
										>{sale.seller || 'Not listed'}</td
									><td>{money(sale.price)}{sale.multi ? ' (bundle)' : ''}</td><td
										><a
											href={resolve(
												`/sales/property/${encodeURIComponent(property.parcel)}?record=${encodeURIComponent(sale.id)}`
											)}>{sale.id}</a
										>{sale.id === property.selectedId ? ' · Selected' : ''}</td
									></tr
								>{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/if}
	</main>
</div>

<style>
	.shell {
		min-height: calc(100dvh - 64px);
		background: var(--canvas);
		color: var(--ink);
		font-family: Inter, Arial, sans-serif;
		color-scheme: light;
	}
	.shell * {
		box-sizing: border-box;
	}
	a {
		color: var(--accent);
	}
	main {
		max-width: 1400px;
		margin: auto;
		padding: 32px;
	}
	h1 {
		font-size: clamp(28px, 4vw, 46px);
		line-height: 1.15;
		max-width: 1000px;
		letter-spacing: -1px;
		margin: 10px 0;
		overflow-wrap: anywhere;
	}
	h2 {
		font-size: 22px;
		margin: 0 0 18px;
	}
	.eyebrow {
		color: var(--accent);
		letter-spacing: 2px;
		font-size: 11px;
		font-weight: 700;
	}
	.sub,
	.note {
		color: var(--muted);
		line-height: 1.7;
	}
	.note {
		font-size: 12px;
	}
	.notice {
		padding: 16px;
		border-left: 2px solid var(--accent);
		background: var(--surface);
		color: var(--muted);
		font-size: 13px;
		line-height: 1.6;
		margin: 24px 0;
	}
	.overview {
		display: grid;
		grid-template-columns: 1.6fr 1fr;
		gap: 24px;
	}
	section {
		min-width: 0;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 24px;
		margin-bottom: 24px;
	}
	iframe {
		width: 100%;
		height: 370px;
		border: 0;
		border-radius: 8px;
		background: var(--canvas);
	}
	.links {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		margin-top: 16px;
	}
	.button,
	button {
		display: inline-block;
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 12px 16px;
		background: var(--canvas);
		color: var(--ink);
		text-decoration: none;
		font: inherit;
		font-size: 13px;
		cursor: pointer;
	}
	a:focus-visible,
	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 4px;
	}
	.price {
		font-size: 36px;
		margin: 24px 0;
		color: #16836b;
	}
	dt {
		color: var(--muted);
		font-size: 12px;
		margin-top: 22px;
	}
	dd {
		margin: 8px 0 0;
		overflow-wrap: anywhere;
	}
	.record .button {
		margin-top: 26px;
	}
	.table-wrap {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}
	th {
		text-align: left;
		color: var(--muted);
		font-size: 11px;
		text-transform: uppercase;
		white-space: nowrap;
	}
	td,
	th {
		padding: 17px 14px;
		border-bottom: 1px solid var(--border);
		line-height: 1.6;
	}
	tr.selected {
		background: var(--canvas);
	}
	td {
		min-width: 110px;
	}
	@media (max-width: 720px) {
		main {
			padding: 28px 16px;
		}
		.overview {
			grid-template-columns: 1fr;
			gap: 0;
		}
		section {
			padding: 18px;
		}
		iframe {
			height: 290px;
		}
	}
</style>
