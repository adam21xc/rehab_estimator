import { expect, test } from '@playwright/test';

test('quantities, totals, summary and category navigation survive reload', async ({ page }) => {
	await page.goto('/rehab');
	const roof = page.getByRole('spinbutton').first();
	await roof.fill('100.5');
	await expect(page.getByTestId('running-total')).toHaveText('$402');
	await page.getByRole('tab', { name: 'Gutters', exact: true }).click();
	await page.getByRole('spinbutton').first().fill('10');
	await expect(page.getByTestId('running-total')).toHaveText('$407');
	await page.getByRole('button', { name: 'Summary', exact: true }).click();
	await expect(page.locator('aside')).toContainText('100.5 × $4 = $402');
	await expect(page.locator('aside')).toContainText('Total: $407');
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	await page.reload();
	await expect(roof).toHaveValue('100.5');
	await expect(page.getByTestId('running-total')).toHaveText('$407');
	await roof.fill('-1');
	await expect(roof).toHaveValue('0');
	await expect(page.getByTestId('running-total')).toHaveText('$5');
	await page.getByRole('tab', { name: 'Roof', exact: true }).focus();
	await page.keyboard.press('ArrowRight');
	await expect(page.getByRole('tab', { name: 'Gutters', exact: true })).toBeFocused();
	await expect(page.getByRole('spinbutton').first()).toHaveValue('10');
});

test('restores the old saved project format and keeps its prices', async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem(
			'rehab_project_v1',
			JSON.stringify({
				meta: {
					id: 'old-project',
					address: '123 Test Street',
					createdAt: '2025-09-01T00:00:00.000Z',
					updatedAt: '2025-09-01T00:00:00.000Z'
				},
				catalog: {
					categories: [
						{
							key: 'roof',
							label: 'Roof',
							items: [{ id: 'saved-roof', description: 'Saved roof price', unit: 'sf', cost: 8 }]
						}
					]
				},
				progress: [
					{
						categoryKey: 'roof',
						lines: [{ itemId: 'saved-roof', quantity: 25, note: 'Keep this note' }],
						photos: []
					}
				]
			})
		);
	});
	await page.goto('/rehab');
	await expect(page.getByTestId('running-total')).toHaveText('$200');
	await page.getByRole('spinbutton').fill('30');
	await expect(page.getByTestId('running-total')).toHaveText('$240');
	await expect
		.poll(() =>
			page.evaluate(
				() => JSON.parse(localStorage.getItem('rehab_project_v1')!).progress[0].lines[0].note
			)
		)
		.toBe('Keep this note');
});

test('corrupt stored data is preserved while a usable session is shown', async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('rehab_project_v1', '{bad json'));
	await page.goto('/rehab');
	await expect(page.getByRole('status')).toContainText('could not be loaded');
	await page.getByRole('spinbutton').first().fill('5');
	await expect(page.getByTestId('running-total')).toHaveText('$20');
	expect(await page.evaluate(() => localStorage.getItem('rehab_project_v1'))).toBe('{bad json');
});

test('storage failures show a warning without breaking calculation', async ({ page }) => {
	await page.addInitScript(() => {
		Storage.prototype.setItem = () => {
			throw new DOMException('Full', 'QuotaExceededError');
		};
	});
	await page.goto('/rehab');
	await page.getByRole('spinbutton').first().fill('2');
	await expect(page.getByTestId('running-total')).toHaveText('$8');
	await expect(page.getByRole('status')).toContainText('could not be saved');
});

test('photo callback saves to the right item and survives navigation and reload', async ({
	page
}) => {
	await page.goto('/rehab');
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
	await expect(page.getByRole('img', { name: /Attachment for/ })).toBeVisible();
	await page.getByRole('tab', { name: 'Gutters', exact: true }).click();
	await expect(page.getByRole('img', { name: /Attachment for/ })).toHaveCount(0);
	await page.reload();
	await expect(page.getByRole('img', { name: /Attachment for/ })).toBeVisible();
});
