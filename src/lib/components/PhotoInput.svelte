<script lang="ts">
	import type { PhotoRef } from '$lib/domain/types';
	import { uid } from '$lib/domain/id';
	let {
		categoryKey,
		itemId,
		onAdd
	}: {
		categoryKey: string;
		itemId?: string;
		onAdd: (photo: PhotoRef) => void;
	} = $props();
	let error = $state('');
	async function onPick(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		// Capture ownership before awaiting: navigation may change the active category.
		const category = categoryKey;
		const item = itemId;
		error = '';
		for (const file of files) {
			if (
				!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
				file.size > 5 * 1024 * 1024
			) {
				error = 'Choose a JPEG, PNG, or WebP photo smaller than 5 MB.';
				continue;
			}
			try {
				const url = await new Promise<string>((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = () => resolve(String(reader.result));
					reader.onerror = () => reject(reader.error);
					reader.readAsDataURL(file);
				});
				onAdd({
					id: uid(),
					itemId: item,
					categoryKey: category,
					fileName: file.name,
					mime: file.type,
					url,
					takenAt: new Date().toISOString()
				});
			} catch {
				error = 'This image could not be read. Please try again.';
			}
		}
		input.value = '';
	}
</script>

<div>
	<label class="inline-flex cursor-pointer items-center gap-2">
		<input
			type="file"
			accept="image/jpeg,image/png,image/webp"
			capture="environment"
			multiple
			class="sr-only"
			onchange={onPick}
		/>
		<span
			class="inline-flex min-h-11 items-center rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium"
			>Add photos</span
		>
	</label>
	{#if error}<p role="alert" class="mt-1 text-sm text-red-700">{error}</p>{/if}
</div>
