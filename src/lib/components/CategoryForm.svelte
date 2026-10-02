<script lang="ts">
	import ItemRow from './ItemRow.svelte';
	import type { CatalogCategory, LineInput, PhotoRef } from '$lib/domain/types';
	let {
		category,
		lines = [],
		photos = [],
		onChange,
		onPhotoAdd
	}: {
		category: CatalogCategory;
		lines?: LineInput[];
		photos?: PhotoRef[];
		onChange: (line: LineInput) => void;
		onPhotoAdd: (photo: PhotoRef) => void;
	} = $props();
</script>

<div class="divide-y">
	{#each category.items as item (item.id)}
		<ItemRow
			{item}
			categoryKey={category.key}
			line={lines.find((line) => line.itemId === item.id)}
			photos={photos.filter((photo) => photo.itemId === item.id)}
			{onChange}
			{onPhotoAdd}
		/>
	{/each}
</div>
