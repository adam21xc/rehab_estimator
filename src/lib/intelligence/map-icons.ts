import type { Indicator } from './properties';

export const MAP_ICONS = {
	MF: { label: 'Mortgage foreclosure', path: 'M3 11 12 3 21 11 M6 10v11h12V10 M10 21v-7h4v7' },
	EU: { label: 'Unsupervised estate', path: 'M6 3h9l4 4v14H6Z M14 3v5h5 M9 12h7 M9 16h7' },
	EVSC: { label: 'Eviction · small claims', path: 'M5 21V3h12v18 M3 21h18 M13 12h1 M8 6h6' },
	EVCD: {
		label: 'Eviction · civil docket',
		path: 'M4 21V3h16v18 M2 21h20 M8 7h1 M15 7h1 M8 11h1 M15 11h1 M10 21v-6h4v6'
	},
	mycase: { label: 'Court record', path: 'M3 9 12 3 21 9Z M5 11v7 M12 11v7 M19 11v7 M3 21h18' },
	accela: { label: 'Accela', path: 'M12 3 22 21H2Z M12 9v5 M12 17v1' },
	sales: { label: 'Gateway sale', path: 'M3 3h9l9 9-9 9-9-9Z M7 7h1' },
	mixed: {
		label: 'Multiple record types',
		path: 'M12 3 22 8 12 13 2 8Z M2 13l10 5 10-5 M2 18l10 5 10-5'
	}
} as const;
export type MapIcon = keyof typeof MAP_ICONS;
export function recordIcon(record: Pick<Indicator, 'source' | 'caseType'>): MapIcon {
	return record.source === 'mycase' && record.caseType && Object.hasOwn(MAP_ICONS, record.caseType)
		? (record.caseType as MapIcon)
		: record.source;
}
export function propertyIcon(records: Indicator[]): MapIcon {
	const icons = new Set(records.map(recordIcon));
	return icons.size === 1 ? [...icons][0] : 'mixed';
}
export function iconSvg(icon: MapIcon) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><path d="${MAP_ICONS[icon].path}" fill="none" stroke="#152a31" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
export function streetView(coordinates: [number, number] | null) {
	if (!coordinates) return null;
	const [lng, lat] = coordinates;
	if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
		return null;
	return {
		image: `https://img.dealmachine.com/sv/${lat},${lng}.jpg`,
		link: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`
	};
}
