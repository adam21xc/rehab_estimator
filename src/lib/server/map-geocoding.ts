import { randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import { authClient } from './rehab-auth';
import { loadPropertyMap } from './intelligence-data';
import { canGeocode, type Property } from '$lib/intelligence/properties';

export type GeocodeFeature = {
	properties: {
		mapbox_id?: string;
		feature_type?: string;
		full_address?: string;
		coordinates?: { longitude: number; latitude: number; accuracy?: string };
		match_code?: {
			confidence?: string;
			address_number?: string;
			street?: string;
			postcode?: string;
		};
	};
};
export function acceptedGeocode(feature?: GeocodeFeature) {
	const p = feature?.properties,
		c = p?.coordinates,
		m = p?.match_code;
	return (
		!!p &&
		p.feature_type === 'address' &&
		!!c &&
		Number.isFinite(c.longitude) &&
		Number.isFinite(c.latitude) &&
		Math.abs(c.longitude) <= 180 &&
		Math.abs(c.latitude) <= 90 &&
		['exact', 'high'].includes(m?.confidence || '') &&
		m?.address_number === 'matched' &&
		m?.street === 'matched' &&
		m?.postcode === 'matched' &&
		['rooftop', 'parcel', 'point'].includes(c.accuracy || '')
	);
}
export async function geocodeNextBatch(limit = 25) {
	const token = env.MAPBOX_GEOCODING_TOKEN || env.MAPBOX_PUBLIC_TOKEN;
	if (!token) error(503, 'Mapbox geocoding is not configured.');
	const data = await loadPropertyMap();
	if (!data.cacheReady)
		error(503, 'Apply the property_geocodes database migration before locating addresses.');
	const pending = data.properties.filter(
		(p) =>
			!p.coordinates && ['missing', 'pending'].includes(p.locationStatus) && canGeocode(p.address)
	);
	const db = authClient();
	let attempted = 0,
		matched = 0,
		review = 0;
	const locate = async (property: Property) => {
		const lease = randomUUID(),
			now = new Date().toISOString();
		const claim = {
			address_key: property.key,
			address: property.address,
			status: 'pending',
			lease_id: lease,
			attempted_at: now
		};
		const insert = await db.from('property_geocodes').insert(claim);
		if (insert.error) {
			if (insert.error.code !== '23505') error(503, 'Unable to reserve an address for geocoding.');
			const reclaimed = await db
				.from('property_geocodes')
				.update(claim)
				.eq('address_key', property.key)
				.eq('status', 'pending')
				.lt('attempted_at', new Date(Date.now() - 10 * 60_000).toISOString())
				.select('address_key');
			if (reclaimed.error) error(503, 'Unable to check geocoding progress.');
			if (!reclaimed.data?.length) return;
		}
		attempted++;
		const save = async (value: Record<string, unknown>) => {
			const result = await db
				.from('property_geocodes')
				.update({ ...value, lease_id: null })
				.eq('address_key', property.key)
				.eq('lease_id', lease)
				.select('address_key');
			if (result.error || !result.data?.length)
				error(503, 'Unable to save a location. Processing stopped to avoid repeat requests.');
		};
		const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
		url.search = new URLSearchParams({
			q: property.address,
			access_token: token,
			permanent: 'true',
			autocomplete: 'false',
			types: 'address',
			country: 'us',
			limit: '1'
		}).toString();
		let response: Response;
		try {
			response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
		} catch {
			await save({ status: 'failed', error_code: 'network' });
			error(
				503,
				'Mapbox could not be reached. Processing stopped; saved coordinates are retained.'
			);
		}
		if (!response.ok) {
			// An API rejection is not a bad address. Remove our unprocessed reservation to permit retry after configuration is fixed.
			const removed = await db
				.from('property_geocodes')
				.delete()
				.eq('address_key', property.key)
				.eq('lease_id', lease);
			if (removed.error) error(503, 'Unable to release a geocoding reservation.');
			error(
				503,
				`Mapbox rejected geocoding (${response.status}). Check permanent-geocoding billing and the server token’s URL restrictions.`
			);
		}
		let feature: GeocodeFeature | undefined;
		try {
			feature = (await response.json()).features?.[0];
		} catch {
			await save({ status: 'failed', error_code: 'invalid_response' });
			error(503, 'Mapbox returned an unreadable response.');
		}
		const p = feature?.properties;
		const accepted = acceptedGeocode(feature);
		await save({
			status: accepted ? 'matched' : 'review',
			longitude: accepted ? p!.coordinates!.longitude : null,
			latitude: accepted ? p!.coordinates!.latitude : null,
			provider_id: p?.mapbox_id || null,
			accuracy: p?.coordinates?.accuracy || null,
			match_confidence: p?.match_code?.confidence || null,
			matched_address: p?.full_address || null,
			error_code: accepted ? null : 'uncertain_match',
			geocoded_at: now
		});
		if (accepted) matched++;
		else review++;
	};
	// Bound paid requests and drain every in-flight write before reporting a failure.
	for (let offset = 0; offset < pending.length && attempted < limit; ) {
		const batch = pending.slice(offset, offset + Math.min(5, limit - attempted));
		offset += batch.length;
		const results = await Promise.allSettled(batch.map(locate));
		const failure = results.find((result) => result.status === 'rejected');
		if (failure?.status === 'rejected') throw failure.reason;
	}
	return { attempted, matched, review, remaining: Math.max(0, pending.length - attempted) };
}
