import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/rehab-auth';
import { loadSalesSnapshot } from '$lib/server/sales-data';
import { analyzeSales } from '$lib/sales/analytics';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async (event) => {
	await requireUser(event);
	const loaded = await loadSalesSnapshot();
	if (!loaded) error(404, 'No sales snapshot is available.');
	const analysis = analyzeSales(loaded.rows, false);
	const transactions = analysis.transactions.filter((r) => r.parcel === event.params.parcel);
	if (!transactions.length) error(404, 'This parcel was not found in the current sales snapshot.');
	const selected =
		transactions.find((r) => r.id === event.url.searchParams.get('record')) || transactions[0];
	return json({
		parcel: event.params.parcel,
		address: selected.address || transactions.find((r) => r.address)?.address || '',
		selectedId: selected.id,
		transactions,
		matches: analysis.matches.filter((r) => r.parcel === event.params.parcel),
		cutoff: analysis.stats.lastSale,
		capturedAt: loaded.snapshot.captured_at
	});
};
