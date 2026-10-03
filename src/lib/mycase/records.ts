export const CASE_TYPES: Record<string, string> = {
	MF: 'Mortgage foreclosure',
	EU: 'Unsupervised estate',
	EVSC: 'Eviction · small claims',
	EVCD: 'Eviction · civil docket'
};
export const COUNTIES: Record<string, string> = {
	'49': 'Marion',
	'32': 'Hendricks',
	'79': 'Tippecanoe'
};
export type CaseRow = {
	case_number: string;
	style: string | null;
	file_date: string | null;
	status: string | null;
	case_type: string | null;
	case_type_code: string;
	court: string | null;
	county_code: string | null;
	primary_plaintiff_name: string | null;
	primary_defendant_name: string | null;
	primary_defendant_address: string | null;
	updated_at: string;
};
export type Party = { name?: string; role?: string; address?: { formatted?: string } | null };
export type CaseDetail = CaseRow & {
	case_about: string | null;
	parties: Party[];
	timeline?: { available: boolean; events: import('./timeline').TimelineEvent[] };
};
export function filingDate(value: string | null) {
	if (!value) return null;
	const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
	const iso = match
		? `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`
		: value.slice(0, 10);
	const d = new Date(`${iso}T00:00:00Z`);
	return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}
export function selectCases(rows: CaseRow[], params: URLSearchParams) {
	const q = (params.get('q') || '').trim().toLowerCase().slice(0, 150);
	const county = params.get('county') || '',
		type = params.get('type') || '';
	const oldest = params.get('sort') === 'oldest';
	const supported = rows.filter((r) => Object.hasOwn(CASE_TYPES, r.case_type_code));
	const filtered = supported.filter(
		(r) =>
			(!county || r.county_code === county) &&
			(!type || r.case_type_code === type) &&
			(!q ||
				[
					r.case_number,
					r.style,
					r.primary_plaintiff_name,
					r.primary_defendant_name,
					r.primary_defendant_address
				].some((v) => v?.toLowerCase().includes(q)))
	);
	filtered.sort((a, b) => {
		const x = filingDate(a.file_date),
			y = filingDate(b.file_date);
		if (!x) return y ? 1 : a.case_number.localeCompare(b.case_number);
		if (!y) return -1;
		return (
			(oldest ? x.localeCompare(y) : y.localeCompare(x)) ||
			a.case_number.localeCompare(b.case_number)
		);
	});
	const page = Math.min(
		Math.max(1, Number(params.get('page')) || 1),
		Math.max(1, Math.ceil(filtered.length / 25))
	);
	return {
		cases: filtered.slice((page - 1) * 25, page * 25),
		count: filtered.length,
		page,
		pageSize: 25,
		total: supported.length,
		lastUpdated:
			supported
				.map((r) => r.updated_at)
				.filter(Boolean)
				.sort()
				.at(-1) || null,
		counties: [
			...new Set(supported.map((r) => r.county_code).filter((s): s is string => !!s))
		].sort()
	};
}
