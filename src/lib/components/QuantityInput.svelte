<script lang="ts">
	import type { Unit } from '$lib/domain/types';
	let {
		unit = 'ea',
		value = 0,
		id,
		label,
		onChange
	}: {
		unit?: Unit;
		value?: number;
		id: string;
		label: string;
		onChange: (value: number) => void;
	} = $props();
	function onInput(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const parsed = input.valueAsNumber;
		const next = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
		input.value = String(next);
		onChange(next);
	}
</script>

<div class="w-full">
	<label class="sr-only" for={id}>{label}</label>
	<input
		{id}
		type="number"
		inputmode="decimal"
		min="0"
		step="0.01"
		class="min-h-12 w-full rounded-xl border border-gray-300 px-3 py-2 text-base"
		{value}
		aria-describedby={`${id}-help`}
		oninput={onInput}
	/>
	<p id={`${id}-help`} class="mt-1 text-xs text-gray-500">
		{unit === 'ls'
			? 'Lump sum (enter count × lots)'
			: unit === 'psf' || unit === 'sf'
				? 'Enter area in square feet'
				: unit === 'lf'
					? 'Enter length in linear feet'
					: 'Enter quantity'}
	</p>
</div>
