import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/rehab-auth';
import { analyzeSales, chronological, entityKey } from '$lib/sales/analytics';
import { loadSalesSnapshot } from '$lib/server/sales-data';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async (event) => {
	await requireUser(event);
	const loaded = await loadSalesSnapshot();
	if (!loaded) return json({ snapshot: null });
	const { snapshot, rows } = loaded;
	const scope = event.url.searchParams.get('scope') === 'all' ? 'all' : 'residential';
	if (!rows) error(503, 'Sales snapshot is unavailable.');
	const analysis = analyzeSales(rows, scope === 'residential');
	const q = entityKey((event.url.searchParams.get('q') || '').slice(0, 150));
	const sort = event.url.searchParams.get('sort') || 'purchases';
	const actors = analysis.actors.filter((a) => !q || entityKey(a.name).includes(q));
	if (sort === 'sales') actors.sort((a, b) => b.sales - a.sales || b.purchases - a.purchases);
	if (sort === 'resales')
		actors.sort((a, b) => b.matchedResales - a.matchedResales || b.purchases - a.purchases);
	const dateOrder = event.url.searchParams.get('dateOrder') === 'oldest' ? 'oldest' : 'newest';
	const requestedPage = Number(event.url.searchParams.get('page') || 1);
	if (!Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage > 100000)
		error(400, 'Invalid page.');
	const matches = chronological(
		analysis.matches.filter((m) => !q || entityKey(m.actor).includes(q)),
		(m) => m.sold,
		dateOrder
	);
	const inventory = chronological(
		analysis.inventory.filter((r) => !q || entityKey(r.buyer).includes(q)),
		(r) => r.bought,
		dateOrder
	);
	const transactions = chronological(
		analysis.transactions.filter(
			(r) => !q || entityKey(r.buyer).includes(q) || entityKey(r.seller).includes(q)
		),
		(r) => r.date,
		dateOrder
	);
	const sameDay = chronological(
		analysis.sameDay.filter(
			(g) =>
				!q ||
				g.transfers.some((r) => entityKey(r.buyer).includes(q) || entityKey(r.seller).includes(q))
		),
		(r) => r.date,
		dateOrder
	);
	const counts = {
		buyers: actors.length,
		resales: matches.length,
		inventory: inventory.length,
		transfers: transactions.length,
		sameday: sameDay.length
	};
	const view = event.url.searchParams.get('view') || 'buyers';
	const count = counts[view as keyof typeof counts] ?? counts.buyers;
	const page = Math.min(requestedPage, Math.max(1, Math.ceil(count / 50)));
	const slice = <T>(rows: T[]) => rows.slice((page - 1) * 50, page * 50);
	return json({
		snapshot,
		scope,
		stats: analysis.stats,
		months: analysis.months,
		actors: slice(actors),
		actorCount: actors.length,
		matches: slice(matches),
		matchCount: matches.length,
		inventory: slice(inventory),
		inventoryAsOf: analysis.inventoryAsOf,
		sameDay: slice(sameDay),
		transactions: slice(transactions),
		counts,
		page,
		pageSize: 50
	});
};
