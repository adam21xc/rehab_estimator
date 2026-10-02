import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { z } from 'zod';
import { requireUser, sameOrigin, readJson } from '$lib/server/rehab-auth';
import { BUCKET } from '$lib/server/rehab-data';
import type { RehabProject } from '$lib/domain/types';
import type { RequestHandler } from './$types';
const input = z.object({
	requestId: z.uuid(),
	estimateId: z.uuid(),
	photoId: z.string().max(100),
	prompt: z.string().trim().min(10).max(2000),
	style: z.enum(['Modern warm', 'Contemporary', 'Classic', 'Suggest a direction'])
});
export const GET: RequestHandler = async (event) => {
	const { db, user } = await requireUser(event);
	const id = event.url.searchParams.get('estimateId');
	if (!id) error(400, 'Choose a saved estimate.');
	const { data, error: failure } = await db
		.from('rehab_renderings')
		.select('id,status,prompt,style,source_photo_id,output_path,error_message,created_at')
		.eq('user_id', user.id)
		.eq('estimate_id', id)
		.order('created_at', { ascending: false });
	if (failure) error(503, 'Unable to load renderings.');
	return json({
		renderings: data.map((r) => ({
			...r,
			url: r.output_path ? `/api/rehab/media?path=${encodeURIComponent(r.output_path)}` : null
		}))
	});
};
export const POST: RequestHandler = async (event) => {
	sameOrigin(event);
	const { db, user } = await requireUser(event);
	const parsed = input.safeParse(await readJson(event, 8192));
	if (!parsed.success)
		error(400, 'Select a saved photo and describe the remodel (10–2000 characters).');
	const request = parsed.data;
	if (!env.OPENAI_API_KEY)
		error(503, 'Image generation is not configured yet. Add the server OpenAI API key.');
	const { data: existing } = await db
		.from('rehab_renderings')
		.select('id,status')
		.eq('id', request.requestId)
		.eq('user_id', user.id)
		.maybeSingle();
	if (existing) return json(existing);
	const { data: estimate } = await db
		.from('rehab_estimates')
		.select('snapshot')
		.eq('id', request.estimateId)
		.eq('user_id', user.id)
		.maybeSingle();
	if (!estimate) error(404, 'Saved estimate not found.');
	const photo = (estimate.snapshot as RehabProject).progress
		.flatMap((p) => p.photos)
		.find((p) => p.id === request.photoId);
	if (!photo?.storagePath?.startsWith(`${user.id}/photos/`))
		error(400, 'Save this photo with the estimate first.');
	const { data: source, error: downloadError } = await db.storage
		.from(BUCKET)
		.download(photo.storagePath);
	if (downloadError || !source) error(404, 'Original photo is unavailable.');
	const { count, error: countError } = await db
		.from('rehab_renderings')
		.select('id', { count: 'exact', head: true })
		.eq('user_id', user.id)
		.gte('created_at', new Date(Date.now() - 86400000).toISOString());
	if (countError) error(503, 'Unable to check rendering allowance.');
	if ((count || 0) >= 10)
		error(429, 'Daily limit reached (10 rendering requests). Try again tomorrow.');
	// A terminated host may leave a job marked processing; never silently retry a paid request.
	await db
		.from('rehab_renderings')
		.update({
			status: 'failed',
			error_message:
				'Generation was interrupted. Check the history before requesting another rendering.'
		})
		.eq('user_id', user.id)
		.eq('status', 'processing')
		.lt('created_at', new Date(Date.now() - 10 * 60000).toISOString());
	const model = 'gpt-image-2.5-sunburst';
	const { error: insertError } = await db.from('rehab_renderings').insert({
		id: request.requestId,
		user_id: user.id,
		estimate_id: request.estimateId,
		source_photo_id: photo.id,
		prompt: request.prompt,
		style: request.style,
		model,
		status: 'processing'
	});
	if (insertError)
		error(409, 'A rendering is already in progress. Refresh its status before trying again.');
	try {
		const form = new FormData();
		form.append('model', model);
		form.append('image', source, photo.fileName);
		form.append('n', '1');
		form.append('size', '1024x1024');
		form.append('quality', 'medium');
		form.append('output_format', 'jpeg');
		form.append(
			'prompt',
			`Create a photorealistic remodel concept from this property photo. Preserve the camera viewpoint, room dimensions, walls, windows, doors and structural layout unless the requested changes explicitly say otherwise. Show plausible materials and lighting. Do not add text or watermarks. Style: ${request.style}. If asked to suggest a direction, choose a cohesive, practical renovation suitable for this space. Requested changes: ${request.prompt}`
		);
		const response = await fetch('https://api.openai.com/v1/images/edits', {
			method: 'POST',
			headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
			body: form,
			signal: AbortSignal.timeout(180000)
		});
		if (!response.ok) throw new Error('provider');
		const payload = await response.json();
		const encoded = payload.data?.[0]?.b64_json;
		if (typeof encoded !== 'string') throw new Error('provider');
		const bytes = Buffer.from(encoded, 'base64');
		const path = `${user.id}/renderings/${request.requestId}.jpeg`;
		const { error: uploadError } = await db.storage
			.from(BUCKET)
			.upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
		if (uploadError) throw new Error('storage');
		const { error: updateError } = await db
			.from('rehab_renderings')
			.update({ status: 'completed', output_path: path })
			.eq('id', request.requestId)
			.eq('user_id', user.id);
		if (updateError) throw new Error('storage');
		return json({ id: request.requestId, status: 'completed' });
	} catch {
		const message =
			'Rendering could not be completed. The provider may have charged for an interrupted request. No automatic retry was made.';
		await db
			.from('rehab_renderings')
			.update({ status: 'failed', error_message: message })
			.eq('id', request.requestId)
			.eq('user_id', user.id);
		error(502, message);
	}
};
