import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { error } from '@sveltejs/kit';
import { addressKey } from '$lib/intelligence/properties';
import { streetView } from '$lib/intelligence/map-icons';

type Location = { address: string; coordinates: [number, number]; warning?: string };
export function providerLocation(row: Record<string, unknown>, requested: string): Location | null {
	if (row.matched === false || typeof row.full_address !== 'string') return null;
	const number = (value: unknown) =>
		typeof value === 'number'
			? value
			: typeof value === 'string' && value.trim()
				? Number(value)
				: NaN;
	const lat = number(row.latitude),
		lng = number(row.longitude);
	if (row.latitude == null || row.longitude == null || !streetView([lng, lat]) || (!lat && !lng))
		return null;
	return {
		address: row.full_address,
		coordinates: [lng, lat],
		warning:
			row.match_warning || addressKey(requested) !== addressKey(row.full_address)
				? 'The returned address differs from your search. Confirm this is the property you want.'
				: undefined
	};
}
export async function findStudioLocation(
	db: SupabaseClient,
	address: string,
	key: string,
	request: typeof fetch = fetch
): Promise<Location> {
	// Reuse previously purchased property facts before requesting another lookup.
	for (let offset = 0; ; offset += 1000) {
		const { data, error: failure } = await db
			.from('dm_properties')
			.select('id,facts')
			.order('id')
			.range(offset, offset + 999);
		if (failure) error(503, 'Saved property locations are unavailable. Try again later.');
		for (const row of data || []) {
			if (addressKey(row.facts?.full_address || '') !== addressKey(address)) continue;
			const location = providerLocation(row.facts, address);
			if (location) return location;
		}
		if ((data?.length || 0) < 1000) break;
	}
	const saved = await db
		.from('property_geocodes')
		.select('longitude,latitude,status')
		.eq('address_key', addressKey(address))
		.maybeSingle();
	if (saved.error) error(503, 'Saved map locations are unavailable.');
	if (saved.data?.status === 'matched') {
		const location = providerLocation({ ...saved.data, full_address: address }, address);
		if (location) return location;
	}
	const cacheKey =
		'studio-location-v1:' + createHash('sha256').update(addressKey(address)).digest('hex');
	const cached = await db
		.from('dm_requests')
		.select('response,status')
		.eq('cache_key', cacheKey)
		.maybeSingle();
	if (cached.error) error(503, 'Unable to check saved address lookups.');
	let response = cached.data?.response;
	if (cached.data && cached.data.status !== 'complete')
		error(
			409,
			'This address lookup is pending or needs review. It will not be charged again automatically.'
		);
	if (!cached.data) {
		if (!key) error(503, 'Address lookup is not configured. Upload a photo instead.');
		const payload = {
			data: [{ full_address: address }],
			fields: ['full_address', 'latitude', 'longitude'],
			contact_audience: 'owners'
		};
		const claimed = await db.rpc('dm_claim_request', { p_key: cacheKey, p_request: payload });
		if (claimed.error) error(503, 'Unable to reserve the address lookup.');
		if (!claimed.data)
			error(409, 'This address is already being looked up. Try loading it again shortly.');
		try {
			const result = await request('https://api.v2.dealmachine.com/v1/enrichment/address', {
				method: 'POST',
				headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
				signal: AbortSignal.timeout(120000)
			});
			if (!result.ok) throw new Error('provider');
			response = await result.json();
			const persisted = await db
				.from('dm_requests')
				.update({
					response,
					status: 'complete',
					completed_at: new Date().toISOString(),
					credits: response.credits?.used || 0
				})
				.eq('cache_key', cacheKey);
			if (persisted.error) throw new Error('cache');
		} catch {
			error(
				502,
				'The address lookup could not complete. Its request is reserved to prevent duplicate charges; upload a photo or review the lookup before retrying.'
			);
		}
	}
	const rows = response?.data;
	const row =
		Array.isArray(rows) &&
		rows.find((r) => addressKey(r.input?.full_address || '') === addressKey(address));
	const location = row && providerLocation(row, address);
	if (!location)
		error(
			404,
			'No property location was found. Check the full address, city, state and ZIP, or upload a photo.'
		);
	return location;
}
