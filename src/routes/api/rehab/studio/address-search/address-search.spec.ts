import { it, expect, vi, beforeEach, afterEach } from 'vitest';
const auth = vi.hoisted(() => vi.fn());
vi.mock('$lib/server/rehab-auth', () => ({ requireUser: auth }));
vi.mock('$env/dynamic/private', () => ({ env: { MAPBOX_PUBLIC_TOKEN: 'private-test-token' } }));
import { GET } from './+server';
const event = (q: string) =>
	({
		url: new URL('http://localhost/api/rehab/studio/address-search?q=' + encodeURIComponent(q))
	}) as Parameters<typeof GET>[0];
beforeEach(() => {
	vi.resetAllMocks();
	vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());
it('requires authentication before paid suggestions', async () => {
	auth.mockRejectedValue({ status: 401 });
	await expect(GET(event('123 Main'))).rejects.toMatchObject({ status: 401 });
	expect(fetch).not.toHaveBeenCalled();
});
it('ignores short input and rejects malformed queries without a request', async () => {
	expect(await (await GET(event('123'))).json()).toEqual({ suggestions: [] });
	await expect(GET(event('Main;Street'))).rejects.toMatchObject({ status: 400 });
	expect(fetch).not.toHaveBeenCalled();
});
it('requests storable US addresses and returns only usable location suggestions', async () => {
	vi.mocked(fetch).mockResolvedValue(
		new Response(
			JSON.stringify({
				features: [
					{
						properties: { mapbox_id: 'house', full_address: '123 Main St, Indianapolis, IN 46201' },
						geometry: { coordinates: [-86, 39] }
					},
					{ properties: { full_address: 'Bad' }, geometry: { coordinates: [999, 999] } }
				]
			})
		)
	);
	const value = await (await GET(event('123 Main'))).json();
	expect(value.suggestions).toHaveLength(1);
	expect(JSON.stringify(value)).not.toContain('private-test-token');
	const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
	expect(url.searchParams.get('permanent')).toBe('true');
	expect(url.searchParams.get('types')).toBe('address');
	expect(url.searchParams.get('country')).toBe('us');
});
it('does not expose provider errors or tokens', async () => {
	vi.mocked(fetch).mockResolvedValue(new Response('private-test-token', { status: 403 }));
	await expect(GET(event('123 Main'))).rejects.toMatchObject({ status: 503 });
});
