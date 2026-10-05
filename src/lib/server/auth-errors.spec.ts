import { describe, it, expect } from 'vitest';
import { authFailure } from './auth-errors';
describe('actionable authentication failures', () => {
	it('distinguishes delivery configuration from wrong credentials', () => {
		expect(authFailure({ code: 'email_address_not_authorized' })).toMatchObject({
			status: 503,
			message: expect.stringContaining('email delivery')
		});
		expect(authFailure({ code: 'invalid_credentials' })).toMatchObject({
			status: 400,
			message: expect.stringContaining('invalid or expired')
		});
	});
	it('explains confirmation and rate limits', () => {
		expect(authFailure({ code: 'email_not_confirmed' }).message).toContain('Confirm your email');
		expect(authFailure({ status: 429 }).status).toBe(429);
	});
	it('does not expose unrecognized provider internals', () => {
		expect(authFailure({ code: 'private_database_error' }).message).not.toContain(
			'private_database_error'
		);
		expect(authFailure({ name: 'AuthRetryableFetchError' }).status).toBe(503);
	});
});
