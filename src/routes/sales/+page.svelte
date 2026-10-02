<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import type { analyzeSales } from '$lib/sales/analytics';
	type Analysis = ReturnType<typeof analyzeSales>;
	type Data = {
		snapshot: { loaded_rows: number; expected_rows: number; captured_at: string };
		stats: Analysis['stats'];
		months: Analysis['months'];
		actors: Analysis['actors'];
		matches: Analysis['matches'];
		transactions: Analysis['transactions'];
		sameDay: Analysis['sameDay'];
		inventory: Analysis['inventory'];
		inventoryAsOf: string | null;
		counts?: Record<string, number>;
		page?: number;
		actorCount: number;
		matchCount: number;
	};
	let data = $state<Data | null>(null),
		signedIn = $state(false),
		busy = $state(true),
		problem = $state('');
	let scope = $state('residential'),
		q = $state(''),
		sort = $state('purchases'),
		dateOrder = $state('newest'),
		page = $state(1),
		tab = $state<'buyers' | 'resales' | 'transfers' | 'sameday' | 'inventory'>('buyers');
	let generation = 0;
	const money = (n: number | null | undefined) =>
		n == null
			? '—'
			: new Intl.NumberFormat('en-US', {
					style: 'currency',
					currency: 'USD',
					maximumFractionDigits: 0
				}).format(n);
	const days = (n: number | null) => (n == null ? '—' : `${Math.round(n)} days`);
	const maxCount = $derived(Math.max(1, ...(data?.months.map((m) => m.count) || [])));
	async function loadPage(nextPage = 1) {
		page = nextPage;
		const current = ++generation;
		busy = true;
		problem = '';
		try {
			const res = await fetch(
				`/api/rehab/sales?${new URLSearchParams({ scope, q, sort, dateOrder, view: tab, page: String(page) })}`
			);
			if (res.status === 401) {
				signedIn = false;
				data = null;
				return;
			}
			const result = await res.json();
			if (!res.ok) throw new Error(result.message || 'Unable to load sales.');
			if (current === generation) {
				data = result.snapshot ? result : null;
				page = result.page || 1;
			}
		} catch (e) {
			if (current === generation) problem = (e as Error).message;
		} finally {
			if (current === generation) busy = false;
		}
	}
	const load = () => loadPage(1);
	const visibleCount = $derived(data?.counts?.[tab] || 0);
	onMount(async () => {
		try {
			const res = await fetch('/api/rehab/session');
			const session = await res.json();
			signedIn = res.ok && !!session.user;
			if (signedIn) await load();
		} catch {
			problem = 'Unable to check your session. Reload to try again.';
		} finally {
			busy = false;
		}
	});
	function inspect(name: string) {
		q = name;
		tab = 'resales';
		load();
	}
</script>

<svelte:head
	><title>Wholesaler intelligence · Apex CRM</title><meta
		name="theme-color"
		content="#101113"
	/></svelte:head
>
<div class="sales-shell">
	<header>
		<a class="brand" href={resolve('/leads')}><b>Λ</b> APEX <small>PROPERTY CRM</small></a>
		<nav aria-label="Workspace">
			<a href={resolve('/leads')}>Leads</a><a class="active" href={resolve('/sales')}
				>Sales intelligence</a
			><a href={resolve('/rehab')}>Rehab studio</a>
		</nav>
	</header>
	<main>
		<div class="sales-hero">
			<div>
				<p class="eyebrow">MARION COUNTY / 2026</p>
				<h1>Follow the market.<br /><em>Find the players.</em></h1>
				<p class="intro">Buyer activity, repeat sales, and the spread between them.</p>
			</div>
			<div class="source">
				<span class="dot"></span> INDIANA GATEWAY SDF<br /><small>Recorded sales intelligence</small
				>
			</div>
		</div>
		{#if problem}<div class="warning" role="alert">
				{problem}<button onclick={load}>Retry</button>
			</div>{/if}
		{#if !signedIn && !busy}<section class="panel signin">
				<h2>Your market workspace.</h2>
				<p>Sign in with your rehab workspace account to view the private sales dashboard.</p>
				<a class="action" href={resolve('/leads')}>Sign in at the lead inbox →</a>
			</section>
		{:else if busy && !data}<p class="loading" role="status">
				Loading the complete sales snapshot…
			</p>
		{:else if !data}<section class="panel">
				<h2>The first import is preparing.</h2>
				<p>Figures will appear once a complete snapshot is verified.</p>
				<button onclick={load}>Refresh</button>
			</section>
		{:else}
			<div class="coverage">
				<span
					><strong
						>{data.snapshot.loaded_rows.toLocaleString()} / {data.snapshot.expected_rows.toLocaleString()}</strong
					>
					source rows loaded · snapshot {new Date(data.snapshot.captured_at).toLocaleString()}</span
				><label
					>Property scope<select bind:value={scope} onchange={load} disabled={busy}
						><option value="residential">Residential</option><option value="all"
							>All property classes</option
						></select
					></label
				>
			</div>
			<p class="data-cutoff">
				<strong>Sales recorded through {data.stats.lastSale || 'an unknown date'}.</strong> This is a
				lagged 2026 snapshot, not live market activity. Missing later months are not zero sales.
			</p>
			<section class="metrics" aria-label="Market overview">
				<div>
					<span>Active buyers</span><strong>{data.stats.buyers.toLocaleString()}</strong><small
						>Names with eligible purchases</small
					>
				</div>
				<div>
					<span>Median reported sale</span><strong>{money(data.stats.medianPrice)}</strong><small
						>{data.stats.eligible.toLocaleString()} eligible sale rows</small
					>
				</div>
				<div>
					<span>Matched resales</span><strong>{data.stats.matchedResales.toLocaleString()}</strong
					><small>{data.stats.quickResales} held 30 days or less</small>
				</div>
				<div>
					<span>Median gross spread</span><strong class="accent"
						>{money(data.stats.medianSpread)}</strong
					><small>Matched resales only · before costs</small>
				</div>
				<div>
					<span>Median holding period</span><strong>{days(data.stats.medianHold)}</strong><small
						>Among matched resales</small
					>
				</div>
			</section>
			<section class="panel trend">
				<div class="section-title">
					<div>
						<p class="eyebrow">01 / ACTIVITY PULSE</p>
						<h2>Reported sales by month</h2>
					</div>
					<span>{data.stats.firstSale || '—'} → {data.stats.lastSale || '—'}</span>
				</div>
				<div class="bars" aria-label="Monthly reported sales">
					{#each data.months as month (month.month)}<div class="month">
							<span class="count">{month.count || '—'}</span>
							<div class="bar-track">
								<div class="bar" style:height={`${(month.count / maxCount) * 100}%`}></div>
							</div>
							<strong
								>{new Date(`${month.month}-15T12:00:00`).toLocaleString('en-US', {
									month: 'short'
								})}</strong
							><small>{month.count ? money(month.medianPrice) : 'No data'}</small>
						</div>{/each}
				</div>
				<p class="muted">
					Bar height = eligible sales; amount = median reported price. Recent months may be
					incomplete due to reporting lag. This is recorded activity, not inventory or days on
					market.
				</p>
			</section>
			<section class="panel data-panel">
				<div class="section-title">
					<div>
						<p class="eyebrow">02 / MARKET PARTICIPANTS</p>
						<h2>Who’s buying. Who’s selling.</h2>
					</div>
					<button onclick={load} disabled={busy}>{busy ? 'Refreshing…' : '↻ Refresh'}</button>
				</div>
				<div class="tabs" role="tablist" aria-label="Sales views">
					{#each [{ id: 'buyers', label: 'Top buyers & sellers' }, { id: 'resales', label: 'Matched resales' }, { id: 'inventory', label: 'Inventory candidates' }, { id: 'transfers', label: 'Recent transfers' }, { id: 'sameday', label: 'Same-day activity' }] as item (item.id)}<button
							role="tab"
							aria-selected={tab === item.id}
							class:chosen={tab === item.id}
							onclick={() => {
								tab = item.id as typeof tab;
								load();
							}}>{item.label}</button
						>{/each}
				</div>
				<form
					class="filters"
					onsubmit={(e) => {
						e.preventDefault();
						load();
					}}
				>
					<label
						>Buyer or seller name<input
							bind:value={q}
							placeholder="Search a person or company"
						/></label
					><label
						>Rank participants by<select bind:value={sort}
							><option value="purchases">Most purchases</option><option value="sales"
								>Most sales</option
							><option value="resales">Most matched resales</option></select
						></label
					><label
						>Transaction dates<select bind:value={dateOrder}
							><option value="newest">Newest first</option><option value="oldest"
								>Oldest first</option
							></select
						></label
					><button class="primary" disabled={busy}>Apply</button>{#if q}<button
							type="button"
							onclick={() => {
								q = '';
								load();
							}}>Clear</button
						>{/if}
				</form>
				{#if q}<p class="muted filter-note">
						Tables filtered by “{q}”. Market overview remains county-wide for the selected property
						scope.
					</p>{/if}
				<div class="table-wrap" role="tabpanel" aria-label={tab} aria-busy={busy}>
					{#if tab === 'buyers'}<table>
							<thead
								><tr
									><th scope="col">Participant</th><th scope="col">Buys</th><th scope="col"
										>Avg buy</th
									><th scope="col">Sells</th><th scope="col">Avg sell</th><th scope="col"
										>Matched resales</th
									><th scope="col">Avg gross spread</th><th scope="col">Median hold</th></tr
								></thead
							><tbody
								>{#each data.actors as actor (actor.key)}<tr
										><td
											><button class="name" onclick={() => inspect(actor.name)}>{actor.name}</button
											></td
										><td>{actor.purchases}</td><td>{money(actor.averageBuy)}</td><td
											>{actor.sales}</td
										><td>{money(actor.averageSell)}</td><td>{actor.matchedResales || '—'}</td><td
											class:positive={(actor.averageSpread || 0) > 0}
											class:negative={(actor.averageSpread || 0) < 0}
											>{money(actor.averageSpread)}</td
										><td>{days(actor.medianHold)}</td></tr
									>{/each}</tbody
							>
						</table>
						{#if !data.actors.length}<p class="empty">No participants match this name.</p>{/if}
						<p class="table-note">
							Showing {data.actors.length} of {data.actorCount.toLocaleString()} participants. Click
							a name to inspect matched resales. Average buy and sell prices cover different transactions;
							their difference is not a profit calculation.
						</p>
					{:else if tab === 'resales'}<table>
							<thead
								><tr
									><th scope="col">Property / participant</th><th scope="col">Bought</th><th
										scope="col">Buy price</th
									><th scope="col">Sold</th><th>Sell price</th><th scope="col">Gross spread</th><th
										scope="col">Held</th
									><th scope="col">Evidence</th></tr
								></thead
							><tbody
								>{#each data.matches as match (`${match.parcel}:${match.buyId}:${match.sellId}`)}<tr
										><td
											><strong
												><a
													href={resolve(
														`/sales/property/${encodeURIComponent(match.parcel)}?record=${encodeURIComponent(match.sellId)}`
													)}
												>
													{match.address} ↗</a
												></strong
											><small>{match.actor}</small></td
										><td>{match.bought}</td><td>{money(match.buyPrice)}</td><td>{match.sold}</td><td
											>{money(match.sellPrice)}</td
										><td class:positive={match.spread > 0} class:negative={match.spread < 0}
											>{money(match.spread)}</td
										><td>{days(match.days)}</td><td
											><a
												target="_blank"
												rel="noreferrer"
												href={`https://gatewaysdf.ifionline.org/GatewaySalesAppReport/PrintForm?SDF_ID=${encodeURIComponent(match.buyId)}&type=3`}
												>Buy ↗</a
											>
											·
											<a
												target="_blank"
												rel="noreferrer"
												href={`https://gatewaysdf.ifionline.org/GatewaySalesAppReport/PrintForm?SDF_ID=${encodeURIComponent(match.sellId)}&type=3`}
												>Sell ↗</a
											></td
										></tr
									>{/each}</tbody
							>
						</table>
						{#if !data.matches.length}<p class="empty">
								No verified-sequence resale candidates in this snapshot for the selected name. That
								does not mean no resale occurred.
							</p>{/if}
						<p class="table-note">
							Showing {data.matches.length} of {data.matchCount} matches. Matching uses parcel identity
							and exact normalized participant name, with distinct sale dates. These are resale candidates,
							not confirmed wholesale deals.
						</p>
					{:else if tab === 'inventory'}
						<p class="table-note">
							<strong
								>No later transfer observed through {data.inventoryAsOf ||
									data.stats.lastSale}.</strong
							>
							These are inventory candidates, not verified current ownership. Pending contracts and unclosed
							purchases are not available in this feed. Days observed run from purchase to the snapshot
							cutoff, not today. Search matches the last recorded buyer.
						</p>
						<table>
							<thead
								><tr
									><th>Property</th><th>Last recorded buyer</th><th>Bought</th><th>Buy price</th><th
										>Days observed</th
									><th>Evidence</th></tr
								></thead
							><tbody>
								{#each data.inventory || [] as item (`${item.id}:${item.parcel}`)}
									<tr
										><td
											><strong
												><a
													href={resolve(
														`/sales/property/${encodeURIComponent(item.parcel)}?record=${encodeURIComponent(item.id)}`
													)}
												>
													{item.address} ↗</a
												></strong
											><small>{item.parcel}</small></td
										><td>{item.buyer}</td><td>{item.bought}</td><td>{money(item.price)}</td><td
											>{days(item.observedDays)}</td
										><td
											><a
												target="_blank"
												rel="noreferrer"
												href={`https://gatewaysdf.ifionline.org/GatewaySalesAppReport/PrintForm?SDF_ID=${encodeURIComponent(item.id)}&type=3`}
												>SDF ↗</a
											></td
										></tr
									>
								{/each}</tbody
							>
						</table>
						{#if !data.inventory?.length}<p class="empty">
								No inventory candidates match this view. Missing or ambiguous records may prevent a
								match.
							</p>{/if}
					{:else if tab === 'sameday'}
						<table>
							<thead
								><tr
									><th scope="col">Property / date</th><th scope="col"
										>Transfers (order unverified)</th
									><th scope="col">Evidence</th></tr
								></thead
							><tbody>
								{#each data.sameDay as group (`${group.parcel}:${group.date}`)}<tr
										><td
											><strong
												><a
													href={resolve(
														`/sales/property/${encodeURIComponent(group.parcel)}?record=${encodeURIComponent(group.transfers[0].id)}`
													)}
												>
													{group.address} ↗</a
												></strong
											><small>{group.date} · {group.parcel}</small></td
										><td
											>{#each group.transfers as transfer (transfer.id)}<div>
													{transfer.seller || 'Unknown seller'} → {transfer.buyer ||
														'Unknown buyer'} · {money(transfer.price)}
												</div>{/each}</td
										><td
											>{#each group.transfers as transfer (transfer.id)}<div>
													<a
														target="_blank"
														rel="noreferrer"
														href={`https://gatewaysdf.ifionline.org/GatewaySalesAppReport/PrintForm?SDF_ID=${encodeURIComponent(transfer.id)}&type=3`}
														>{transfer.id} ↗</a
													>
												</div>{/each}</td
										></tr
									>{/each}
							</tbody>
						</table>
						{#if !data.sameDay.length}<p class="empty">
								No same-day activity matches this view.
							</p>{/if}
						<p class="table-note">
							Parcel/date groups ordered by sale date. Possible back-to-back closings require record
							review; row order does not establish closing order. No profit or spread is assigned to
							these groups.
						</p>
					{:else}<table>
							<thead
								><tr
									><th scope="col">Property</th><th scope="col">Buyer</th><th scope="col">Seller</th
									><th scope="col">Sale date</th><th>Reported price</th><th scope="col">Record</th
									></tr
								></thead
							><tbody
								>{#each data.transactions as sale (`${sale.id}:${sale.parcel}`)}<tr
										><td
											><strong
												><a
													href={resolve(
														`/sales/property/${encodeURIComponent(sale.parcel)}?record=${encodeURIComponent(sale.id)}`
													)}
												>
													{sale.address || 'Address unavailable'} ↗</a
												></strong
											><small
												>{sale.parcel}{sale.multi
													? ' · Multi-parcel disclosure'
													: ''}{sale.ambiguous ? ' · Conflicting source rows' : ''}</small
											></td
										><td>{sale.buyer || 'Not listed'}</td><td>{sale.seller || 'Not listed'}</td><td
											>{sale.date || 'Outside 2026 / unavailable'}</td
										><td>{money(sale.price)}</td><td
											><a
												target="_blank"
												rel="noreferrer"
												href={`https://gatewaysdf.ifionline.org/GatewaySalesAppReport/PrintForm?SDF_ID=${encodeURIComponent(sale.id)}&type=3`}
												>SDF ↗</a
											></td
										></tr
									>{/each}</tbody
							>
						</table>
						{#if !data.transactions.length}<p class="empty">No transfers match this name.</p>{/if}
						<p class="table-note">
							Matching parcel rows ordered by sale date. Disclosure prices can apply to an entire
							bundled transaction.
						</p>{/if}
				</div>
				{#if data.counts}<div class="table-note">
						<span
							>{visibleCount ? (page - 1) * 50 + 1 : 0}–{Math.min(page * 50, visibleCount)} of {visibleCount}
							results</span
						>
						<button disabled={busy || page <= 1} onclick={() => loadPage(page - 1)}
							>← Previous</button
						>
						<button disabled={busy || page * 50 >= visibleCount} onclick={() => loadPage(page + 1)}
							>Next →</button
						>
					</div>{/if}
			</section>
			<section class="method">
				<div>
					<p class="eyebrow">READING THE SIGNAL</p>
					<h3>Spread is not profit.</h3>
					<p>
						Gross spread is the reported resale price minus the matched purchase price. It excludes
						renovations, financing, closing costs, taxes, commissions, and other expenses.
						Assignment fees are not available in this feed.
					</p>
				</div>
				<div>
					<h3>What we leave unresolved</h3>
					<p>
						{data.stats.duplicateRows} repeated source rows were deduplicated; {data.stats
							.ambiguousRows} conflicting groups were excluded from prices. {data.stats
							.sameDayGroups} same-day parcel/date groups are excluded from resale spreads because closing
						order is unknown. {data.stats.multiParcelRows} known multi-parcel rows and {data.stats
							.missingPriceOrDate} rows without a usable positive price or 2026 sale date are excluded
						from price averages. Bundles across separate disclosures may still require review.
					</p>
				</div>
				<div>
					<h3>A view of recorded activity</h3>
					<p>
						Names are not confirmed wholesaler identities. LLC aliases are not merged. Purchases
						before 2026, unrecorded assignments, and late filings can be missing. Sales include
						records not marked valid for assessment trending. <a
							href="https://www.in.gov/dlgf/assessments/sales-disclosure-form-information/"
							target="_blank"
							rel="noreferrer">About the source ↗</a
						>
					</p>
				</div>
			</section>
		{/if}
	</main>
</div>

<style>
	.sales-shell {
		background: #101113;
		color: #ecebe6;
		min-height: 100vh;
		font-family: Inter, Arial, sans-serif;
		color-scheme: dark;
	}
	.sales-shell * {
		box-sizing: border-box;
	}
	header {
		max-width: 1500px;
		margin: auto;
		padding: 24px 40px;
		border-bottom: 1px solid #343438;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 20px;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 12px;
		color: #eee;
		text-decoration: none;
		letter-spacing: 2px;
		font-size: 24px;
		font-weight: 750;
	}
	.brand b {
		color: #ff6253;
		font-size: 34px;
	}
	.brand small {
		font-size: 9px;
		color: #a3a3ad;
		border-left: 1px solid #555;
		padding-left: 12px;
	}
	nav {
		display: flex;
		gap: 25px;
		font-size: 12px;
	}
	nav a {
		color: #a4a6b1;
		text-decoration: none;
	}
	nav a.active {
		color: #ff877c;
	}
	main {
		max-width: 1500px;
		margin: auto;
		padding: 52px 40px;
	}
	.sales-hero {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		margin-bottom: 34px;
		gap: 24px;
	}
	.eyebrow {
		color: #ff8a7e;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 2px;
		margin: 0 0 14px;
	}
	h1 {
		font-size: clamp(36px, 4.5vw, 60px);
		font-weight: 600;
		letter-spacing: -2px;
		line-height: 1.06;
		margin: 0;
	}
	h1 em {
		font-style: normal;
		color: #999ba5;
	}
	h2 {
		font-size: 24px;
		letter-spacing: -0.6px;
		font-weight: 600;
		margin: 0;
	}
	h3 {
		font-size: 16px;
		margin: 0 0 10px;
	}
	.intro {
		font-size: 14px;
		color: #a7a8af;
		margin-top: 20px;
	}
	.source {
		font-size: 10px;
		letter-spacing: 1px;
		line-height: 2.3;
		white-space: nowrap;
		color: #dfdbd0;
	}
	.source small {
		color: #94969f;
	}
	.dot {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #ff7465;
		margin-right: 8px;
	}
	.coverage {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 20px;
		font-size: 11px;
		color: #9ea0ab;
		margin-bottom: 20px;
	}
	.coverage label {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.coverage strong {
		color: #e6e4dd;
	}
	button,
	input,
	select {
		font: inherit;
	}
	button,
	.action {
		min-height: 40px;
		padding: 10px 14px;
		border-radius: 6px;
		border: 1px solid #42434b;
		background: #232429;
		color: #ecebe6;
		cursor: pointer;
		font-size: 12px;
		text-decoration: none;
	}
	button:hover {
		background: #36373f;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	input,
	select {
		padding: 11px 12px;
		min-height: 42px;
		border: 1px solid #41424a;
		background: #111215;
		color: #eee;
		border-radius: 6px;
		font-size: 12px;
	}
	button:focus-visible,
	a:focus-visible,
	input:focus,
	select:focus {
		outline: 2px solid #ff887d;
		outline-offset: 3px;
	}
	.data-cutoff {
		padding: 12px 16px;
		margin: 0 0 20px;
		border-left: 2px solid #e4a47f;
		background: #29231f;
		color: #cdbfae;
		font-size: 12px;
		line-height: 1.7;
	}
	.metrics {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		border: 1px solid #3b3c43;
		border-radius: 10px;
		overflow: hidden;
		background: linear-gradient(120deg, #232428, #17181b);
		margin-bottom: 28px;
	}
	.metrics > div {
		padding: 24px 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.metrics > div + div {
		border-left: 1px solid #3b3c43;
	}
	.metrics span {
		font-size: 11px;
		color: #b0b1bb;
	}
	.metrics strong {
		font-size: 30px;
		font-weight: 500;
		letter-spacing: -1px;
	}
	.metrics small {
		font-size: 10px;
		color: #8f929d;
	}
	.metrics .accent {
		color: #f6aa83;
	}
	.panel {
		border: 1px solid #34353b;
		border-radius: 10px;
		background: #191a1e;
		margin-bottom: 28px;
		padding: 26px;
	}
	.section-title {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 20px;
		margin-bottom: 28px;
	}
	.section-title > span {
		font-size: 11px;
		color: #9c9faa;
	}
	.bars {
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		gap: 16px;
		padding: 10px 0 22px;
	}
	.month {
		text-align: center;
		min-width: 0;
	}
	.month .count {
		font-size: 10px;
		color: #babcc6;
		display: block;
		margin-bottom: 10px;
	}
	.bar-track {
		height: 120px;
		display: flex;
		align-items: flex-end;
		border-bottom: 1px solid #4d4540;
		background: linear-gradient(0deg, #ffffff03, transparent);
	}
	.bar {
		background: linear-gradient(0deg, #be5746, #f2ab81);
		width: 100%;
		border-radius: 3px 3px 0 0;
	}
	.month strong {
		font-size: 10px;
		display: block;
		margin-top: 12px;
		font-weight: 500;
	}
	.month small {
		font-size: 9px;
		color: #858a96;
		display: block;
		margin-top: 8px;
	}
	.muted {
		font-size: 11px;
		line-height: 1.7;
		color: #979ba7;
		margin: 0;
	}
	.data-panel {
		padding: 26px 0 0;
		overflow: hidden;
	}
	.data-panel .section-title {
		padding: 0 26px;
	}
	.tabs {
		display: flex;
		padding: 0 26px;
		border-bottom: 1px solid #393a41;
		gap: 20px;
	}
	.tabs button {
		border: 0;
		border-radius: 0;
		background: transparent;
		color: #999da8;
		padding: 10px 0 16px;
		min-height: 48px;
	}
	.tabs button.chosen {
		color: #ff9a8e;
		border-bottom: 2px solid #f47364;
	}
	.filters {
		display: flex;
		gap: 12px;
		padding: 24px 26px;
		align-items: flex-end;
	}
	.filters label {
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 10px;
		color: #a4a8b4;
	}
	.filters label:first-child {
		flex: 1;
	}
	.filters input {
		width: 100%;
	}
	.primary {
		background: #eb6252;
		border-color: #eb6252;
		color: #fff;
		font-weight: 600;
	}
	.primary:hover {
		background: #c84b3d;
	}
	.table-wrap {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		text-align: left;
		font-size: 11px;
	}
	th {
		background: #232429;
		color: #a4a8b3;
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		padding: 15px 20px;
		white-space: nowrap;
	}
	td {
		padding: 18px 20px;
		border-bottom: 1px solid #303139;
		color: #c4c6cf;
		white-space: nowrap;
	}
	td:first-child {
		min-width: 220px;
		max-width: 360px;
		white-space: normal;
	}
	td strong {
		font-weight: 500;
		color: #e5e4df;
		font-size: 12px;
	}
	td small {
		display: block;
		color: #969ba8;
		margin-top: 7px;
		font-size: 10px;
	}
	tbody tr:hover {
		background: #202126;
	}
	.name {
		border: none;
		background: transparent;
		padding: 0;
		min-height: 28px;
		font-size: 12px;
		text-align: left;
		color: #efede7;
	}
	.name:hover {
		background: none;
		color: #ff9a8e;
	}
	.positive {
		color: #9bd1b8;
	}
	.negative {
		color: #f29e95;
	}
	td a,
	.method a {
		color: #eeac88;
		text-decoration: none;
	}
	.table-note {
		font-size: 10px;
		color: #9da1af;
		padding: 18px 26px;
		line-height: 1.8;
		min-width: 400px;
	}
	.method {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 36px;
		margin-top: 34px;
		padding-top: 28px;
		border-top: 1px solid #36373e;
	}
	.method p {
		font-size: 11px;
		color: #999eaa;
		line-height: 1.85;
	}
	.filter-note {
		padding: 0 26px 20px;
	}
	.empty,
	.loading {
		padding: 45px 26px;
		color: #a3a7b2;
		font-size: 13px;
	}
	.warning {
		border: 1px solid #a6635d;
		padding: 20px;
		color: #ffc1b8;
		border-radius: 8px;
		margin-bottom: 20px;
	}
	.warning button {
		margin-left: 20px;
	}
	.signin {
		max-width: 560px;
		margin: 60px auto;
		line-height: 1.7;
	}
	.signin .action {
		display: inline-block;
		margin-top: 20px;
	}
	@media (max-width: 850px) {
		header {
			padding: 16px 20px;
			flex-wrap: wrap;
		}
		nav {
			width: 100%;
			gap: 20px;
		}
		main {
			padding: 32px 16px;
		}
		.sales-hero {
			align-items: flex-start;
			flex-direction: column;
		}
		.source {
			font-size: 9px;
		}
		.coverage {
			align-items: flex-start;
			flex-direction: column;
		}
		.metrics {
			grid-template-columns: repeat(2, 1fr);
		}
		.metrics > div {
			border-bottom: 1px solid #3b3c43;
			padding: 20px 16px;
		}
		.metrics > div + div {
			border-left: 0;
		}
		.metrics > div:nth-child(even) {
			border-left: 1px solid #3b3c43;
		}
		.metrics > div:last-child {
			grid-column: 1/-1;
		}
		.metrics strong {
			font-size: 28px;
		}
		.panel {
			padding: 20px 16px;
		}
		.data-panel {
			padding: 20px 0 0;
		}
		.section-title {
			align-items: flex-start;
			flex-direction: column;
			gap: 12px;
		}
		h2 {
			font-size: 21px;
		}
		.bars {
			gap: 7px;
			overflow: auto;
		}
		.month small {
			display: none;
		}
		.bar-track {
			height: 90px;
		}
		.month .count {
			font-size: 8px;
		}
		.month strong {
			font-size: 8px;
		}
		.tabs {
			gap: 16px;
			padding: 0 16px;
		}
		.tabs button {
			font-size: 10px;
			text-align: left;
		}
		.filters {
			padding: 20px 16px;
			flex-wrap: wrap;
		}
		.filters label:first-child {
			flex-basis: 100%;
		}
		.filters label:nth-child(2) {
			flex: 1;
		}
		.data-panel .section-title {
			padding: 0 16px;
		}
		.method {
			grid-template-columns: 1fr;
			gap: 16px;
		}
		.table-note {
			min-width: 0;
		}
		.brand {
			font-size: 21px;
		}
		.brand small {
			font-size: 8px;
		}
	}
</style>
