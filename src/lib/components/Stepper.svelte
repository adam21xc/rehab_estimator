<script lang="ts">
  import type { CatalogCategory } from '$lib/domain/types';
  import { onMount, afterUpdate } from 'svelte';
  export let categories: CatalogCategory[] = [];
  export let active = 0; // parent passes `{active}` directly
  export let onStep: (idx: number) => void;

  let scroller: HTMLDivElement;
  let leftShadow = false;
  let rightShadow = false;

  let prevActive = -1;

  function updateShadows() {
    if (!scroller) return;
    const { scrollLeft, scrollWidth, clientWidth } = scroller;
    leftShadow  = scrollLeft > 2;
    rightShadow = scrollLeft + clientWidth < scrollWidth - 2;
  }

  function focusActiveChip() {
    const el = scroller?.querySelector<HTMLButtonElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
  }

  // 🔑 Only recenter when the active step actually changes
  afterUpdate(() => {
    if (active !== prevActive) {
      focusActiveChip();
      prevActive = active;
    }
  });

  function onWheel(e: WheelEvent) {
    // Horizontal swipe on trackpads or shift+wheel
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      scroller?.scrollBy({ left: e.deltaX, behavior: 'auto' });
      updateShadows();
    }
  }

  // Roving tabindex for keyboard users
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') { e.preventDefault(); onStep(Math.min(active + 1, categories.length - 1)); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); onStep(Math.max(active - 1, 0)); }
    if (e.key === 'Home')       { e.preventDefault(); onStep(0); }
    if (e.key === 'End')        { e.preventDefault(); onStep(categories.length - 1); }
  }

  onMount(() => {
    prevActive = active; // avoid initial recenter snap
    updateShadows();
    const obs = new ResizeObserver(updateShadows);
    obs.observe(scroller);
    return () => obs.disconnect();
  });
</script>

<nav aria-label="Category steps"
     class="sticky top-0 z-30 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-b">

  <div class="relative">
    <!-- Edge fades -->
    <div class="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white to-transparent"
         class:hidden={!leftShadow}></div>
    <div class="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent"
         class:hidden={!rightShadow}></div>


    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div
      bind:this={scroller}
      class="overflow-x-auto scroll-smooth no-scrollbar"
      on:scroll={updateShadows}
      on:wheel|passive={onWheel}
      on:keydown={onKeyDown}
      role="tablist" aria-label="Rehab categories">

      <div class="flex gap-8 px-3 py-2 min-w-full">
        {#each categories as c, i (c.key)}
          <button
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-controls={`panel-${c.key}`}
            id={`tab-${c.key}`}
            data-idx={i}
            tabindex={i === active ? 0 : -1}
            on:click={() => onStep(i)}
            class="px-3 py-2 rounded-full text-sm whitespace-nowrap border transition
                   focus:outline-none focus:ring-2
                   {i===active
                     ? 'bg-gray-900 text-white border-gray-900'
                     : 'bg-white text-gray-700 hover:bg-gray-50'}">
            {c.label}
          </button>
        {/each}
      </div>
    </div>
  </div>
</nav>

<style>
  /* Hide scrollbar on mobile but keep scrollability */
  .no-scrollbar::-webkit-scrollbar { display: none; }
  .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>