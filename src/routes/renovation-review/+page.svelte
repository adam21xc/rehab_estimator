<script lang="ts">
	import { browser } from '$app/environment';
	import { afterNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page as appPage } from '$app/state';
	import EmailSignIn from '$lib/components/EmailSignIn.svelte';
	type Row = {
		id: string;
		address: string;
		version: string | null;
		status: string;
		note: string;
		hold: string | null;
		beforeUrl: string | null;
		afterUrl: string | null;
		imageError: boolean;
		loadedBefore?: boolean;
		loadedAfter?: boolean;
		reasons?: string[];
		hasImages?: boolean;
		kind?: string;
	};
	const FILTERS = ['manual', 'pending', 'approved', 'flagged', 'archived', 'all'];
	const kindLabel: Record<string, string> = {
		not_usable: 'NOT USABLE',
		flagged: 'Flagged',
		pending: 'Awaiting review',
		held: 'Held'
	};
	function readStatus() {
		const value = appPage.url.searchParams.get('status');
		return value && FILTERS.includes(value) ? value : 'manual';
	}
	function listHref(nextStatus: string, nextPage = 1, nextQ = '', nextId = '') {
		const query = [
			`status=${encodeURIComponent(nextStatus)}`,
			nextPage > 1 ? `page=${nextPage}` : '',
			nextQ.trim() ? `q=${encodeURIComponent(nextQ.trim())}` : '',
			nextId ? `id=${encodeURIComponent(nextId)}` : ''
		]
			.filter(Boolean)
			.join('&');
		return `${resolve('/renovation-review')}?${query}`;
	}
	function cardHref(row: Row) {
		const next =
			row.status === 'pending' || row.status === 'flagged' || row.status === 'approved'
				? row.status
				: 'all';
		return listHref(next, 1, '', row.id);
	}
	let rows = $state<Row[]>([]),
		counts = $state({ all: 0, pending: 0, approved: 0, flagged: 0, archived: 0, manual: 0 }),
		page = $state(Math.max(1, Number(appPage.url.searchParams.get('page')) || 1)),
		pages = $state(1),
		q = $state(appPage.url.searchParams.get('q') || ''),
		status = $state(readStatus()),
		focusId = $state(appPage.url.searchParams.get('id') || ''),
		busy = $state(false),
		saving = $state(''),
		problem = $state(''),
		notice = $state(''),
		signedIn = $state(true);
	let requestId = 0;
	async function load(next = page) {
		const request = ++requestId;
		busy = true;
		problem = '';
		try {
			const r = await fetch(
				`/api/rehab/renovation/review?${new URLSearchParams({
					q,
					status,
					page: String(next),
					...(focusId ? { id: focusId } : {})
				})}`
			);
			const data = await r.json();
			if (request !== requestId) return;
			if (r.status === 401) {
				signedIn = false;
				return;
			}
			if (!r.ok) throw Error(data.message || 'Unable to load images.');
			signedIn = true;
			rows = data.items;
			counts = data.counts;
			page = data.page;
			pages = data.pages;
		} catch (e) {
			if (request === requestId)
				problem = e instanceof Error ? e.message : 'Unable to load images.';
		} finally {
			if (request === requestId) busy = false;
		}
	}
	async function save(row: Row, value: string) {
		saving = row.id;
		problem = '';
		notice = '';
		try {
			const r = await fetch('/api/rehab/renovation/review', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: row.id, version: row.version, status: value, note: row.note })
			});
			const data = await r.json();
			if (!r.ok) throw Error(data.message || 'Review was not saved.');
			notice = `${row.address}: ${value === 'approved' ? 'image pair approved' : value === 'flagged' ? 'flagged for review' : value === 'archived' ? 'archived and removed from the active queue' : 'returned to pending'}.`;
			await load();
		} catch (e) {
			problem = e instanceof Error ? e.message : 'Review was not saved.';
		} finally {
			saving = '';
		}
	}
	async function go(href: string) {
		const current = `${appPage.url.pathname}${appPage.url.search}`;
		if (current === href) {
			await load(Math.max(1, Number(appPage.url.searchParams.get('page')) || 1));
			return;
		}
		// listHref() resolves /renovation-review, then adds the filter query.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		await goto(href, { replaceState: true, keepFocus: true, noScroll: true });
	}
	afterNavigate(() => {
		if (!browser) return;
		status = readStatus();
		focusId = appPage.url.searchParams.get('id') || '';
		q = appPage.url.searchParams.get('q') || '';
		void load(Math.max(1, Number(appPage.url.searchParams.get('page')) || 1));
	});
</script>

<svelte:head
	><title>{status === 'manual' ? 'Needs your review' : 'Postcard image review'} · Apex</title
	></svelte:head
>
<main>
	<header>
		<p class="eyebrow">POSTCARD PREPARATION</p>
		<h1>{status === 'manual' ? 'Needs your review' : 'Before & after review'}</h1>
		<p>
			{#if status === 'manual'}
				These properties still need a decision from you. Flagged renderings stay on this list,
				including notes that start with NOT USABLE. A property hold stays here too. A property whose
				only outstanding item is that its rehab image has not been generated yet is left off.
			{:else}
				Review each property’s current photo and AI renovation concept. Approving images does not
				send or schedule a postcard.
			{/if}
		</p>
	</header>
	{#if !signedIn}<EmailSignIn onSignedIn={() => load()} />{:else}
		<div class="stats">
			<span><b>{counts.manual}</b> need your review</span><span
				><b>{counts.all}</b> active image pairs</span
			><span><b>{counts.pending}</b> awaiting review</span><span
				><b>{counts.approved}</b> approved</span
			><span><b>{counts.flagged}</b> flagged</span><span><b>{counts.archived}</b> archived</span>
		</div>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				focusId = '';
				void go(listHref(status, 1, q));
			}}
		>
			<label>Property address<input bind:value={q} placeholder="Search an address or note" /></label
			><label
				>Review status<select
					bind:value={status}
					onchange={(event) => {
						const next = event.currentTarget.value;
						focusId = '';
						void go(listHref(next, 1, q));
					}}
					><option value="manual">Needs your review</option><option value="all"
						>All active images</option
					><option value="pending">Awaiting review</option><option value="approved">Approved</option
					><option value="flagged">Flagged</option><option value="archived">Archived</option
					></select
				></label
			><button
				disabled={busy || !!saving}
				onclick={() => {
					focusId = '';
				}}>Search / refresh</button
			>
		</form>
		{#if problem}<p class="error" role="alert">{problem}</p>{/if}{#if notice}<p
				class="notice"
				role="status"
			>
				{notice}
			</p>{/if}
		<p class="hint">
			{#if status === 'manual'}
				Search by address or by the review note. Open a rendering to approve, flag, or archive it.
				Holds without an image are not still waiting in the generator.
			{:else}
				New image pairs appear as the batch finishes. Refresh to load them. Click either photo to
				view it full size. Archive unusable pairs to remove them from this queue without deleting
				the property or images. Restore them from the Archived filter.
			{/if}
		</p>
		{#if focusId}<p>
				<!-- listHref() resolves /renovation-review, then adds the filter query. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a href={listHref('manual')}
					>{status === 'manual'
						? 'Show every property that needs review'
						: 'Back to needs your review'}</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</p>{/if}
		{#if busy}<p role="status">Loading review queue…</p>{/if}
		{#if status === 'manual'}
			{#each rows as row (row.id)}
				<article id={'review-' + row.id} aria-label={row.address}>
					<div class="title">
						<h2>{row.address}</h2>
						<span
							class="badge"
							class:flagged={row.kind === 'flagged' || row.kind === 'not_usable'}
							class:held={row.kind === 'held'}>{kindLabel[row.kind || ''] || row.status}</span
						>
					</div>
					<ul class="reasons">
						{#each row.reasons || [] as reason, index (row.id + '-' + index)}<li>
								{reason}
							</li>{/each}
					</ul>
					{#if row.hasImages}<!-- cardHref() resolves /renovation-review, then adds the filter query. -->
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a class="card-link" href={cardHref(row)}>Open rendering</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->{:else}<p class="hint">
							No before-and-after card yet. This is a hold, not an image still waiting to generate.
						</p>{/if}
				</article>
			{:else}{#if !busy}<p class="empty">
						No properties need your review. Properties that are only waiting for an image to be
						generated are not listed here.
					</p>{/if}{/each}
		{:else}
			{#each rows as row (row.id)}
				<article aria-label={row.address}>
					<div class="title">
						<h2>{row.address}</h2>
						<span
							class="badge"
							class:approved={row.status === 'approved'}
							class:flagged={row.status === 'flagged'}
							>{row.status === 'pending' ? 'Awaiting review' : row.status}</span
						>
					</div>
					{#if row.hold}<p class="error">Property match needs review: {row.hold}</p>{/if}
					<div class="pair">
						{#each [{ label: 'Before · current property', url: row.beforeUrl }, { label: 'After · AI renovation concept', url: row.afterUrl }] as image (image.label)}<figure
							>
								<figcaption>{image.label}</figcaption>
								{#if image.url}<!-- Signed storage URL, not an app route. -->
									<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
									<a href={image.url} target="_blank" rel="noreferrer"
										><img
											src={image.url}
											alt={`${image.label}: ${row.address}`}
											loading="lazy"
											onload={() => {
												if (image.label.startsWith('Before')) row.loadedBefore = true;
												else row.loadedAfter = true;
											}}
											onerror={() => {
												row.imageError = true;
											}}
										/></a
									>{:else}<p>Image unavailable. Refresh to try again.</p>{/if}
							</figure>{/each}
					</div>
					{#if row.imageError}<p class="error">
							An image could not be loaded. Refresh before approving this pair.
						</p>{/if}
					<label class="notes"
						>Review note<textarea
							bind:value={row.note}
							maxlength="2000"
							placeholder="Wrong house, unrealistic changes, poor framing…"
							rows="2"
						></textarea></label
					>
					<div class="actions">
						<button
							class="approve"
							disabled={busy ||
								!!saving ||
								row.status === 'archived' ||
								!!row.hold ||
								row.imageError ||
								!row.loadedBefore ||
								!row.loadedAfter}
							onclick={() => save(row, 'approved')}>Approve images</button
						><button
							class="flag"
							disabled={busy || !!saving || row.status === 'archived' || !row.note.trim()}
							onclick={() => save(row, 'flagged')}>Flag for review</button
						><button disabled={busy || !!saving} onclick={() => save(row, row.status)}
							>Save note</button
						>{#if row.status !== 'archived'}<button
								class="archive"
								disabled={busy || !!saving}
								onclick={() => save(row, 'archived')}>Archive images</button
							>{/if}{#if row.status !== 'pending'}<button
								disabled={busy || !!saving}
								onclick={() => save(row, 'pending')}
								>{row.status === 'archived' ? 'Restore to review' : 'Return to pending'}</button
							>{/if}{#if saving === row.id}<span role="status">Saving…</span>{/if}
					</div>
				</article>
			{:else}{#if !busy}<p class="empty">
						No image pairs match this filter. Try “All active images” or refresh as generation
						progresses.
					</p>{/if}{/each}
		{/if}
		<nav aria-label="Review pages">
			<button
				disabled={page <= 1 || busy || !!saving}
				onclick={() => go(listHref(status, page - 1, q, focusId))}>Previous</button
			><span>Page {page} of {pages}</span><button
				disabled={page >= pages || busy || !!saving}
				onclick={() => go(listHref(status, page + 1, q, focusId))}>Next</button
			>
		</nav>
	{/if}
</main>

<style>
	main {
		max-width: 1250px;
		margin: auto;
		padding: 32px;
		color: #172c38;
	}
	header p {
		max-width: 780px;
		color: #536774;
	}
	h1 {
		font-size: 2rem;
		margin: 8px 0;
	}
	h2 {
		font-size: 1.15rem;
		margin: 0;
	}
	.eyebrow {
		font-weight: 700;
		letter-spacing: 0.12em;
		font-size: 0.75rem;
	}
	.stats,
	form,
	.actions,
	.title,
	nav {
		display: flex;
		gap: 16px;
		align-items: center;
		flex-wrap: wrap;
	}
	.stats {
		padding: 20px 0;
	}
	.stats span {
		background: #eaf2f3;
		border-radius: 8px;
		padding: 12px;
	}
	form {
		background: white;
		padding: 18px;
		border: 1px solid #d3dfe2;
		border-radius: 10px;
	}
	label {
		display: grid;
		gap: 6px;
		font-weight: 600;
		font-size: 0.9rem;
	}
	input,
	select,
	textarea {
		background: white;
		color: #172c38;
		border: 1px solid #96aab5;
		border-radius: 6px;
		padding: 10px;
		font: inherit;
	}
	input {
		min-width: 260px;
	}
	button {
		background: #edf2f5;
		color: #173748;
		border: 1px solid #99adb7;
		padding: 10px 16px;
		border-radius: 7px;
		font-weight: 600;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	button:focus-visible,
	a:focus-visible {
		outline: 3px solid #167cd1;
		outline-offset: 3px;
	}
	.approve {
		background: #14624c;
		color: white;
	}
	.flag {
		background: #8c3c21;
		color: white;
	}
	article {
		background: white;
		border: 1px solid #cedbe0;
		border-radius: 12px;
		padding: 20px;
		margin: 24px 0;
	}
	.title {
		justify-content: space-between;
		margin-bottom: 16px;
	}
	.badge {
		background: #eef1f6;
		padding: 6px 12px;
		border-radius: 20px;
		text-transform: capitalize;
	}
	.badge.approved {
		background: #d7f3e4;
		color: #14543d;
	}
	.badge.flagged {
		background: #ffeadf;
		color: #87341b;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	figure {
		margin: 0;
		min-width: 0;
		background: #f0f4f5;
		border-radius: 8px;
		overflow: hidden;
	}
	figcaption {
		padding: 12px;
		font-weight: 700;
		font-size: 0.9rem;
	}
	img {
		width: 100%;
		aspect-ratio: 1;
		object-fit: contain;
		display: block;
	}
	textarea {
		width: 100%;
		box-sizing: border-box;
	}
	.notes {
		margin: 18px 0;
	}
	.error {
		background: #fff0eb;
		padding: 12px;
		color: #8b2814;
		border-radius: 6px;
	}
	.notice {
		background: #e0f4e8;
		color: #165b38;
		padding: 12px;
	}
	.hint {
		font-size: 0.9rem;
		color: #586e78;
	}
	nav {
		justify-content: center;
		padding: 20px;
	}
	.empty {
		padding: 40px;
		text-align: center;
	}
	.reasons {
		margin: 12px 0;
		padding-left: 1.2rem;
		color: #3d5360;
	}
	.badge.held {
		background: #fff3d6;
		color: #6a4b00;
	}
	.card-link {
		font-weight: 700;
		color: #14624c;
	}
	@media (max-width: 600px) {
		main {
			padding: 16px;
		}
		.pair {
			gap: 6px;
		}
		figcaption {
			font-size: 0.7rem;
			padding: 8px;
		}
		article {
			padding: 12px;
		}
		input {
			min-width: 0;
		}
		form label {
			width: 100%;
		}
	}
</style>
