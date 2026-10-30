import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), body: vi.fn(), origin: vi.fn() }));
vi.mock('$lib/server/rehab-auth', () => ({
	sameOrigin: m.origin,
	requireUser: m.auth,
	readJson: m.body
}));
import { POST } from './+server';
import { QUEUED_MODEL, COMPLETED_MODEL } from '$lib/renovation-queue.js';
const request = {
	requestId: '3bbd19f8-b79a-437c-86b7-65907e4af611',
	estimateId: '876bb712-08ea-419d-ad17-5d19710be401',
	photoId: 'photo1',
	prompt: 'Refresh the siding with warm neutral finishes.',
	style: 'Modern warm'
};
const event = {} as Parameters<typeof POST>[0];
beforeEach(() => {
	vi.resetAllMocks();
	m.body.mockResolvedValue(request);
});
function setup(
	options: { existing?: any; reused?: any; foreign?: boolean; insertError?: any } = {}
) {
	let renderingReads = 0;
	const inserted = vi.fn(async () => ({ error: options.insertError || null }));
	const db = {
		from: vi.fn((table: string) => {
			const chain: any = {};
			for (const key of ['select', 'eq', 'gte', 'limit', 'in', 'order'])
				chain[key] = vi.fn(() => chain);
			chain.maybeSingle = vi.fn(async () => ({
				data:
					table === 'rehab_estimates'
						? {
								snapshot: {
									progress: [
										{
											photos: [
												{
													id: 'photo1',
													storagePath: options.foreign
														? 'other/photos/one.jpg'
														: 'user1/photos/one.jpg'
												}
											]
										}
									]
								}
							}
						: ++renderingReads === 1
							? options.existing || null
							: options.reused || null,
				error: null
			}));
			chain.then = (resolve: any) => Promise.resolve({ count: 0, error: null }).then(resolve);
			chain.insert = inserted;
			return chain;
		})
	};
	m.auth.mockResolvedValue({ user: { id: 'user1' }, db });
	return { db, inserted };
}
it('queues an OAuth job without calling an image provider', async () => {
	const { inserted } = setup();
	const fetch = vi.fn();
	vi.stubGlobal('fetch', fetch);
	try {
		const r = await POST(event);
		expect(r.status).toBe(202);
		expect(await r.json()).toMatchObject({ phase: 'queued' });
		expect(inserted).toHaveBeenCalledWith(
			expect.objectContaining({ model: QUEUED_MODEL, status: 'processing', user_id: 'user1' })
		);
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		vi.unstubAllGlobals();
	}
});
it('reuses the same request ID', async () => {
	const { inserted } = setup({
		existing: { id: request.requestId, status: 'processing', model: QUEUED_MODEL }
	});
	expect(await (await POST(event)).json()).toMatchObject({ phase: 'queued' });
	expect(inserted).not.toHaveBeenCalled();
});
it('reuses a completed concept with matching settings', async () => {
	const { inserted } = setup({
		reused: { id: 'saved', status: 'completed', model: COMPLETED_MODEL }
	});
	expect(await (await POST(event)).json()).toMatchObject({ id: 'saved', reused: true });
	expect(inserted).not.toHaveBeenCalled();
});
it('rejects a photo belonging to another owner', async () => {
	const { inserted } = setup({ foreign: true });
	await expect(POST(event)).rejects.toMatchObject({ status: 400 });
	expect(inserted).not.toHaveBeenCalled();
});
it('does not start a second active request', async () => {
	setup({ insertError: { code: '23505' } });
	await expect(POST(event)).rejects.toMatchObject({ status: 409 });
});
it('requires authentication', async () => {
	m.auth.mockRejectedValue({ status: 401 });
	await expect(POST(event)).rejects.toMatchObject({ status: 401 });
	expect(m.body).not.toHaveBeenCalled();
});
