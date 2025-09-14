<script lang="ts">
import type { PhotoRef } from '$lib/domain/types';
import { createEventDispatcher } from 'svelte';
import { nanoid } from 'nanoid/non-secure';
export let categoryKey!: string;
export let itemId: string | undefined;
const dispatch = createEventDispatcher<{ add: PhotoRef }>();
async function onPick(e: Event) {
const files = (e.target as HTMLInputElement).files;
if (!files) return;
for (const file of Array.from(files)) {
const url = URL.createObjectURL(file);
dispatch('add', {
id: nanoid(),
itemId,
categoryKey,
fileName: file.name,
mime: file.type,
url,
takenAt: new Date().toISOString(),
});
}
}
</script>
<div class="flex items-center gap-3">
<label class="inline-flex items-center gap-2 cursor-pointer">
<input type="file" accept="image/*" capture="environment" multiple class="sr-only" on:change={onPick} />
<span class="rounded-xl border px-3 py-2">Add photos</span>
</label>
</div>