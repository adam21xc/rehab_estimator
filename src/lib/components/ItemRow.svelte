<script lang="ts">
	import QuantityInput from './QuantityInput.svelte';
	import PhotoInput from './PhotoInput.svelte';
	import type { CatalogItem, LineInput, PhotoRef } from '$lib/domain/types';
	import { currency } from '$lib/domain/format';
	let {
		item,
		line,
		categoryKey,
		photos = [],
		onChange,
		onPhotoAdd
	}: {
		item: CatalogItem;
		line?: LineInput;
		categoryKey: string;
		photos?: PhotoRef[];
		onChange: (line: LineInput) => void;
		onPhotoAdd: (photo: PhotoRef) => void;
	} = $props();
	const quantity = $derived(line?.quantity ?? 0);
	const total = $derived(quantity * item.cost);
	const lastThumb = $derived(photos.at(-1)?.url);
</script>

<div class="repair-card rounded-2xl border border-gray-200 p-4 bg-white shadow-sm mb-3">
	<div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
		<div>
			<div class="font-medium">{item.description}</div>
			<div class="mt-1 flex items-center gap-2 text-xs text-gray-500">
				<span class="inline-flex items-center rounded-full border px-2 py-0.5">
					{item.unit}
				</span>
				<span>@ {currency(item.cost, { max: 2 })}</span>
			</div>
		</div>
		<div class="text-right whitespace-nowrap">
			<div class="text-xs text-gray-500">Line total</div>
			<div class="text-base font-semibold sm:text-lg">{currency(total, { max: 2 })}</div>
		</div>
	</div>

	{#if lastThumb}
		<div class="mt-3">
			<img
				src={lastThumb}
				alt={`Attachment for ${item.description}`}
				class="h-16 w-16 object-cover rounded-lg border"
			/>
		</div>
	{/if}
	<div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
		<div class="flex items-center gap-2">
			<button
				class="min-h-12 min-w-12 shrink-0 self-start rounded-xl border border-gray-300 text-xl"
				aria-label="Decrease quantity"
				onclick={() => onChange({ itemId: item.id, quantity: Math.max(quantity - 1, 0) })}>−</button
			>

			<QuantityInput
				id={`${categoryKey}-${item.id}`}
				label={`Quantity for ${item.description}`}
				unit={item.unit}
				value={quantity}
				onChange={(value) => onChange({ itemId: item.id, quantity: value })}
			/>

			<button
				class="min-h-12 min-w-12 shrink-0 self-start rounded-xl border border-gray-300 text-xl"
				aria-label="Increase quantity"
				onclick={() => onChange({ itemId: item.id, quantity: quantity + 1 })}>+</button
			>
		</div>

		<div class="flex items-center justify-end">
			<PhotoInput {categoryKey} itemId={item.id} onAdd={onPhotoAdd} />
		</div>
	</div>
</div>
