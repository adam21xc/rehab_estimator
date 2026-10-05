import { it, expect, vi, beforeEach } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
const mocks = vi.hoisted(() => ({
	signInWithOtp: vi.fn(),
	verifyOtp: vi.fn(),
	setSession: vi.fn()
}));
vi.mock('$lib/server/rehab-auth', () => ({
	authClient: () => ({ auth: mocks }),
	allowedEmail: (email: string) => email === 'owner@example.com',
	sameOrigin: () => {},
	setSession: mocks.setSession,
	requireUser: vi.fn(),
	readJson: (event: RequestEvent) => event.request.json()
}));
import { POST } from './+server';
const request = (body: unknown) =>
	({
		request: new Request('https://example.com/api/rehab/session', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	}) as Parameters<typeof POST>[0];
beforeEach(() => vi.clearAllMocks());
it('rejects non-allowlisted emails and legacy password requests before provider calls', async () => {
	await expect(
		POST(request({ email: 'other@example.com', mode: 'send-code' }))
	).rejects.toMatchObject({ status: 403 });
	await expect(
		POST(request({ email: 'owner@example.com', mode: 'signin', password: 'anything' }))
	).rejects.toMatchObject({ status: 400 });
	expect(mocks.signInWithOtp).not.toHaveBeenCalled();
});
it('sending a code does not create a session or an account', async () => {
	mocks.signInWithOtp.mockResolvedValue({ data: { session: null }, error: null });
	const response = await POST(request({ email: ' OWNER@EXAMPLE.COM ', mode: 'send-code' }));
	expect(mocks.signInWithOtp).toHaveBeenCalledWith({
		email: 'owner@example.com',
		options: { shouldCreateUser: false }
	});
	expect((await response.json()).signedIn).toBe(false);
	expect(mocks.setSession).not.toHaveBeenCalled();
});
it('issues session cookies only after successful verification', async () => {
	mocks.verifyOtp.mockResolvedValueOnce({
		data: { session: null },
		error: { code: 'otp_expired' }
	});
	await expect(
		POST(request({ email: 'owner@example.com', mode: 'verify', code: '123456' }))
	).rejects.toMatchObject({ status: 400 });
	expect(mocks.setSession).not.toHaveBeenCalled();
	mocks.verifyOtp.mockResolvedValueOnce({
		data: { session: { access_token: 'test-only' } },
		error: null
	});
	const response = await POST(
		request({ email: 'owner@example.com', mode: 'verify', code: '654321' })
	);
	expect((await response.json()).signedIn).toBe(true);
	expect(mocks.setSession).toHaveBeenCalledOnce();
});
