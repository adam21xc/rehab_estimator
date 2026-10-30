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
