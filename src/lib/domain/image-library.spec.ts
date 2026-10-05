import { expect, it } from 'vitest';
import { groupPropertyImages, type ImageEstimate, type SavedRendering } from './image-library';
const estimate = (
	id: string,
	project_id: string,
	address: string,
	created_at: string
): ImageEstimate => ({
	id,
	project_id,
	address,
	created_at,
	snapshot: {
		meta: { id: project_id, address, createdAt: created_at, updatedAt: created_at },
		catalog: { categories: [] },
		progress: [
			{
				categoryKey: 'roof',
				lines: [],
				photos: [
					{
						id: 'p',
						categoryKey: 'roof',
						fileName: 'house.jpg',
						mime: 'image/jpeg',
						url: 'ignored',
						storagePath: 'owner/photos/house.jpg'
					}
				]
			}
		]
	}
});
const rendering = (
	estimate_id: string,
	path = 'owner/renderings/concept.jpeg'
): SavedRendering => ({
	id: estimate_id,
	estimate_id,
	status: 'completed',
	output_path: path,
	prompt: 'New siding',
	style: 'Modern warm',
	created_at: '2026-10-04'
});
it('groups saved versions under latest address and deduplicates original images', () => {
	const result = groupPropertyImages(
		[
			estimate('a', 'p', '', '2026-10-01'),
			estimate('b', 'p', '123 Main St', '2026-10-03'),
			estimate('c', 'q', ' 123  MAIN ST ', '2026-10-02')
		],
		[rendering('a'), rendering('b')],
		'owner'
	);
	expect(result).toHaveLength(1);
	expect(result[0].address).toBe('123 Main St');
	expect(result[0].estimateId).toBe('b');
	expect(result[0].images).toHaveLength(3);
	expect(result[0].images.filter((i) => i.kind === 'concept')).toHaveLength(2);
});
it('keeps unnamed projects separate and excludes foreign or missing outputs', () => {
	const result = groupPropertyImages(
		[estimate('a', 'p', '', '2026-10-01'), estimate('b', 'q', '', '2026-10-02')],
		[rendering('a', 'other/renderings/file.jpeg'), rendering('missing')],
		'owner'
	);
	expect(result).toHaveLength(2);
	expect(result.every((g) => g.images.length === 1)).toBe(true);
});
