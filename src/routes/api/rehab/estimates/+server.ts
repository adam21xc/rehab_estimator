import { json, error } from '@sveltejs/kit';
import { requireUser, sameOrigin, readJson } from '$lib/server/rehab-auth';
import { validateSnapshot } from '$lib/server/rehab-data';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async (event) => {
	const { db, user } = await requireUser(event);
	const page = Math.max(0, Number(event.url.searchParams.get('page')) || 0);
	const { data, error: failure } = await db
		.from('rehab_estimates')
		.select('id,project_id,address,total,created_at')
		.eq('user_id', user.id)
		.order('created_at', { ascending: false })
		.range(page * 30, page * 30 + 29);
	if (failure) error(503, 'Estimate history is unavailable. Please try again.');
	return json({ estimates: data });
};
export const POST: RequestHandler = async (event) => {
	sameOrigin(event);
	const { db, user } = await requireUser(event);
	const body = await readJson(event);
	const { project, total } = validateSnapshot(body.project, user.id);
	const photos = project.progress.flatMap((p) => p.photos);
	for (const photo of photos) {
		const { data } = await db.storage.from('rehab-media').info(photo.storagePath!);
		if (!data) error(400, 'A photo upload is missing. Add the photo again before saving.');
	}
	const { data, error: failure } = await db
		.from('rehab_estimates')
		.insert({
			user_id: user.id,
			project_id: project.meta.id,
			address: project.meta.address || 'Untitled property',
			total,
			snapshot: project
		})
		.select('id,created_at')
		.single();
	if (failure) error(503, 'The estimate was not saved. Your local draft is still available.');
	return json(data, { status: 201 });
};
