import { describe, it, expect } from 'vitest';
import { analyzeSales, chronological, type RawSale } from './analytics';
const row = (
	id: string,
	date: string,
	buyer: string,
	seller: string,
	price: string,
	extra: Partial<RawSale> = {}
): RawSale => ({
	sdF_ID: id,
	parcelNumber: 'p1',
	parcelAddress: 'Example',
	salesPrice: price,
	saleDate: date,
	conveyanceDate: date,
	dateReceived: date,
	transferDate: date,
	buyerName: buyer,
	buyerCompany: '',
	sellerName: seller,
	sellerCompany: '',
	propertyClassCode: '510',
	validTrending: 'Y',
	...extra
});
describe('sales intelligence', () => {
	it('uses matched parcels and parties, not unrelated average prices, to compute spreads', () => {
		const result = analyzeSales([
			row('a', '2026-01-01', 'Example LLC', 'Owner', '100,000'),
			row('b', '2026-01-11', 'End buyer', 'EXAMPLE LLC', '130,000'),
			row('c', '2026-02-01', 'Example LLC', 'Owner 2', '900,000', { parcelNumber: 'p2' })
		]);
		expect(result.matches[0]).toMatchObject({ spread: 30000, days: 10 });
		expect(result.actors.find((a) => a.key === 'EXAMPLE LLC')).toMatchObject({
			averageBuy: 500000,
			averageSell: 130000,
			averageSpread: 30000,
			medianHold: 10
		});
	});
	it('excludes ambiguous same-day sequences and multi-parcel amounts', () => {
		const result = analyzeSales([
			row('a', '2026-01-01', 'Dealer', 'Owner', '100'),
			row('b', '2026-01-01', 'Buyer', 'Dealer', '200'),
			row('bundle', '2026-02-01', 'X', 'Y', '500', { parcelNumber: 'p3' }),
			row('bundle', '2026-02-01', 'X', 'Y', '500', { parcelNumber: 'p4' })
		]);
		expect(result.matches).toHaveLength(0);
		expect(result.stats.multiParcelRows).toBe(2);
		expect(result.stats.sameDayGroups).toBe(1);
	});
	it('deduplicates identical rows and excludes conflicting records', () => {
		const a = row('a', '2026-01-01', 'Buyer', 'Owner', '100');
		const result = analyzeSales([a, a, { ...a, salesPrice: '200' }]);
		expect(result.stats.duplicateRows).toBe(2);
		expect(result.stats.ambiguousRows).toBe(1);
		expect(result.stats.eligible).toBe(0);
	});
	it('does not skip a zero-dollar intermediate transfer to fabricate a resale', () => {
		const result = analyzeSales([
			row('a', '2026-01-01', 'Dealer', 'Owner', '100'),
			row('b', '2026-01-02', 'Other', 'Dealer', '0'),
			row('c', '2026-01-11', 'Buyer', 'Dealer', '200')
		]);
		expect(result.matches).toHaveLength(0);
	});
	it('preserves losses and unknown prices without inventing zero profit', () => {
		const result = analyzeSales([
			row('a', '2026-01-01', 'Dealer', 'Owner', '100'),
			row('b', '2026-01-11', 'Buyer', 'Dealer', '70')
		]);
		expect(result.stats.medianSpread).toBe(-30);
		expect(analyzeSales([]).stats.medianSpread).toBeNull();
	});
});

it('inventory uses the final observed transfer and ages only to the snapshot cutoff', () => {
	const result = analyzeSales([
		row('a', '2026-01-01', 'Dealer', 'Owner', '100'),
		row('b', '2026-02-01', 'Other', 'Alias', '200'),
		row('c', '2026-01-01', 'Dealer', 'Owner', '100', { parcelNumber: 'p2' })
	]);
	expect(result.inventory.filter((r) => r.buyer === 'Dealer')).toEqual([
		expect.objectContaining({ parcel: 'p2', observedDays: 31 })
	]);
	expect(result.inventoryAsOf).toBe('2026-02-01');
});
it('inventory excludes ambiguous, undated, bundled and later zero-price transfers', () => {
	for (const next of [
		row('b', '2026-02-01', 'Other', 'Dealer', '0'),
		row('b', '', 'Other', 'Dealer', '200'),
		row('b', '2026-01-01', 'Other', 'Dealer', '200')
	]) {
		expect(
			analyzeSales([row('a', '2026-01-01', 'Dealer', 'Owner', '100'), next]).inventory
		).toHaveLength(0);
	}
	const a = row('a', '2026-01-01', 'Dealer', 'Owner', '100');
	expect(analyzeSales([a, { ...a, buyerName: 'Conflict' }]).inventory).toHaveLength(0);
	expect(analyzeSales([a, { ...a, parcelNumber: 'p2' }]).inventory).toHaveLength(0);
});
it('sorts both directions with undated records last without mutating input', () => {
	const rows = [{ date: null }, { date: '2026-02-01' }, { date: '2026-01-01' }];
	expect(chronological(rows, (r) => r.date, 'oldest').map((r) => r.date)).toEqual([
		'2026-01-01',
		'2026-02-01',
		null
	]);
	expect(chronological(rows, (r) => r.date, 'newest').map((r) => r.date)).toEqual([
		'2026-02-01',
		'2026-01-01',
		null
	]);
	expect(rows[0].date).toBeNull();
});
