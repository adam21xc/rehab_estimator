import { expect, test } from '@playwright/test';

const flagged = {
	id: 'prop_12',
	address: '12 Main St',
	version: 'a'.repeat(64),
	status: 'flagged',
	note: 'NOT USABLE: No usable front photo after an extensive search.',
	hold: null,
	reviewedAt: null,
	reasons: ['NOT USABLE: No usable front photo after an extensive search.'],
	hasImages: true,
	kind: 'not_usable',
	beforeUrl: null,
	afterUrl: null,
	imageError: false
};
const held = {
	id: 'prop_4',
	address: '99 Held Ave',
	version: null,
	status: 'held',
	note: '',
	hold: 'Source unavailable or invalid JPEG',
	reviewedAt: null,
	reasons: ['Source unavailable or invalid JPEG'],
	hasImages: false,
	kind: 'held',
	beforeUrl: null,
	afterUrl: null,
	imageError: false
};
const counts = { all: 1, pending: 0, approved: 0, flagged: 1, archived: 0, manual: 2 };

test('needs-your-review list links to the rendering and hides generation-only waits', async ({
	page
}) => {
	await page.route('**/api/rehab/renovation/review**', (route) => {
		const url = new URL(route.request().url());
		const status = url.searchParams.get('status');
		if (status === 'manual') {
			return route.fulfill({
				json: { items: [flagged, held], counts, page: 1, pages: 1, total: 2 }
			});
		}
		return route.fulfill({
			json: {
				items: [
					{
						...flagged,
						beforeUrl: '/api/rehab/media?path=before',
						afterUrl: '/api/rehab/media?path=after'
					}
				],
				counts,
				page: 1,
				pages: 1,
				total: 1
			}
		});
	});
	await page.route('**/api/rehab/media**', (route) =>
		route.fulfill({
			contentType: 'image/png',
			body: Buffer.from(
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
				'base64'
			)
		})
	);
	await page.goto('/renovation-review?status=manual');
	const nav = page.getByRole('navigation', { name: 'Workspace navigation', exact: true });
	await expect(nav.getByRole('link', { name: 'Needs your review' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await expect(page.getByRole('heading', { name: 'Needs your review' })).toBeVisible();
	await expect(page.getByRole('article', { name: '12 Main St' })).toContainText('NOT USABLE');
	await expect(page.getByRole('article', { name: '99 Held Ave' })).toContainText(
		'Source unavailable or invalid JPEG'
	);
	await expect(page.getByText('3 Queue St')).toHaveCount(0);
	await page.getByRole('link', { name: 'Open rendering' }).click();
	await expect(page).toHaveURL(/status=flagged/);
	await expect(
		page.getByRole('img', { name: /Before · current property: 12 Main St/ })
	).toBeVisible();
	await page.getByRole('link', { name: 'Back to needs your review' }).click();
	await expect(page.getByRole('heading', { name: 'Needs your review' })).toBeVisible();
	await page.screenshot({
		path: '/opt/cursor/artifacts/needs_review_list.png',
		fullPage: true
	});
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.getByRole('article', { name: '99 Held Ave' })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
});
