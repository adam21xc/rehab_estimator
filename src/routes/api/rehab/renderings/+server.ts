import { RENOVATION_MODEL } from '$lib/renovation-standard.js';
import { z } from 'zod';
import { QUEUED_MODEL, COMPLETED_MODEL, renderingPhase } from '$lib/renovation-queue.js';
import type { RehabProject } from '$lib/domain/types';
import { json, error } from '@sveltejs/kit';
import { requireUser, sameOrigin, readJson } from '$lib/server/rehab-auth';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async (event) => {
	const { db, user } = await requireUser(event);
	const id = event.url.searchParams.get('estimateId');
	if (!id) error(400, 'Choose a saved estimate.');
	const { data, error: failure } = await db
		.from('rehab_renderings')
		.select('id,status,prompt,style,source_photo_id,output_path,error_message,created_at,model')
		.eq('user_id', user.id)
		.eq('estimate_id', id)
		.order('created_at', { ascending: false });
	if (failure) error(503, 'Unable to load renderings.');
	return json({
		renderings: data.map((r) => ({
			...r,
			phase: renderingPhase(r),
			url: r.output_path ? `/api/rehab/media?path=${encodeURIComponent(r.output_path)}` : null
		}))
	});
};

const input = z.object({
	requestId: z.uuid(),
	estimateId: z.uuid(),
	photoId: z.string().min(1).max(100),
	prompt: z.string().trim().min(10).max(2000),
	style: z.enum(['Modern warm', 'Contemporary', 'Classic', 'Suggest a direction'])
});
// Durable queue only. This web endpoint never contacts an image provider.
export const POST: RequestHandler = async (event) => {
	sameOrigin(event);
	const { db, user } = await requireUser(event);
	const parsed = input.safeParse(await readJson(event, 8192));
	if (!parsed.success)
		error(400, 'Select a saved photo and describe the remodel (10–2000 characters).');
	const request = parsed.data;
	const existing = await db
		.from('rehab_renderings')
		.select('id,status,model')
		.eq('id', request.requestId)
		.eq('user_id', user.id)
		.maybeSingle();
	if (existing.error) error(503, 'Unable to check saved request.');
	if (existing.data) return json({ ...existing.data, phase: renderingPhase(existing.data) });
	const estimate = await db
		.from('rehab_estimates')
		.select('snapshot')
		.eq('id', request.estimateId)
		.eq('user_id', user.id)
		.maybeSingle();
	if (estimate.error || !estimate.data) error(404, 'Saved estimate not found.');
	const photo = (estimate.data.snapshot as RehabProject).progress
		.flatMap((p) => p.photos)
		.find((p) => p.id === request.photoId);
	if (!photo?.storagePath?.startsWith(`${user.id}/photos/`) || photo.storagePath.includes('..'))
		error(400, 'Save this photo with the estimate first.');
	const reused = await db
		.from('rehab_renderings')
		.select('id,status,model')
		.eq('user_id', user.id)
		.eq('estimate_id', request.estimateId)
		.eq('source_photo_id', request.photoId)
		.eq('prompt', request.prompt)
		.eq('style', request.style)
		.in('model', [COMPLETED_MODEL, RENOVATION_MODEL])
		.eq('status', 'completed')
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (reused.error) error(503, 'Unable to check saved concepts.');
	if (reused.data) return json({ ...reused.data, phase: 'completed', reused: true });
	const allowance = await db
		.from('rehab_renderings')
		.select('id', { count: 'exact', head: true })
		.eq('user_id', user.id)
		.gte('created_at', new Date(Date.now() - 86400000).toISOString());
	if (allowance.error) error(503, 'Unable to check request allowance.');
	if ((allowance.count || 0) >= 10)
		error(429, 'Daily limit reached (10 requests). Try again tomorrow.');
	const inserted = await db.from('rehab_renderings').insert({
		id: request.requestId,
		user_id: user.id,
		estimate_id: request.estimateId,
		source_photo_id: request.photoId,
		prompt: request.prompt,
		style: request.style,
		model: QUEUED_MODEL,
		status: 'processing'
	});
	if (inserted.error) {
		if (inserted.error.code === '23505')
			error(
				409,
				'A request is already queued or processing. Open its saved session and refresh its status.'
			);
		error(503, 'Unable to save the image request. Please retry with the same request.');
	}
	return json({ id: request.requestId, status: 'processing', phase: 'queued' }, { status: 202 });
};
