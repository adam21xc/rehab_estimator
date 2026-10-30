import { expect, test } from '@playwright/test';

test('bot team office is linked from the workspace and shows the floor', async ({ page }) => {
	await page.goto('/office');
	await expect(page.getByRole('heading', { name: 'Bot team office', level: 1 })).toBeVisible();
	const nav = page.getByRole('navigation', { name: 'Workspace navigation', exact: true });
	await expect(nav.getByRole('link', { name: 'Bot team office' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await expect(page.locator('.floor-wide').getByText('Not hired yet').first()).toBeVisible();
	await expect(page.locator('.floor-wide').getByText('Jarvis').first()).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Waiting on Adam' })).toBeVisible();
});

test('bot office uses the phone layout without widening the page', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/office');
	await expect(page.locator('.floor-narrow').getByText('Dispo').first()).toBeVisible();
	await expect(page.locator('.floor-wide')).toBeHidden();
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
	).toBe(true);
});
