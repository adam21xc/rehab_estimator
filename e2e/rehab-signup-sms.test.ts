import { expect, test } from '@playwright/test';

test('email code replaces passwords and opens a verified session', async ({ page }) => {
	let signedIn = false;
	await page.route('**/api/rehab/session', (route) => {
		if (route.request().method() === 'GET')
			return route.fulfill({
				json: { user: signedIn ? { email: 'test@example.com' } : null, renderingEnabled: false }
			});
		const body = route.request().postDataJSON();
		expect(body.password).toBeUndefined();
		if (body.mode === 'send-code')
			return route.fulfill({
				json: { signedIn: false, message: 'Check your inbox for your sign-in code.' }
			});
		expect(body.code).toBe('123456');
		signedIn = true;
		return route.fulfill({ json: { signedIn: true } });
	});
	await page.goto('/rehab');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.locator('input[type=password]')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Create account', exact: true })).toHaveCount(0);
	await page.getByLabel('Email', { exact: true }).fill('test@example.com');
	await page.getByRole('button', { name: 'Send sign-in code' }).click();
	await page.getByLabel('Sign-in code', { exact: true }).fill('123456');
	await page.getByRole('button', { name: 'Open workspace' }).click();
	await expect(page.getByText('Connected · test@example.com')).toBeVisible();
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
