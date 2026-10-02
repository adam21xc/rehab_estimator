import { error } from '@sveltejs/kit';
import { rehabProjectZ } from '$lib/domain/schema';
import { computeTotals } from '$lib/domain/calc';
import type { RehabProject } from '$lib/domain/types';
export const BUCKET = 'rehab-media';
export function validateSnapshot(value: unknown, userId: string) {
	const parsed = rehabProjectZ.safeParse(value);
	if (!parsed.success) error(400, 'Estimate data is invalid.');
	const project = parsed.data;
	if (project.catalog.categories.length > 100 || project.progress.length > 100)
		error(400, 'Too many categories.');
	const photos = project.progress.flatMap((p) => p.photos);
	if (photos.length > 100) error(400, 'An estimate can contain up to 100 photos.');
	for (const photo of photos) {
		if (
			!photo.storagePath ||
			!photo.storagePath.startsWith(`${userId}/photos/`) ||
			photo.storagePath.includes('..')
		)
			error(400, 'Upload each photo before saving.');
		// Never persist expiring signed URLs or base64 image data in the database.
		photo.url = `https://rehab.invalid/${photo.id}`;
	}
	const total = computeTotals(project).grandTotal;
	if (!Number.isFinite(total) || total > 1e12) error(400, 'Estimate total is too large.');
	return { project, total };
}
export function hydrateProject(project: RehabProject) {
	for (const p of project.progress)
		for (const photo of p.photos)
			if (photo.storagePath)
				photo.url = `/api/rehab/media?path=${encodeURIComponent(photo.storagePath)}`;
	return project;
}
