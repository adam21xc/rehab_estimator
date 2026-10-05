<script lang="ts">
	import { onMount } from 'svelte';
	import type { PropertyImages } from '$lib/domain/image-library';
	let { signedIn, onOpen }: { signedIn: boolean; onOpen: (id: string) => void } = $props();
	let properties = $state<PropertyImages[]>([]);
	let query = $state('');
	let kind = $state('all');
	let loading = $state(true);
	let failure = $state('');
	const visible = $derived(
		properties.filter((p) => p.address.toLowerCase().includes(query.trim().toLowerCase()))
	);
	async function refresh() {
		if (!signedIn) {
			loading = false;
			return;
		}
		loading = true;
		failure = '';
		try {
			const response = await fetch('/api/rehab/image-library');
			const data = await response.json();
			if (!response.ok) throw new Error(data.message || 'Unable to load images.');
			properties = data.properties;
		} catch (e) {
			failure = (e as Error).message;
		} finally {
			loading = false;
		}
	}
	onMount(() => {
		void refresh();
	});
</script>

<section class="workspace-section">
	<div class="section-heading">
		<div>
			<p class="eyebrow">PROPERTY WORKSPACE</p>
			<h2>Property images</h2>
		</div>
		<button class="secondary-button" disabled={loading || !signedIn} onclick={refresh}
			>Refresh images</button
		>
	</div>
	<p class="muted small">
		Original photos and saved remodel concepts, together across every estimate version. Add an
		address to an estimate and save it to name its collection.
	</p>
	{#if !signedIn}<div class="empty-state">Sign in above to view your property images.</div>
	{:else}
		<div class="library-filters">
			<label
				>Find an address<input
					type="search"
					bind:value={query}
					placeholder="Search property address"
				/></label
			><label
				>Image type<select bind:value={kind}
					><option value="all">All images</option><option value="original">Original photos</option
					><option value="concept">Remodel concepts</option></select
				></label
			>
		</div>
		{#if failure}<p class="notice error" role="alert">{failure}</p>
		{:else if loading}<p role="status">Loading property images…</p>
		{:else if !visible.length}<div class="empty-state">
				{properties.length ? 'No matching addresses.' : 'No saved images yet.'}<span
					>Save an estimate with photos to start your property library.</span
				>
			</div>
		{:else}
			{#each visible as property (property.key)}
				<section class="surface property-collection">
					<div class="collection-heading">
						<div>
							<h3>{property.address}</h3>
							<p class="muted small">
								{property.images.length} saved images · {property.images.filter(
									(i) => i.kind === 'concept'
								).length} concepts
							</p>
						</div>
						<button class="secondary-button" onclick={() => onOpen(property.estimateId)}
							>Open estimate</button
						>
					</div>
					<div class="library-grid">
						{#each property.images.filter((i) => kind === 'all' || i.kind === kind) as photo (photo.id)}
							<article class="library-photo">
								<img
									src={photo.url}
									alt={`${photo.kind === 'concept' ? 'Remodel concept' : 'Original photo'}: ${property.address} — ${photo.label}`}
									loading="lazy"
								/>
								<div>
									<span class="image-tag" class:concept={photo.kind === 'concept'}
										>{photo.kind === 'concept' ? 'Remodel concept' : 'Original photo'}</span
									>
									<h4>{photo.label}</h4>
									<p class="muted small">{new Date(photo.createdAt).toLocaleDateString()}</p>
									{#if photo.prompt}<details>
											<summary>Design instructions</summary>
											<p class="muted small">{photo.prompt}</p>
										</details>{/if}
									<!-- eslint-disable svelte/no-navigation-without-resolve -->
									<a
										class="secondary-button"
										href={photo.url}
										download={photo.kind === 'concept' ? `remodel-${photo.id}.jpeg` : photo.label}
										>Download image</a
									>
									<!-- eslint-enable svelte/no-navigation-without-resolve -->
								</div>
							</article>
						{:else}<p class="muted small">
								No {kind === 'concept' ? 'concepts' : 'original photos'} saved for this address yet.
							</p>{/each}
					</div>
				</section>
			{/each}{/if}{/if}
</section>

<style>
	.library-filters {
		display: flex;
		gap: 16px;
		margin: 24px 0;
		flex-wrap: wrap;
	}
	.library-filters label {
		display: grid;
		gap: 7px;
		flex: 1;
		min-width: 180px;
	}
	.property-collection {
		margin: 24px 0;
		padding: 22px;
	}
	.collection-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
		margin-bottom: 20px;
	}
	h3 {
		font-size: 20px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.library-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(250px, 100%), 1fr));
		gap: 18px;
	}
	.library-photo {
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
		min-width: 0;
	}
	.library-photo img {
		width: 100%;
		height: 240px;
		object-fit: contain;
		background: var(--canvas);
	}
	.library-photo > div {
		padding: 16px;
	}
	h4 {
		font-size: 14px;
		font-weight: 600;
		overflow-wrap: anywhere;
		margin: 10px 0 4px;
	}
	.image-tag {
		font-size: 10px;
		background: #e6f5f1;
		color: #166d59;
		padding: 5px 8px;
		border-radius: 4px;
	}
	.image-tag.concept {
		background: #eee9ff;
		color: #7253ba;
	}
	details {
		font-size: 12px;
		margin: 12px 0;
		overflow-wrap: anywhere;
	}
	.library-photo a {
		margin-top: 14px;
	}
</style>
