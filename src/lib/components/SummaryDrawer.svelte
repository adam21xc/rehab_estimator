<script lang="ts">
  import { projectStore } from '$lib/stores/projectStore';
  import { currency } from '$lib/domain/format';
  import type { RehabProject } from '$lib/domain/types';
  import { onDestroy } from 'svelte';
  export let open = false;
  export let onClose: () => void;

  let project: RehabProject | null = null;
  const unsubscribe = projectStore.store.subscribe((p) => (project = p));
  onDestroy(unsubscribe);
  $: rows = project
    ? project.catalog.categories.map(c => {
        const progress = project.progress.find(p => p.categoryKey === c.key);
        const lines = (progress?.lines ?? [])
          .filter(l => (l.quantity ?? 0) > 0)
          .map(l => {
            const it = c.items.find(i => i.id === l.itemId);
            const total = (l.quantity ?? 0) * (it?.cost ?? 0);
            return { item: it, qty: l.quantity ?? 0, total };
          });
        const subtotal = lines.reduce((a, b) => a + b.total, 0);
        return { cat: c, lines, subtotal };
      })
    : [];
  $: grand = rows.reduce((a, r) => a + r.subtotal, 0);
  $: hasLines = rows.some((r) => r.lines.length > 0);
</script>

{#if open}
  <div class="fixed inset-0 z-50 bg-black/40" on:click={onClose}></div>
  <aside class="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-xl p-4 overflow-y-auto">
    <div class="flex items-center justify-between mb-2">
      <h2 class="text-xl font-semibold">Summary</h2>
      <button class="rounded-lg border px-3 py-1" on:click={onClose}>Close</button>
    </div>

    {#if !hasLines}
      <div class="mt-8 text-sm text-gray-600">
        <p class="font-medium">No items selected yet</p>
        <p class="mt-1">Enter quantities in any category and your line-by-line scope will appear here.</p>
      </div>
    {:else}
      {#each rows as r}
        {#if r.lines.length}
          <h3 class="mt-4 mb-2 text-sm font-semibold text-gray-700">{r.cat.label}</h3>
          <div class="divide-y border rounded-xl">
            {#each r.lines as l}
              <div class="p-3 text-sm">
                <div class="font-medium">{l.item?.description}</div>
                <div class="text-gray-600">
                  {l.qty} × {currency(l.item?.cost ?? 0, { max: 2 })} = <span class="font-semibold">{currency(l.total, { max: 2 })}</span>
                </div>
              </div>
            {/each}
            <div class="p-3 text-right text-sm font-semibold bg-gray-50">Subtotal: {currency(r.subtotal, { max: 2 })}</div>
          </div>
        {/if}
      {/each}

      <div class="mt-6 text-right text-lg font-bold">Total: {currency(grand, { max: 2 })}</div>
    {/if}
  </aside>
{/if}