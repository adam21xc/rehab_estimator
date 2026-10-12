import { describe, expect, it } from 'vitest';
import { recordIcon, propertyIcon, streetView } from './map-icons';
import { toGeoJSON, type Indicator } from './properties';
const record = (caseType: string): Indicator => ({
	id: caseType,
	source: 'mycase',
	caseType,
	address: '123 Main St',
	title: 'Case',
	date: null,
	addressRole: 'defendant'
});
describe('map record types', () => {
	it('keeps all four court types distinct and unknown types usable', () => {
		expect(new Set(['MF', 'EU', 'EVSC', 'EVCD'].map((code) => recordIcon(record(code)))).size).toBe(
			4
		);
		expect(recordIcon(record('UNKNOWN'))).toBe('mycase');
	});
	it('shows a type for repeated cases and a stack for mixed types', () => {
		expect(propertyIcon([record('MF'), record('MF')])).toBe('MF');
		expect(propertyIcon([record('MF'), record('EU')])).toBe('mixed');
		expect(
			toGeoJSON([
				{
					key: 'one',
					address: '123 Main St',
					records: [record('EU')],
					coordinates: [-86, 39],
					locationStatus: 'matched'
				}
			]).features[0].properties?.icon
		).toBe('EU');
	});
	it('uses latitude/longitude ordering and refuses missing or invalid locations', () => {
		expect(streetView([-86, 39])?.link).toContain('viewpoint=39,-86');
		expect(streetView([-86, 39])?.image).toContain('/sv/39,-86.jpg');
		expect(streetView(null)).toBeNull();
		expect(streetView([NaN, 39])).toBeNull();
		expect(streetView([39, 181])).toBeNull();
	});
});
