import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { requireUser, authClient, sameOrigin, readJson } from '$lib/server/rehab-auth';
import { reviewPair } from '$lib/server/renovation-review';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async (event) => {
	await requireUser(event);
	const db = authClient();
	const rows: NonNullable<ReturnType<typeof reviewPair>>[] = [];
	for (let offset = 0; ; offset += 500) {
		const r = await db
			.from('dm_properties')
			.select('id,facts')
			.or(
				'facts->renovation_image_pair.not.is.null,facts->renovation_dashboard_trial.not.is.null,facts->renovation_pilot.not.is.null'
			)
			.order('id')
			.range(offset, offset + 499);
		if (r.error) error(503, 'Unable to load image reviews.');
		for (const row of r.data || []) {
			const pair = reviewPair(row.id, row.facts || {});
			if (pair) rows.push(pair);
		}
		if ((r.data?.length || 0) < 500) break;
	}
	const counts = { all: rows.length, pending: 0, approved: 0, flagged: 0 };
	for (const row of rows) counts[row.status as 'pending' | 'approved' | 'flagged']++;
	const q = (event.url.searchParams.get('q') || '').toLowerCase(),
		status = event.url.searchParams.get('status') || 'all';
	const filtered = rows.filter(
		(r) => (status === 'all' || r.status === status) && r.address.toLowerCase().includes(q)
	);
	const pages = Math.max(1, Math.ceil(filtered.length / 12));
	const page = Math.min(pages, Math.max(1, Number(event.url.searchParams.get('page')) || 1));
	const items = await Promise.all(
		filtered.slice((page - 1) * 12, page * 12).map(async (r) => {
			const signed = await db.storage
				.from('rehab-media')
				.createSignedUrls([r.before, r.after], 3600);
			const urls = signed.data || [];
			return {
				...r,
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
			status: z.enum(['pending', 'approved', 'flagged']),
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
