import { describe, it, expect, vi } from 'vitest';
import twilio from 'twilio';
vi.mock('$env/dynamic/private', () => ({
	env: {
		TWILIO_ACCOUNT_SID: 'ACtest',
		TWILIO_AUTH_TOKEN: 'test-token',
		TWILIO_FROM_NUMBER: '+13175550123',
		SMS_PUBLIC_BASE_URL: 'https://sms.example.com'
	}
}));
import { nextSmsStatus, isStop, verifyTwilio } from './twilio';
import type { RequestEvent } from '@sveltejs/kit';
describe('Twilio callbacks', () => {
	it('does not regress delivered messages or accept unknown statuses', () => {
		expect(nextSmsStatus('delivered', 'queued')).toBe('delivered');
		expect(nextSmsStatus('sent', 'delivered')).toBe('delivered');
		expect(nextSmsStatus('queued', 'garbage')).toBe('queued');
		expect(nextSmsStatus('unknown', 'sent')).toBe('sent');
	});
	it('detects opt-out messages and never treats START as STOP', () => {
		expect(isStop(' stop ')).toBe(true);
		expect(isStop('please unsubscribe', 'STOP')).toBe(true);
		expect(isStop('START')).toBe(false);
	});
	it('validates the exact public callback URL and every form parameter', async () => {
		const params = {
			AccountSid: 'ACtest',
			MessageSid: 'SM' + '1'.repeat(32),
			Body: 'hi',
			NewTwilioField: 'extra'
		};
		const url = 'https://sms.example.com/api/twilio/webhook?requestId=test';
		const signature = twilio.getExpectedTwilioSignature('test-token', url, params);
		const event = {
			url: new URL('http://localhost/api/twilio/webhook?requestId=test'),
			request: new Request(url, {
				method: 'POST',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
					'x-twilio-signature': signature
				},
				body: new URLSearchParams(params)
			})
		} as RequestEvent;
		expect(await verifyTwilio(event)).toEqual(params);
	});
	it('rejects forged callbacks', async () => {
		const event = {
			url: new URL('http://localhost/api/twilio/webhook'),
			request: new Request('http://localhost', {
				method: 'POST',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
					'x-twilio-signature': 'forged'
				},
				body: 'AccountSid=ACtest'
			})
		} as RequestEvent;
		await expect(verifyTwilio(event)).rejects.toMatchObject({ status: 403 });
	});
});
