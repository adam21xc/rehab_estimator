import { filingDate } from '$lib/mycase/records';

export type Source = 'accela' | 'mycase' | 'sales';
export const SOURCE_LABELS: Record<Source, string> = {
	accela: 'Accela',
	mycase: 'MyCase',
	sales: 'Gateway sales'
};
export const SOURCE_COLORS: Record<Source, string> = {
	accela: '#35b9a1',
	mycase: '#e4ac4e',
	sales: '#9c83f5'
};
export type Indicator = {
	id: string;
	source: Source;
	address: string;
	date: string | null;
	title: string;
	status?: string;
	parcel?: string;
	buyer?: string;
	seller?: string;
	price?: number | null;
	multiParcel?: boolean;
	addressRole: 'property' | 'defendant';
};
export type Property = {
	key: string;
	address: string;
	records: Indicator[];
	coordinates: [number, number] | null;
	locationStatus: 'pending' | 'matched' | 'review' | 'failed' | 'missing';
};
// Conservative address identity, not fuzzy entity resolution. Keep units and ZIPs.
const words: Record<string, string> = {
	NORTH: 'N',
	SOUTH: 'S',
	EAST: 'E',
	WEST: 'W',
	NORTHEAST: 'NE',
	NORTHWEST: 'NW',
	SOUTHEAST: 'SE',
	SOUTHWEST: 'SW',
	STREET: 'ST',
	AVENUE: 'AVE',
	AV: 'AVE',
	ROAD: 'RD',
	DRIVE: 'DR',
	BOULEVARD: 'BLVD',
	LANE: 'LN',
	COURT: 'CT',
	PLACE: 'PL',
	CIRCLE: 'CIR',
	PARKWAY: 'PKWY',
	TERRACE: 'TER',
	INDIANA: 'IN',
	APARTMENT: 'UNIT',
	APT: 'UNIT',
	SUITE: 'UNIT',
	STE: 'UNIT'
};
export function addressKey(address: string) {
	return address
		.normalize('NFKC')
		.toUpperCase()
		.replace(/\b(\d{5})-\d{4}\b/g, '$1')
		.replace(/#/g, ' UNIT ')
		.replace(/[.,\n\r]/g, ' ')
		.replace(/\b[A-Z]+\b/g, (word) => words[word] || word)
		.replace(/\s+/g, ' ')
		.trim();
}
export function canGeocode(address: string) {
	return (
		address.length <= 256 &&
		address.trim().split(/\s+/).length <= 20 &&
		!address.includes(';') &&
		/^\d+[A-Z]?(?:[-/]\d+)?\s+\S+/i.test(address.trim()) &&
		!/\bP\.?\s*O\.?\s*BOX\b/i.test(address) &&
		/\b[A-Z]{2}[,\s]+\d{5}(?:-\d{4})?\b/i.test(address)
	);
}
export function groupProperties(records: Indicator[]) {
	const groups = new Map<string, Property>();
	const seen = new Set<string>();
	let missingAddresses = 0;
	for (const record of records) {
		const id = `${record.source}:${record.id}`;
		if (seen.has(id)) continue;
		seen.add(id);
		if (!record.address?.trim()) {
			missingAddresses++;
			continue;
		}
		const key = addressKey(record.address);
		let property = groups.get(key);
		if (!property) {
			property = {
				key,
				address: record.address,
				records: [],
				coordinates: null,
				locationStatus: 'missing'
			};
			groups.set(key, property);
		}
		property.records.push({ ...record, date: filingDate(record.date) });
	}
	return {
		properties: [...groups.values()].sort((a, b) => a.key.localeCompare(b.key)),
		missingAddresses
	};
}
export type MapFilters = {
	sources: Source[];
	from: string;
	to: string;
	query: string;
	multiple: boolean;
};
export function filterProperties(properties: Property[], filters: MapFilters) {
	const query = addressKey(filters.query);
	return properties.flatMap((property) => {
		if (
			query &&
			!addressKey(
				[property.address, ...property.records.map((r) => r.parcel || '')].join(' ')
			).includes(query)
		)
			return [];
		const records = property.records.filter(
			(r) =>
				filters.sources.includes(r.source) &&
				(!filters.from || (!!r.date && r.date >= filters.from)) &&
				(!filters.to || (!!r.date && r.date <= filters.to))
		);
		if (!records.length || (filters.multiple && records.length < 2)) return [];
		return [{ ...property, records }];
	});
}
export function sourceCount(property: Property) {
	return new Set(property.records.map((r) => r.source)).size;
}
export function toGeoJSON(properties: Property[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
	return {
		type: 'FeatureCollection',
		features: properties
			.filter((p) => p.coordinates)
			.map((p) => ({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: p.coordinates! },
				properties: {
					key: p.key,
					count: p.records.length,
					color: sourceCount(p) > 1 ? '#ebeff9' : SOURCE_COLORS[p.records[0].source]
				}
			}))
	};
}
// Display-only offsets; saved coordinates always remain the actual geocode.
export function spiderOffsets(count: number): [number, number][] {
	return Array.from({ length: count }, (_, i) => {
		const ring = Math.floor(i / 12),
			inRing = Math.min(12, count - ring * 12);
		const angle = ((i % 12) / inRing) * Math.PI * 2 - Math.PI / 2,
			radius = 55 + ring * 38;
		return [Math.cos(angle) * radius, Math.sin(angle) * radius];
	});
}
