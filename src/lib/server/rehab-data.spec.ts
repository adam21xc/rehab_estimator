import { describe, it, expect } from 'vitest';
import { validateSnapshot, hydrateProject } from './rehab-data';
import type { RehabProject } from '$lib/domain/types';
const fixture = (): RehabProject => ({
	meta: {
		id: 'test',
		createdAt: '2026-09-29T00:00:00.000Z',
		updatedAt: '2026-09-29T00:00:00.000Z'
	},
	catalog: {
		categories: [
			{
				key: 'roof',
				label: 'Roof',
				items: [{ id: 'roof', description: 'Roof', unit: 'sf', cost: 4 }]
			}
		]
	},
	progress: [
		{
			categoryKey: 'roof',
			lines: [{ itemId: 'roof', quantity: 10 }],
			photos: [
				{
					id: 'photo',
					categoryKey: 'roof',
					fileName: 'roof.png',
					mime: 'image/png',
					url: 'data:image/png;base64,YQ==',
					storagePath: 'owner/photos/photo.png'
				}
			]
		}
	]
});
describe('cloud snapshots', () => {
	it('recomputes totals and removes temporary URLs', () => {
		const saved = validateSnapshot(fixture(), 'owner');
		expect(saved.total).toBe(40);
		expect(saved.project.progress[0].photos[0].url).not.toContain('base64');
		expect(hydrateProject(saved.project).progress[0].photos[0].url).toContain(
			'/api/rehab/media?path=owner'
		);
	});
	it('rejects photos owned by another user', () => {
		expect(() => validateSnapshot(fixture(), 'other')).toThrow();
	});
	it('rejects unuploaded photos and non-finite quantities', () => {
		const p = fixture();
		delete p.progress[0].photos[0].storagePath;
		expect(() => validateSnapshot(p, 'owner')).toThrow();
		p.progress[0].lines[0].quantity = Infinity;
		expect(() => validateSnapshot(p, 'owner')).toThrow();
	});
});
