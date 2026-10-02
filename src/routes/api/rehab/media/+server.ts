import { error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/rehab-auth';
import { BUCKET } from '$lib/server/rehab-data';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async (event) => {
	const { db, user } = await requireUser(event);
	const path = event.url.searchParams.get('path') || '';
	if (!path.startsWith(`${user.id}/`) || path.includes('..')) error(404, 'Photo not found.');
	const { data, error: failure } = await db.storage.from(BUCKET).download(path);
	if (failure || !data) error(404, 'Photo not found.');
	return new Response(data, {
		headers: {
			'content-type': data.type,
			'cache-control': 'private, no-store',
			'x-content-type-options': 'nosniff'
		}
	});
};
