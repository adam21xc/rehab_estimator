<script lang="ts">
	import type { CatalogCategory } from '$lib/domain/types';
	import { onMount, untrack } from 'svelte';
	let {
		categories = [],
		active = 0,
		onStep
	}: {
		categories?: CatalogCategory[];
		active?: number;
		onStep: (index: number) => void;
	} = $props();
	let scroller = $state<HTMLDivElement>();
	let leftShadow = $state(false);
	let rightShadow = $state(false);
	let prevActive: number | undefined;

	function updateShadows() {
		if (!scroller) return;
		const { scrollLeft, scrollWidth, clientWidth } = scroller;
		leftShadow = scrollLeft > 2;
		rightShadow = scrollLeft + clientWidth < scrollWidth - 2;
	}

	$effect(() => {
		const index = active;
		const element = scroller;
		untrack(() => {
			if (prevActive !== undefined && index !== prevActive) {
				element
					?.querySelector<HTMLButtonElement>(`[data-idx="${index}"]`)
					?.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
			}
			prevActive = index;
		});
	});

	function onWheel(e: WheelEvent) {
		// Horizontal swipe on trackpads or shift+wheel
		if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
			scroller?.scrollBy({ left: e.deltaX, behavior: 'auto' });
			updateShadows();
		}
	}

	// Roving tabindex for keyboard users
	function onKeyDown(event: KeyboardEvent) {
		if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		const next =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? categories.length - 1
					: Math.max(
							0,
							Math.min(categories.length - 1, active + (event.key === 'ArrowRight' ? 1 : -1))
						);
		onStep(next);
		scroller?.querySelector<HTMLButtonElement>(`[data-idx="${next}"]`)?.focus();
	}

	onMount(() => {
		updateShadows();
		const obs = new ResizeObserver(updateShadows);
		if (scroller) obs.observe(scroller);
		return () => obs.disconnect();
	});
</script>

<nav
	aria-label="Category steps"
	class="category-navigation sticky top-0 z-30 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-b"
>
	<div class="space-y-2 py-3 sm:hidden">
		<div class="flex items-center justify-between text-xs text-gray-500">
			<label for="mobile-category" class="font-semibold uppercase tracking-wide">Category</label>
			<span>{active + 1} of {categories.length}</span>
		</div>
		<select
			id="mobile-category"
			class="min-h-12 w-full rounded-xl border border-gray-300 bg-white px-3 text-base font-semibold"
			value={active}
			onchange={(event) => onStep(Number(event.currentTarget.value))}
		>
			{#each categories as category, index (category.key)}
				<option value={index}>{category.label}</option>
			{/each}
		</select>
		<div class="grid grid-cols-2 gap-2">
			<button
				class="min-h-11 rounded-xl border border-gray-300 bg-white text-sm font-medium disabled:opacity-40"
				disabled={active === 0}
				onclick={() => onStep(active - 1)}>← Previous category</button
			>
			<button
				class="min-h-11 rounded-xl border border-gray-300 bg-white text-sm font-medium disabled:opacity-40"
				disabled={active === categories.length - 1}
				onclick={() => onStep(active + 1)}>Next category →</button
			>
		</div>
	</div>
	<div class="relative hidden sm:block">
		<!-- Edge fades -->
		<div
			class="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white to-transparent"
			class:hidden={!leftShadow}
		></div>
		<div
			class="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent"
			class:hidden={!rightShadow}
		></div>

		<!-- svelte-ignore a11y_interactive_supports_focus -->
		<div
			bind:this={scroller}
			class="overflow-x-auto scroll-smooth no-scrollbar"
			onscroll={updateShadows}
			onwheel={onWheel}
			onkeydown={onKeyDown}
			role="tablist"
			aria-label="Rehab categories"
		>
			<div class="flex gap-8 px-3 py-2 min-w-full">
				{#each categories as c, i (c.key)}
					<button
						type="button"
						role="tab"
						aria-selected={i === active}
						aria-controls={`panel-${c.key}`}
						id={`tab-${c.key}`}
						data-idx={i}
						tabindex={i === active ? 0 : -1}
						onclick={() => onStep(i)}
						class="px-3 py-2 rounded-full text-sm whitespace-nowrap border transition
                   focus:outline-none focus:ring-2
                   {i === active
							? 'bg-gray-900 text-white border-gray-900'
							: 'bg-white text-gray-700 hover:bg-gray-50'}"
					>
						{c.label}
					</button>
				{/each}
			</div>
		</div>
	</div>
</nav>

<style>
	/* Hide scrollbar on mobile but keep scrollability */
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}
	.no-scrollbar {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
