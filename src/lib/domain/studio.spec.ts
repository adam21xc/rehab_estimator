import { it, expect } from 'vitest';
import { studioProject } from './studio';
import { validateSnapshot } from '$lib/server/rehab-data';
import { groupPropertyImages } from './image-library';
it('saves a standalone concept with no address or repair costs and keeps it in the image library', () => {
	const photo = {
		id: 'photo',
		fileName: 'House.jpg',
		mime: 'image/jpeg',
		url: 'https://example.com/house.jpg',
		storagePath: 'owner/photos/house.jpg',
		categoryKey: 'other'
	};
	const source = studioProject(photo, '');
	const { project, total } = validateSnapshot(source, 'owner');
	expect(project.meta.kind).toBe('studio');
	expect(total).toBe(0);
	expect(project.meta.address).toBe('');
	expect(photo.categoryKey).toBe('other');
	const groups = groupPropertyImages(
		[
			{
				id: 'session',
				project_id: project.meta.id,
				address: 'Untitled property',
				created_at: project.meta.createdAt,
				snapshot: project
			}
		],
		[],
		'owner'
	);
	expect(groups[0].address).toBe('Address not set');
	expect(groups[0].images).toHaveLength(1);
	expect(studioProject(photo, ' 123 Main St ').meta.address).toBe('123 Main St');
});
