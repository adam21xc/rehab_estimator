import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('$lib/supabase', () => ({ supabaseAdmin: { rpc } }));
import { GET } from './+server';

const request = (query = '') =>
	GET({ url: new URL(`https://example.com/api/pixel${query}`) } as RequestEvent);

describe('tracking pixel', () => {
	beforeEach(() => {
		rpc.mockReset().mockResolvedValue({ error: null });
	});

	it('records an open with the deployed RPC signature and serves an uncached GIF', async () => {
		const response = await request('?t=test-token');
		expect(rpc).toHaveBeenCalledExactlyOnceWith('track_open', { token: 'test-token' });
		expect(response.headers.get('content-type')).toBe('image/gif');
		expect(response.headers.get('cache-control')).toContain('no-store');
		expect(new Uint8Array(await response.arrayBuffer()).length).toBe(43);
	});

	it('serves a missing-token request without calling the database', async () => {
		expect((await request()).status).toBe(200);
		expect(rpc).not.toHaveBeenCalled();
	});

	it('supports the alternate query parameter and old database signature', async () => {
		rpc.mockResolvedValueOnce({ error: { code: 'PGRST202', message: 'Unknown signature' } });
		await request('?token=old-token');
		expect(rpc).toHaveBeenNthCalledWith(1, 'track_open', { token: 'old-token' });
		expect(rpc).toHaveBeenNthCalledWith(2, 'track_open', { _token: 'old-token' });
	});

	it('does not retry ambiguous database failures or break the image', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			rpc.mockResolvedValueOnce({ error: { code: '08006', message: 'Connection lost' } });
			expect((await request('?t=test-token')).status).toBe(200);
			expect(rpc).toHaveBeenCalledTimes(1);
		} finally {
			log.mockRestore();
		}
	});
});
