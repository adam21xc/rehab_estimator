import { json, error } from '@sveltejs/kit';
import { requireUser, authClient } from '$lib/server/rehab-auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	await requireUser(event); // Validates the session AND the workspace email allowlist.
	// Source tables are private. Only this authorized server endpoint uses service-role reads.
	const db = authClient();
	const params = event.url.searchParams;
	const page = Math.max(1, Math.min(100000, Number(params.get('page')) || 1));
	if (!Number.isInteger(page)) error(400, 'Invalid page.');
	const q = (params.get('q') || '')
		.trim()
		.slice(0, 120)
		.replace(/[^\p{L}\p{N}\s-]/gu, ' ');
	const status = params.get('status') || '';
	const readiness = params.get('readiness') || '';
	const sort = params.get('sort') === 'oldest';
	let query = db
		.from('accela_cases')
		.select(
			'agency,case_number,address,filed_date,case_type,record_status,owners,occupants,violators,detail_checked_at,detail_failures',
			{ count: 'exact' }
		)
		.eq('agency', 'INDY');
	if (q) query = query.or(`address.ilike.%${q}%,case_number.ilike.%${q}%`);
	if (status === 'closed') query = query.ilike('record_status', 'Closed%');
	if (status === 'active')
		query = query.not('record_status', 'ilike', 'Closed%').neq('record_status', 'Void');
	if (status === 'void') query = query.eq('record_status', 'Void');
	if (readiness === 'ready') query = query.not('detail_checked_at', 'is', null);
	if (readiness === 'pending') query = query.is('detail_checked_at', null);
	if (readiness === 'retry') query = query.gt('detail_failures', 0);
	const [rows, total, ready, retry, run, first, last] = await Promise.all([
		query
			.order('filed_date', { ascending: sort })
			.order('case_number', { ascending: sort })
			.range((page - 1) * 25, page * 25 - 1),
		db.from('accela_cases').select('*', { count: 'exact', head: true }).eq('agency', 'INDY'),
		db
			.from('accela_cases')
			.select('*', { count: 'exact', head: true })
			.eq('agency', 'INDY')
			.not('detail_checked_at', 'is', null),
		db
			.from('accela_cases')
			.select('*', { count: 'exact', head: true })
			.eq('agency', 'INDY')
			.gt('detail_failures', 0),
		db
			.from('accela_import_runs')
			.select('started_at,finished_at,status,window_start,window_end,metrics')
			.order('started_at', { ascending: false })
			.limit(1),
		db
			.from('accela_cases')
			.select('filed_date')
			.eq('agency', 'INDY')
			.not('filed_date', 'is', null)
			.order('filed_date')
			.limit(1),
		db
			.from('accela_cases')
			.select('filed_date')
			.eq('agency', 'INDY')
			.not('filed_date', 'is', null)
			.order('filed_date', { ascending: false })
			.limit(1)
	]);
	if ([rows, total, ready, retry, run, first, last].some((r) => r.error))
		error(503, 'Lead data is unavailable. Please try again.');
	return json({
		leads: rows.data,
		count: rows.count,
		page,
		pageSize: 25,
		stats: { total: total.count, ready: ready.count, retry: retry.count },
		coverage: {
			firstFiled: first.data?.[0]?.filed_date || null,
			lastFiled: last.data?.[0]?.filed_date || null
		},
		lastRun: run.data?.[0] || null
	});
};
