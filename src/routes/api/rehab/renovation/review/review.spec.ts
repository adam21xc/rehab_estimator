import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn(), origin: vi.fn(), body: vi.fn() }));
vi.mock('$lib/server/rehab-auth', () => ({
	requireUser: m.auth,
	authClient: m.db,
	sameOrigin: m.origin,
	readJson: m.body
}));
import { GET, PATCH } from './+server';
import { reviewPair } from '$lib/server/renovation-review';
const id = 'prop_12';
const facts = {
	full_address: '12 Main St',
	renovation_image_pair: {
		before_path: 'renovation/prop_12/b.jpg',
		renovated_path: 'renovation/prop_12/a.jpg'
	},
	unrelated: { keep: true }
};
const event = {} as Parameters<typeof PATCH>[0];
beforeEach(() => {
	vi.resetAllMocks();
	m.auth.mockResolvedValue({ user: { id: 'reviewer' } });
	m.body.mockResolvedValue({
		id,
		version: reviewPair(id, facts)!.version,
		status: 'flagged',
		note: 'Wrong house'
	});
});
function setup(f: Record<string, any> = facts, conflict = false) {
	let updated = false;
	const chain: any = {};
	chain.select = vi.fn(() =>
		updated ? Promise.resolve({ data: conflict ? [] : [{ id }], error: null }) : chain
	);
	chain.eq = vi.fn(() => chain);
	chain.single = vi.fn(async () => ({ data: { id, facts: f }, error: null }));
	chain.update = vi.fn(() => {
		updated = true;
		return chain;
	});
	m.db.mockReturnValue({ from: () => chain });
	return chain;
}
it('requires workspace authorization before reading images', async () => {
	m.auth.mockRejectedValue({ status: 401 });
	await expect(GET(event)).rejects.toMatchObject({ status: 401 });
	expect(m.db).not.toHaveBeenCalled();
});
it('requires same origin before saving', async () => {
	m.origin.mockImplementation(() => {
		throw { status: 403 };
	});
	await expect(PATCH(event)).rejects.toMatchObject({ status: 403 });
	expect(m.db).not.toHaveBeenCalled();
});
it('rejects approval of a held property', async () => {
	const chain = setup({
		...facts,
		renovation_batch: { status: 'needs_review', reason: 'House mismatch' }
	});
	m.body.mockResolvedValue({
		id,
		version: reviewPair(id, facts)!.version,
		status: 'approved',
		note: ''
	});
	await expect(PATCH(event)).rejects.toMatchObject({ status: 409 });
	expect(chain.update).not.toHaveBeenCalled();
});
it('rejects a stale image review', async () => {
	const chain = setup();
	m.body.mockResolvedValue({ id, version: '0'.repeat(64), status: 'approved', note: '' });
	await expect(PATCH(event)).rejects.toMatchObject({ status: 409 });
	expect(chain.update).not.toHaveBeenCalled();
});
it('saves notes without replacing other enrichment data and detects concurrent writes', async () => {
	const chain = setup(facts, true);
	await expect(PATCH(event)).rejects.toMatchObject({ status: 409 });
	expect(chain.update.mock.calls[0][0].facts.unrelated).toEqual({ keep: true });
	expect(chain.eq).toHaveBeenCalledWith('facts', JSON.stringify(facts));
	expect(chain.update.mock.calls[0][0].facts.renovation_image_review).toMatchObject({
		status: 'flagged',
		note: 'Wrong house',
		reviewed_by: 'reviewer'
	});
});

it('archives even held images without deleting assets or other property facts', async () => {
	const f = { ...facts, renovation_batch: { status: 'needs_review', reason: 'No better source' } };
	const chain = setup(f);
	m.body.mockResolvedValue({
		id,
		version: reviewPair(id, f)!.version,
		status: 'archived',
		note: ''
	});
	expect((await PATCH(event)).status).toBe(200);
	const updated = chain.update.mock.calls[0][0].facts;
	expect(updated.renovation_image_review.status).toBe('archived');
	expect(updated.renovation_image_pair).toEqual(facts.renovation_image_pair);
	expect(updated.unrelated).toEqual(facts.unrelated);
});
it('excludes archived pairs from all active images and exposes a separate archive filter', async () => {
	const archived = {
		...facts,
		renovation_image_review: { version: reviewPair(id, facts)!.version, status: 'archived' }
	};
	const chain: any = {};
	for (const method of ['select', 'or', 'order']) chain[method] = () => chain;
	chain.range = async () => ({
		data: [
			{ id, facts: archived },
			{ id, facts }
		],
		error: null
	});
	const signed = vi.fn(async () => ({ data: [{ signedUrl: 'before' }, { signedUrl: 'after' }] }));
	m.db.mockReturnValue({
		from: () => chain,
		storage: { from: () => ({ createSignedUrls: signed }) }
	});
	const active = await (await GET({ url: new URL('http://localhost/?status=all') } as any)).json();
	expect(active.counts).toMatchObject({ all: 1, pending: 1, archived: 1 });
	expect(active.items.map((r: any) => r.status)).toEqual(['pending']);
	const archive = await (
		await GET({ url: new URL('http://localhost/?status=archived') } as any)
	).json();
	expect(archive.items.map((r: any) => r.status)).toEqual(['archived']);
});

it('lists flagged and held properties and leaves out a property that is only waiting on an image', async () => {
	const pair = {
		before_path: 'renovation/prop_12/b.jpg',
		renovated_path: 'renovation/prop_12/a.jpg'
	};
	const flaggedFacts = {
		full_address: 'A Flagged St',
		renovation_image_pair: pair,
		renovation_image_review: {
			version: reviewPair('prop_12', { renovation_image_pair: pair })!.version,
			status: 'flagged',
			note: 'NOT USABLE: No usable front photo after an extensive search.'
		}
	};
	const chain: any = {};
	for (const method of ['select', 'order']) chain[method] = () => chain;
	chain.or = vi.fn(() => chain);
	chain.range = async () => ({
		data: [
			{ id: 'prop_12', facts: flaggedFacts },
			{
				id: 'prop_4',
				facts: {
					full_address: 'B Held Ave',
					renovation_batch: { status: 'needs_review', reason: 'Source unavailable or invalid JPEG' }
				}
			},
			{
				id: 'prop_9',
				facts: {
					full_address: 'C Queue St',
					renovation_dashboard_trial: { status: 'generating' },
					renovation_batch: { status: 'queued' }
				}
			},
			{
				id: 'prop_8',
				facts: {
					full_address: 'D Approved St',
					renovation_image_pair: {
						before_path: 'renovation/prop_8/b.jpg',
						renovated_path: 'renovation/prop_8/a.jpg'
					},
					renovation_image_review: {
						version: reviewPair('prop_8', {
							renovation_image_pair: {
								before_path: 'renovation/prop_8/b.jpg',
								renovated_path: 'renovation/prop_8/a.jpg'
							}
						})!.version,
						status: 'approved',
						note: 'Looks right'
					}
				}
			}
		],
		error: null
	});
	const sign = vi.fn();
	m.db.mockReturnValue({
		from: () => chain,
		storage: { from: () => ({ createSignedUrls: sign }) }
	});
	const body = await (await GET({ url: new URL('http://localhost/?status=manual') } as any)).json();
	expect(body.counts.manual).toBe(2);
	expect(body.items.map((row: { address: string }) => row.address)).toEqual([
		'A Flagged St',
		'B Held Ave'
	]);
	expect(body.items[0].kind).toBe('not_usable');
	expect(body.items[1].hasImages).toBe(false);
	expect(sign).not.toHaveBeenCalled();
	expect(chain.or).toHaveBeenCalledWith(expect.stringContaining('needs_review'));
});
