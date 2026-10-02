export type RawSale = {
	sdF_ID: string;
	parcelNumber: string;
	parcelAddress: string;
	salesPrice: string;
	saleDate: string;
	conveyanceDate: string;
	dateReceived: string;
	transferDate: string;
	buyerName: string;
	buyerCompany: string;
	sellerName: string;
	sellerCompany: string;
	propertyClassCode: string;
	validTrending: string;
};
export const entityKey = (name: string) =>
	name.normalize('NFKC').toUpperCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
export const amount = (value: string) => {
	const n = Number(String(value ?? '').replace(/[$,\s]/g, ''));
	return Number.isFinite(n) && n > 0 ? n : null;
};
const mean = (values: number[]) =>
	values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const median = (values: number[]) => {
	const a = [...values].sort((a, b) => a - b);
	const n = a.length;
	return n ? (a[Math.floor(n / 2)] + a[Math.floor((n - 1) / 2)]) / 2 : null;
};
function saleDate(value: string) {
	const date = String(value || '').slice(0, 10);
	return /^2026-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) ? date : null;
}
export function analyzeSales(raw: RawSale[], residential = true) {
	const sdfParcels = new Map<string, Set<string>>();
	for (const row of raw) {
		const parcels = sdfParcels.get(row.sdF_ID) || new Set();
		parcels.add(row.parcelNumber);
		sdfParcels.set(row.sdF_ID, parcels);
	}
	const signatures = new Map<string, Set<string>>();
	for (const r of raw) {
		const key = `${r.sdF_ID}|${r.parcelNumber}`;
		const set = signatures.get(key) || new Set<string>();
		set.add(
			JSON.stringify([
				amount(r.salesPrice),
				r.saleDate,
				entityKey(r.buyerCompany || r.buyerName || ''),
				entityKey(r.sellerCompany || r.sellerName || ''),
				r.propertyClassCode
			])
		);
		signatures.set(key, set);
	}
	const ambiguous = new Set([...signatures].filter(([, v]) => v.size > 1).map(([k]) => k));
	const seen = new Set<string>();
	const allRows = raw
		.filter((r) => {
			const key = `${r.sdF_ID}|${r.parcelNumber}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.map((r) => ({
			id: r.sdF_ID,
			parcel: r.parcelNumber,
			address: r.parcelAddress,
			price: ambiguous.has(`${r.sdF_ID}|${r.parcelNumber}`) ? null : amount(r.salesPrice),
			ambiguous: ambiguous.has(`${r.sdF_ID}|${r.parcelNumber}`),
			date: saleDate(r.saleDate),
			buyer: (r.buyerCompany || r.buyerName || '').trim(),
			seller: (r.sellerCompany || r.sellerName || '').trim(),
			buyerKey: entityKey(r.buyerCompany || r.buyerName || ''),
			sellerKey: entityKey(r.sellerCompany || r.sellerName || ''),
			multi: (sdfParcels.get(r.sdF_ID)?.size || 0) > 1,
			residential: Number(r.propertyClassCode) >= 500 && Number(r.propertyClassCode) < 600,
			valid: r.validTrending === 'Y'
		}));
	const rows = allRows.filter((r) => !residential || r.residential);
	const eligible = rows.filter((r) => r.price !== null && r.date && !r.multi && r.parcel);
	const dated = rows.filter((r) => r.date);
	type Actor = {
		key: string;
		name: string;
		buyPrices: number[];
		sellPrices: number[];
		spreads: number[];
		holds: number[];
	};
	const actors = new Map<string, Actor>();
	const actor = (key: string, name: string) => {
		if (!actors.has(key))
			actors.set(key, { key, name, buyPrices: [], sellPrices: [], spreads: [], holds: [] });
		return actors.get(key)!;
	};
	for (const r of eligible) {
		if (r.buyerKey) actor(r.buyerKey, r.buyer).buyPrices.push(r.price!);
		if (r.sellerKey) actor(r.sellerKey, r.seller).sellPrices.push(r.price!);
	}
	const byParcel = new Map<string, typeof eligible>();
	// Keep ALL dated source transfers in the sequence so an excluded transfer cannot be skipped.
	for (const r of allRows.filter((r) => r.date && r.parcel)) {
		const group = byParcel.get(r.parcel) || [];
		group.push(r);
		byParcel.set(r.parcel, group);
	}

	const matches: {
		actor: string;
		actorKey: string;
		parcel: string;
		address: string;
		buyId: string;
		sellId: string;
		bought: string;
		sold: string;
		buyPrice: number;
		sellPrice: number;
		spread: number;
		days: number;
	}[] = [];
	const sameDay: {
		parcel: string;
		address: string;
		date: string;
		transfers: { id: string; buyer: string; seller: string; price: number | null }[];
	}[] = [];
	const inventory: {
		id: string;
		parcel: string;
		address: string;
		buyer: string;
		bought: string;
		price: number;
		observedDays: number;
	}[] = [];
	const inventoryAsOf =
		allRows
			.map((r) => r.date || '')
			.sort()
			.at(-1) || null;
	const uncertainParcels = new Set(
		allRows.filter((r) => !r.date || r.ambiguous).map((r) => r.parcel)
	);
	let sameDayGroups = 0;
	for (const [parcel, transactions] of byParcel) {
		const group = [...new Map(transactions.map((r) => [r.id, r])).values()].sort(
			(a, b) => a.date!.localeCompare(b.date!) || a.id.localeCompare(b.id)
		);
		const dayCounts = new Map<string, number>();
		for (const r of group) dayCounts.set(r.date!, (dayCounts.get(r.date!) || 0) + 1);
		sameDayGroups += [...dayCounts.entries()].filter(
			([day, n]) => n > 1 && group.some((r) => r.date === day && (!residential || r.residential))
		).length;
		for (const [day, n] of dayCounts) {
			const transfers = group.filter((r) => r.date === day);
			if (n > 1 && transfers.some((r) => !residential || r.residential))
				sameDay.push({
					parcel,
					address: transfers[0].address,
					date: day,
					transfers: transfers.map((r) => ({
						id: r.id,
						buyer: r.buyer,
						seller: r.seller,
						price: r.price
					}))
				});
		}
		const latest = group.at(-1)!;
		if (
			inventoryAsOf &&
			!uncertainParcels.has(parcel) &&
			dayCounts.get(latest.date!) === 1 &&
			(!residential || latest.residential) &&
			latest.price &&
			!latest.multi &&
			latest.buyerKey &&
			latest.buyerKey !== latest.sellerKey
		) {
			inventory.push({
				id: latest.id,
				parcel,
				address: latest.address,
				buyer: latest.buyer,
				bought: latest.date!,
				price: latest.price,
				observedDays: Math.round((Date.parse(inventoryAsOf) - Date.parse(latest.date!)) / 86400000)
			});
		}
		for (let i = 1; i < group.length; i++) {
			const buy = group[i - 1],
				sell = group[i];
			if (
				(residential && (!buy.residential || !sell.residential)) ||
				!buy.price ||
				!sell.price ||
				buy.multi ||
				sell.multi ||
				!buy.buyerKey ||
				buy.buyerKey !== sell.sellerKey ||
				buy.buyerKey === buy.sellerKey ||
				sell.buyerKey === sell.sellerKey ||
				dayCounts.get(buy.date!) !== 1 ||
				dayCounts.get(sell.date!) !== 1
			)
				continue;
			const days = Math.round((Date.parse(sell.date!) - Date.parse(buy.date!)) / 86400000);
			if (days <= 0) continue;
			const spread = sell.price - buy.price;
			matches.push({
				actor: buy.buyer,
				actorKey: buy.buyerKey,
				parcel,
				address: sell.address,
				buyId: buy.id,
				sellId: sell.id,
				bought: buy.date!,
				sold: sell.date!,
				buyPrice: buy.price,
				sellPrice: sell.price,
				spread,
				days
			});
			const a = actor(buy.buyerKey, buy.buyer);
			a.spreads.push(spread);
			a.holds.push(days);
		}
	}
	const months = Array.from({ length: 12 }, (_, i) => {
		const month = `2026-${String(i + 1).padStart(2, '0')}`;
		const entries = eligible.filter((r) => r.date!.startsWith(month));
		return { month, count: entries.length, medianPrice: median(entries.map((r) => r.price!)) };
	});
	return {
		inventoryAsOf,
		inventory,
		stats: {
			rows: rows.length,
			duplicateRows: raw.length - allRows.length,
			ambiguousRows: rows.filter((r) => r.ambiguous).length,
			transactions: new Set(rows.map((r) => r.id)).size,
			eligible: eligible.length,
			multiParcelRows: rows.filter((r) => r.multi).length,
			missingPriceOrDate: rows.filter((r) => !r.date || !r.price).length,
			buyers: actors.size ? [...actors.values()].filter((a) => a.buyPrices.length).length : 0,
			medianPrice: median(eligible.map((r) => r.price!)),
			matchedResales: matches.length,
			medianSpread: median(matches.map((r) => r.spread)),
			medianHold: median(matches.map((r) => r.days)),
			quickResales: matches.filter((r) => r.days <= 30).length,
			sameDayGroups,
			firstSale: dated.map((r) => r.date!).sort()[0] || null,
			lastSale:
				dated
					.map((r) => r.date!)
					.sort()
					.at(-1) || null
		},
		actors: [...actors.values()]
			.map((a) => ({
				key: a.key,
				name: a.name,
				purchases: a.buyPrices.length,
				sales: a.sellPrices.length,
				averageBuy: mean(a.buyPrices),
				averageSell: mean(a.sellPrices),
				matchedResales: a.spreads.length,
				averageSpread: mean(a.spreads),
				medianHold: median(a.holds)
			}))
			.sort((a, b) => b.purchases - a.purchases || a.name.localeCompare(b.name)),
		sameDay: sameDay.sort((a, b) => b.date.localeCompare(a.date)),
		matches: matches.sort((a, b) => b.sold.localeCompare(a.sold)),
		months,
		transactions: rows
			.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.id.localeCompare(b.id))
			.map((r) => ({
				id: r.id,
				parcel: r.parcel,
				address: r.address,
				price: r.price,
				ambiguous: r.ambiguous,
				date: r.date,
				buyer: r.buyer,
				seller: r.seller,
				multi: r.multi,
				valid: r.valid
			}))
	};
}

// Undated transfers stay last in either direction. Sorting happens before pagination.
export function chronological<T>(rows: T[], date: (row: T) => string | null, order: string) {
	return [...rows].sort((a, b) => {
		const x = date(a),
			y = date(b);
		if (!x) return y ? 1 : 0;
		if (!y) return -1;
		return order === 'oldest' ? x.localeCompare(y) : y.localeCompare(x);
	});
}
