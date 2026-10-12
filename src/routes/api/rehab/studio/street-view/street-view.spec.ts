import { it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({
	auth: vi.fn(),
	origin: vi.fn(),
	body: vi.fn(),
	lookup: vi.fn(),
	client: vi.fn()
}));
vi.mock('$lib/server/rehab-auth', () => ({
	requireUser: mocks.auth,
	sameOrigin: mocks.origin,
	readJson: mocks.body,
	authClient: mocks.client
}));
vi.mock('$lib/server/studio-location', () => ({ findStudioLocation: mocks.lookup }));
vi.mock('$env/dynamic/private', () => ({ env: { DEALMACHINE_API_KEY: 'secret' } }));
import { POST } from './+server';
beforeEach(() => vi.resetAllMocks());
const event = {} as Parameters<typeof POST>[0];
it('requires authentication and same-origin before any lookup', async () => {
	mocks.origin.mockImplementation(() => {
		throw { status: 403 };
	});
	await expect(POST(event)).rejects.toMatchObject({ status: 403 });
	expect(mocks.lookup).not.toHaveBeenCalled();
	mocks.origin.mockReset();
	mocks.auth.mockRejectedValue({ status: 401 });
	await expect(POST(event)).rejects.toMatchObject({ status: 401 });
	expect(mocks.lookup).not.toHaveBeenCalled();
});
it('rejects oversized address input before looking it up', async () => {
	mocks.body.mockResolvedValue({ address: 'a'.repeat(257) });
	await expect(POST(event)).rejects.toMatchObject({ status: 400 });
	expect(mocks.lookup).not.toHaveBeenCalled();
});
it('uses selected Mapbox coordinates without a second paid property lookup', async () => {
	mocks.body.mockResolvedValue({
		address: '123 Main St, Indianapolis IN 46201',
		coordinates: [-86, 39]
	});
	const request = vi
		.spyOn(globalThis, 'fetch')
		.mockResolvedValue(
			new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })
		);
	try {
		const body = await (await POST(event)).json();
		expect(mocks.lookup).not.toHaveBeenCalled();
		expect(request).toHaveBeenCalledWith(
			'https://img.dealmachine.com/sv/39,-86.jpg',
			expect.any(Object)
		);
		expect(body.address).toContain('123 Main');
	} finally {
		request.mockRestore();
	}
});
it('rejects out-of-range selected coordinates', async () => {
	mocks.body.mockResolvedValue({
		address: '123 Main St, Indianapolis IN 46201',
		coordinates: [-86, 999]
	});
	await expect(POST(event)).rejects.toMatchObject({ status: 400 });
	expect(mocks.lookup).not.toHaveBeenCalled();
});
