<!-- <script lang="ts">
import { projectStore } from '$lib/stores/projectStore';
import { currency } from '$lib/domain/format';
import { fly } from 'svelte/transition';
const { totals } = projectStore;
</script>
<div class="fixed inset-x-0 bottom-0 z-40" aria-live="polite">
  <div class="mx-auto max-w-screen-md m-3 rounded-2xl shadow-2xl
              bg-white border p-4 flex items-center justify-between gap-3">
    <div class="text-sm text-gray-600">Running Total</div>
    <div class="text-2xl font-bold">{currency($totals.grandTotal)}</div>
    <button class="rounded-xl bg-gray-900 text-white px-4 py-2"
            on:click={() => dispatchEvent(new CustomEvent('summary:open'))}>
      Summary
    </button>
  </div>
</div> -->

<script lang="ts">
  import { projectStore } from '$lib/stores/projectStore';
  import { currency } from '$lib/domain/format';
  import { createEventDispatcher } from 'svelte';
  const { totals } = projectStore;
  const dispatch = createEventDispatcher();
</script>

<div class="fixed inset-x-0 bottom-0 z-40" aria-live="polite">
  <div class="mx-auto max-w-screen-md m-3 rounded-2xl shadow-2xl bg-white border p-4
              flex items-center justify-between gap-3">
    <div class="text-sm text-gray-600">Running Total</div>
    <div class="text-2xl font-bold">{currency($totals.grandTotal, { max: 2 })}</div>
    <button class="rounded-xl bg-gray-900 text-white px-4 py-2"
            on:click={() => dispatch('open')}>Summary</button>
  </div>
</div>