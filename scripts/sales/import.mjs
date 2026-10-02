import { readFile } from 'node:fs/promises';
import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';
const env = loadEnv('development', process.cwd(), '');
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false }
});
const input = JSON.parse(await readFile('.sales-data/marion-2026.json', 'utf8'));
if (input.data.length !== input.recordsFiltered)
	throw new Error('Only publish a complete validated snapshot');
const { data: run, error } = await db
	.from('gateway_imports')
	.insert({
		county: '49',
		source_year: 2026,
		expected_rows: input.recordsFiltered,
		captured_at: input.capturedAt,
		status: 'loading'
	})
	.select('id')
	.single();
if (error) throw error;
try {
	for (let i = 0; i < input.data.length; i += 250) {
		const { error } = await db.from('gateway_sales').insert(
			input.data.slice(i, i + 250).map((raw, j) => ({
				import_id: run.id,
				ordinal: i + j,
				sdf_id: raw.sdF_ID,
				parcel_number: raw.parcelNumber,
				raw
			}))
		);
		if (error) throw error;
	}
	const { count, error: countError } = await db
		.from('gateway_sales')
		.select('*', { count: 'exact', head: true })
		.eq('import_id', run.id);
	if (countError || count !== input.recordsFiltered) throw new Error('Stored count mismatch');
	const { error: finish } = await db
		.from('gateway_imports')
		.update({ loaded_rows: count, status: 'complete', completed_at: new Date().toISOString() })
		.eq('id', run.id);
	if (finish) throw finish;
	console.log(JSON.stringify({ importId: run.id, rows: count, status: 'complete' }));
} catch (e) {
	await db.from('gateway_imports').update({ status: 'failed' }).eq('id', run.id);
	throw e;
}
