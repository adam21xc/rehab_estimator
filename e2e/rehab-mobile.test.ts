import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('phone walkthrough saves address and quantities across categories and reloads', async ({
	page
}) => {
	await page.goto('/rehab');
	await page.getByRole('textbox', { name: 'Property address' }).fill('123 Walkthrough Street');
	await page.getByRole('spinbutton').first().fill('1000');
	await expect(page.getByTestId('running-total')).toHaveText('$4,000');
	await expect(page.getByRole('button', { name: '← Previous category' })).toBeDisabled();
	await page.getByRole('button', { name: 'Next category →' }).click();
	await expect(page.getByRole('combobox', { name: 'Category', exact: true })).toHaveValue('1');
	await page.getByRole('spinbutton').first().fill('100');
	await expect(page.getByTestId('running-total')).toHaveText('$4,050');
	await page.getByRole('button', { name: 'Summary', exact: true }).click();
	const summary = page.getByRole('dialog', { name: 'Summary' });
	await expect(summary).toBeVisible();
	await expect(summary).toContainText('123 Walkthrough Street');
	await expect(summary).toContainText('Total: $4,050');
	await page.keyboard.press('Escape');
	await expect(summary).not.toBeVisible();
	await expect(page.getByRole('button', { name: 'Summary', exact: true })).toBeFocused();
	await page.reload();
	await expect(page.getByRole('textbox', { name: 'Property address' })).toHaveValue(
		'123 Walkthrough Street'
	);
	await expect(page.getByRole('spinbutton').first()).toHaveValue('1000');
	await expect(page.getByTestId('running-total')).toHaveText('$4,050');
	await page
		.getByRole('combobox', { name: 'Category', exact: true })
		.selectOption({ label: 'Permits' });
	await expect(page.getByRole('button', { name: 'Next category →' })).toBeDisabled();
	await expect(page.getByRole('tabpanel', { name: 'Permits' })).toBeVisible();
});

test('narrow phone fits controls and large totals without horizontal page overflow', async ({
	page
}) => {
	await page.setViewportSize({ width: 320, height: 740 });
	await page.goto('/rehab');
	await page.getByRole('spinbutton').first().fill('1000000');
	await expect(page.getByTestId('running-total')).toHaveText('$4,000,000');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
	const increase = await page
		.getByRole('button', { name: 'Increase quantity' })
		.first()
		.boundingBox();
	expect(increase?.width).toBeGreaterThanOrEqual(44);
	expect(increase?.height).toBeGreaterThanOrEqual(44);
	await page.getByRole('button', { name: 'Summary', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
});
