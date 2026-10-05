<script lang="ts">
	import { onMount } from 'svelte';
	import EmailSignIn from '$lib/components/EmailSignIn.svelte';
	import { page as route } from '$app/state';
	import { goto } from '$app/navigation';
	import MyCaseInbox from '$lib/components/MyCaseInbox.svelte';
	const source = $derived(route.url.searchParams.get('source') === 'mycase' ? 'mycase' : 'accela');
	import { resolve } from '$app/paths';
	type Party = { display_name: string; raw_lines: string[]; phones: string[]; emails: string[] };
	type Lead = {
		case_number: string;
		address: string;
		filed_date: string;
		case_type: string;
		record_status: string;
		owners: Party[];
		occupants: Party[];
		violators: Party[];
		detail_checked_at: string | null;
		detail_failures: number;
		source_url?: string;
		project_description?: string;
		violation_details?: { title: string; entries: { label: string; value: string }[] }[];
		parcel_information?: string[];
	};
	let signedIn = $state(false),
		checking = $state(true),
		busy = $state(false);
	let problem = $state(''),
		detailError = $state('');
	let leads = $state<Lead[]>([]),
		selected = $state<Lead | null>(null),
		detailBusy = $state(false);
	let q = $state(''),
		status = $state(''),
		readiness = $state(''),
		sort = $state('newest');
	let page = $state(1),
		count = $state(0);
	let stats = $state({ total: 0, ready: 0, retry: 0 });
	let coverage = $state<{ firstFiled: string | null; lastFiled: string | null } | null>(null);
	let lastRun = $state<{ status: string; started_at: string } | null>(null);
	let dialog: HTMLDialogElement;
	let generation = 0;
	const date = (value?: string | null) =>
		value
			? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString(undefined, {
					month: 'short',
					day: 'numeric',
					year: 'numeric'
				})
			: 'Not yet fetched';
	const names = (parties: Party[]) =>
		parties
			?.map((p) => p.display_name)
			.filter(Boolean)
			.join(', ') || 'Not listed';
	const safeSource = (value?: string) => {
		try {
			const u = new URL(value || '');
			return u.protocol === 'https:' && u.hostname === 'aca-prod.accela.com' ? u.href : null;
		} catch {
			return null;
		}
	};
	async function request(path: string, options?: RequestInit) {
		const response = await fetch(path, options);
		const body = await response.json();
		if (response.status === 401) {
			signedIn = false;
			leads = [];
			selected = null;
			dialog?.close();
		}
		if (!response.ok) throw new Error(body.message || 'Request failed. Please try again.');
		return body;
	}
	async function load(nextPage = 1) {
		const current = ++generation;
		busy = true;
		problem = '';
		try {
			const data = await request(
				`/api/rehab/leads?${new URLSearchParams({ q, status, readiness, sort, page: String(nextPage) })}`
			);
			if (current !== generation) return;
			leads = data.leads;
			count = data.count;
			page = data.page;
			stats = data.stats;
			lastRun = data.lastRun;
			coverage = data.coverage || null;
		} catch (e) {
			if (current === generation) problem = (e as Error).message;
		} finally {
			if (current === generation) busy = false;
		}
	}
	async function signOut() {
		try {
			await request('/api/rehab/session', { method: 'DELETE' });
			generation++;
			signedIn = false;
			leads = [];
			selected = null;
		} catch (e) {
			problem = (e as Error).message;
		}
	}
	async function openCase(lead: Lead) {
		selected = lead;
		detailError = '';
		detailBusy = true;
		dialog.showModal();
		try {
			const result = await request(`/api/rehab/leads/${encodeURIComponent(lead.case_number)}`);
			if (selected?.case_number === lead.case_number) selected = result.lead;
		} catch (e) {
			detailError = (e as Error).message;
		} finally {
			detailBusy = false;
		}
	}
	onMount(async () => {
		try {
			const session = await request('/api/rehab/session');
			signedIn = !!session.user;
			if (signedIn) await load();
		} catch (e) {
			problem = (e as Error).message;
		} finally {
			checking = false;
		}
	});
</script>

<svelte:head
	><title>Lead inbox · Apex CRM</title><meta name="theme-color" content="#101113" /></svelte:head
>
<div class="crm">
	<main>
		<div class="heading">
			<div>
				<p class="eyebrow">ACQUISITIONS / LEAD INTELLIGENCE</p>
				<h1>{source === 'mycase' ? 'MyCase records' : 'Accela records'}</h1>
				<p class="muted">Local signals. Real properties. One place to start.</p>
			</div>
			<div class="source">
				{#if signedIn}<button onclick={signOut}>Sign out</button>{/if}
			</div>
		</div>
		{#if problem}<div class="notice error" role="alert">
				{problem}{#if signedIn}<button onclick={() => load(page)}>Retry</button>{/if}
			</div>{/if}
		{#if checking}<p class="notice" role="status">Opening your workspace…</p>
		{:else if !signedIn}
			<EmailSignIn
				onSignedIn={async () => {
					signedIn = true;
					await load();
				}}
			/>
		{:else}
			<div class="source-tabs" role="tablist" aria-label="Lead source">
				<button
					role="tab"
					aria-selected={source === 'accela'}
					onclick={() => goto(resolve('/leads?source=accela'), { noScroll: true })}
					>Code violations</button
				><button
					role="tab"
					aria-selected={source === 'mycase'}
					onclick={() => goto(resolve('/leads?source=mycase'), { noScroll: true })}
					>MyCase court leads</button
				>
			</div>
			{#if source === 'mycase'}<MyCaseInbox
					onUnauthorized={() => {
						signedIn = false;
					}}
				/>{:else}
				<section class="metrics" aria-label="Import overview">
					<div>
						<span>Imported cases</span><strong>{stats.total.toLocaleString()}</strong><small
							>Accela source records</small
						>
					</div>
					<div>
						<span>Details available</span><strong>{stats.ready.toLocaleString()}</strong><small
							>Ready for your review</small
						>
					</div>
					<div>
						<span>Awaiting details</span><strong
							>{(stats.total - stats.ready).toLocaleString()}</strong
						><small>{stats.retry} cases scheduled for retry</small>
					</div>
				</section>
				<section class="inbox">
					<div class="section-heading">
						<div>
							<p class="eyebrow">01 / SOURCE INBOX</p>
							<h2>Code violation leads <span>{count}</span></h2>
						</div>
						<button disabled={busy} onclick={() => load(page)}
							>{busy ? 'Refreshing…' : '↻ Refresh'}</button
						>
					</div>
					<p class="context">
						Each row is a case, so a property may appear more than once. Case status comes from
						Accela. {stats.ready} of {stats.total} cases have full details; {stats.total -
							stats.ready} have summaries awaiting their detail fetch.
						{#if coverage?.firstFiled}
							Imported cases were filed {coverage.firstFiled} through {coverage.lastFiled}. This is
							the imported coverage, not all historical Accela cases.{/if}
					</p>
					<form
						class="filters"
						onsubmit={(e) => {
							e.preventDefault();
							load();
						}}
					>
						<label class="search"
							>Search leads<input
								placeholder="Street address or case number"
								bind:value={q}
							/></label
						><label
							>Case status<select bind:value={status}
								><option value="">All statuses</option><option value="active">Active cases</option
								><option value="closed">Closed cases</option><option value="void">Void</option
								></select
							></label
						><label
							>Details<select bind:value={readiness}
								><option value="">All cases</option><option value="ready">Available</option><option
									value="pending">Awaiting details</option
								><option value="retry">Retry scheduled</option></select
							></label
						><label
							>Sort<select bind:value={sort}
								><option value="newest">Newest first</option><option value="oldest"
									>Oldest first</option
								></select
							></label
						><button class="primary" disabled={busy}>Apply</button>
					</form>
					<div class="table-wrap" aria-busy={busy}>
						<table>
							<thead
								><tr
									><th>Property / case</th><th>Violation type</th><th>Case status</th><th>Owner</th
									><th>Filed</th><th>Details</th></tr
								></thead
							>
							<tbody
								>{#each leads as lead (lead.case_number)}<tr>
										<td
											><button class="address" onclick={() => openCase(lead)}
												>{lead.address || 'Address not listed'}</button
											><small>{lead.case_number}</small></td
										>
										<td data-label="Violation type">{lead.case_type || 'Not listed'}</td>
										<td data-label="Case status"
											><span class:closed={lead.record_status?.startsWith('Closed')} class="badge"
												>{lead.record_status}</span
											></td
										>
										<td data-label="Owner"
											>{lead.detail_checked_at ? names(lead.owners) : 'Awaiting details'}</td
										>
										<td data-label="Filed" class="date">{date(lead.filed_date)}</td>
										<td data-label="Details"
											><span class="detail-status" class:ready={!!lead.detail_checked_at}
												>{lead.detail_failures
													? 'Retry scheduled'
													: lead.detail_checked_at
														? 'Available'
														: 'Summary only'}</span
											></td
										>
									</tr>{/each}</tbody
							>
						</table>
						{#if !leads.length}<div class="empty">
								<h3>{busy ? 'Loading leads…' : 'No cases match this view.'}</h3>
								<p>
									{busy
										? 'Fetching your latest imported records.'
										: 'Try a different address or remove a filter.'}
								</p>
							</div>{/if}
					</div>
					<footer class="pagination">
						<span
							>{count
								? `${(page - 1) * 25 + 1}–${Math.min(page * 25, count)} of ${count}`
								: '0 cases'}</span
						>
						<div>
							<button disabled={busy || page <= 1} onclick={() => load(page - 1)}>← Previous</button
							><button disabled={busy || page * 25 >= count} onclick={() => load(page + 1)}
								>Next →</button
							>
						</div>
					</footer>
				</section>
				<div class="footnote">
					<span
						>Latest import: {lastRun
							? `${lastRun.status} · ${new Date(lastRun.started_at).toLocaleString()}`
							: 'No runs yet'}</span
					><span>Skip tracing · not connected yet</span>
				</div>
			{/if}
		{/if}
	</main>
</div>
<dialog
	bind:this={dialog}
	onclose={() => {
		selected = null;
	}}
	aria-labelledby="case-title"
>
	{#if selected}<div class="drawer">
			<div class="drawer-top">
				<p class="eyebrow">ACCELA / {selected.case_number}</p>
				<button aria-label="Close case details" onclick={() => dialog.close()}>✕</button>
			</div>
			<h2 id="case-title">{selected.address || 'Address not listed'}</h2>
			<p>{selected.case_type} <span class="badge">{selected.record_status}</span></p>
			{#if detailBusy}<p role="status">Loading case details…</p>{:else if detailError}<p
					class="notice error"
					role="alert"
				>
					{detailError}
				</p>
				<button onclick={() => selected && openCase(selected)}>Retry details</button>{:else}
				{#if !selected.detail_checked_at}<p class="notice">
						This case is queued for detail collection. Contact and violation information will appear
						after the worker fetches it.
					</p>{/if}
				<p class="muted">
					Filed {date(selected.filed_date)} · Details checked {date(selected.detail_checked_at)}
				</p>
				{#if safeSource(selected.source_url)}<!-- External URL is restricted to the HTTPS Accela host by safeSource. -->
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						class="source-link"
						href={safeSource(selected.source_url)}
						target="_blank"
						rel="noreferrer">View original Accela record ↗</a
					><!-- eslint-enable svelte/no-navigation-without-resolve -->{/if}
				{#each [{ title: 'Owners', parties: selected.owners }, { title: 'Occupants', parties: selected.occupants }, { title: 'Named violators', parties: selected.violators }] as group (group.title)}<section
						class="detail-section"
					>
						<h3>{group.title}</h3>
						{#if group.parties?.length}{#each group.parties as party, i (i)}<div class="party">
									<strong>{party.display_name}</strong
									>{#each party.raw_lines?.slice(1) || [] as line, i (i)}<div>{line}</div>{/each}
								</div>{/each}{:else}<p class="muted">
								{selected.detail_checked_at
									? 'Not listed in the source record.'
									: 'Awaiting details.'}
							</p>{/if}
					</section>{/each}
				<section class="detail-section">
					<h3>Violation details</h3>
					{#if selected.project_description}<p class="narrative">
							{selected.project_description}
						</p>{/if}{#each selected.violation_details || [] as group, i (i)}<h4>{group.title}</h4>
						<dl>
							{#each group.entries as entry, i (i)}<div>
									<dt>{entry.label}</dt>
									<dd>{entry.value || '—'}</dd>
								</div>{/each}
						</dl>{:else}<p class="muted">No violation tables available yet.</p>{/each}
				</section>
				{#if selected.parcel_information?.length}<section class="detail-section">
						<h3>Parcel information</h3>
						{#each selected.parcel_information as line, i (i)}<p>{line}</p>{/each}
					</section>{/if}
			{/if}
		</div>{/if}
</dialog>

<style>
	.source-tabs {
		display: flex;
		gap: 12px;
		margin: 20px 0;
	}
	.source-tabs [aria-selected='true'] {
		border-color: var(--accent);
		color: var(--accent);
	}
	.crm {
		min-height: calc(100dvh - 64px);
		background: var(--canvas);
		color: var(--ink);
		font-family: Inter, Arial, sans-serif;
		color-scheme: light;
	}
	.crm * {
		box-sizing: border-box;
	}
	main {
		max-width: 1440px;
		padding: 32px;
		margin: auto;
	}
	.heading {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 24px;
		margin-bottom: 36px;
	}
	.eyebrow {
		font-size: 10px;
		letter-spacing: 2px;
		color: var(--accent);
		font-weight: 700;
		margin: 0 0 12px;
	}
	h1 {
		font-size: 30px;
		letter-spacing: -0.8px;
		font-weight: 650;
		margin: 0 0 12px;
		line-height: 1.1;
	}
	h2 {
		font-size: 23px;
		font-weight: 600;
		margin: 0 0 12px;
		letter-spacing: -0.5px;
	}
	.muted,
	.context {
		color: var(--muted);
		font-size: 14px;
		line-height: 1.6;
	}
	.source {
		font-size: 12px;
		color: var(--muted);
		white-space: nowrap;
	}
	.metrics {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border: 1px solid var(--border);
		background: var(--surface);
		border-radius: 12px;
		margin-bottom: 36px;
	}
	.metrics > div {
		padding: 24px 28px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.metrics > div + div {
		border-left: 1px solid var(--border);
	}
	.metrics span {
		color: var(--muted);
		font-size: 12px;
	}
	.metrics strong {
		font-size: 38px;
		font-weight: 500;
		letter-spacing: -1px;
	}
	.metrics small {
		font-size: 11px;
		color: var(--muted);
	}
	.inbox {
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--surface);
		overflow: hidden;
	}
	.section-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 26px 24px 0;
		gap: 12px;
	}
	.section-heading h2 span {
		font-size: 12px;
		border: 1px solid var(--border);
		border-radius: 20px;
		padding: 4px 8px;
		vertical-align: middle;
		margin-left: 8px;
	}
	.context {
		font-size: 12px;
		padding: 0 24px;
		margin: 0 0 20px;
	}
	button,
	input,
	select {
		font: inherit;
	}
	button {
		cursor: pointer;
		border: 1px solid var(--border);
		background: var(--surface);
		color: inherit;
		border-radius: 6px;
		padding: 10px 14px;
		font-size: 12px;
		min-height: 40px;
	}
	button:hover {
		background: var(--canvas);
	}
	button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.primary {
		background: #eef3ff;
		border-color: var(--accent);
		color: white;
		font-weight: 600;
	}
	.primary:hover {
		background: #eef3ff;
	}
	.filters {
		padding: 0 24px 24px;
		display: flex;
		align-items: flex-end;
		gap: 12px;
	}
	.filters label {
		font-size: 10px;
		color: var(--muted);
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex: 1;
	}
	.filters .search {
		flex: 2;
	}
	input,
	select {
		width: 100%;
		min-height: 42px;
		padding: 10px 12px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		font-size: 12px;
	}
	input:focus,
	select:focus,
	button:focus-visible,
	a:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}
	.table-wrap {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		text-align: left;
		font-size: 12px;
	}
	th {
		background: var(--surface);
		color: var(--muted);
		font-size: 10px;
		letter-spacing: 0.6px;
		text-transform: uppercase;
		padding: 14px 20px;
		white-space: nowrap;
	}
	td {
		padding: 20px;
		border-bottom: 1px solid var(--border);
		max-width: 270px;
		color: var(--muted);
		line-height: 1.5;
	}
	td small {
		display: block;
		color: var(--muted);
		font-size: 10px;
		margin-top: 5px;
		letter-spacing: 0.5px;
	}
	tr:hover td {
		background: var(--surface);
	}
	.address {
		padding: 0;
		border: 0;
		background: transparent;
		text-align: left;
		font-size: 13px;
		font-weight: 600;
		color: var(--ink);
		min-height: 24px;
	}
	.address:hover {
		background: transparent;
		color: var(--accent);
	}
	.date {
		white-space: nowrap;
	}
	.badge {
		display: inline-block;
		padding: 4px 8px;
		background: var(--canvas);
		color: var(--muted);
		border: 1px solid var(--accent);
		border-radius: 5px;
		font-size: 10px;
		white-space: nowrap;
	}
	.badge.closed {
		background: var(--canvas);
		border-color: var(--border);
		color: var(--muted);
	}
	.detail-status {
		font-size: 11px;
		color: var(--muted);
		white-space: nowrap;
	}
	.detail-status.ready {
		color: #16836b;
	}
	.pagination {
		padding: 16px 24px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 11px;
		color: var(--muted);
	}
	.pagination div {
		display: flex;
		gap: 8px;
	}
	.empty {
		padding: 60px 24px;
		text-align: center;
		color: var(--muted);
	}
	.empty h3 {
		color: var(--ink);
		font-size: 18px;
	}
	.footnote {
		display: flex;
		justify-content: space-between;
		gap: 15px;
		margin-top: 18px;
		color: var(--muted);
		font-size: 10px;
	}
	.notice {
		padding: 20px;
		border: 1px solid var(--border);
		border-radius: 8px;
		margin: 20px 0;
	}
	.error {
		color: var(--accent);
		border-color: var(--accent);
	}
	.notice button {
		margin-left: 12px;
	}
	dialog {
		position: fixed;
		inset: 0 0 0 auto;
		margin: 0;
		width: min(600px, 100%);
		height: 100dvh;
		max-height: 100dvh;
		max-width: 100%;
		border: 0;
		border-left: 1px solid var(--border);
		background: var(--surface);
		color: var(--ink);
		color-scheme: light;
		font-family: Inter, Arial, sans-serif;
		padding: 0;
	}
	dialog::backdrop {
		background: var(--surface);
		backdrop-filter: blur(3px);
	}
	.drawer {
		padding: 30px;
	}
	.drawer-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 15px;
	}
	.drawer-top button {
		border: 1px solid var(--border);
		color: var(--ink);
		background: var(--surface);
		padding: 10px;
		border-radius: 6px;
	}
	.drawer h2 {
		margin: 24px 0 16px;
		font-size: 27px;
		line-height: 1.25;
	}
	.drawer > p {
		font-size: 12px;
		line-height: 1.6;
	}
	.detail-section {
		border-top: 1px solid var(--border);
		padding: 24px 0;
	}
	.detail-section h3 {
		font-size: 15px;
		font-weight: 600;
		margin: 0 0 16px;
	}
	.detail-section h4 {
		font-size: 11px;
		color: var(--accent);
		margin: 24px 0 12px;
		letter-spacing: 1px;
	}
	.party {
		padding: 16px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		margin-bottom: 10px;
		font-size: 12px;
		line-height: 1.7;
		overflow-wrap: anywhere;
	}
	.party strong {
		display: block;
		color: var(--ink);
		margin-bottom: 5px;
	}
	.source-link {
		display: inline-block;
		color: var(--accent);
		font-size: 12px;
		margin: 16px 0 24px;
	}
	.narrative {
		white-space: pre-line;
		font-size: 13px;
		line-height: 1.7;
	}
	dl > div {
		margin-bottom: 16px;
	}
	dt {
		font-size: 10px;
		text-transform: uppercase;
		color: var(--muted);
		margin-bottom: 6px;
	}
	dd {
		font-size: 13px;
		line-height: 1.6;
		margin: 0;
		overflow-wrap: anywhere;
	}
	.detail-section > p {
		font-size: 12px;
	}
	@media (max-width: 720px) {
		main {
			padding: 32px 16px;
		}
		.heading {
			align-items: flex-start;
			flex-direction: column;
			gap: 16px;
		}
		.metrics {
			margin-bottom: 24px;
		}
		.metrics > div {
			padding: 16px 12px;
		}
		.metrics strong {
			font-size: 30px;
		}
		.metrics span,
		.metrics small {
			font-size: 10px;
		}
		.filters {
			flex-wrap: wrap;
			padding: 0 16px 20px;
			gap: 12px;
		}
		.filters .search {
			flex-basis: 100%;
		}
		.filters label {
			flex-basis: 40%;
		}
		.section-heading {
			padding: 20px 16px 0;
		}
		.section-heading h2 {
			font-size: 19px;
		}
		.context {
			padding: 0 16px;
		}
		.pagination {
			padding: 14px 16px;
		}
		.footnote {
			flex-direction: column;
		}
		.table-wrap table,
		tbody {
			display: block;
			width: 100%;
		}
		thead {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}
		tbody tr {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			padding: 16px;
			border-top: 1px solid var(--border);
			gap: 16px;
		}
		td {
			display: block;
			padding: 0;
			border: 0;
			max-width: none;
			overflow-wrap: anywhere;
		}
		td:first-child {
			grid-column: 1 / -1;
		}
		td[data-label]::before {
			content: attr(data-label);
			display: block;
			font-size: 10px;
			color: var(--muted);
			margin-bottom: 5px;
		}
		.badge {
			white-space: normal;
		}
		.address {
			min-height: 32px;
		}
		.table-wrap {
			overflow: visible;
		}
		.drawer {
			padding: 24px;
		}
		.drawer h2 {
			font-size: 24px;
		}
	}

	.metrics {
		background: transparent;
		border: 0;
		gap: 14px;
		overflow: visible;
	}
	.metrics > div {
		background: white;
		border: 1px solid var(--border);
		border-top: 3px solid #0073ea;
		border-radius: 8px;
	}
	.metrics > div:nth-child(2) {
		border-top-color: #a080ed;
	}
	.metrics > div:nth-child(3) {
		border-top-color: #26bba6;
	}
	.metrics > div:nth-child(4) {
		border-top-color: #f0b84c;
	}
	.metrics > div:nth-child(5) {
		border-top-color: #e88bb4;
	}
	.metrics strong {
		font-weight: 650;
	}

	.badge {
		background: #fff2d4;
		color: #8b5e06;
		border-color: #f2d9a4;
	}
	.badge.closed {
		background: #f0f2f6;
		color: var(--muted);
		border-color: var(--border);
	}
	.detail-status.ready {
		color: #16836b;
	}
	.inbox {
		border-left: 3px solid #a080ed;
	}
	.error {
		color: #b42341;
		border-color: #ecc3cc;
		background: #fff0f2;
	}
</style>
