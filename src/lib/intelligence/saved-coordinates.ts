import { addressKey } from './properties';

// A provider match must preserve the complete address, including units and ZIP.
export function dealMachineLocation(
	candidate: string,
	facts: Record<string, unknown>,
	warning?: unknown
) {
	if (
		warning ||
		typeof facts.full_address !== 'string' ||
		!candidate.trim() ||
		addressKey(candidate) !== addressKey(facts.full_address)
	)
		return null;
	const number = (v: unknown) =>
		typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
	const longitude = number(facts.longitude),
		latitude = number(facts.latitude);
	if (
		!Number.isFinite(longitude) ||
		!Number.isFinite(latitude) ||
		Math.abs(longitude) > 180 ||
		Math.abs(latitude) > 90 ||
		(longitude === 0 && latitude === 0)
	)
		return null;
	return { key: addressKey(candidate), coordinates: [longitude, latitude] as [number, number] };
}
