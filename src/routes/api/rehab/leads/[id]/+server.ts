import { json, error } from '@sveltejs/kit';
import { requireUser, authClient } from '$lib/server/rehab-auth';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async (event) => {
	await requireUser(event);
	const db = authClient();
	const { data, error: failure } = await db
		.from('accela_cases')
		.select(
			'agency,case_number,address,filed_date,case_type,record_status,source_url,owners,occupants,violators,project_description,violation_details,parcel_information,detail_checked_at,detail_changed_at,first_seen_at,detail_failures'
		)
		.eq('agency', 'INDY')
		.eq('case_number', event.params.id)
		.maybeSingle();
	if (failure) error(503, 'Case details are unavailable. Please try again.');
	if (!data) error(404, 'Case not found.');
	return json({ lead: data });
};
