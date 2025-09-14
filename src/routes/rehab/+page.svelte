<script lang="ts">
import { onMount } from 'svelte';
import { projectStore } from '$lib/stores/projectStore';
import { REHAB_CATALOG } from '$lib/data/rehabCatalog';
import { slugify } from '$lib/domain/id';
import type { RehabProject, CategoryProgress } from '$lib/domain/types';
import Stepper from '$lib/components/Stepper.svelte';
import CategoryForm from '$lib/components/CategoryForm.svelte';
import StickyTotals from '$lib/components/StickyTotals.svelte';
import { uid } from '$lib/domain/id';
import SummaryDrawer from '$lib/components/SummaryDrawer.svelte';
let showSummary = false;


let active = 0;
const { store } = projectStore;
let project: RehabProject | null = null;


const ensureProject = () => ({
    meta: { id: uid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    catalog: REHAB_CATALOG,
    progress: REHAB_CATALOG.categories.map((c) => ({ categoryKey: c.key, lines: [], photos: [] }))
  } satisfies RehabProject);


onMount(()=>{
const unsub = store.subscribe((p)=> project = p);
if (!project) store.set(ensureProject());
return unsub;
});


function updateCategory(lines: CategoryProgress['lines']) {
if (!project) return;
const categoryKey = project.catalog.categories[active].key;
project = {
...project,
meta: { ...project.meta, updatedAt: new Date().toISOString() },
progress: project.progress.map(p => p.categoryKey===categoryKey ? { ...p, lines } : p)
};
store.set(project);
}

function addPhoto(photo) {
    if (!project) return;
    const key = project.catalog.categories[active].key;
    project = {
      ...project,
      meta: { ...project.meta, updatedAt: new Date().toISOString() },
      progress: project.progress.map(p =>
        p.categoryKey === key ? { ...p, photos: [...p.photos, photo] } : p
      )
    };
    store.set(project);
  }
</script>


<div class="mx-auto max-w-screen-md p-4 pb-24">
<h1 class="text-2xl font-bold">Rehab Calculator</h1>
<p class="text-sm text-gray-600">Walk the property one category at a time.</p>


{#if project}
  <Stepper
    categories={project.catalog.categories}
    {active}
    onStep={(i)=> active = i }
  />

  {#key project.catalog.categories[active].key}
    <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
    <section
      id={`panel-${project.catalog.categories[active].key}`}
      role="tabpanel"
      tabindex="-1"
      aria-labelledby=""
      class="mt-2"
    >
      <CategoryForm
        category={project.catalog.categories[active]}
        lines={project.progress[active].lines}
        onChange={updateCategory}
        onPhotoAdd={addPhoto}
      />
    </section>
  {/key}
{/if}
</div>


<!-- <StickyTotals /> -->
 <StickyTotals on:open={() => (showSummary = true)} />
<SummaryDrawer open={showSummary} onClose={() => (showSummary = false)} />