import { it, expect } from 'vitest';
import { filingDate, selectCases, type CaseRow } from './records';
const row = (n: string, date: string, type = 'MF'): CaseRow => ({
	case_number: n,
	file_date: date,
	case_type_code: type,
	county_code: '49',
	primary_defendant_name: 'Example Person',
	primary_defendant_address: 'Mailing only',
	primary_plaintiff_name: 'Lender',
	updated_at: '2026-02-19T00:00:00Z',
	style: null,
	status: 'Pending',
	case_type: null,
	court: null
});
it('sorts filing dates chronologically across years and excludes unrelated case types', () => {
	const rows = [
		row('a', '12/31/2025'),
		row('b', '01/01/2026'),
		row('c', '02/31/2026'),
		row('criminal', '02/01/2026', 'CM')
	];
	expect(selectCases(rows, new URLSearchParams()).cases.map((r) => r.case_number)).toEqual([
		'b',
		'a',
		'c'
	]);
	expect(
		selectCases(rows, new URLSearchParams('sort=oldest')).cases.map((r) => r.case_number)
	).toEqual(['a', 'b', 'c']);
	expect(filingDate('02/31/2026')).toBeNull();
});
it('filters before paginating and clamps pages after filtering', () => {
	const rows = Array.from({ length: 30 }, (_, i) => row(String(i).padStart(2, '0'), '02/01/2026'));
	expect(selectCases(rows, new URLSearchParams('page=2')).cases).toHaveLength(5);
	expect(selectCases(rows, new URLSearchParams('q=29&page=2'))).toMatchObject({
		count: 1,
		page: 1
	});
	expect(selectCases(rows, new URLSearchParams('county=32')).count).toBe(0);
	expect(selectCases(rows, new URLSearchParams('type=EU')).count).toBe(0);
});
