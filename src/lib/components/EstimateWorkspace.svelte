<script lang="ts">
	import { onMount } from 'svelte';
	import SmsWorkspace from './SmsWorkspace.svelte';
	import type { RehabProject } from '$lib/domain/types';
	import { currency } from '$lib/domain/format';
	let {
		project,
		onLoad,
		onNew,
		onCloudPhoto,
		view = $bindable('estimate')
	}: {
		project: RehabProject | null;
		onLoad: (p: RehabProject) => void;
		onNew: () => void;
		onCloudPhoto: (id: string, path: string, url: string) => void;
		view?: string;
	} = $props();
	type History = {
		id: string;
		project_id: string;
		address: string;
		total: number;
		created_at: string;
	};
	type Rendering = {
		id: string;
		status: string;
		prompt: string;
		style: string;
		source_photo_id: string;
		url: string | null;
		error_message: string | null;
		created_at: string;
	};
	let user = $state<{ email: string } | null>(null);
	let renderingEnabled = $state(false);
	let email = $state('');
	let password = $state('');
	let authOpen = $state(false);
	let authMode = $state<'signin' | 'signup'>('signin');
	let busy = $state(false);
	let message = $state('');
	let failure = $state('');
	let history = $state<History[]>([]);
	let page = $state(0);
	let more = $state(false);
	let savedId = $state('');
	let savedStamp = $state('');
	let photoId = $state('');
	let style = $state('Modern warm');
	let prompt = $state(
		'Refresh this space with durable, attractive finishes, a cohesive neutral palette, and practical upgrades. Preserve the existing layout.'
	);
	let renderings = $state<Rendering[]>([]);
	let generating = $state(false);
	const photos = $derived(project?.progress.flatMap((p) => p.photos) ?? []);
	const dirty = $derived(
		!savedId || savedStamp !== project?.meta.updatedAt || photos.some((p) => !p.storagePath)
	);
	async function api(path: string, method = 'GET', body?: unknown) {
		const response = await fetch(`/api/rehab/${path}`, {
			method,
			headers: body ? { 'content-type': 'application/json' } : undefined,
			body: body ? JSON.stringify(body) : undefined
		});
		const data = await response.json();
		if (!response.ok) throw new Error(data.message || 'Request failed. Please try again.');
		return data;
	}
	async function session() {
		try {
			const data = await api('session');
			user = data.user;
			renderingEnabled = data.renderingEnabled;
		} catch {
			user = null;
		}
	}
	onMount(() => {
		void session();
	});
	async function auth(mode: 'signin' | 'signup') {
		busy = true;
		failure = '';
		message = '';
		try {
			const data = await api('session', 'POST', { email, password, mode });
			message = data.message;
			password = '';
			await session();
			if (user) authOpen = false;
		} catch (e) {
			failure = (e as Error).message;
		} finally {
			busy = false;
		}
	}
	async function logout() {
		busy = true;
		try {
			await api('session', 'DELETE');
			user = null;
			history = [];
			renderings = [];
			savedId = '';
			message = 'Signed out. Your current draft remains on this device.';
		} catch (e) {
			failure = (e as Error).message;
		} finally {
			busy = false;
		}
	}
	async function loadHistory(reset = true) {
		if (!user) {
			authOpen = true;
			return;
		}
		busy = true;
		failure = '';
		try {
			const next = reset ? 0 : page + 1;
			const data = await api(`estimates?page=${next}`);
			history = reset ? data.estimates : [...history, ...data.estimates];
			page = next;
			more = data.estimates.length === 30;
		} catch (e) {
			failure = (e as Error).message;
		} finally {
			busy = false;
		}
	}
	async function changeView(next: string) {
		view = next;
		if (next === 'history') await loadHistory();
		if (next === 'studio' && savedId) await refreshRenderings();
	}
	async function save() {
		if (!user) {
			authOpen = true;
			return;
		}
		if (!project) return;
		busy = true;
		failure = '';
		message = '';
		try {
			// Work from a snapshot so in-flight edits cannot be incorrectly marked saved.
			const snapshot: RehabProject = JSON.parse(JSON.stringify(project));
			for (const photo of snapshot.progress.flatMap((p) => p.photos))
				if (!photo.storagePath) {
					const upload = await api('photos', 'POST', { dataUrl: photo.url });
					photo.storagePath = upload.path;
					photo.url = upload.url;
					onCloudPhoto(photo.id, upload.path, upload.url);
				}
			const saved = await api('estimates', 'POST', { project: snapshot });
			savedId = saved.id;
			savedStamp = snapshot.meta.updatedAt;
			renderings = [];
			message = 'Saved to your estimate history.';
		} catch (e) {
			failure = (e as Error).message;
		} finally {
			busy = false;
		}
	}
	async function openEstimate(id: string) {
		if (
			dirty &&
			project &&
			(photos.length || project.meta.address || project.progress.some((p) => p.lines.length)) &&
			!confirm('Open this saved version? Unsaved changes in the current draft will be replaced.')
		)
			return;
		busy = true;
		failure = '';
		try {
			const data = await api(`estimates/${id}`);
			onLoad(data.snapshot);
			savedId = id;
			savedStamp = data.snapshot.meta.updatedAt;
			photoId = '';
			renderings = [];
			view = 'estimate';
			message = 'Saved estimate opened. Saving edits creates a new version.';
		} catch (e) {
			failure = (e as Error).message;
		} finally {
			busy = false;
		}
	}
	function newEstimate() {
		if (
			project &&
			(photos.length || project.progress.some((p) => p.lines.length) || project.meta.address) &&
			!confirm('Start a new estimate? Save the current draft first if you want to keep it.')
		)
			return;
		onNew();
		savedId = '';
		savedStamp = '';
		photoId = '';
		renderings = [];
		view = 'estimate';
		message = 'New estimate started.';
		failure = '';
	}
	async function refreshRenderings() {
		if (!savedId) return;
		try {
			renderings = (await api(`renderings?estimateId=${savedId}`)).renderings;
		} catch (e) {
			failure = (e as Error).message;
		}
	}
	async function generate() {
		if (!savedId || !photoId) return;
		generating = true;
		failure = '';
		message = 'Rendering your concept. This may take a few minutes.';
		try {
			await api('renderings', 'POST', {
				requestId: crypto.randomUUID(),
				estimateId: savedId,
				photoId,
				prompt,
				style
			});
			message = 'Your remodel concept is ready.';
		} catch (e) {
			failure = (e as Error).message;
			message = '';
		} finally {
			generating = false;
			await refreshRenderings();
		}
	}
</script>

<div class="workspace-toolbar">
	<div class="workspace-tabs" aria-label="Workspace views">
		<button
			class:current={view === 'estimate'}
			disabled={busy || generating}
			onclick={() => changeView('estimate')}>Estimate</button
		>
		<button
			class:current={view === 'history'}
			disabled={busy || generating}
			onclick={() => changeView('history')}>History</button
		>
		<button
			class:current={view === 'studio'}
			disabled={busy || generating}
			onclick={() => changeView('studio')}>Design studio <span class="tiny-tag">AI</span></button
		>
		<button
			class:current={view === 'sms'}
			disabled={busy || generating}
			onclick={() => changeView('sms')}>SMS outreach</button
		>
	</div>
	<div class="workspace-actions">
		<button class="quiet-button" disabled={busy || generating} onclick={newEstimate}>＋ New</button>
		<button class="primary-button" disabled={busy || generating} onclick={save}
			>{busy ? 'Working…' : 'Save estimate'} <span aria-hidden="true">↗</span></button
		>
	</div>
</div>
<div class="connection-line">
	<span class="status-dot" class:online={!!user}></span><span
		>{user
			? `Connected · ${user.email}`
			: 'Local draft · Save across devices with a free workspace account'}</span
	>
	{#if user}<button disabled={busy || generating} onclick={logout}>Sign out</button>{:else}
		<div class="button-row">
			<button
				class="secondary-button"
				disabled={busy}
				onclick={() => {
					authMode = 'signin';
					authOpen = true;
				}}>Sign in</button
			><button
				class="primary-button"
				disabled={busy}
				onclick={() => {
					authMode = 'signup';
					authOpen = true;
				}}>Create account</button
			>
		</div>
	{/if}
</div>
{#if message}<p role="status" class="notice">{message}</p>{/if}
{#if failure}<p role="alert" class="notice error">{failure}</p>{/if}
{#if authOpen && !user}
	<form
		class="surface auth-panel"
		onsubmit={(e) => {
			e.preventDefault();
			auth(authMode);
		}}
	>
		<p class="eyebrow">YOUR PRIVATE WORKSPACE</p>
		<h2>{authMode === 'signup' ? 'Create your rehab account.' : 'Welcome back.'}</h2>
		<p class="muted">
			This account is just for the rehab app. Use your email address and a new, unique password—not
			your Gmail password.
		</p>
		<label>Email<input type="email" autocomplete="email" bind:value={email} required /></label>
		<label
			>Password<input
				type="password"
				autocomplete={authMode === 'signup' ? 'new-password' : 'current-password'}
				bind:value={password}
				minlength="8"
				required
			/></label
		>
		<div class="button-row">
			<button class="primary-button" disabled={busy}
				>{busy
					? 'Working…'
					: authMode === 'signup'
						? 'Create my account'
						: 'Sign in to workspace'}</button
			>
			<button
				type="button"
				class="secondary-button"
				disabled={busy}
				onclick={() => (authMode = authMode === 'signup' ? 'signin' : 'signup')}
				>{authMode === 'signup' ? 'Already have an account?' : 'Create an account instead'}</button
			>
		</div>
	</form>
{/if}
{#if view === 'history'}
	<section class="workspace-section">
		<p class="eyebrow">THE ARCHIVE</p>
		<h2>Every property. Every version.</h2>
		<p class="muted">Each save preserves your quantities, prices, and photos at that moment.</p>
		{#if !user}<div class="empty-state">
				Sign in above to access your saved estimates.
			</div>{:else if !history.length && !busy}<div class="empty-state">
				Your next project starts here.<span
					>Save an estimate and it will appear in your history.</span
				>
			</div>{/if}
		<div class="history-grid">
			{#each history as estimate (estimate.id)}<button
					class="surface history-card"
					disabled={busy || generating}
					onclick={() => openEstimate(estimate.id)}
					><span class="eyebrow">{new Date(estimate.created_at).toLocaleString()}</span>
					<h3>{estimate.address}</h3>
					<strong>{currency(estimate.total)}</strong><span class="history-open"
						>Open estimate ↗</span
					></button
				>{/each}
		</div>
		{#if more}<button class="secondary-button" disabled={busy} onclick={() => loadHistory(false)}
				>Load older estimates</button
			>{/if}
	</section>
{:else if view === 'studio'}
	<section class="workspace-section">
		<p class="eyebrow">FROM POTENTIAL TO PICTURE</p>
		<h2>See what comes next.</h2>
		<p class="muted">
			Turn a property photo into a remodel concept. Your originals stay untouched.
		</p>
		{#if !photos.length}<div class="empty-state">
				Start with a photo.<span>Add a photo to any repair item, then save your estimate.</span
				><button class="secondary-button" onclick={() => (view = 'estimate')}
					>Back to estimate →</button
				>
			</div>{:else}
			<div class="photo-choices">
				{#each photos as photo (photo.id)}<button
						class:selected={photoId === photo.id}
						aria-label={`Select ${photo.fileName}`}
						aria-pressed={photoId === photo.id}
						onclick={() => (photoId = photo.id)}
						><img src={photo.url} alt={photo.fileName} /><span>{photo.fileName}</span></button
					>{/each}
			</div>
			<div class="surface design-form">
				<label
					>Design direction<select bind:value={style}
						><option>Modern warm</option><option>Contemporary</option><option>Classic</option
						><option>Suggest a direction</option></select
					></label
				><label
					>What would you change?<textarea rows="4" maxlength="2000" bind:value={prompt}
					></textarea></label
				>
				<p class="muted small">
					Generate sends the selected photo and instructions to OpenAI. One concept per request; API
					charges apply. Concept imagery does not change your estimate or establish structural
					feasibility.
				</p>
				{#if dirty}<p class="notice">Save this version before requesting a rendering.</p>{/if}
				{#if !renderingEnabled}<p class="notice">
						Rendering is awaiting the workspace’s OpenAI API connection.
					</p>{/if}
				<button
					class="primary-button"
					disabled={!user ||
						dirty ||
						!photoId ||
						prompt.trim().length < 10 ||
						generating ||
						!renderingEnabled ||
						busy}
					onclick={generate}
					>{generating ? 'Creating your concept…' : 'Generate remodel concept'}
					<span aria-hidden="true">↗</span></button
				>
			</div>{/if}
		{#if savedId}<div class="section-heading">
				<h3>Concept history</h3>
				<button class="quiet-button" onclick={refreshRenderings}>Refresh status</button>
			</div>{/if}
		<div class="rendering-grid">
			{#each renderings as rendering (rendering.id)}<article class="surface rendering-card">
					{#if rendering.url}<img
							src={rendering.url}
							alt={`AI remodel concept: ${rendering.prompt}`}
						/>{/if}
					<div>
						<span class="eyebrow">{rendering.status} · {rendering.style}</span>
						<p>{rendering.prompt}</p>
						{#if rendering.error_message}<p class="notice error">
								{rendering.error_message}
							</p>{/if}
						{#if rendering.url}
							<!-- Authenticated media download, not client-side navigation. -->
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a
								class="secondary-button"
								href={rendering.url}
								download={`remodel-${rendering.id}.jpeg`}>Download concept ↓</a
							>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{/if}
					</div>
				</article>{/each}
		</div>
	</section>
{/if}

{#if view === 'sms'}{#key user?.email}<SmsWorkspace signedIn={!!user} />{/key}{/if}
