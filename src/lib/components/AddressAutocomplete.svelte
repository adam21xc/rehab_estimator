<script lang="ts">
	import { onDestroy } from 'svelte';
	type Suggestion = { id: string; address: string; coordinates: [number, number] };
	let {
		value = $bindable(''),
		label,
		placeholder = 'Street address, city, state and ZIP',
		disabled = false,
		onselect,
		onedit
	}: {
		value?: string;
		label: string;
		placeholder?: string;
		disabled?: boolean;
		onselect?: (suggestion: Suggestion) => void;
		onedit?: () => void;
	} = $props();
	const id = $props.id();
	let suggestions = $state<Suggestion[]>([]),
		active = $state(-1),
		open = $state(false),
		loading = $state(false),
		message = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined,
		controller: AbortController | undefined,
		version = 0;
	function cancel() {
		clearTimeout(timer);
		controller?.abort();
		version++;
		loading = false;
	}
	function edit() {
		cancel();
		onedit?.();
		suggestions = [];
		active = -1;
		message = '';
		const q = value.trim();
		if (disabled || q.length < 4) {
			open = false;
			return;
		}
		open = true;
		const current = version;
		timer = setTimeout(async () => {
			controller = new AbortController();
			loading = true;
			try {
				const response = await fetch(
					`/api/rehab/studio/address-search?q=${encodeURIComponent(q)}`,
					{ signal: controller.signal }
				);
				const data = await response.json();
				if (current !== version) return;
				if (!response.ok)
					throw new Error(data.message || 'Suggestions unavailable. Enter the full address.');
				suggestions = data.suggestions;
				message = suggestions.length ? '' : 'No address suggestions. Try adding the city or ZIP.';
			} catch (e) {
				if (current === version && (e as Error).name !== 'AbortError')
					message = (e as Error).message;
			} finally {
				if (current === version) loading = false;
			}
		}, 400);
	}
	function choose(suggestion: Suggestion) {
		cancel();
		value = suggestion.address;
		open = false;
		suggestions = [];
		active = -1;
		message = '';
		onselect?.(suggestion);
	}
	function key(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			cancel();
			open = false;
			return;
		}
		if (!open || !suggestions.length) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			active = (active + 1) % suggestions.length;
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			active = (active - 1 + suggestions.length) % suggestions.length;
		}
		if (event.key === 'Enter' && active >= 0) {
			event.preventDefault();
			choose(suggestions[active]);
		}
	}
	onDestroy(cancel);
</script>

<div class="autocomplete">
	<label for={id}>{label}</label>
	<input
		{id}
		bind:value
		{placeholder}
		{disabled}
		maxlength="256"
		autocomplete="off"
		role="combobox"
		aria-autocomplete="list"
		aria-expanded={open && suggestions.length > 0}
		aria-controls={`${id}-results`}
		aria-activedescendant={active >= 0 ? `${id}-option-${active}` : undefined}
		oninput={(event) => {
			value = event.currentTarget.value;
			edit();
		}}
		onkeydown={key}
		onblur={() => {
			cancel();
			open = false;
		}}
	/>
	{#if open}<div class="suggestion-panel">
			<div id={`${id}-results`} role="listbox" aria-label="Address suggestions">
				{#each suggestions as suggestion, i (suggestion.id)}<button
						type="button"
						role="option"
						id={`${id}-option-${i}`}
						aria-selected={active === i}
						class:active={active === i}
						onpointerdown={(e) => e.preventDefault()}
						onclick={() => choose(suggestion)}>{suggestion.address}</button
					>{/each}
			</div>
			{#if loading}<p role="status">Finding addresses…</p>{:else if message}<p role="status">
					{message}
				</p>{/if}
			<a
				href="https://www.mapbox.com/about/maps/"
				target="_blank"
				rel="noopener noreferrer"
				onpointerdown={(e) => e.preventDefault()}>Powered by Mapbox</a
			>
		</div>{/if}
</div>

<style>
	.autocomplete {
		position: relative;
	}
	label {
		display: block;
		font-size: 13px;
		font-weight: 600;
		color: #20322a;
	}
	input {
		display: block;
		box-sizing: border-box;
		width: 100%;
		padding: 11px 12px;
		margin-top: 7px;
		border: 1px solid #bfccc1;
		border-radius: 8px;
		background: white;
		color: #24372c;
		font: inherit;
		font-size: 14px;
	}
	input:focus {
		outline: 2px solid #46775a;
		outline-offset: 2px;
	}
	.suggestion-panel {
		position: absolute;
		z-index: 20;
		top: 100%;
		left: 0;
		right: 0;
		margin-top: 5px;
		background: #fff;
		border: 1px solid #adbfaf;
		border-radius: 10px;
		box-shadow: 0 8px 28px #20322a24;
		overflow: hidden;
	}
	button {
		display: block;
		width: 100%;
		text-align: left;
		padding: 13px 14px;
		border: 0;
		border-bottom: 1px solid #e5ebe4;
		background: white;
		color: #21392b;
		font: inherit;
		font-size: 13px;
		cursor: pointer;
	}
	button:hover,
	button.active {
		background: #e6efdf;
	}
	p {
		padding: 10px 14px;
		margin: 0;
		font-size: 12px;
		color: #5c6a60;
	}
	a {
		display: block;
		padding: 8px 14px;
		font-size: 10px;
		color: #56665b;
		text-align: right;
		background: #f5f7f2;
	}
</style>
