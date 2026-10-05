import { expect, test } from '@playwright/test';

test('sidebar deep links preserve the draft and browser history restores views', async ({
	page
}) => {
	await page.route('**/api/rehab/session', (route) => route.fulfill({ json: { user: null } }));
	await page.goto('/rehab');
	await page.getByLabel('Property address').fill('Navigation test property');
	await page.getByRole('spinbutton').first().fill('100');
	const nav = page.getByRole('navigation', { name: 'Workspace navigation', exact: true });
	await nav.getByRole('link', { name: 'SMS outreach', exact: true }).click();
	await expect(page).toHaveURL(/view=sms/);
	await expect(page.getByRole('heading', { name: 'SMS outreach' })).toBeVisible();
	await expect(nav.getByRole('link', { name: 'SMS outreach' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await page.goBack();
	await expect(page.getByLabel('Property address')).toHaveValue('Navigation test property');
	await expect(page.getByTestId('running-total')).toHaveText('$400');
	await nav.getByRole('link', { name: 'MyCase', exact: true }).click();
	await expect(page).toHaveURL(/source=mycase/);
	await expect(page.getByRole('heading', { name: 'MyCase records', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Collapse sidebar' }).click();
	await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
	await nav.getByRole('link', { name: 'Rehab calculator' }).click();
	await expect(page.getByLabel('Property address')).toHaveValue('Navigation test property');
});

test('mobile navigation closes on selection and Escape returns focus', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 740 });
	await page.goto('/rehab');
	const menu = page.getByRole('button', { name: 'Open navigation' });
	await menu.click();
	const drawer = page.getByRole('dialog', { name: 'Workspace menu' });
	await expect(drawer).toBeVisible();
	await drawer.getByRole('link', { name: 'Email outreach' }).click();
	await expect(drawer).not.toBeVisible();
	await expect(page.getByRole('heading', { name: 'Email outreach' })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await menu.click();
	await page.keyboard.press('Escape');
	await expect(drawer).not.toBeVisible();
	await expect(menu).toBeFocused();
});
