<script lang="ts">
	import { onMount } from 'svelte';
	import { studioProject } from '$lib/domain/studio';
	import type { PhotoRef, RehabProject } from '$lib/domain/types';
	let { signedIn, enabled }: { signedIn: boolean; enabled: boolean } = $props();
	let mode = $state<'upload' | 'address'>('upload');
	let photo = $state<PhotoRef | null>(null);
	let address = $state('');
	let searchAddress = $state('');
	let lookupAddress = $state('');
	let warning = $state('');
	let streetLink = $state('');
	let confirmed = $state(false);
	let style = $state('Modern warm');
	let prompt = $state(
		'Give this property a fresh, inviting remodel with cohesive colors, attractive finishes, and practical upgrades. Preserve the viewpoint and existing structure.'
	);
	let busy = $state(false);
	let problem = $state('');
	let message = $state('');
	let savedId = $state('');
	let savedAddress = $state('');
	let requestId = $state('');
	let dragging = $state(false);
	type Concept = {
		id: string;
		status: string;
		prompt: string;
		url: string | null;
		error_message?: string;
	};
	type Session = { id: string; address: string; snapshot: RehabProject; created_at: string };
	let concepts = $state<Concept[]>([]);
	let sessions = $state<Session[]>([]);
	async function api(path: string, body?: unknown) {
		const res = await fetch(`/api/rehab/${path}`, {
			method: body ? 'POST' : 'GET',
			headers: body ? { 'content-type': 'application/json' } : undefined,
			body: body ? JSON.stringify(body) : undefined
		});
		const data = await res.json();
		if (!res.ok) throw new Error(data.message || 'Unable to complete this request.');
		return data;
	}
	async function history() {
		try {
			sessions = (await api('studio')).sessions;
		} catch (e) {
			problem = (e as Error).message;
		}
	}
	onMount(() => {
		if (signedIn) void history();
	});
	async function refresh() {
		if (savedId) concepts = (await api(`renderings?estimateId=${savedId}`)).renderings;
	}
	function resetPhoto(next: PhotoRef) {
		photo = next;
		savedId = '';
		requestId = '';
		concepts = [];
		problem = '';
		message = '';
	}
	async function pick(file?: File) {
		if (!file || busy) return;
		if (
			!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
			file.size > 5 * 1024 * 1024 ||
			!file.size
		) {
			problem = 'Choose a JPEG, PNG, or WebP photo smaller than 5 MB.';
			return;
		}
		busy = true;
		try {
			const url = await new Promise<string>((resolve, reject) => {
				const r = new FileReader();
				r.onload = () => resolve(String(r.result));
				r.onerror = () => reject(new Error('This photo could not be read.'));
				r.readAsDataURL(file);
			});
			resetPhoto({
				id: crypto.randomUUID(),
				categoryKey: 'studio',
				fileName: file.name,
				mime: file.type,
				url,
				takenAt: new Date().toISOString()
			});
			streetLink = '';
			lookupAddress = '';
			warning = '';
			confirmed = true;
		} catch (e) {
			problem = (e as Error).message;
		} finally {
			busy = false;
		}
	}
	async function lookup() {
		busy = true;
		problem = '';
		message = 'Loading a Street View photo…';
		try {
			const value = await api('studio/street-view', { address: searchAddress });
			resetPhoto({
				id: crypto.randomUUID(),
				categoryKey: 'studio',
				fileName: 'Street View photo',
				mime: value.mime,
				url: value.dataUrl,
				takenAt: new Date().toISOString(),
				note: `Street View via DealMachine; requested: ${searchAddress}; returned: ${value.address}`
			});
			address = value.address;
			lookupAddress = value.address;
			streetLink = value.link;
			warning = value.warning || '';
			confirmed = false;
		} catch (e) {
			problem = (e as Error).message;
			message = '';
		} finally {
			busy = false;
		}
	}
	async function generate() {
		if (!photo || busy || !confirmed) return;
		busy = true;
		problem = '';
		message = 'Saving your photo and creating a concept…';
		try {
			if (!photo.storagePath) {
				const uploaded = await api('photos', { dataUrl: photo.url });
				photo = { ...photo, storagePath: uploaded.path, url: uploaded.url };
			}
			if (!savedId || savedAddress !== address.trim()) {
				const saved = await api('estimates', { project: studioProject(photo, address) });
				savedId = saved.id;
				savedAddress = address.trim();
				requestId = '';
				concepts = [];
			}
			requestId ||= crypto.randomUUID();
			const result = await api('renderings', {
				requestId,
				estimateId: savedId,
				photoId: photo.id,
				prompt,
				style
			});
			message =
				result.status === 'completed'
					? 'Your remodel concept is ready.'
					: result.status === 'processing'
						? 'Still processing. Use Refresh status to check without creating another request.'
						: 'This request failed. Review its status before starting another concept.';
			if (result.status === 'completed') requestId = '';
		} catch (e) {
			problem = (e as Error).message;
			message = '';
		} finally {
			try {
				await refresh();
				await history();
			} catch (e) {
				problem = (e as Error).message;
			}
			busy = false;
		}
	}
	function open(session: Session) {
		const source = session.snapshot.progress.flatMap((p) => p.photos)[0];
		if (!source) return;
		resetPhoto(source);
		address = session.snapshot.meta.address || '';
		savedAddress = address;
		savedId = session.id;
		streetLink = '';
		lookupAddress = '';
		confirmed = true;
		void refresh().catch((e) => (problem = e.message));
	}
	async function checkStatus() {
		try {
			await refresh();
			const previous = concepts.find((c) => c.id === requestId);
			if (!previous || previous.status === 'completed') requestId = '';
		} catch (e) {
			problem = (e as Error).message;
		}
	}
</script>

<section class="quick-studio" aria-label="Quick remodel">
	<div class="intro">
		<div>
			<span class="kicker">A LITTLE IMAGINATION</span>
			<h3>Quick remodel</h3>
			<p>Drop in a photo and try a new look. No estimate needed.</p>
		</div>
		<span class="pill">Just exploring? Address optional.</span>
	</div>
	{#if !signedIn}<p class="notice">Sign in above to save photos and create concepts.</p>{/if}
	<div class="mode" aria-label="Photo source">
		<button
			class:active={mode === 'upload'}
			aria-pressed={mode === 'upload'}
			disabled={busy}
			onclick={() => (mode = 'upload')}>Upload a photo</button
		><button
			class:active={mode === 'address'}
			aria-pressed={mode === 'address'}
			disabled={busy}
			onclick={() => (mode = 'address')}>Find by address</button
		>
	</div>
	<div class="studio-columns">
		<div>
			{#if mode === 'upload'}
				<label
					class="drop-zone"
					class:dragging
					ondragover={(e) => {
						e.preventDefault();
						dragging = true;
					}}
					ondragleave={() => (dragging = false)}
					ondrop={(e) => {
						e.preventDefault();
						dragging = false;
						void pick(e.dataTransfer?.files[0]);
					}}
				>
					<span class="upload-symbol">＋</span><strong>Drop a property photo here</strong><span
						>or choose a file · JPG, PNG, WebP · up to 5 MB</span
					>
					<input
						aria-label="Choose a remodel photo"
						type="file"
						accept="image/jpeg,image/png,image/webp"
						disabled={busy}
						onchange={(e) => {
							void pick(e.currentTarget.files?.[0]);
							e.currentTarget.value = '';
						}}
					/>
				</label>
			{:else}
				<div class="lookup">
					<label
						>Property to look up<input
							bind:value={searchAddress}
							disabled={busy}
							placeholder="Street address, city, state and ZIP"
						/></label
					><button disabled={!signedIn || busy || searchAddress.trim().length < 8} onclick={lookup}
						>Load Street View photo</button
					>
					<p>Saved locations are reused. A new address lookup may use DealMachine credits.</p>
				</div>
			{/if}
			{#if photo}<figure>
					<img src={photo.url} alt="Original property selected for remodeling" />
					<figcaption>Original · {photo.fileName}</figcaption>
				</figure>{/if}
			{#if streetLink}<p class="lookup-address">
					Returned address: <strong>{lookupAddress}</strong>
				</p>
				<a href={streetLink} target="_blank" rel="noopener noreferrer"
					>Inspect on Google Street View ↗</a
				>
				<p class="fine">
					Street View via DealMachine. Imagery may be older or show a nearby property.
				</p>
				{#if warning}<p class="notice">{warning}</p>{/if}<label class="confirm"
					><input type="checkbox" bind:checked={confirmed} disabled={busy} />This is the
					property/photo I want to remodel.</label
				>{/if}
		</div>
		<div class="controls">
			<label
				>Assign to an address <span>(optional)</span><input
					bind:value={address}
					disabled={busy}
					maxlength="256"
					placeholder="Leave blank to experiment"
				/></label
			>
			<label
				>Design direction<select bind:value={style} disabled={busy}
					><option>Modern warm</option><option>Contemporary</option><option>Classic</option><option
						>Suggest a direction</option
					></select
				></label
			>
			<label
				>What would you change?<textarea
					rows="5"
					bind:value={prompt}
					disabled={busy}
					maxlength="2000"
				></textarea></label
			>
			<p class="fine">
				Generate sends this photo and your instructions to OpenAI. API charges apply. Your original
				and concept are saved in Property images.
			</p>
			{#if !enabled}<p class="notice">
					Image generation needs the workspace’s OpenAI connection.
				</p>{/if}
			<button
				class="generate"
				disabled={!signedIn ||
					!enabled ||
					!photo ||
					!confirmed ||
					busy ||
					prompt.trim().length < 10 ||
					!!requestId}
				onclick={generate}
				>{busy ? 'Working on your concept…' : 'Generate remodel concept ↗'}</button
			>
			{#if requestId}<p class="fine">
					This request is saved. Refresh its status before creating another.
				</p>
				<button disabled={busy} onclick={checkStatus}>Refresh status</button
				>{#if concepts.find((c) => c.id === requestId)?.status === 'failed'}<button
						disabled={busy}
						onclick={() => {
							requestId = '';
							message =
								'You can now request a new concept. A new request may incur another charge.';
						}}>Start a new request</button
					>{/if}{/if}
		</div>
	</div>
	{#if problem}<p class="notice error" role="alert">{problem}</p>{/if}{#if message}<p
			class="notice"
			role="status"
		>
			{message}
		</p>{/if}
	{#if savedId}<div class="history-heading">
			<h4>Concepts for this photo</h4>
			<button disabled={busy} onclick={checkStatus}>Refresh status</button>
		</div>{/if}
	<div class="concepts">
		{#each concepts as concept (concept.id)}<article>
				{#if concept.url}<img src={concept.url} alt={`Remodel concept: ${concept.prompt}`} />{/if}
				<p><strong>{concept.status}</strong> · {concept.prompt}</p>
				{#if concept.error_message}<p class="notice error">
						{concept.error_message}
					</p>{/if}{#if concept.url}<a href={concept.url} target="_blank" rel="noopener noreferrer"
						>Open / download concept ↗</a
					>{/if}
			</article>{/each}
	</div>
	{#if sessions.length}<details>
			<summary>Recent quick remodels ({sessions.length})</summary>
			<div class="sessions">
				{#each sessions as session (session.id)}<button
						disabled={busy}
						onclick={() => open(session)}
						>{session.snapshot.meta.address || 'Just for fun · no address'}<small
							>{new Date(session.created_at).toLocaleString()}</small
						></button
					>{/each}
			</div>
		</details>{/if}
</section>

<style>
	.quick-studio {
		margin: 24px 0 32px;
		padding: 26px;
		border: 1px solid #d8dfd6;
		border-radius: 18px;
		background: #f5f7f2;
		color: #20322a;
	}
	.intro {
		display: flex;
		justify-content: space-between;
		gap: 18px;
		align-items: center;
	}
	.kicker {
		font-size: 10px;
		letter-spacing: 2px;
		color: #46755d;
		font-weight: 700;
	}
	h3 {
		font-size: 26px;
		letter-spacing: -0.6px;
		margin: 8px 0;
	}
	p {
		font-size: 13px;
		line-height: 1.6;
		margin: 8px 0;
		color: #58665e;
	}
	.pill {
		background: #e3ecdf;
		border-radius: 20px;
		padding: 9px 13px;
		font-size: 11px;
		white-space: nowrap;
	}
	.mode {
		display: flex;
		gap: 8px;
		margin: 22px 0;
	}
	.mode button.active {
		background: #274f3a;
		color: white;
		border-color: #274f3a;
	}
	.studio-columns {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 26px;
	}
	button {
		cursor: pointer;
		border: 1px solid #bdcbbf;
		border-radius: 8px;
		padding: 10px 14px;
		background: white;
		color: #254431;
		font: inherit;
		font-size: 13px;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	label {
		display: block;
		font-size: 13px;
		font-weight: 600;
	}
	label span {
		font-weight: 400;
		color: #657269;
	}
	input:not([type='checkbox']),
	select,
	textarea {
		display: block;
		box-sizing: border-box;
		width: 100%;
		padding: 11px 12px;
		margin-top: 7px;
		border: 1px solid #bfccc1;
		border-radius: 8px;
		background: white;
		color: #24372c;
		font: inherit;
		font-size: 14px;
	}
	textarea {
		resize: vertical;
	}
	.controls {
		display: grid;
		gap: 16px;
		align-content: start;
	}
	.drop-zone {
		border: 2px dashed #9eb19f;
		min-height: 190px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		align-items: center;
		justify-content: center;
		padding: 20px;
		border-radius: 12px;
		background: #fff;
		cursor: pointer;
	}
	.drop-zone.dragging {
		background: #e2efdf;
		border-color: #356c46;
	}
	.drop-zone span {
		font-size: 12px;
		text-align: center;
	}
	.drop-zone .upload-symbol {
		font-size: 32px;
		color: #3f7150;
	}
	.drop-zone input {
		font-size: 12px;
	}
	.lookup button {
		margin-top: 12px;
	}
	figure {
		margin: 18px 0 10px;
	}
	figure img,
	.concepts img {
		display: block;
		width: 100%;
		max-height: 420px;
		object-fit: contain;
		border-radius: 10px;
		background: #e0e7dc;
	}
	figcaption {
		font-size: 11px;
		color: #637265;
		margin-top: 7px;
	}
	.fine {
		font-size: 11px;
	}
	.generate {
		background: #294e39;
		color: white;
		border-color: #294e39;
		padding: 14px;
		font-weight: 600;
	}
	a {
		color: #315e46;
		font-size: 12px;
		text-decoration: underline;
	}
	.confirm {
		display: flex;
		gap: 10px;
		align-items: center;
		margin: 16px 0;
		font-size: 12px;
	}
	.notice {
		padding: 12px;
		background: #e7eddf;
		border-radius: 8px;
	}
	.error {
		color: #87352d;
		background: #f8e5df;
	}
	.history-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 20px;
	}
	.concepts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 18px;
	}
	.concepts article {
		background: white;
		padding: 14px;
		border-radius: 10px;
	}
	summary {
		cursor: pointer;
		font-size: 13px;
		margin-top: 24px;
	}
	.sessions {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		margin-top: 12px;
	}
	.sessions button {
		text-align: left;
	}
	small {
		display: block;
		font-size: 10px;
		margin-top: 5px;
		color: #637265;
	}
	@media (max-width: 800px) {
		.studio-columns,
		.concepts {
			grid-template-columns: 1fr;
		}
		.intro {
			align-items: start;
			flex-direction: column;
		}
		.quick-studio {
			padding: 18px;
		}
	}
</style>
