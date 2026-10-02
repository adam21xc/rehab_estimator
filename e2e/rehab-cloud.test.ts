import { expect, test } from '@playwright/test';

test('cloud history saves photos and opens snapshots, then requests a rendering', async ({
	page
}) => {
	let snapshot: unknown;
	let requests = 0;
	const id = '11111111-1111-4111-8111-111111111111';
	await page.route('**/api/rehab/**', async (route) => {
		const url = new URL(route.request().url());
		const path = url.pathname;
		if (path.endsWith('/session'))
			return route.fulfill({
				json: { user: { email: 'test@example.com' }, renderingEnabled: true }
			});
		if (path.endsWith('/photos'))
			return route.fulfill({
				json: {
					path: 'test/photos/roof.png',
					url: '/api/rehab/media?path=test%2Fphotos%2Froof.png'
				}
			});
		if (path.endsWith('/media'))
			return route.fulfill({
				contentType: 'image/png',
				body: Buffer.from(
					'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
					'base64'
				)
			});
		if (path.endsWith('/estimates') && route.request().method() === 'POST') {
			snapshot = route.request().postDataJSON().project;
			return route.fulfill({ json: { id } });
		}
		if (path.endsWith('/estimates'))
			return route.fulfill({
				json: {
					estimates: [
						{
							id,
							project_id: 'test',
							address: '123 Test Avenue',
							total: 400,
							created_at: new Date().toISOString()
						}
					]
				}
			});
		if (path.endsWith(`/estimates/${id}`)) return route.fulfill({ json: { id, snapshot } });
		if (path.endsWith('/renderings') && route.request().method() === 'POST') {
			requests++;
			expect(route.request().postDataJSON().estimateId).toBe(id);
			return route.fulfill({ json: { id, status: 'completed' } });
		}
		if (path.endsWith('/renderings'))
			return route.fulfill({
				json: {
					renderings: requests
						? [
								{
									id,
									status: 'completed',
									style: 'Modern warm',
									prompt: 'Test concept',
									url: '/api/rehab/media?path=render.png'
								}
							]
						: []
				}
			});
		return route.abort();
	});
	await page.goto('/rehab');
	await page.getByRole('textbox', { name: 'Property address' }).fill('123 Test Avenue');
	await page.getByRole('spinbutton').first().fill('100');
	await page
		.locator('input[type=file]')
		.first()
		.setInputFiles({
			name: 'roof.png',
			mimeType: 'image/png',
			buffer: Buffer.from(
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
				'base64'
			)
		});
	await page.getByRole('button', { name: /Save estimate/ }).click();
	await expect(page.getByRole('status')).toContainText('Saved to your estimate history');
	await page.getByRole('button', { name: 'History', exact: true }).click();
	await page.getByRole('button', { name: /123 Test Avenue/ }).click();
	await expect(page.getByRole('spinbutton').first()).toHaveValue('100');
	await page.getByRole('button', { name: /Design studio/ }).click();
	await page.getByRole('button', { name: 'Select roof.png' }).click();
	await page.getByRole('button', { name: /Generate remodel concept/ }).click();
	await expect(page.getByRole('link', { name: /Download concept/ })).toBeVisible();
	expect(requests).toBe(1);
});

test('cloud endpoints require sign-in and protect against cross-origin mutations', async ({
	request
}) => {
	const result = await request.get('/api/rehab/estimates');
	expect(result.status()).toBe(401);
	const mutation = await request.post('/api/rehab/estimates', {
		headers: { Origin: 'https://untrusted.example' },
		data: {}
	});
	expect(mutation.status()).toBe(403);
});
