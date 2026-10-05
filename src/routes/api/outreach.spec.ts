import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const { env, fetchDue, send, sendGmail, bumpFollowup } = vi.hoisted(() => ({
	env: { SEND_DUE_SECRET: '' },
	fetchDue: vi.fn(),
	send: vi.fn(),
	sendGmail: vi.fn(),
	bumpFollowup: vi.fn()
}));
vi.mock('$env/dynamic/private', () => ({ env }));
vi.mock('$lib/due', () => ({ fetchDue }));
vi.mock('$lib/gmail', () => ({ sendGmail }));
vi.mock('$lib/supabase', () => ({ bumpFollowup }));
vi.mock('googleapis', () => ({
	google: {
		auth: {
			OAuth2: class {
				setCredentials() {}
			}
		},
		gmail: () => ({ users: { messages: { send } } })
	}
}));
import { POST as sendDue } from './send-due/+server';
import { POST as gmailTest } from './gmail-test/+server';

function event(path: string, authorization?: string, body: unknown = {}) {
	const url = new URL(`https://example.com/api/${path}`);
	return {
		url,
		request: new Request(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) },
			body: JSON.stringify(body)
		})
	} as RequestEvent;
}

describe('outreach authorization', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		env.SEND_DUE_SECRET = '';
		fetchDue.mockResolvedValue([]);
		send.mockResolvedValue({ data: { id: 'test-message' } });
	});

	it.each([
		['send-due', sendDue],
		['send-due?dry=1', sendDue],
		['gmail-test', gmailTest]
	] as const)('blocks %s before any provider or contact access', async (path, handler) => {
		for (const secret of ['', 'test-secret']) {
			env.SEND_DUE_SECRET = secret;
			for (const token of [undefined, 'Bearer ', 'Bearer wrong-value', 'Bearer test-secrex']) {
				expect((await handler(event(path, token))).status).toBe(401);
			}
		}
		expect(fetchDue).not.toHaveBeenCalled();
		expect(send).not.toHaveBeenCalled();
		expect(sendGmail).not.toHaveBeenCalled();
		expect(bumpFollowup).not.toHaveBeenCalled();
	});

	it('allows an authorized preview without sending', async () => {
		env.SEND_DUE_SECRET = 'test-secret';
		fetchDue.mockResolvedValue([
			{ email: 'test@example.com', contact_email_prop_nk: 'test', followup_count: 0 }
		]);
		const response = await sendDue(event('send-due?dry=1', 'Bearer test-secret'));
		expect(response.status).toBe(200);
		expect((await response.json()).previews).toHaveLength(1);
		expect(sendGmail).not.toHaveBeenCalled();
		expect(bumpFollowup).not.toHaveBeenCalled();
	});

	it('rejects injected mail headers without sending', async () => {
		env.SEND_DUE_SECRET = 'test-secret';
		const response = await gmailTest(
			event('gmail-test', 'Bearer test-secret', {
				to: 'test@example.com',
				subject: 'Hello\r\nBcc: other@example.com'
			})
		);
		expect(response.status).toBe(400);
		expect(send).not.toHaveBeenCalled();
	});

	it('allows an authorized test and escapes message HTML', async () => {
		env.SEND_DUE_SECRET = 'test-secret';
		const response = await gmailTest(
			event('gmail-test', 'Bearer test-secret', {
				to: 'test@example.com',
				message: '<b>text & more</b>'
			})
		);
		expect(response.status).toBe(200);
		expect(send).toHaveBeenCalledTimes(1);
		const mime = Buffer.from(send.mock.calls[0][0].requestBody.raw, 'base64url').toString();
		expect(mime).toContain('<p>&lt;b&gt;text &amp; more&lt;/b&gt;</p>');
	});
});
