import type { PhotoRef, RehabProject } from './types';
export function studioProject(
	photo: PhotoRef,
	address: string,
	id = crypto.randomUUID()
): RehabProject {
	const now = new Date().toISOString();
	return {
		meta: { id, kind: 'studio', address: address.trim(), createdAt: now, updatedAt: now },
		catalog: { categories: [{ key: 'studio', label: 'Design studio', items: [] }] },
		progress: [{ categoryKey: 'studio', lines: [], photos: [{ ...photo, categoryKey: 'studio' }] }]
	};
}
