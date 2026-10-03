import { test, expect } from '@playwright/test';
const record = {
	case_number: '49D01-2602-MF-TEST',
	style: 'Lender v Example',
	file_date: '02/06/2026',
	status: 'Pending',
	case_type_code: 'MF',
	case_type: 'Mortgage foreclosure',
	court: 'Example Court',
	county_code: '49',
	primary_defendant_name: 'Example Person',
	primary_defendant_address: '123 Mailing Street',
	primary_plaintiff_name: 'Lender',
	updated_at: '2026-02-19T00:21:00Z'
};
test('MyCase endpoints require a session', async ({ request }) => {
	for (const path of ['/api/rehab/mycase', '/api/rehab/mycase/test'])
		expect((await request.get(path)).status()).toBe(401);
});
test('MyCase source filters, paginates, and shows mailing addresses with provenance', async ({
	page
}) => {
	await page.route('**/api/rehab/session', (r) =>
		r.fulfill({ json: { user: { email: 'test@example.com' } } })
	);
	await page.route('**/api/rehab/leads?**', (r) =>
		r.fulfill({
			json: { leads: [], count: 0, page: 1, stats: { total: 0, ready: 0, retry: 0 }, lastRun: null }
		})
	);
	await page.route('**/api/rehab/mycase?**', (r) =>
		r.fulfill({
			json: {
				cases: [record],
				count: 26,
				total: 26,
				page: Number(new URL(r.request().url()).searchParams.get('page')),
				lastUpdated: record.updated_at,
				counties: ['49', '32']
			}
		})
	);
	await page.route('**/api/rehab/mycase/49D01-2602-MF-TEST', (r) =>
		r.fulfill({
			json: {
				case: {
					...record,
					case_about: 'Example case summary',
					timeline: {
						available: true,
						events: [
							{
								id: '1',
								date: '10/02/2026',
								time: null,
								title: 'Order Issued',
								details: [{ label: 'Details', value: 'Example order text' }],
								documents: []
							},
							{
								id: '2',
								date: '10/26/2026',
								time: '11:00 AM',
								title: 'Eviction Hearing',
								details: [],
								documents: []
							}
						]
					},
					parties: [
						{
							name: 'Example Person',
							role: 'Defendant',
							address: { formatted: '123 Mailing Street' }
						}
					]
				}
			}
		})
	);
	await page.goto('/leads');
	await page.getByRole('tab', { name: 'MyCase court leads' }).click();
	await expect(page.getByRole('heading', { name: 'MyCase leads 26' })).toBeVisible();
	await expect(
		page.getByText('Refresh reads the database; it does not run a new scrape.', { exact: false })
	).toBeVisible();
	await page.getByRole('button', { name: 'Next MyCase →' }).click();
	await expect(page.getByText('26–26 of 26 MyCase cases')).toBeVisible();
	await page.getByRole('combobox', { name: 'County', exact: true }).selectOption('49');
	await page.getByLabel('Search MyCase').fill('Example');
	const request = page.waitForRequest(
		(r) =>
			r.url().includes('/api/rehab/mycase?') &&
			r.url().includes('q=Example') &&
			r.url().includes('county=49')
	);
	await page.getByRole('button', { name: 'Apply MyCase filters' }).click();
	expect(new URL((await request).url()).searchParams.get('page')).toBe('1');
	await page.getByRole('button', { name: record.case_number, exact: true }).click();
	await expect(page.getByRole('dialog')).toContainText('No subject property');
	await expect(page.getByRole('dialog')).toContainText('Example case summary');
	await expect(page.getByRole('heading', { name: 'Chronological case summary' })).toBeVisible();
	await expect(page.getByRole('dialog')).toContainText('Example order text');
	await expect(page.getByRole('dialog')).toContainText('10/26/2026');
	await expect(page.getByRole('dialog')).toContainText('Defendant');
	await page.keyboard.press('Escape');
	await page.setViewportSize({ width: 390, height: 844 });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.screenshot({ path: '/tmp/mycase-mobile.png', fullPage: true });
});
