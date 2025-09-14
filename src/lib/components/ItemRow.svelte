<script lang="ts">
  import QuantityInput from './QuantityInput.svelte';
  import PhotoInput from './PhotoInput.svelte';
  import type { CatalogItem, LineInput } from '$lib/domain/types';
  import { currency } from '$lib/domain/format';
  import { createEventDispatcher } from 'svelte';

  export let item!: CatalogItem;
  export let line: LineInput | undefined;
  export let categoryKey!: string;
  export let onChange!: (li: LineInput) => void;

  const dispatch = createEventDispatcher<{ photoAdd: any }>();
  let lastThumb: string | null = null;

  // reactive quantity + total
  $: quantity = line?.quantity ?? 0;
  $: total = (Number.isFinite(quantity) ? quantity : 0) * (item?.cost ?? 0);
</script>

<div class="rounded-2xl border p-4 bg-white shadow-sm mb-3">
  <div class="flex items-start justify-between gap-4">
    <div>
      <div class="font-medium">{item.description}</div>
      <div class="mt-1 flex items-center gap-2 text-xs text-gray-500">
        <span class="inline-flex items-center rounded-full border px-2 py-0.5">
            {item.unit}
        </span>
        <span>@ {currency(item.cost, { max: 2 })}</span>
      </div>
    </div>
    <div class="text-right">
      <div class="text-xs text-gray-500">Line total</div>
      <div class="text-lg font-semibold">{currency(total, { max: 2 })}</div>
    </div>
  </div>

  {#if lastThumb}
    <div class="mt-3">
      <img src={lastThumb} alt="Attached photo"
           class="h-16 w-16 object-cover rounded-lg border" />
    </div>
  {/if}
  <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
    <div class="flex items-center gap-2">
      <button class="rounded-xl border px-3 py-2"
              aria-label="Decrease quantity"
              on:click={() => onChange({ itemId: item.id, quantity: Math.max(quantity - 1, 0) })}>−</button>

      <input id={`${categoryKey}-${item.id}`}
             type="number" inputmode="decimal" min="0" step="0.01"
             class="w-full rounded-xl border px-3 py-2"
             value={quantity}
             aria-describedby={`${categoryKey}-${item.id}-help`}
             on:input={(e)=> onChange({ itemId: item.id, quantity: +((e.target as HTMLInputElement).value || 0) })} />

      <button class="rounded-xl border px-3 py-2"
              aria-label="Increase quantity"
              on:click={() => onChange({ itemId: item.id, quantity: quantity + 1 })}>+</button>
    </div>

    <div class="flex items-center justify-end">
      <PhotoInput {categoryKey} itemId={item.id}
        on:add={(e) => {
          lastThumb = e.detail.url;
          dispatch('photoAdd', e.detail);
        }} />
    </div>
  </div>

  <p id={`${categoryKey}-${item.id}-help`} class="mt-1 text-xs text-gray-500">
    {item.unit === 'ls' ? 'Lump sum (enter count × lots)'
     : item.unit === 'psf' || item.unit === 'sf' ? 'Enter area in square feet'
     : item.unit === 'lf' ? 'Enter length in linear feet'
     : 'Enter quantity'}
  </p>
</div>