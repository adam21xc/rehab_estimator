import { test, expect } from '@playwright/test';
import { analyzeSales, type RawSale } from '../src/lib/sales/analytics';
const make = (id: string, date: string, buyer: string, seller: string, price: string): RawSale => ({
	sdF_ID: id,
	parcelNumber: '49-test',
	parcelAddress: '100 Example Street',
	salesPrice: price,
	saleDate: date,
	conveyanceDate: date,
	dateReceived: date,
	transferDate: date,
	buyerName: buyer,
	buyerCompany: '',
	sellerName: seller,
	sellerCompany: '',
	propertyClassCode: '510',
	validTrending: 'Y'
});
const analysis = analyzeSales([
	make('a', '2026-01-01', 'Example Homes LLC', 'Original Owner', '100000'),
	make('b', '2026-01-11', 'Final Buyer', 'Example Homes LLC', '130000')
]);
const payload = {
	...analysis,
	snapshot: { loaded_rows: 2, expected_rows: 2, captured_at: '2026-09-30T20:00:00Z' },
	actorCount: analysis.actors.length,
	matchCount: analysis.matches.length
};
test('sales data requires an authorized session', async ({ request }) => {
	expect((await request.get('/api/rehab/sales')).status()).toBe(401);
});
test('rankings, matched spreads, source links and mobile layout', async ({ page }) => {
	await page.route('**/api/rehab/session', (r) =>
		r.fulfill({ json: { user: { email: 'test@example.com' } } })
	);
	await page.route('**/api/rehab/sales?**', (r) => r.fulfill({ json: payload }));
	await page.goto('/sales');
	await expect(page.getByRole('heading', { name: 'Who’s buying. Who’s selling.' })).toBeVisible();
	await page.getByRole('button', { name: 'Example Homes LLC', exact: true }).click();
	await expect(page.getByRole('tab', { name: 'Matched resales' })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(page.getByRole('cell', { name: '$30,000', exact: true })).toBeVisible();
	await expect(page.getByRole('cell', { name: '10 days', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Buy ↗' })).toHaveAttribute('href', /SDF_ID=a/);
	await page.getByRole('tab', { name: 'Recent transfers' }).click();
	await expect(page.getByRole('columnheader', { name: 'Seller', exact: true })).toBeVisible();
	await page.getByRole('tab', { name: 'Same-day activity' }).click();
	await expect(page.getByText('No same-day activity matches this view.')).toBeVisible();
	await page.getByRole('tab', { name: 'Recent transfers' }).click();
	await page.setViewportSize({ width: 390, height: 844 });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.screenshot({ path: '/tmp/sales-mobile.png', fullPage: true });
	await page.setViewportSize({ width: 1440, height: 1100 });
	await page.getByRole('tab', { name: 'Top buyers & sellers' }).click();
	await page.screenshot({ path: '/tmp/sales-desktop.png', fullPage: true });
});
test('does not replace API failures with zero sales', async ({ page }) => {
	await page.route('**/api/rehab/session', (r) =>
		r.fulfill({ json: { user: { email: 'test@example.com' } } })
	);
	await page.route('**/api/rehab/sales?**', (r) =>
		r.fulfill({ status: 503, json: { message: 'Sales data is temporarily unavailable.' } })
	);
	await page.goto('/sales');
	await expect(page.getByRole('alert').filter({ hasText: 'Sales data is temporarily unavailable.' })).toBeVisible();
});

test('inventory cutoff, date ordering and pagination controls', async ({ page }) => {
	await page.route('**/api/rehab/session', (r) =>
		r.fulfill({ json: { user: { email: 'test@example.com' } } })
	);
	await page.route('**/api/rehab/sales?**', (r) => {
		const params = new URL(r.request().url()).searchParams;
		const current = Number(params.get('page'));
		return r.fulfill({
			json: {
				...payload,
				inventoryAsOf: '2026-07-31',
				inventory: [
					{
						id: 'inventory',
						parcel: 'p2',
						address: current === 2 ? 'Second page property' : 'Inventory property',
						buyer: 'Example Homes LLC',
						bought: '2026-01-01',
						price: 100000,
						observedDays: 211
					}
				],
				counts: { inventory: 51, buyers: 3 },
				page: current || 1
			}
		});
	});
	await page.goto('/sales');
	await page.getByRole('tab', { name: 'Inventory candidates' }).click();
	await expect(page.getByText('No later transfer observed through 2026-07-31.')).toBeVisible();
	await expect(page.getByRole('cell', { name: '211 days' })).toBeVisible();
	await page.getByLabel('Transaction dates').selectOption('oldest');
	const request = page.waitForRequest(
		(r) => r.url().includes('dateOrder=oldest') && r.url().includes('view=inventory')
	);
	await page.getByRole('button', { name: 'Apply', exact: true }).click();
	await request;
	await page.getByRole('button', { name: 'Next →' }).click();
	await expect(page.getByText('Second page property')).toBeVisible();
	await expect(page.getByText('51–51 of 51 results')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Next →' })).toBeDisabled();
	await page.setViewportSize({ width: 390, height: 844 });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('property profile preserves the selected record and provides map and Zillow lookup', async ({
	page,
	request
}) => {
	expect((await request.get('/api/rehab/properties/49-test')).status()).toBe(401);
	await page.route('**/api/rehab/session', (r) =>
		r.fulfill({ json: { user: { email: 'test@example.com' } } })
	);
	await page.route('**/api/rehab/sales?**', (r) => r.fulfill({ json: payload }));
	await page.route('**/api/rehab/properties/49-test?**', (r) =>
		r.fulfill({
			json: {
				parcel: '49-test',
				address: '100 Example Street, Indianapolis, IN',
				selectedId: 'b',
				transactions: analysis.transactions,
				matches: analysis.matches,
				cutoff: '2026-07-31',
				capturedAt: '2026-09-30'
			}
		})
	);
	await page.route('https://www.google.com/maps?**', (r) =>
		r.fulfill({ body: '<html>Map test fixture</html>', contentType: 'text/html' })
	);
	await page.goto('/sales');
	await page.getByRole('tab', { name: 'Matched resales' }).click();
	await page.getByRole('link', { name: '100 Example Street ↗' }).click();
	await expect(page).toHaveURL(/sales\/property\/49-test\?record=b/);
	await expect(
		page.getByRole('heading', { name: '100 Example Street, Indianapolis, IN' })
	).toBeVisible();
	await expect(page.locator('iframe')).toHaveAttribute('src', /q=100%20Example%20Street/);
	await expect(
		page.getByRole('link', { name: 'Search this address on Zillow ↗' })
	).toHaveAttribute('href', /^https:\/\/www.zillow.com\/homes\/100%20Example/);
	await expect(page.getByRole('link', { name: 'View original disclosure ↗' })).toHaveAttribute(
		'href',
		/SDF_ID=b/
	);
	await page.setViewportSize({ width: 390, height: 844 });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.screenshot({ path: '/tmp/property-mobile.png', fullPage: true });
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.screenshot({ path: '/tmp/property-desktop.png', fullPage: true });
});

test('property errors and sign-in state do not show invented records', async ({ page }) => {
	await page.route('**/api/rehab/properties/missing?**', (r) =>
		r.fulfill({
			status: 404,
			json: { message: 'This parcel was not found in the current sales snapshot.' }
		})
	);
	await page.goto('/sales/property/missing');
	await expect(page.getByRole('alert')).toContainText('This parcel was not found');
	await page.route('**/api/rehab/properties/private?**', (r) =>
		r.fulfill({ status: 401, json: { message: 'Unauthorized' } })
	);
	await page.goto('/sales/property/private');
	await expect(page.getByRole('link', { name: 'Sign in →' })).toBeVisible();
	await expect(page.locator('iframe')).toHaveCount(0);
});
