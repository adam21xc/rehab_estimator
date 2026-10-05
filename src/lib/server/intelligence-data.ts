import { error } from '@sveltejs/kit';
import { authClient } from './rehab-auth';
import { loadSalesSnapshot } from './sales-data';
import { analyzeSales } from '$lib/sales/analytics';
import { CASE_TYPES, type CaseRow } from '$lib/mycase/records';
import { groupProperties, type Indicator } from '$lib/intelligence/properties';

type Accela = {
	case_number: string;
	address: string | null;
	filed_date: string | null;
	case_type: string;
	record_status: string;
};
let cache: { at: number; value: Awaited<ReturnType<typeof readSources>> } | undefined;
async function readSources() {
	const db = authClient();
	const accela: Accela[] = [],
		cases: CaseRow[] = [];
	const sales = await loadSalesSnapshot();
	for (let start = 0; ; start += 1000) {
		const result = await db
			.from('accela_cases')
			.select('case_number,address,filed_date,case_type,record_status')
			.eq('agency', 'INDY')
			.order('case_number')
			.range(start, start + 999);
		if (result.error) error(503, 'Accela map records are unavailable.');
		accela.push(...(result.data || []));
		if ((result.data?.length || 0) < 1000) break;
	}
	for (let start = 0; ; start += 1000) {
		const result = await db
			.from('indiana_cases')
			.select('case_number,primary_defendant_address,file_date,case_type,case_type_code,status')
			.in('case_type_code', Object.keys(CASE_TYPES))
			.order('case_number')
			.range(start, start + 999);
		if (result.error) error(503, 'MyCase map records are unavailable.');
		cases.push(...((result.data as CaseRow[]) || []));
		if ((result.data?.length || 0) < 1000) break;
	}
	const transactions = sales ? analyzeSales(sales.rows, false).transactions : [];
	const records: Indicator[] = [
		...accela.map((r) => ({
			id: r.case_number,
			source: 'accela' as const,
			address: r.address || '',
			date: r.filed_date,
			title: r.case_type || 'Code enforcement',
			status: r.record_status,
			addressRole: 'property' as const
		})),
		...cases.map((r) => ({
			id: r.case_number,
			source: 'mycase' as const,
			address: r.primary_defendant_address || '',
			date: r.file_date,
			title: CASE_TYPES[r.case_type_code] || r.case_type || 'Court record',
			status: r.status || '',
			addressRole: 'defendant' as const
		})),
		...transactions.map((r) => ({
			id: `${r.id}:${r.parcel}`,
			source: 'sales' as const,
			address: r.address || '',
			date: r.date,
			title: 'Recorded transfer',
			parcel: r.parcel,
			buyer: r.buyer,
			seller: r.seller,
			price: r.price,
			multiParcel: r.multi,
			addressRole: 'property' as const
		}))
	];
	return {
		...groupProperties(records),
		counts: { accela: accela.length, mycase: cases.length, sales: transactions.length },
		salesCoverage: sales
			? {
					capturedAt: sales.snapshot.captured_at,
					from:
						transactions
							.map((r) => r.date)
							.filter(Boolean)
							.sort()[0] || null,
					to:
						transactions
							.map((r) => r.date)
							.filter(Boolean)
							.sort()
							.at(-1) || null,
					year: 2026,
					county: 'Marion'
				}
			: null
	};
}
export async function loadMapSources() {
	if (!cache || Date.now() - cache.at > 60_000)
		cache = { at: Date.now(), value: await readSources() };
	return structuredClone(cache.value);
}
export async function loadPropertyMap() {
	const data = await loadMapSources(),
		db = authClient();
	let cacheReady = true;
	const locations = new Map<
		string,
		{
			longitude: number | null;
			latitude: number | null;
			status: 'matched' | 'review' | 'failed' | 'pending';
		}
	>();
	for (let start = 0; ; start += 1000) {
		const result = await db
			.from('property_geocodes')
			.select('address_key,longitude,latitude,status')
			.order('address_key')
			.range(start, start + 999);
		if (result.error) {
			if (['PGRST205', '42P01'].includes(result.error.code)) {
				cacheReady = false;
				break;
			}
			error(503, 'Saved map locations are temporarily unavailable.');
		}
		for (const row of result.data || []) locations.set(row.address_key, row);
		if ((result.data?.length || 0) < 1000) break;
	}
	for (const property of data.properties) {
		const location = locations.get(property.key);
		if (!location) continue;
		property.locationStatus = location.status;
		if (
			location.status === 'matched' &&
			Number.isFinite(location.longitude) &&
			Number.isFinite(location.latitude)
		)
			property.coordinates = [location.longitude!, location.latitude!];
	}
	return { ...data, cacheReady };
}
