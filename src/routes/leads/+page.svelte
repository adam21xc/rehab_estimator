<script lang="ts">
	import { onMount } from 'svelte';
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
		busy = $state(false),
		authBusy = $state(false);
	let email = $state(''),
		password = $state(''),
		mode = $state<'signin' | 'signup'>('signin');
	let message = $state(''),
		problem = $state(''),
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
	async function authenticate(event: SubmitEvent) {
		event.preventDefault();
		authBusy = true;
		problem = '';
		message = '';
		try {
			const result = await request('/api/rehab/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password, mode })
			});
			password = '';
			message = result.message;
			if (result.signedIn) {
				signedIn = true;
				await load();
			}
		} catch (e) {
			problem = (e as Error).message;
		} finally {
			authBusy = false;
		}
	}
	async function signOut() {
		try {
			await request('/api/rehab/session', { method: 'DELETE' });
			generation++;
			signedIn = false;
			leads = [];
			selected = null;
			message = '';
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
	<header>
		<a class="brand" href={resolve('/leads')}><span>Λ</span> APEX <small>PROPERTY CRM</small></a>
		<nav aria-label="Workspace">
			<a href={resolve('/sales')}>Sales intelligence</a>
			<a class="active" href={resolve('/leads')}>Leads</a><a href={resolve('/rehab')}
				>Rehab studio</a
			>{#if signedIn}<button onclick={signOut}>Sign out</button>{/if}
		</nav>
	</header>
	<main>
		<div class="heading">
			<div>
				<p class="eyebrow">ACQUISITIONS / LEAD INTELLIGENCE</p>
				<h1>Your next opportunity.</h1>
				<p class="muted">Local signals. Real properties. One place to start.</p>
			</div>
			<span class="source"><i></i> Indianapolis · Accela</span>
		</div>
		{#if problem}<div class="notice error" role="alert">
				{problem}{#if signedIn}<button onclick={() => load(page)}>Retry</button>{/if}
			</div>{/if}
		{#if checking}<p class="notice" role="status">Opening your workspace…</p>
		{:else if !signedIn}
			<section class="signin">
				<p class="eyebrow">YOUR PRIVATE WORKSPACE</p>
				<h2>{mode === 'signin' ? 'Sign in to your CRM.' : 'Create your workspace account.'}</h2>
				<p class="muted">
					Use the same account as the rehab calculator. This is your app password, not your Gmail
					password.
				</p>
				<form onsubmit={authenticate}>
					<label>Email<input type="email" bind:value={email} autocomplete="email" required /></label
					><label
						>Password<input
							type="password"
							bind:value={password}
							minlength="8"
							autocomplete={mode === 'signin' ? 'current-password' : 'new-password'}
							required
						/></label
					><button class="primary" disabled={authBusy}
						>{authBusy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button
					>
				</form>
				<button
					class="text-button"
					onclick={() => {
						mode = mode === 'signin' ? 'signup' : 'signin';
						problem = '';
						message = '';
					}}>{mode === 'signin' ? 'Create an account' : 'Already have an account?'}</button
				>{#if message}<p role="status">{message}</p>{/if}
			</section>
		{:else}
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
						>Search leads<input placeholder="Street address or case number" bind:value={q} /></label
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
				><span>MyCase & skip tracing · not connected yet</span>
			</div>
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
	.crm {
		min-height: 100vh;
		background: #101113;
		color: #edece8;
		font-family: Inter, Arial, sans-serif;
		color-scheme: dark;
	}
	.crm * {
		box-sizing: border-box;
	}
	header {
		max-width: 1440px;
		margin: auto;
		padding: 24px 40px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid #2c2d31;
	}
	.brand {
		font-size: 24px;
		font-weight: 800;
		letter-spacing: 2px;
		text-decoration: none;
		color: inherit;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.brand span {
		color: #ff584b;
		font-size: 34px;
	}
	.brand small {
		font-size: 9px;
		letter-spacing: 2px;
		color: #a4a5ad;
		border-left: 1px solid #555;
		padding-left: 12px;
	}
	nav {
		display: flex;
		gap: 24px;
		align-items: center;
	}
	nav a {
		color: #a4a5ad;
		text-decoration: none;
		font-size: 13px;
	}
	nav .active {
		color: #ff6559;
	}
	main {
		max-width: 1440px;
		padding: 54px 40px;
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
		color: #ff776c;
		font-weight: 700;
		margin: 0 0 12px;
	}
	h1 {
		font-size: clamp(32px, 4vw, 48px);
		letter-spacing: -2px;
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
		color: #a4a5ad;
		font-size: 14px;
		line-height: 1.6;
	}
	.source {
		font-size: 12px;
		color: #bcbec4;
		white-space: nowrap;
	}
	.source i {
		display: inline-block;
		width: 6px;
		height: 6px;
		background: #ff6254;
		border-radius: 50%;
		margin-right: 8px;
	}
	.metrics {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border: 1px solid #343438;
		background: linear-gradient(125deg, #202125, #17181b);
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
		border-left: 1px solid #343438;
	}
	.metrics span {
		color: #babac1;
		font-size: 12px;
	}
	.metrics strong {
		font-size: 38px;
		font-weight: 500;
		letter-spacing: -1px;
	}
	.metrics small {
		font-size: 11px;
		color: #92939c;
	}
	.inbox {
		border: 1px solid #343438;
		border-radius: 12px;
		background: #18191c;
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
		border: 1px solid #48494f;
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
		border: 1px solid #44454c;
		background: #222328;
		color: inherit;
		border-radius: 6px;
		padding: 10px 14px;
		font-size: 12px;
		min-height: 40px;
	}
	button:hover {
		background: #34353b;
	}
	button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.primary {
		background: #f25749;
		border-color: #f25749;
		color: #fff;
		font-weight: 600;
	}
	.primary:hover {
		background: #d94438;
	}
	.filters {
		padding: 0 24px 24px;
		display: flex;
		align-items: flex-end;
		gap: 12px;
	}
	.filters label {
		font-size: 10px;
		color: #a9abb3;
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
		border: 1px solid #44454c;
		border-radius: 6px;
		background: #111215;
		color: #eee;
		font-size: 12px;
	}
	input:focus,
	select:focus,
	button:focus-visible,
	a:focus-visible {
		outline: 2px solid #ff776c;
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
		background: #202125;
		color: #a7a8af;
		font-size: 10px;
		letter-spacing: 0.6px;
		text-transform: uppercase;
		padding: 14px 20px;
		white-space: nowrap;
	}
	td {
		padding: 20px;
		border-bottom: 1px solid #2e2f34;
		max-width: 270px;
		color: #c8c9cf;
		line-height: 1.5;
	}
	td small {
		display: block;
		color: #858792;
		font-size: 10px;
		margin-top: 5px;
		letter-spacing: 0.5px;
	}
	tr:hover td {
		background: #1f2024;
	}
	.address {
		padding: 0;
		border: 0;
		background: transparent;
		text-align: left;
		font-size: 13px;
		font-weight: 600;
		color: #f1efea;
		min-height: 24px;
	}
	.address:hover {
		background: transparent;
		color: #ff776c;
	}
	.date {
		white-space: nowrap;
	}
	.badge {
		display: inline-block;
		padding: 4px 8px;
		background: #453224;
		color: #f2c497;
		border: 1px solid #65452c;
		border-radius: 5px;
		font-size: 10px;
		white-space: nowrap;
	}
	.badge.closed {
		background: #292d30;
		border-color: #42474b;
		color: #b2b8bf;
	}
	.detail-status {
		font-size: 11px;
		color: #9698a3;
		white-space: nowrap;
	}
	.detail-status.ready {
		color: #9ccbb2;
	}
	.pagination {
		padding: 16px 24px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 11px;
		color: #a4a5ad;
	}
	.pagination div {
		display: flex;
		gap: 8px;
	}
	.empty {
		padding: 60px 24px;
		text-align: center;
		color: #a4a5ad;
	}
	.empty h3 {
		color: #e6e5e0;
		font-size: 18px;
	}
	.footnote {
		display: flex;
		justify-content: space-between;
		gap: 15px;
		margin-top: 18px;
		color: #8e909b;
		font-size: 10px;
	}
	.notice {
		padding: 20px;
		border: 1px solid #4b4b52;
		border-radius: 8px;
		margin: 20px 0;
	}
	.error {
		color: #ffb2aa;
		border-color: #9c524c;
	}
	.notice button {
		margin-left: 12px;
	}
	.signin {
		max-width: 450px;
		margin: 60px auto;
		padding: 32px;
		background: #1b1c20;
		border: 1px solid #3e3f45;
		border-radius: 12px;
	}
	.signin form {
		display: grid;
		gap: 18px;
		margin-top: 24px;
	}
	.signin label {
		display: grid;
		gap: 8px;
		font-size: 12px;
	}
	.text-button {
		border: none;
		background: transparent;
		padding-left: 0;
		margin-top: 14px;
		color: #ff8d82;
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
		border-left: 1px solid #45454d;
		background: #191a1e;
		color: #ecebe7;
		color-scheme: dark;
		font-family: Inter, Arial, sans-serif;
		padding: 0;
	}
	dialog::backdrop {
		background: #000a;
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
		border: 1px solid #555;
		color: #eee;
		background: #222;
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
		border-top: 1px solid #38393f;
		padding: 24px 0;
	}
	.detail-section h3 {
		font-size: 15px;
		font-weight: 600;
		margin: 0 0 16px;
	}
	.detail-section h4 {
		font-size: 11px;
		color: #ff9289;
		margin: 24px 0 12px;
		letter-spacing: 1px;
	}
	.party {
		padding: 16px;
		background: #222328;
		border: 1px solid #36373e;
		border-radius: 8px;
		margin-bottom: 10px;
		font-size: 12px;
		line-height: 1.7;
		overflow-wrap: anywhere;
	}
	.party strong {
		display: block;
		color: #fff;
		margin-bottom: 5px;
	}
	.source-link {
		display: inline-block;
		color: #ff9289;
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
		color: #9b9da6;
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
		header {
			padding: 16px 20px;
			gap: 14px;
			flex-wrap: wrap;
		}
		.brand {
			font-size: 20px;
		}
		.brand small {
			font-size: 8px;
		}
		nav {
			gap: 16px;
			width: 100%;
			justify-content: flex-start;
		}
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
			border-top: 1px solid #343438;
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
			color: #90939e;
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
		.signin {
			margin: 24px auto;
			padding: 24px;
		}
		.drawer {
			padding: 24px;
		}
		.drawer h2 {
			font-size: 24px;
		}
	}
</style>
