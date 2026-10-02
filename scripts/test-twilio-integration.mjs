// Uses live Supabase with an isolated temporary account. Twilio calls are intercepted.
import { createServer, loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const env = loadEnv('development', process.cwd(), '');
const admin = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false }
});
const phone = '+1999' + String(Date.now()).slice(-7);
const email = `sms-test-${randomUUID()}@example.com`;
const password = randomUUID() + randomUUID();
let userId, vite;
const originalFetch = globalThis.fetch;
let calls = 0;
try {
	const { data, error } = await admin.auth.admin.createUser({
		email,
		password,
		email_confirm: true
	});
	if (error) throw error;
	userId = data.user.id;
	const login = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
		auth: { persistSession: false }
	});
	const { data: session, error: authError } = await login.auth.signInWithPassword({
		email,
		password
	});
	if (authError) throw authError;
	Object.assign(process.env, {
		REHAB_ALLOWED_EMAILS: email,
		TWILIO_ACCOUNT_SID: 'ACtest',
		TWILIO_AUTH_TOKEN: 'test-token',
		TWILIO_FROM_NUMBER: '+19995550100',
		SMS_PUBLIC_BASE_URL: 'https://sms.example.com'
	});
	vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
	const sid = 'SM' + randomUUID().replaceAll('-', '');
	globalThis.fetch = async (url, options) => {
		if (String(url).startsWith('https://api.twilio.com/')) {
			calls++;
			assert.equal(new URLSearchParams(options.body).get('To'), phone);
			return Response.json({ sid, status: 'queued', from: '+19995550100' });
		}
		return originalFetch(url, options);
	};
	const api = await vite.ssrLoadModule('/src/routes/api/rehab/sms/+server.ts');
	const webhook = await vite.ssrLoadModule('/src/routes/api/twilio/webhook/+server.ts');
	const event = (body) => ({
		url: new URL('http://localhost/api/rehab/sms'),
		request: new Request('http://localhost/api/rehab/sms', {
			method: 'POST',
			headers: { origin: 'http://localhost', 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		cookies: {
			get: (name) => (name === 'rehab_access' ? session.session.access_token : undefined),
			set: () => {}
		},
		setHeaders: () => {}
	});
	const request = {
		requestId: randomUUID(),
		to: phone,
		body: 'ISOLATED TEST — no real SMS',
		consentConfirmed: true
	};
	assert.equal((await (await api.POST(event(request))).json()).status, 'queued');
	await api.POST(event(request));
	assert.equal(calls, 1);
	async function callback(params, query = '') {
		const url = 'https://sms.example.com/api/twilio/webhook' + query;
		const signature = twilio.getExpectedTwilioSignature('test-token', url, params);
		return webhook.POST({
			url: new URL(url),
			request: new Request(url, {
				method: 'POST',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
					'x-twilio-signature': signature
				},
				body: new URLSearchParams(params)
			})
		});
	}
	await callback(
		{ AccountSid: 'ACtest', MessageSid: sid, MessageStatus: 'delivered' },
		`?requestId=${request.requestId}`
	);
	await callback(
		{ AccountSid: 'ACtest', MessageSid: sid, MessageStatus: 'sent' },
		`?requestId=${request.requestId}`
	);
	assert.equal(
		(await admin.from('sms_messages').select('status').eq('id', request.requestId).single()).data
			.status,
		'delivered'
	);
	const inbound = {
		AccountSid: 'ACtest',
		MessageSid: 'SM' + randomUUID().replaceAll('-', ''),
		From: phone,
		To: '+19995550100',
		Body: 'STOP'
	};
	await callback(inbound);
	await callback(inbound);
	assert.equal(
		(await admin.from('sms_messages').select('id').eq('provider_sid', inbound.MessageSid)).data
			.length,
		1
	);
	await assert.rejects(
		() => api.POST(event({ ...request, requestId: randomUUID() })),
		(e) => e.status === 409
	);
	assert.equal(calls, 1);
	const scoped = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
		global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
		auth: { persistSession: false }
	});
	assert.ok(
		(await scoped.from('sms_messages').select('id')).error,
		'Clients cannot bypass server authorization'
	);
	console.log(
		'PASS: SMS submission, request deduplication, signed delivery callbacks, status ordering, inbound deduplication, STOP suppression and private tables. No real texts sent.'
	);
} finally {
	globalThis.fetch = originalFetch;
	if (vite) await vite.close();
	for (const table of ['sms_messages', 'sms_suppressions']) {
		const { error } = await admin.from(table).delete().eq('phone', phone);
		if (error) {
			console.error('Cleanup failed:', error);
			process.exitCode = 1;
		}
	}
	if (userId) {
		const { error } = await admin.auth.admin.deleteUser(userId);
		if (error) {
			console.error('Cleanup failed:', error);
			process.exitCode = 1;
		}
	}
	if (!process.exitCode) console.log('Temporary SMS data and test user cleaned up.');
}
