import { vi, it, expect, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({
	auth: vi.fn(),
	origin: vi.fn(),
	load: vi.fn(),
	geocode: vi.fn()
}));
vi.mock('$lib/server/rehab-auth', () => ({ requireUser: mocks.auth, sameOrigin: mocks.origin }));
vi.mock('$lib/server/intelligence-data', () => ({ loadPropertyMap: mocks.load }));
vi.mock('$lib/server/map-geocoding', () => ({ geocodeNextBatch: mocks.geocode }));
vi.mock('$env/dynamic/private', () => ({
	env: { MAPBOX_PUBLIC_TOKEN: 'pk.browser', MAPBOX_GEOCODING_TOKEN: 'server-only' }
}));
import { GET, POST } from './+server';

const event = {} as Parameters<typeof GET>[0];
beforeEach(() => vi.resetAllMocks());
it('requires authentication before returning property records or token', async () => {
	mocks.auth.mockRejectedValue({ status: 401 });
	await expect(GET(event)).rejects.toMatchObject({ status: 401 });
	expect(mocks.load).not.toHaveBeenCalled();
});
it('does not reveal the server geocoding token', async () => {
	mocks.load.mockResolvedValue({ properties: [] });
	const body = await (await GET(event)).json();
	expect(body.token).toBe('pk.browser');
	expect(JSON.stringify(body)).not.toContain('server-only');
});
it('rejects cross-origin geocoding without making paid requests', async () => {
	mocks.origin.mockImplementation(() => {
		throw { status: 403 };
	});
	await expect(POST(event)).rejects.toMatchObject({ status: 403 });
	expect(mocks.geocode).not.toHaveBeenCalled();
});
it('requires authentication on same-origin geocoding', async () => {
	mocks.auth.mockRejectedValue({ status: 401 });
	await expect(POST(event)).rejects.toMatchObject({ status: 401 });
	expect(mocks.geocode).not.toHaveBeenCalled();
});
