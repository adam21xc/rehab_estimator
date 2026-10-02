<script lang="ts">
	import { currency } from '$lib/domain/format';
	import type { RehabProject } from '$lib/domain/types';
	let {
		project,
		open = false,
		onClose
	}: {
		project: RehabProject | null;
		open?: boolean;
		onClose: () => void;
	} = $props();
	const rows = $derived(
		project
			? project.catalog.categories.map((c) => {
					const progress = project?.progress.find((p) => p.categoryKey === c.key);
					const lines = (progress?.lines ?? [])
						.filter((l) => (l.quantity ?? 0) > 0)
						.map((l) => {
							const it = c.items.find((i) => i.id === l.itemId);
							const total = (l.quantity ?? 0) * (it?.cost ?? 0);
							return { item: it, qty: l.quantity ?? 0, total };
						});
					const subtotal = lines.reduce((a, b) => a + b.total, 0);
					return { cat: c, lines, subtotal };
				})
			: []
	);
	const grand = $derived(rows.reduce((a, r) => a + r.subtotal, 0));
	const hasLines = $derived(rows.some((r) => r.lines.length > 0));
	let dialog = $state<HTMLDialogElement>();
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	aria-labelledby="summary-title"
	oncancel={(event) => {
		event.preventDefault();
		onClose();
	}}
>
	<aside class="h-full overflow-y-auto bg-white p-4">
		<div class="flex items-center justify-between mb-2">
			<h2 id="summary-title" class="text-xl font-semibold">Summary</h2>
			<button class="min-h-11 rounded-xl border border-gray-300 px-4 py-2" onclick={onClose}
				>Close</button
			>
		</div>

		{#if project?.meta.address}<p class="mb-4 break-words text-sm text-gray-600">
				{project.meta.address}
			</p>{/if}
		{#if !hasLines}
			<div class="mt-8 text-sm text-gray-600">
				<p class="font-medium">No items selected yet</p>
				<p class="mt-1">
					Enter quantities in any category and your line-by-line scope will appear here.
				</p>
			</div>
		{:else}
			{#each rows as r (r.cat.key)}
				{#if r.lines.length}
					<h3 class="mt-4 mb-2 text-sm font-semibold text-gray-700">{r.cat.label}</h3>
					<div class="divide-y border rounded-xl">
						{#each r.lines as l (l.item?.id)}
							<div class="p-3 text-sm">
								<div class="font-medium">{l.item?.description}</div>
								<div class="text-gray-600">
									{l.qty} × {currency(l.item?.cost ?? 0, { max: 2 })} =
									<span class="font-semibold">{currency(l.total, { max: 2 })}</span>
								</div>
							</div>
						{/each}
						<div class="p-3 text-right text-sm font-semibold bg-gray-50">
							Subtotal: {currency(r.subtotal, { max: 2 })}
						</div>
					</div>
				{/if}
			{/each}

			<div class="mt-6 text-right text-lg font-bold">Total: {currency(grand, { max: 2 })}</div>
		{/if}
	</aside>
</dialog>

<style>
	dialog {
		position: fixed;
		inset: 0 0 0 auto;
		margin: 0;
		width: min(100%, 28rem);
		max-width: 100%;
		height: 100dvh;
		max-height: 100dvh;
		padding: 0;
		border: 0;
		overscroll-behavior: contain;
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 0.4);
	}
	aside {
		padding-bottom: max(1rem, env(safe-area-inset-bottom));
	}
</style>
