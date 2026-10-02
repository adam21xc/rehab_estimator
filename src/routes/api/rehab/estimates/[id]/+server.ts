import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/rehab-auth';
import { hydrateProject } from '$lib/server/rehab-data';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async (event) => {
	const { db, user } = await requireUser(event);
	const { data, error: failure } = await db
		.from('rehab_estimates')
		.select('id,snapshot,created_at')
		.eq('id', event.params.id)
		.eq('user_id', user.id)
		.maybeSingle();
	if (failure || !data) error(404, 'Estimate not found.');
	return json({ ...data, snapshot: hydrateProject(data.snapshot) });
};
