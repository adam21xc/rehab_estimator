import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { requireUser, authClient, sameOrigin, readJson } from '$lib/server/rehab-auth';
import { manualReview, reviewPair, type ManualReview } from '$lib/server/renovation-review';
import type { RequestHandler } from './$types';
const PROPERTY_FILTER =
	'facts->renovation_image_pair.not.is.null,facts->renovation_dashboard_trial.not.is.null,facts->renovation_pilot.not.is.null,facts->renovation_batch->>status.eq.needs_review';
export const GET: RequestHandler = async (event) => {
	await requireUser(event);
	const db = authClient();
	const loaded: { id: string; facts: Record<string, unknown> }[] = [];
	for (let offset = 0; ; offset += 500) {
		const r = await db
			.from('dm_properties')
			.select('id,facts')
			.or(PROPERTY_FILTER)
			.order('id')
			.range(offset, offset + 499);
		if (r.error) error(503, 'Unable to load image reviews.');
		loaded.push(...(r.data || []));
		if ((r.data?.length || 0) < 500) break;
	}
	const counts = { all: 0, pending: 0, approved: 0, flagged: 0, archived: 0, manual: 0 };
	const pairs: NonNullable<ReturnType<typeof reviewPair>>[] = [];
	const manual: ManualReview[] = [];
	for (const row of loaded) {
		const facts = row.facts || {};
		const pair = reviewPair(row.id, facts);
		if (pair) {
			pairs.push(pair);
			counts[pair.status as 'pending' | 'approved' | 'flagged' | 'archived']++;
			if (pair.status !== 'archived') counts.all++;
		}
		const item = manualReview(row.id, facts);
		if (item) {
			counts.manual++;
			manual.push(item);
		}
	}
	manual.sort((a, b) => a.address.localeCompare(b.address) || a.id.localeCompare(b.id));
	const q = (event.url.searchParams.get('q') || '').toLowerCase();
	const status = event.url.searchParams.get('status') || 'all';
	const focus = event.url.searchParams.get('id') || '';
	const manualMode = status === 'manual';
	const filtered = manualMode
		? manual.filter(
				(row) =>
					(!focus || row.id === focus) &&
					`${row.address}\n${row.reasons.join('\n')}`.toLowerCase().includes(q)
			)
		: pairs.filter(
				(row) =>
					(!focus || row.id === focus) &&
					row.address.toLowerCase().includes(q) &&
					(status === 'all' ? row.status !== 'archived' : row.status === status)
			);
	const pageSize = manualMode ? 50 : 12;
	const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
	const page = Math.min(pages, Math.max(1, Number(event.url.searchParams.get('page')) || 1));
	const slice = filtered.slice((page - 1) * pageSize, page * pageSize);
	const items = manualMode
		? slice.map((row) => ({
				...row,
				beforeUrl: null,
				afterUrl: null,
				imageError: false
			}))
		: await Promise.all(
				slice.map(async (row) => {
					const pair = row as NonNullable<ReturnType<typeof reviewPair>>;
					const signed = await db.storage
						.from('rehab-media')
						.createSignedUrls([pair.before, pair.after], 3600);
					const urls = signed.data || [];
					return {
						...pair,
						before: undefined,
						after: undefined,
						beforeUrl: urls[0]?.signedUrl || null,
						afterUrl: urls[1]?.signedUrl || null,
						imageError: !!signed.error || urls.some((x) => x.error)
					};
				})
			);
	return json({ items, counts, page, pages, total: filtered.length });
};
export const PATCH: RequestHandler = async (event) => {
	sameOrigin(event);
	const { user } = await requireUser(event);
	const input = z
		.object({
			id: z.string().regex(/^prop_\d+$/),
			version: z.string().regex(/^[a-f0-9]{64}$/),
			status: z.enum(['pending', 'approved', 'flagged', 'archived']),
			note: z.string().trim().max(2000)
		})
		.safeParse(await readJson(event, 8000));
	if (!input.success) error(400, 'Choose a review status and a note of at most 2,000 characters.');
	const v = input.data;
	if (v.status === 'flagged' && !v.note) error(400, 'Describe what needs fixing.');
	const db = authClient();
	const r = await db.from('dm_properties').select('id,facts').eq('id', v.id).single();
	if (r.error || !r.data) error(404, 'Property not found.');
	const pair = reviewPair(v.id, r.data.facts);
	if (!pair || pair.version !== v.version)
		error(409, 'The images changed. Refresh and review the new pair.');
	if (pair.hold && v.status === 'approved')
		error(
			409,
			'Resolve the property identity hold before approving. You can flag this pair with a note.'
		);
	const review = {
		version: v.version,
		status: v.status,
		note: v.note,
		reviewed_at: new Date().toISOString(),
		reviewed_by: user.id
	};
	const saved = await db
		.from('dm_properties')
		.update({ facts: { ...r.data.facts, renovation_image_review: review } })
		.eq('id', v.id)
		.eq('facts', JSON.stringify(r.data.facts))
		.select('id');
	if (saved.error) error(503, 'Unable to save review.');
	if (!saved.data?.length) error(409, 'The property changed while saving. Refresh and try again.');
	return json({ saved: true, review });
};
