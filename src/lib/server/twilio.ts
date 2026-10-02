import twilio from 'twilio';
import { env } from '$env/dynamic/private';
import { error, type RequestEvent } from '@sveltejs/kit';
export function smsConfig() {
	const missing = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'SMS_PUBLIC_BASE_URL'].filter(
		(k) => !env[k]
	);
	if (!env.TWILIO_MESSAGING_SERVICE_SID && !env.TWILIO_FROM_NUMBER)
		missing.push('TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER');
	let base = '';
	try {
		const url = new URL(env.SMS_PUBLIC_BASE_URL || '');
		if (url.protocol === 'https:' && !url.search && !url.hash && url.pathname === '/')
			base = url.origin;
		else missing.push('SMS_PUBLIC_BASE_URL must be an HTTPS origin');
	} catch {
		if (env.SMS_PUBLIC_BASE_URL) missing.push('valid SMS_PUBLIC_BASE_URL');
	}
	return {
		ready: missing.length === 0,
		missing,
		base,
		sender: env.TWILIO_FROM_NUMBER || 'Messaging Service'
	};
}
export async function verifyTwilio(event: RequestEvent) {
	const config = smsConfig();
	if (!config.ready) error(503, 'Twilio is not configured.');
	if (!event.request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))
		error(415, 'Expected form data.');
	const text = await event.request.text();
	if (text.length > 65536) error(413, 'Webhook too large.');
	const params = Object.fromEntries(new URLSearchParams(text));
	const url = `${config.base}${event.url.pathname}${event.url.search}`;
	if (
		!twilio.validateRequest(
			env.TWILIO_AUTH_TOKEN || '',
			event.request.headers.get('x-twilio-signature') || '',
			url,
			params
		) ||
		params.AccountSid !== env.TWILIO_ACCOUNT_SID
	)
		error(403, 'Invalid Twilio signature.');
	return params;
}
export function nextSmsStatus(current: string, next: string) {
	const rank: Record<string, number> = {
		submitting: 0,
		unknown: 0,
		accepted: 1,
		scheduled: 1,
		queued: 2,
		sending: 3,
		sent: 4,
		delivered: 5,
		read: 6,
		failed: 5,
		undelivered: 5,
		canceled: 5
	};
	if (!(next in rank)) return current;
	if (['delivered', 'read', 'failed', 'undelivered', 'canceled'].includes(current)) return current;
	return (rank[next] ?? 0) >= (rank[current] ?? 0) ? next : current;
}
export function isStop(body: string, optOutType?: string) {
	return (
		optOutType === 'STOP' ||
		['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT'].includes(
			body.trim().toUpperCase()
		)
	);
}
export async function sendSms(to: string, body: string, requestId: string) {
	const config = smsConfig();
	if (!config.ready) throw new Error('configuration');
	const form = new URLSearchParams({
		To: to,
		Body: body,
		StatusCallback: `${config.base}/api/twilio/webhook?requestId=${requestId}`
	});
	if (env.TWILIO_MESSAGING_SERVICE_SID)
		form.set('MessagingServiceSid', env.TWILIO_MESSAGING_SERVICE_SID);
	else form.set('From', env.TWILIO_FROM_NUMBER || '');
	// No automatic retry: a timeout can occur after Twilio accepts the message.
	const response = await fetch(
		`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
		{
			method: 'POST',
			headers: {
				Authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
				'content-type': 'application/x-www-form-urlencoded'
			},
			body: form,
			signal: AbortSignal.timeout(20000)
		}
	);
	const data = await response.json();
	if (!response.ok)
		return {
			accepted: false as const,
			code: String(data.code || response.status),
			uncertain: response.status >= 500
		};
	return {
		accepted: true as const,
		sid: String(data.sid),
		status: String(data.status || 'accepted'),
		from: String(data.from || config.sender)
	};
}
