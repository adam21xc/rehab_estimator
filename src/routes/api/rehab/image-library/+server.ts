import { error, json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/rehab-auth';
import {
	groupPropertyImages,
	type ImageEstimate,
	type SavedRendering
} from '$lib/domain/image-library';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async (event) => {
	const { db, user } = await requireUser(event);
	const estimates: ImageEstimate[] = [];
	const renderings: SavedRendering[] = [];
	// Read every saved version: an image must not disappear at the API's default row limit.
	for (let start = 0; ; start += 500) {
		const { data, error: failure } = await db
			.from('rehab_estimates')
			.select('id,project_id,address,created_at,snapshot')
			.eq('user_id', user.id)
			.order('id')
			.range(start, start + 499);
		if (failure) error(503, 'Unable to load the property image library. Please try again.');
		estimates.push(...data);
		if (data.length < 500) break;
	}
	for (let start = 0; ; start += 500) {
		const { data, error: failure } = await db
			.from('rehab_renderings')
			.select('id,estimate_id,status,output_path,prompt,style,created_at')
			.eq('user_id', user.id)
			.eq('status', 'completed')
			.order('id')
			.range(start, start + 499);
		if (failure) error(503, 'Unable to load saved concepts. Please try again.');
		renderings.push(...data);
		if (data.length < 500) break;
	}
	return json({ properties: groupPropertyImages(estimates, renderings, user.id) });
};
