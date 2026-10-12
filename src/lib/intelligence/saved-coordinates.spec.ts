import { it, expect } from 'vitest';
import { dealMachineLocation } from './saved-coordinates';
const address = '123 North Main Street, Indianapolis IN 46222';
const facts = {
	full_address: '123 N Main St Indianapolis IN 46222',
	latitude: '39.77',
	longitude: '-86.18'
};
it('reads saved numeric strings in longitude/latitude order', () => {
	expect(dealMachineLocation(address, facts)?.coordinates).toEqual([-86.18, 39.77]);
});
it('rejects missing, invalid, and placeholder coordinates', () => {
	for (const values of [
		{ latitude: null },
		{ latitude: '' },
		{ longitude: 181 },
		{ latitude: 91 },
		{ longitude: 'NaN' },
		{ longitude: 0, latitude: 0 }
	])
		expect(dealMachineLocation(address, { ...facts, ...values })).toBeNull();
});
it('does not place different units, ZIPs, or warned matches at a provider location', () => {
	expect(dealMachineLocation(address + ' UNIT 2', facts)).toBeNull();
	expect(dealMachineLocation(address.replace('46222', '46201'), facts)).toBeNull();
	expect(dealMachineLocation(address, facts, 'Address mismatch')).toBeNull();
});
