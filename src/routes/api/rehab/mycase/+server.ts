import { json, error } from '@sveltejs/kit';
import { requireUser, authClient } from '$lib/server/rehab-auth';
import { CASE_TYPES, selectCases, type CaseRow } from '$lib/mycase/records';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async (event) => {
	await requireUser(event);
	const page = Number(event.url.searchParams.get('page') || 1);
	if (!Number.isInteger(page) || page < 1 || page > 100000) error(400, 'Invalid page.');
	const db = authClient(),
		rows: CaseRow[] = [];
	// The legacy scraper stores MM/DD/YYYY text. Sort parsed dates, not lexicographic text.
	for (let start = 0; ; start += 1000) {
		const result = await db
			.from('indiana_cases')
			.select(
				'case_number,style,file_date,status,case_type,case_type_code,court,county_code,primary_plaintiff_name,primary_defendant_name,primary_defendant_address,updated_at'
			)
			.in('case_type_code', Object.keys(CASE_TYPES))
			.order('case_number')
			.range(start, start + 999);
		if (result.error) error(503, 'MyCase data is unavailable. Please try again.');
		rows.push(...(result.data || []));
		if ((result.data?.length || 0) < 1000) break;
	}
	return json(selectCases(rows, event.url.searchParams));
};
