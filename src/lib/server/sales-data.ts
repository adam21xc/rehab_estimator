import { error } from '@sveltejs/kit';
import { authClient } from '$lib/server/rehab-auth';
import type { RawSale } from '$lib/sales/analytics';
let cache: { id: string; rows: RawSale[] } | null = null;
export async function loadSalesSnapshot() {
	const db = authClient();
	const { data: snapshot, error: failure } = await db
		.from('gateway_imports')
		.select('id,expected_rows,loaded_rows,captured_at,completed_at')
		.eq('county', '49')
		.eq('source_year', 2026)
		.eq('status', 'complete')
		.order('completed_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (failure) error(503, 'Sales data is temporarily unavailable.');
	if (!snapshot) return null;
	if (cache?.id !== snapshot.id) {
		const rows: RawSale[] = [];
		for (let offset = 0; offset < snapshot.loaded_rows; offset += 1000) {
			const result = await db
				.from('gateway_sales')
				.select('raw')
				.eq('import_id', snapshot.id)
				.order('ordinal')
				.range(offset, offset + 999);
			if (result.error) error(503, 'Unable to load the complete sales snapshot. Please retry.');
			rows.push(...(result.data || []).map((r) => r.raw as RawSale));
		}
		if (rows.length !== snapshot.loaded_rows) error(503, 'Sales snapshot is incomplete.');
		cache = { id: snapshot.id, rows };
	}
	return { snapshot, rows: cache!.rows };
}
