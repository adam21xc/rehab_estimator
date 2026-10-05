import { expect, test } from '@playwright/test';
test('property library groups images and supports address and type filtering', async ({ page }) => {
	await page.route('**/api/rehab/session', (r) =>
		r.fulfill({ json: { user: { email: 'test@example.com' }, renderingEnabled: true } })
	);
	await page.route('**/api/rehab/image-library', (r) =>
		r.fulfill({
			json: {
				properties: [
					{
						key: 'address:123 main st',
						address: '123 Main St',
						estimateId: 'saved',
						images: [
							{
								id: 'a',
								kind: 'original',
								url: '/test-image',
								label: 'house.jpg',
								createdAt: '2026-10-01',
								estimateId: 'saved'
							},
							{
								id: 'b',
								kind: 'concept',
								url: '/test-image',
								label: 'Modern warm',
								prompt: 'New siding and porch',
								createdAt: '2026-10-03',
								estimateId: 'saved'
							}
						]
					}
				]
			}
		})
	);
	await page.route('**/test-image', (r) => r.fulfill({ status: 204 }));
	await page.goto('/rehab?view=gallery');
	await expect(page.getByRole('heading', { name: 'Property images', exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: '123 Main St', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Download image' })).toHaveCount(2);
	await page.getByLabel('Image type').selectOption('concept');
	await expect(page.getByRole('link', { name: 'Download image' })).toHaveCount(1);
	await page.getByLabel('Find an address').fill('Unknown');
	await expect(page.getByText('No matching addresses.')).toBeVisible();
});
test('image library requires authentication', async ({ request }) => {
	expect((await request.get('/api/rehab/image-library')).status()).toBe(401);
});
