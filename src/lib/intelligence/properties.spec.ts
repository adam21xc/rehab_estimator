import { describe, it, expect } from 'vitest';
import {
	addressKey,
	canGeocode,
	groupProperties,
	filterProperties,
	toGeoJSON,
	spiderOffsets,
	type Indicator
} from './properties';
const record = (overrides: Partial<Indicator> = {}): Indicator => ({
	id: 'one',
	source: 'accela',
	address: '123 North Main Street, Indianapolis, IN, 46201',
	date: '2026-01-01',
	title: 'Code enforcement',
	addressRole: 'property',
	...overrides
});
describe('intelligence property identity and filtering', () => {
	it('joins formatting variants, preserves units and does not merge different ZIPs', () => {
		expect(addressKey(record().address)).toBe(
			addressKey('123 N MAIN ST, INDIANAPOLIS IN 46201-1234')
		);
		expect(addressKey('123 Main St Apt 2')).toBe(addressKey('123 MAIN ST #2'));
		expect(addressKey('123 Main St Apt 2')).not.toBe(addressKey('123 Main St Apt 3'));
		expect(addressKey('123 Main St IN 46201')).not.toBe(addressKey('123 Main St IN 46202'));
	});
	it('requires a complete street address and leaves PO boxes unpinned', () => {
		expect(canGeocode(record().address)).toBe(true);
		expect(canGeocode('123 Main St')).toBe(false);
		expect(canGeocode('PO BOX 123, Indianapolis IN 46201')).toBe(false);
	});
	it('counts distinct source records and records lacking addresses', () => {
		const grouped = groupProperties([
			record(),
			record(),
			record({ source: 'mycase', date: '2/1/2026' }),
			record({ id: 'two', address: '' })
		]);
		expect(grouped.properties).toHaveLength(1);
		expect(grouped.properties[0].records).toHaveLength(2);
		expect(grouped.properties[0].records[1].date).toBe('2026-02-01');
		expect(grouped.missingAddresses).toBe(1);
	});
	it('filters records before computing overlap and excludes undated records within ranges', () => {
		const { properties } = groupProperties([
			record(),
			record({ id: 'court', source: 'mycase', date: null }),
			record({ id: 'sale', source: 'sales', date: '2026-03-01' })
		]);
		const filters = {
			sources: ['accela', 'mycase', 'sales'] as Indicator['source'][],
			from: '2026-02-01',
			to: '2026-04-01',
			query: '',
			multiple: false
		};
		expect(filterProperties(properties, filters)[0].records.map((r) => r.id)).toEqual(['sale']);
		expect(filterProperties(properties, { ...filters, multiple: true })).toHaveLength(0);
		expect(
			filterProperties(properties, {
				...filters,
				from: '',
				to: '',
				sources: ['accela', 'mycase'],
				multiple: true
			})[0].records
		).toHaveLength(2);
	});
	it('never invents coordinates and keeps spider offsets separate from saved locations', () => {
		const { properties } = groupProperties([record()]);
		expect(toGeoJSON(properties).features).toHaveLength(0);
		properties[0].coordinates = [-86.15, 39.76];
		const offsets = spiderOffsets(20);
		expect(new Set(offsets.map((p) => p.join(','))).size).toBe(20);
		expect(toGeoJSON(properties).features[0].geometry.coordinates).toEqual([-86.15, 39.76]);
	});
});
