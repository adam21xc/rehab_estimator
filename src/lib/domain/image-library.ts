import type { RehabProject } from './types';
export type ImageEstimate = {
	id: string;
	project_id: string;
	address: string;
	created_at: string;
	snapshot: RehabProject;
};
export type SavedRendering = {
	id: string;
	estimate_id: string;
	status: string;
	output_path: string | null;
	prompt: string;
	style: string;
	created_at: string;
};
export type LibraryImage = {
	id: string;
	kind: 'original' | 'concept';
	url: string;
	label: string;
	prompt?: string;
	createdAt: string;
	estimateId: string;
};
export type PropertyImages = {
	key: string;
	address: string;
	estimateId: string;
	images: LibraryImage[];
};
export function groupPropertyImages(
	estimates: ImageEstimate[],
	renderings: SavedRendering[],
	userId: string
): PropertyImages[] {
	const ordered = [...estimates].sort((a, b) => b.created_at.localeCompare(a.created_at));
	const addresses = new Map<string, string>();
	for (const e of ordered) {
		const address = (e.snapshot.meta.address || '').trim().replace(/\s+/g, ' ');
		if (address && !addresses.has(e.project_id)) addresses.set(e.project_id, address);
	}
	const groups = new Map<string, PropertyImages>();
	const byEstimate = new Map<string, PropertyImages>();
	const originals = new Map<string, Set<string>>();
	const media = (path: string) => `/api/rehab/media?path=${encodeURIComponent(path)}`;
	const owned = (path: string) => path.startsWith(`${userId}/`) && !path.includes('..');
	for (const e of ordered) {
		const address = addresses.get(e.project_id);
		const key = address ? `address:${address.toLowerCase()}` : `project:${e.project_id}`;
		let group = groups.get(key);
		if (!group) {
			group = { key, address: address || 'Address not set', estimateId: e.id, images: [] };
			groups.set(key, group);
			originals.set(key, new Set());
		}
		byEstimate.set(e.id, group);
		for (const photo of e.snapshot.progress.flatMap((p) => p.photos)) {
			const path = photo.storagePath;
			if (!path || !owned(path) || originals.get(key)!.has(path)) continue;
			originals.get(key)!.add(path);
			group.images.push({
				id: `original:${path}`,
				kind: 'original',
				url: media(path),
				label: photo.fileName,
				createdAt: photo.takenAt || e.created_at,
				estimateId: e.id
			});
		}
	}
	for (const r of renderings) {
		const group = byEstimate.get(r.estimate_id);
		if (!group || r.status !== 'completed' || !r.output_path || !owned(r.output_path)) continue;
		group.images.push({
			id: r.id,
			kind: 'concept',
			url: media(r.output_path),
			label: r.style,
			prompt: r.prompt,
			createdAt: r.created_at,
			estimateId: r.estimate_id
		});
	}
	return [...groups.values()]
		.filter((g) => g.images.length)
		.map((g) => ({
			...g,
			images: g.images.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
		}));
}
