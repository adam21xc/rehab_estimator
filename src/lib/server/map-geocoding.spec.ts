import { vi, describe, it, expect, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ db: vi.fn(), load: vi.fn() }));
vi.mock('$env/dynamic/private', () => ({ env: { MAPBOX_PUBLIC_TOKEN: 'pk.test' } }));
vi.mock('./rehab-auth', () => ({ authClient: mocks.db }));
vi.mock('./intelligence-data', () => ({ loadPropertyMap: mocks.load }));
import { acceptedGeocode, geocodeNextBatch, type GeocodeFeature } from './map-geocoding';
const feature = (): GeocodeFeature => ({
	properties: {
		feature_type: 'address',
		coordinates: { longitude: -86.15, latitude: 39.77, accuracy: 'rooftop' },
		match_code: {
			confidence: 'high',
			address_number: 'matched',
			street: 'matched',
			postcode: 'matched'
		}
	}
});
beforeEach(() => {
	vi.resetAllMocks();
	vi.unstubAllGlobals();
});
describe('permanent geocoding safeguards', () => {
	it('accepts confident full address matches, not approximate streets or wrong numbers', () => {
		expect(acceptedGeocode(feature())).toBe(true);
		const approximate = feature();
		approximate.properties.coordinates!.accuracy = 'interpolated';
		expect(acceptedGeocode(approximate)).toBe(false);
		const wrongNumber = feature();
		wrongNumber.properties.match_code!.address_number = 'unmatched';
		expect(acceptedGeocode(wrongNumber)).toBe(false);
		expect(acceptedGeocode()).toBe(false);
	});
	it('does not geocode without persistent storage', async () => {
		mocks.load.mockResolvedValue({ cacheReady: false });
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		await expect(geocodeNextBatch()).rejects.toMatchObject({ status: 503 });
		expect(fetch).not.toHaveBeenCalled();
	});
	it('reuses matched results without calling Mapbox', async () => {
		mocks.load.mockResolvedValue({
			cacheReady: true,
			properties: [{ coordinates: [-86, 39], locationStatus: 'matched' }]
		});
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		await expect(geocodeNextBatch()).resolves.toMatchObject({ attempted: 0, remaining: 0 });
		expect(fetch).not.toHaveBeenCalled();
	});
	it('sends permanent=true and saves only accepted coordinates under its lease', async () => {
		mocks.load.mockResolvedValue({
			cacheReady: true,
			properties: [
				{
					key: '123 MAIN',
					address: '123 Main St, Indianapolis IN 46201',
					coordinates: null,
					locationStatus: 'missing'
				}
			]
		});
		const update = vi.fn();
		const eq2 = vi.fn(() => ({
			select: vi.fn().mockResolvedValue({ data: [{ address_key: '123 MAIN' }], error: null })
		}));
		update.mockReturnValue({ eq: vi.fn(() => ({ eq: eq2 })) });
		mocks.db.mockReturnValue({
			from: vi.fn(() => ({ insert: vi.fn().mockResolvedValue({ error: null }), update }))
		});
		const fetch = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ features: [feature()] })));
		vi.stubGlobal('fetch', fetch);
		await expect(geocodeNextBatch()).resolves.toMatchObject({
			attempted: 1,
			matched: 1,
			remaining: 0
		});
		const url = fetch.mock.calls[0][0] as URL;
		expect(url.searchParams.get('permanent')).toBe('true');
		expect(url.searchParams.get('autocomplete')).toBe('false');
		expect(update).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'matched',
				longitude: -86.15,
				latitude: 39.77,
				lease_id: null
			})
		);
		expect(eq2).toHaveBeenCalledWith('lease_id', expect.any(String));
	});
	it('does not pay for an address already reserved by another worker', async () => {
		mocks.load.mockResolvedValue({
			cacheReady: true,
			properties: [
				{
					key: '123 MAIN',
					address: '123 Main St, Indianapolis IN 46201',
					coordinates: null,
					locationStatus: 'pending'
				}
			]
		});
		const chain = {
			eq: vi.fn(),
			lt: vi.fn(),
			select: vi.fn().mockResolvedValue({ data: [], error: null })
		};
		chain.eq.mockReturnValue(chain);
		chain.lt.mockReturnValue(chain);
		mocks.db.mockReturnValue({
			from: vi.fn(() => ({
				insert: vi.fn().mockResolvedValue({ error: { code: '23505' } }),
				update: vi.fn(() => chain)
			}))
		});
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		await expect(geocodeNextBatch()).resolves.toMatchObject({ attempted: 0, remaining: 1 });
		expect(fetch).not.toHaveBeenCalled();
	});
	it('honors the paid-request limit while processing concurrently', async () => {
		mocks.load.mockResolvedValue({
			cacheReady: true,
			properties: Array.from({ length: 12 }, (_, i) => ({
				key: String(i),
				address: `${i + 1} Main St, Indianapolis IN 46201`,
				coordinates: null,
				locationStatus: 'missing'
			}))
		});
		const chain = {
			eq: vi.fn(),
			select: vi.fn().mockResolvedValue({ data: [{ address_key: 'claimed' }], error: null })
		};
		chain.eq.mockReturnValue(chain);
		mocks.db.mockReturnValue({
			from: vi.fn(() => ({
				insert: vi.fn().mockResolvedValue({ error: null }),
				update: vi.fn(() => chain)
			}))
		});
		const fetch = vi.fn(async () => new Response(JSON.stringify({ features: [feature()] })));
		vi.stubGlobal('fetch', fetch);
		await expect(geocodeNextBatch(3)).resolves.toMatchObject({
			attempted: 3,
			matched: 3,
			remaining: 9
		});
		expect(fetch).toHaveBeenCalledTimes(3);
	});
});
