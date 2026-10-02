import { SvelteDate } from 'svelte/reactivity';
import { REHAB_CATALOG } from '$lib/data/rehabCatalog';
import { computeTotals } from '$lib/domain/calc';
import { uid } from '$lib/domain/id';
import { rehabProjectZ } from '$lib/domain/schema';
import type { LineInput, PhotoRef, RehabProject } from '$lib/domain/types';

export const PROJECT_STORAGE_KEY = 'rehab_project_v1';

// Create once per page instance, never as a server-wide singleton.
export function createProjectState() {
	let project = $state<RehabProject | null>(null);
	let storageMessage = $state('');
	let canSave = false;
	const totals = $derived(project ? computeTotals(project) : { byCategory: [], grandTotal: 0 });

	function restore(storage: Pick<Storage, 'getItem'>) {
		try {
			const raw = storage.getItem(PROJECT_STORAGE_KEY);
			if (raw) {
				const saved = rehabProjectZ.parse(JSON.parse(raw));
				if (!saved.catalog.categories.length) throw new Error('Empty catalog');
				// Preserve saved prices and match progress by key, not position.
				saved.progress = saved.catalog.categories.map(
					(category) =>
						saved.progress.find((entry) => entry.categoryKey === category.key) ?? {
							categoryKey: category.key,
							lines: [],
							photos: []
						}
				);
				project = saved;
			}
			canSave = true;
		} catch {
			storageMessage =
				'Your saved estimate could not be loaded. It has been preserved; changes in this session will not overwrite it.';
		}
		if (!project) {
			const now = new SvelteDate().toISOString();
			project = {
				meta: { id: uid(), createdAt: now, updatedAt: now },
				catalog: structuredClone(REHAB_CATALOG),
				progress: REHAB_CATALOG.categories.map((category) => ({
					categoryKey: category.key,
					lines: [],
					photos: []
				}))
			};
		}
	}

	function persist(storage: Pick<Storage, 'setItem'>) {
		if (!project || !canSave) return;
		// Serialize before the storage call so the page effect tracks nested edits.
		const serialized = JSON.stringify(project);
		try {
			storage.setItem(PROJECT_STORAGE_KEY, serialized);
			storageMessage = '';
		} catch {
			storageMessage =
				'This estimate could not be saved in this browser. Keep this tab open; browser storage may be full or disabled.';
		}
	}

	function updateLine(categoryKey: string, line: LineInput) {
		if (!project) return;
		const category = project.catalog.categories.find((entry) => entry.key === categoryKey);
		const progress = project.progress.find((entry) => entry.categoryKey === categoryKey);
		if (!category?.items.some((item) => item.id === line.itemId) || !progress) return;
		const quantity = Number.isFinite(line.quantity) ? Math.max(0, line.quantity) : 0;
		const previous = progress.lines.find((entry) => entry.itemId === line.itemId);
		progress.lines = progress.lines.filter((entry) => entry.itemId !== line.itemId);
		if (quantity > 0) progress.lines.push({ ...previous, ...line, quantity });
		project.meta.updatedAt = new SvelteDate().toISOString();
	}

	function updateAddress(address: string) {
		if (!project) return;
		project.meta.address = address;
		project.meta.updatedAt = new SvelteDate().toISOString();
	}

	function addPhoto(photo: PhotoRef) {
		const progress = project?.progress.find((entry) => entry.categoryKey === photo.categoryKey);
		if (!project || !progress) return;
		progress.photos.push(photo);
		project.meta.updatedAt = new SvelteDate().toISOString();
	}

	function replace(next: RehabProject) {
		project = rehabProjectZ.parse(next);
		canSave = true;
		storageMessage = '';
	}
	function newProject() {
		const now = new SvelteDate().toISOString();
		replace({
			meta: { id: uid(), createdAt: now, updatedAt: now },
			catalog: structuredClone(REHAB_CATALOG),
			progress: REHAB_CATALOG.categories.map((c) => ({ categoryKey: c.key, lines: [], photos: [] }))
		});
	}
	function cloudPhoto(id: string, storagePath: string, url: string) {
		const photo = project?.progress.flatMap((p) => p.photos).find((p) => p.id === id);
		if (photo) {
			photo.storagePath = storagePath;
			photo.url = url;
		}
	}
	return {
		replace,
		newProject,
		cloudPhoto,
		get project() {
			return project;
		},
		get totals() {
			return totals;
		},
		get storageMessage() {
			return storageMessage;
		},
		restore,
		persist,
		updateLine,
		updateAddress,
		addPhoto
	};
}
