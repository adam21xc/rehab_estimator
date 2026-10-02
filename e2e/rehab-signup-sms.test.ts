import { expect, test } from '@playwright/test';
test('create account is visible before credentials and opens a separate signup form', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/rehab');
	const create = page.getByRole('button', { name: 'Create account', exact: true });
	await expect(create).toBeEnabled();
	await create.click();
	await expect(page.getByRole('heading', { name: 'Create your rehab account.' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Create my account', exact: true })).toBeEnabled();
	await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
		'autocomplete',
		'new-password'
	);
	await expect(page.getByText(/not\s+your Gmail password/)).toBeVisible();
	await page.getByRole('button', { name: 'Already have an account?' }).click();
	await expect(page.getByRole('button', { name: 'Sign in to workspace' })).toBeVisible();
});
test('SMS workspace displays configuration status and keeps sending disabled', async ({ page }) => {
	await page.route('**/api/rehab/session', (route) =>
		route.fulfill({ json: { user: { email: 'test@example.com' }, renderingEnabled: true } })
	);
	await page.route('**/api/rehab/sms?**', (route) =>
		route.fulfill({
			json: {
				messages: [],
				configured: false,
				missing: ['TWILIO_ACCOUNT_SID'],
				sender: '',
				suppressed: false
			}
		})
	);
	await page.goto('/rehab');
	await page.getByRole('button', { name: 'SMS outreach', exact: true }).click();
	await expect(page.getByText(/Twilio setup required: TWILIO_ACCOUNT_SID/)).toBeVisible();
	await expect(page.getByRole('button', { name: /Send text/ })).toBeDisabled();
});
