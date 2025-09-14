<script lang="ts">
import ItemRow from './ItemRow.svelte';
import type { CatalogCategory, LineInput } from '$lib/domain/types';
export let category!: CatalogCategory;
export let lines: LineInput[] = [];
export let onChange!: (lines: LineInput[]) => void;
export let onPhotoAdd!: (photo: PhotoRef) => void;   // NEW
function upsert(li: LineInput) {
const idx = lines.findIndex((l) => l.itemId === li.itemId);
const next = [...lines];
if (idx === -1) next.push(li); else next[idx] = li;
onChange(next.filter(l => (l.quantity ?? 0) > 0));
}
</script>
<div class="divide-y">
  {#each category.items as item (item.id)}
    <ItemRow
      {item}
      categoryKey={category.key}
      line={lines.find(l => l.itemId === item.id)}
      onChange={upsert}
    />
  {/each}
</div>