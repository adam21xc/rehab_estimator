<script lang="ts">
	import { onMount } from 'svelte';
	import {
		CASE_TYPES,
		COUNTIES,
		filingDate,
		type CaseRow,
		type CaseDetail
	} from '$lib/mycase/records';
	let { onUnauthorized }: { onUnauthorized: () => void } = $props();
	let rows = $state<CaseRow[]>([]),
		selected = $state<CaseDetail | null>(null);
	let busy = $state(false),
		problem = $state(''),
		detailProblem = $state(''),
		detailBusy = $state(false);
	let q = $state(''),
		county = $state(''),
		type = $state(''),
		sort = $state('newest');
	let page = $state(1),
		count = $state(0),
		total = $state(0),
		updated = $state<string | null>(null),
		counties = $state<string[]>([]);
	let dialog: HTMLDialogElement;
	let generation = 0,
		detailGeneration = 0;
	async function request(url: string) {
		const res = await fetch(url);
		if (res.status === 401) {
			onUnauthorized();
			throw new Error('Please sign in again.');
		}
		const data = await res.json();
		if (!res.ok) throw new Error(data.message || 'Unable to load MyCase.');
		return data;
	}
	async function load(next = 1) {
		const current = ++generation;
		busy = true;
		problem = '';
		try {
			const data = await request(
				`/api/rehab/mycase?${new URLSearchParams({ q, county, type, sort, page: String(next) })}`
			);
			if (current !== generation) return;
			rows = data.cases;
			count = data.count;
			page = data.page;
			total = data.total;
			updated = data.lastUpdated;
			counties = data.counties;
		} catch (e) {
			if (current === generation) problem = (e as Error).message;
		} finally {
			if (current === generation) busy = false;
		}
	}
	async function open(row: CaseRow) {
		const current = ++detailGeneration;
		selected = null;
		detailProblem = '';
		detailBusy = true;
		dialog.showModal();
		try {
			const data = await request(`/api/rehab/mycase/${encodeURIComponent(row.case_number)}`);
			if (current === detailGeneration) selected = data.case;
		} catch (e) {
			if (current === detailGeneration) detailProblem = (e as Error).message;
		} finally {
			if (current === detailGeneration) detailBusy = false;
		}
	}
	onMount(() => {
		void load();
	});
</script>

<section class="mycase">
	<div class="heading">
		<div>
			<p class="eyebrow">02 / COURT CASE INBOX</p>
			<h2>MyCase leads <span>{total}</span></h2>
		</div>
		<button disabled={busy} onclick={() => load(page)}
			>{busy ? 'Refreshing…' : '↻ Refresh MyCase'}</button
		>
	</div>
	<p class="context">
		Foreclosures, unsupervised estates, and evictions from the existing scraper. These are case
		records requiring review—not confirmed property owners or qualified leads.
	</p>
	<p class="freshness">
		Latest stored update: <strong
			>{updated
				? new Date(updated).toLocaleString('en-US', { timeZone: 'America/Indiana/Indianapolis' })
				: 'No imported records'}</strong
		>{updated ? ' Eastern' : ''}. Refresh reads the database; it does not run a new scrape.
	</p>
	<form
		onsubmit={(e) => {
			e.preventDefault();
			load();
		}}
	>
		<label
			>Search MyCase<input
				bind:value={q}
				placeholder="Case number, party, or mailing address"
			/></label
		><label
			>County<select bind:value={county}
				><option value="">All imported counties</option>{#each counties as code (code)}<option
						value={code}>{COUNTIES[code] || `County ${code}`}</option
					>{/each}</select
			></label
		><label
			>Case type<select bind:value={type}
				><option value="">All lead types</option
				>{#each Object.entries(CASE_TYPES) as [code, name] (code)}<option value={code}
						>{name}</option
					>{/each}</select
			></label
		><label
			>Filed date<select bind:value={sort}
				><option value="newest">Newest first</option><option value="oldest">Oldest first</option
				></select
			></label
		><button class="primary" disabled={busy}>Apply MyCase filters</button>
	</form>
	{#if problem}<p role="alert">
			{problem}<button onclick={() => load(page)}>Retry MyCase</button>
		</p>{/if}
	<div class="table-wrap" aria-busy={busy}>
		<table>
			<thead
				><tr
					><th>Case / court</th><th>Type / status</th><th>Primary defendant</th><th
						>Defendant mailing address</th
					><th>Filed</th></tr
				></thead
			><tbody>
				{#each rows as row (row.case_number)}<tr
						><td
							><button class="case" onclick={() => open(row)}>{row.case_number}</button><small
								>{row.style}</small
							><small>{row.court}</small></td
						><td>{CASE_TYPES[row.case_type_code]}<small>{row.status || 'Not listed'}</small></td><td
							>{row.primary_defendant_name || 'Not listed'}<small
								>Plaintiff: {row.primary_plaintiff_name || 'Not listed'}</small
							></td
						><td
							>{row.primary_defendant_address || 'Not listed'}<small
								>Subject property not verified</small
							></td
						><td>{filingDate(row.file_date) || row.file_date || 'Unknown'}</td></tr
					>{/each}
			</tbody>
		</table>
	</div>
	{#if !busy && !problem && !rows.length}<p class="context">
			No MyCase leads match these filters.
		</p>{/if}
	<footer>
		<span
			>{count ? (page - 1) * 25 + 1 : 0}–{Math.min(page * 25, count)} of {count} MyCase cases</span
		>
		<div>
			<button disabled={busy || page <= 1} onclick={() => load(page - 1)}>← Previous MyCase</button
			><button disabled={busy || page * 25 >= count} onclick={() => load(page + 1)}
				>Next MyCase →</button
			>
		</div>
	</footer>
</section>
<dialog
	bind:this={dialog}
	onclose={() => {
		detailGeneration++;
		selected = null;
	}}
>
	<div class="modal">
		<button class="close" onclick={() => dialog.close()}>Close MyCase details</button
		>{#if detailBusy}<p role="status">Loading case details…</p>{:else if detailProblem}<p
				role="alert"
			>
				{detailProblem}
			</p>{:else if selected}<p class="eyebrow">MYCASE / SOURCE RECORD</p>
			<h2>{selected.case_number}</h2>
			<p>{selected.style}</p>
			<p>{selected.case_type} · {selected.status}</p>
			<p>{selected.court} · Filed {filingDate(selected.file_date) || selected.file_date}</p>
			<p class="freshness">
				Party mailing addresses may belong to people, businesses, or representatives. No subject
				property or ownership match has been verified.
			</p>
			{#if selected.case_about}<h3>Case summary</h3>
				<p>{selected.case_about}</p>{/if}
			<h3>Chronological case summary</h3>
			<p class="context">
				Stored as of {new Date(selected.updated_at).toLocaleString('en-US', {
					timeZone: 'America/Indiana/Indianapolis'
				})} Eastern. Oldest date first; future dates may be scheduled hearings, not completed events.
			</p>
			{#if !selected.timeline?.available}<p>
					Chronological summary has not been captured for this record.
				</p>
			{:else if !selected.timeline.events.length}<p>
					No chronological events were returned in the stored summary.
				</p>
			{:else}<ol class="timeline">
					{#each selected.timeline.events as event (event.id)}<li>
							<div class="event-date">{event.date || 'Date not listed'} {event.time || ''}</div>
							<strong>{event.title}</strong>{#each event.details as detail, i (i)}<p>
									<span>{detail.label}:</span>
									{detail.value}
								</p>{/each}{#if event.documents.length}<p class="document-note">
									Documents referenced: {event.documents.join(', ')}. View availability in MyCase.
								</p>{/if}
						</li>{/each}
				</ol>{/if}
			<h3>Parties and mailing addresses</h3>
			{#each selected.parties || [] as party, i (i)}<div class="party">
					<strong>{party.name || 'Unnamed party'}</strong><small
						>{party.role || 'Role not listed'}</small
					>
					<p>{party.address?.formatted || 'Mailing address not listed'}</p>
				</div>{/each}<a
				href="https://public.courts.in.gov/mycase/#/vw/Search"
				target="_blank"
				rel="noreferrer">Open MyCase search ↗</a
			>
			<p class="context">
				Search using case number {selected.case_number}. Stored records may be out of date; verify
				the current court record.
			</p>{/if}
	</div>
</dialog>

<style>
	.timeline {
		list-style: none;
		padding: 0;
	}
	.timeline li {
		padding: 18px 0;
		border-bottom: 1px solid var(--border);
	}
	.timeline p {
		white-space: pre-line;
		overflow-wrap: anywhere;
		line-height: 1.6;
		margin: 8px 0;
	}
	.event-date,
	.timeline span,
	.document-note {
		color: var(--muted);
		font-size: 12px;
	}
	.event-date {
		margin-bottom: 8px;
	}
	.mycase {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		color: var(--ink);
		margin: 24px 0;
		overflow: hidden;
	}
	.heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 18px;
		padding: 24px;
	}
	h2 {
		margin: 0;
		font-size: 24px;
	}
	h2 span {
		color: var(--muted);
		font-size: 16px;
	}
	.eyebrow {
		color: var(--accent);
		letter-spacing: 2px;
		font-size: 11px;
		font-weight: 700;
	}
	.context,
	.freshness {
		font-size: 13px;
		line-height: 1.7;
		color: var(--muted);
		margin: 0;
		padding: 12px 24px;
	}
	.freshness {
		background: var(--surface);
		color: var(--muted);
	}
	form {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		padding: 24px;
		align-items: end;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 12px;
		color: var(--muted);
	}
	label:first-child {
		flex: 1;
		min-width: 180px;
	}
	input,
	select,
	button {
		font: inherit;
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 12px;
		background: var(--canvas);
		color: var(--ink);
		min-height: 44px;
	}
	button {
		cursor: pointer;
		font-size: 12px;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.primary {
		background: var(--accent);
		color: white;
	}
	input,
	select {
		background: var(--surface);
	}
	.table-wrap {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}
	th,
	td {
		text-align: left;
		padding: 18px;
		border-bottom: 1px solid var(--border);
		line-height: 1.6;
	}
	th {
		font-size: 11px;
		text-transform: uppercase;
		background: var(--canvas);
	}
	td {
		min-width: 135px;
	}
	small {
		display: block;
		color: var(--muted);
		margin-top: 6px;
	}
	.case {
		color: var(--accent);
		padding: 0;
		background: transparent;
		border: 0;
		text-align: left;
		font-weight: 700;
		font-size: 13px;
	}
	footer {
		display: flex;
		justify-content: space-between;
		gap: 18px;
		padding: 20px;
		font-size: 12px;
		color: var(--muted);
	}
	footer div {
		display: flex;
		gap: 8px;
	}
	dialog {
		color: var(--ink);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		width: min(760px, 94vw);
		max-height: 90vh;
		padding: 0;
	}
	dialog::backdrop {
		background: var(--surface);
	}
	.modal {
		padding: 24px;
	}
	.close {
		float: right;
	}
	.party {
		padding: 16px 0;
		border-bottom: 1px solid var(--border);
	}
	.party p {
		white-space: pre-line;
	}
	a {
		color: var(--accent);
	}
	button:focus-visible,
	a:focus-visible,
	input:focus,
	select:focus {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}
	@media (max-width: 720px) {
		.heading {
			align-items: start;
			padding: 18px;
		}
		form {
			padding: 18px;
		}
		label {
			width: 100%;
		}
		.context,
		.freshness {
			padding: 12px 18px;
		}
		footer {
			flex-direction: column;
		}
		.modal {
			padding: 18px;
		}
		.close {
			float: none;
			margin-bottom: 20px;
		}
	}
</style>
