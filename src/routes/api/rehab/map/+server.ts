import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { requireUser, sameOrigin } from '$lib/server/rehab-auth';
import { loadPropertyMap } from '$lib/server/intelligence-data';
import { geocodeNextBatch } from '$lib/server/map-geocoding';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async (event) => {
	await requireUser(event);
	return json({ ...(await loadPropertyMap()), token: env.MAPBOX_PUBLIC_TOKEN || '' });
};
export const POST: RequestHandler = async (event) => {
	sameOrigin(event);
	await requireUser(event);
	return json(await geocodeNextBatch());
};
