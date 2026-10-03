import { json, error } from '@sveltejs/kit';
import { requireUser, authClient } from '$lib/server/rehab-auth';
import { caseTimeline } from '$lib/mycase/timeline';
import { CASE_TYPES } from '$lib/mycase/records';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async (event) => {
	await requireUser(event);
	const { data, error: failure } = await authClient()
		.from('indiana_cases')
		.select(
			'case_number,style,file_date,status,case_type,case_type_code,court,county_code,primary_plaintiff_name,primary_defendant_name,primary_defendant_address,updated_at,case_about,parties,raw_json'
		)
		.eq('case_number', event.params.id)
		.in('case_type_code', Object.keys(CASE_TYPES))
		.maybeSingle();
	if (failure) error(503, 'MyCase details are unavailable. Please try again.');
	if (!data) error(404, 'Case not found in the MyCase lead inbox.');
	const { raw_json, ...record } = data;
	return json({ case: { ...record, timeline: caseTimeline(raw_json) } });
};
