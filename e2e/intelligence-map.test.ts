import { test, expect } from '@playwright/test';
import { loadEnv } from 'vite';
const token = loadEnv('development', process.cwd(), '').MAPBOX_PUBLIC_TOKEN || '';
const properties = [
	{
		key: 'DEMO-A',
		address: '100 Example Street, Indianapolis IN 46201',
		coordinates: [-86.16, 39.77],
		locationStatus: 'matched',
		records: [
			{
				id: 'CODE-1',
				source: 'accela',
				date: '2026-01-01',
				title: 'Unsafe building',
				addressRole: 'property'
			},
			{
				id: 'CASE-1',
				source: 'mycase',
				date: '2026-02-01',
				title: 'Mortgage foreclosure',
				addressRole: 'defendant'
			}
		]
	},
	{
		key: 'DEMO-B',
		address: '200 Example Avenue, Indianapolis IN 46202',
		coordinates: [-86.14, 39.78],
		locationStatus: 'matched',
		records: [
			{
				id: 'SALE-1',
				source: 'sales',
				date: '2026-03-01',
				title: 'Recorded transfer',
				addressRole: 'property',
				parcel: 'demo',
				price: 120000,
				buyer: 'Example buyer',
				seller: 'Example seller'
			}
		]
	}
];
async function setup(page: import('@playwright/test').Page, mapToken = '') {
	await page.route('**/api/rehab/session', (r) => r.fulfill({ json: { user: { id: 'test' } } }));
	await page.route('**/api/rehab/sales?*', (r) => r.fulfill({ json: { snapshot: null } }));
	await page.route('**/api/rehab/map', (r) =>
		r.fulfill({
			json: {
				token: mapToken,
				properties,
				counts: { accela: 1, mycase: 1, sales: 1 },
				missingAddresses: 0,
				cacheReady: true,
				salesCoverage: { from: '2026-01-01', to: '2026-03-01', capturedAt: '2026-03-02' }
			}
		})
	);
	await page.goto('/sales');
	await expect(page.getByRole('heading', { name: 'The signals, on the map.' })).toBeVisible();
}
test('map filters and address details work without WebGL or a token', async ({ page }) => {
	await setup(page);
	await page.getByText('Browse matching addresses (2)', { exact: true }).click();
	await page.getByRole('button', { name: /100 Example Street/ }).click();
	await expect(
		page.getByText('Defendant address; connection to the subject property is unverified.')
	).toBeVisible();
	await page.getByRole('checkbox', { name: /MyCase/ }).uncheck();
	await expect(
		page.getByText('Defendant address; connection to the subject property is unverified.')
	).not.toBeVisible();
	await page.getByRole('checkbox', { name: 'Multiple indicators' }).check();
	await expect(page.getByText('Browse matching addresses (0)', { exact: true })).toBeVisible();
	await page.getByRole('checkbox', { name: 'Multiple indicators' }).uncheck();
	await page.getByLabel('From', { exact: true }).fill('2026-02-15');
	await expect(page.getByText('Browse matching addresses (1)', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: /200 Example Avenue/ }).click();
	await expect(page.getByText('$120,000', { exact: true })).toBeVisible();
	await page.setViewportSize({ width: 390, height: 844 });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('configured Mapbox renders the basemap and fans out property indicators', async ({ page }) => {
	test.skip(!token, 'No local Mapbox token configured.');
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await setup(page, token);
	await expect(page.getByRole('button', { name: 'Fit visible results ↗' })).toBeEnabled({
		timeout: 30000
	});
	await page.getByText('Browse matching addresses (2)', { exact: true }).click();
	await page.getByRole('button', { name: /100 Example Street/ }).click();
	await expect(page.locator('.map-indicator')).toHaveCount(2);
	await page.locator('.map-indicator').nth(1).click();
	await expect(page.locator('article.active')).toContainText('Mortgage foreclosure');
	await page.getByRole('checkbox', { name: /MyCase/ }).uncheck();
	await expect(page.locator('.map-indicator')).toHaveCount(0);
	expect(errors).toEqual([]);
	await page.getByRole('checkbox', { name: /MyCase/ }).check();
	await page
		.locator('.intelligence-map')
		.screenshot({ path: 'output/intelligence-map-desktop.png' });
	await page.setViewportSize({ width: 390, height: 844 });
	await page
		.locator('.intelligence-map')
		.screenshot({ path: 'output/intelligence-map-mobile.png' });
});
