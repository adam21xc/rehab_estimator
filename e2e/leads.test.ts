import { test, expect } from '@playwright/test';
const lead = {
	case_number: 'VIO26-TEST',
	address: '123 Example Street',
	filed_date: '2026-09-29',
	case_type: 'Trash',
	record_status: 'Open',
	owners: [{ display_name: 'Example Owner', raw_lines: ['Example Owner'], phones: [], emails: [] }],
	occupants: [{ display_name: 'OCCUPANT', raw_lines: ['OCCUPANT'], phones: [], emails: [] }],
	violators: [],
	detail_checked_at: '2026-09-30T12:00:00Z',
	detail_failures: 0,
	violation_details: [
		{ title: 'NOTICE', entries: [{ label: 'Comments', value: 'Example violation description' }] }
	]
};
test('private lead endpoints reject unauthenticated requests', async ({ request }) => {
	for (const path of ['/api/rehab/leads', '/api/rehab/leads/VIO26-TEST'])
		expect((await request.get(path)).status()).toBe(401);
});
test('lead inbox searches, paginates, and separates parties on mobile', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.route('**/api/rehab/session', (r) =>
		r.fulfill({ json: { user: { email: 'test@example.com' } } })
	);
	await page.route('**/api/rehab/leads?**', (r) =>
		r.fulfill({
			json: {
				leads: [lead],
				count: 26,
				page: Number(new URL(r.request().url()).searchParams.get('page')),
				stats: { total: 26, ready: 1, retry: 0 },
				lastRun: null
			}
		})
	);
	await page.route('**/api/rehab/leads/VIO26-TEST', (r) => r.fulfill({ json: { lead } }));
	await page.goto('/leads');
	await expect(page.getByRole('button', { name: lead.address })).toBeVisible();
	await expect(page.getByText('1–25 of 26')).toBeVisible();
	await page.getByRole('button', { name: 'Next →' }).click();
	await expect(page.getByText('26–26 of 26')).toBeVisible();
	await page.getByLabel('Search leads').fill('Example');
	const requested = page.waitForRequest(
		(r) =>
			r.url().includes('/api/rehab/leads?') && new URL(r.url()).searchParams.get('q') === 'Example'
	);
	await page.getByRole('button', { name: 'Apply', exact: true }).click();
	expect(new URL((await requested).url()).searchParams.get('page')).toBe('1');
	await page.getByRole('button', { name: lead.address }).click();
	await expect(page.getByRole('heading', { name: 'Owners', exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Occupants', exact: true })).toBeVisible();
	await expect(page.getByText('Example violation description')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).not.toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.screenshot({ path: '/tmp/crm-mobile.png', fullPage: true });
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.screenshot({ path: '/tmp/crm-desktop.png', fullPage: true });
});
test('failed query is visible and can be retried', async ({ page }) => {
	await page.route('**/api/rehab/session', (r) =>
		r.fulfill({ json: { user: { email: 'test@example.com' } } })
	);
	let failure = true;
	await page.route('**/api/rehab/leads?**', (r) =>
		failure
			? r.fulfill({ status: 503, json: { message: 'Lead data is unavailable.' } })
			: r.fulfill({
					json: {
						leads: [],
						count: 0,
						page: 1,
						stats: { total: 0, ready: 0, retry: 0 },
						lastRun: null
					}
				})
	);
	await page.goto('/leads');
	await expect(page.getByRole('alert')).toContainText('Lead data is unavailable');
	failure = false;
	await page.getByRole('button', { name: 'Retry', exact: true }).click();
	await expect(page.getByRole('alert')).not.toBeVisible();
	await expect(page.getByText('No cases match this view.')).toBeVisible();
});
