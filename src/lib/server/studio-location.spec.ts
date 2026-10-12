import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { findStudioLocation, providerLocation } from './studio-location';
const address = '123 Main St, Indianapolis IN 46201';
const property = { full_address: address, latitude: 39.7, longitude: -86.1 };
function fixture(properties: unknown[] = [], cached: unknown = null, claim = true) {
	const update = vi.fn();
	const db = {
		from: vi.fn((table: string) => {
			const result =
				table === 'dm_properties'
					? { data: properties }
					: table === 'dm_requests'
						? { data: cached }
						: { data: null };
			const q: Record<string, unknown> = {};
			for (const name of ['select', 'order', 'eq']) q[name] = vi.fn(() => q);
			q.range = vi.fn(async () => result);
			q.maybeSingle = vi.fn(async () => result);
			q.update = vi.fn((value: unknown) => {
				update(value);
				return { eq: vi.fn(async () => ({ error: null })) };
			});
			return q;
		}),
		rpc: vi.fn(async () => ({ data: claim }))
	};
	return { db: db as unknown as SupabaseClient, update, rpc: db.rpc };
}
describe('studio address lookup', () => {
	it('reuses saved locations without a paid request', async () => {
		const { db, rpc } = fixture([{ facts: property }]);
		const request = vi.fn();
		expect((await findStudioLocation(db, address, '', request)).coordinates).toEqual([-86.1, 39.7]);
		expect(request).not.toHaveBeenCalled();
		expect(rpc).not.toHaveBeenCalled();
	});
	it('reuses complete responses and never retries pending requests', async () => {
		const request = vi.fn();
		const { db } = fixture([], {
			status: 'complete',
			response: { data: [{ ...property, input: { full_address: address } }] }
		});
		expect((await findStudioLocation(db, address, 'key', request)).address).toBe(address);
		await expect(
			findStudioLocation(fixture([], { status: 'pending' }).db, address, 'key', request)
		).rejects.toMatchObject({ status: 409 });
		expect(request).not.toHaveBeenCalled();
	});
	it('persists a successful lookup before returning it', async () => {
		const { db, update } = fixture();
		const response = {
			data: [{ ...property, input: { full_address: address } }],
			credits: { used: 1 }
		};
		const request = vi.fn(async () => new Response(JSON.stringify(response), { status: 200 }));
		await findStudioLocation(db, address, 'key', request);
		expect(request).toHaveBeenCalledTimes(1);
		expect(update).toHaveBeenCalledWith(
			expect.objectContaining({ response, status: 'complete', credits: 1 })
		);
	});
	it('does not call the provider when another lookup owns the reservation', async () => {
		const request = vi.fn();
		await expect(
			findStudioLocation(fixture([], null, false).db, address, 'key', request)
		).rejects.toMatchObject({ status: 409 });
		expect(request).not.toHaveBeenCalled();
	});
	it('rejects invalid coordinates and flags different properties', () => {
		expect(providerLocation({ ...property, latitude: null }, address)).toBeNull();
		expect(providerLocation({ ...property, latitude: 100 }, address)).toBeNull();
		expect(providerLocation({ ...property, matched: false }, address)).toBeNull();
		expect(
			providerLocation({ ...property, full_address: '456 Other St' }, address)?.warning
		).toBeTruthy();
	});
});
