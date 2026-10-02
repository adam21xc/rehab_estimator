import { json, error } from '@sveltejs/kit';
import { requireUser, sameOrigin, readJson } from '$lib/server/rehab-auth';
import { BUCKET } from '$lib/server/rehab-data';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async (event) => {
	sameOrigin(event);
	const { db, user } = await requireUser(event);
	const body = await readJson(event, 7 * 1024 * 1024);
	const match =
		typeof body.dataUrl === 'string' &&
		body.dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
	if (!match) error(400, 'Choose a JPEG, PNG, or WebP photo.');
	const bytes = Buffer.from(match[2], 'base64');
	if (!bytes.length || bytes.length > 5 * 1024 * 1024)
		error(400, 'Photos must be smaller than 5 MB.');
	const path = `${user.id}/photos/${crypto.randomUUID()}.${match[1].split('/')[1]}`;
	const { error: failure } = await db.storage
		.from(BUCKET)
		.upload(path, bytes, { contentType: match[1], upsert: false });
	if (failure) error(503, 'Photo could not be uploaded. Try again.');
	return json({ path, url: `/api/rehab/media?path=${encodeURIComponent(path)}` }, { status: 201 });
};
