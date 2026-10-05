<script lang="ts">
	import { onMount } from 'svelte';
	import EstimateWorkspace from '$lib/components/EstimateWorkspace.svelte';
	import { currency } from '$lib/domain/format';
	let view = $state('estimate');
	import { createProjectState } from '$lib/stores/project.svelte';
	import Stepper from '$lib/components/Stepper.svelte';
	import CategoryForm from '$lib/components/CategoryForm.svelte';
	import StickyTotals from '$lib/components/StickyTotals.svelte';
	import SummaryDrawer from '$lib/components/SummaryDrawer.svelte';

	const estimator = createProjectState();
	let active = $state(0);
	let showSummary = $state(false);
	const category = $derived(estimator.project?.catalog.categories[active]);
	const progress = $derived(
		estimator.project?.progress.find((entry) => entry.categoryKey === category?.key)
	);

	onMount(() => {
		estimator.restore({ getItem: (key) => localStorage.getItem(key) });
	});
	$effect(() => {
		estimator.persist({ setItem: (key, value) => localStorage.setItem(key, value) });
	});
</script>

<svelte:head
	><title>Rehab Calculator</title><meta name="theme-color" content="#f6f7fb" /></svelte:head
>
<div class="rehab-shell">
	<main class="rehab-page">
		<section class="hero">
			<div>
				<p class="eyebrow">PROPERTY WORKSPACE</p>
				<h1>
					{view === 'estimate'
						? 'Rehab Calculator'
						: view === 'sms'
							? 'Communications'
							: 'Rehab workspace'}
				</h1>
				<p class="hero-copy">
					{view === 'sms'
						? 'Stay connected with your contacts and keep every conversation in one place.'
						: 'Plan the work. Price every detail. Bring your next property to life.'}
				</p>
			</div>
			<span class="page-badge">✦ Rehab studio</span>
		</section>
		<EstimateWorkspace
			project={estimator.project}
			onLoad={(project) => {
				estimator.replace(project);
				active = 0;
			}}
			onNew={() => {
				estimator.newProject();
				active = 0;
			}}
			onCloudPhoto={estimator.cloudPhoto}
			bind:view
		/>
		{#if view === 'estimate'}
			{#if estimator.project}
				<div class="mt-4 mb-2">
					<label for="property-address" class="mb-1 block text-sm font-medium"
						>Property address</label
					>
					<input
						id="property-address"
						type="text"
						autocomplete="street-address"
						placeholder="Add the property address"
						class="min-h-12 w-full rounded-xl border border-gray-300 bg-white px-3 text-base"
						value={estimator.project.meta.address ?? ''}
						oninput={(event) => estimator.updateAddress(event.currentTarget.value)}
					/>
					{#if !estimator.storageMessage}<p class="mt-2 text-xs text-gray-500">
							Draft saved on this device · Save estimate to keep a cloud version
						</p>{/if}
				</div>
			{/if}
			{#if estimator.storageMessage}
				<p role="status" class="my-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
					{estimator.storageMessage}
				</p>
			{/if}
			{#if estimator.project && category && progress}
				<div class="instrument-row">
					<div>
						<span class="eyebrow">PROJECT TOTAL</span><strong
							>{currency(estimator.totals.grandTotal)}</strong
						>
					</div>
					<div>
						<span class="eyebrow">SCOPE ITEMS</span><strong
							>{estimator.project.progress
								.reduce((n, p) => n + p.lines.filter((l) => l.quantity > 0).length, 0)
								.toString()
								.padStart(2, '0')}</strong
						>
					</div>
					<div>
						<span class="eyebrow">PHOTOS</span><strong
							>{estimator.project.progress
								.reduce((n, p) => n + p.photos.length, 0)
								.toString()
								.padStart(2, '0')}</strong
						>
					</div>
				</div>
				<div class="section-heading">
					<div>
						<p class="eyebrow">THE WALKTHROUGH</p>
						<h2>{category.label}</h2>
					</div>
					<span class="muted small"
						>{active + 1} / {estimator.project.catalog.categories.length}</span
					>
				</div>
				<Stepper
					categories={estimator.project.catalog.categories}
					{active}
					onStep={(index) => (active = index)}
				/>
				{#key category.key}
					<div
						id={`panel-${category.key}`}
						role="tabpanel"
						tabindex="0"
						aria-label={category.label}
						class="mt-3 scroll-mt-48"
					>
						<CategoryForm
							{category}
							lines={progress.lines}
							photos={progress.photos}
							onChange={(line) => estimator.updateLine(category.key, line)}
							onPhotoAdd={estimator.addPhoto}
						/>
					</div>
				{/key}
			{/if}
		{/if}
	</main>
	{#if view === 'estimate'}<StickyTotals
			totals={estimator.totals}
			onOpen={() => (showSummary = true)}
		/>{/if}
	<SummaryDrawer
		project={estimator.project}
		open={showSummary}
		onClose={() => (showSummary = false)}
	/>
</div>
