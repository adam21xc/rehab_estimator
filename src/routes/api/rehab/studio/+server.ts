import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/rehab-auth';
import { hydrateProject } from '$lib/server/rehab-data';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async (event) => {
	const { db, user } = await requireUser(event);
	const { data, error: failure } = await db
		.from('rehab_estimates')
		.select('id,address,snapshot,created_at')
		.eq('user_id', user.id)
		.eq('snapshot->meta->>kind', 'studio')
		.order('created_at', { ascending: false })
		.limit(50);
	if (failure) error(503, 'Unable to load your studio history.');
	return json({
		sessions: data.map((row) => ({ ...row, snapshot: hydrateProject(row.snapshot) }))
	});
};
