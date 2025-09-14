<script lang="ts">
import { createEventDispatcher } from 'svelte';
export let unit: 'ea'|'sf'|'psf'|'lf'|'ls' = 'ea';
export let value = 0;
export let id: string;
export let label: string;
const dispatch = createEventDispatcher<{ change: number }>();
function onInput(e: Event) {
const v = Number((e.target as HTMLInputElement).value) || 0;
dispatch('change', v);
}
</script>
<label class="block text-sm font-medium" for={id}>{label}</label>

<input
  id={id}
  type="number"
  inputmode="decimal"
  min="0"
  step="0.01"
  class="mt-1 w-full rounded-xl border p-3"
  aria-describedby={`${id}-help`}
  value={value}
  on:input={onInput}
/>

<p id={`${id}-help`} class="text-xs text-gray-500 mt-1">{unit === 'ls' ? 'Lump sum (enter count × lot)' : unit === 'psf' ? 'Enter area (sq ft)' : unit === 'sf' ? 'Enter area (sq ft)' : unit === 'lf' ? 'Enter length (linear ft)' : 'Enter quantity'}</p>