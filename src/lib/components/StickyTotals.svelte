<script lang="ts">
	import { currency } from '$lib/domain/format';
	import type { CalcTotals } from '$lib/domain/types';
	let { totals, onOpen }: { totals: CalcTotals; onOpen: () => void } = $props();
</script>

<div class="estimate-footer fixed inset-x-0 bottom-0 z-40" aria-live="polite">
	<div
		class="mx-auto flex w-full max-w-screen-md items-center justify-between gap-3 rounded-t-2xl border border-gray-200 bg-white px-4 py-3 shadow-2xl sm:rounded-2xl"
	>
		<div class="min-w-0">
			<div class="text-xs text-gray-500">Running Total</div>
			<div class="break-words text-xl font-bold sm:text-2xl" data-testid="running-total">
				{currency(totals.grandTotal, { max: 2 })}
			</div>
		</div>
		<button
			class="min-h-12 shrink-0 rounded-xl bg-gray-900 px-5 py-2 text-sm font-semibold text-white"
			onclick={onOpen}>Summary</button
		>
	</div>
</div>
