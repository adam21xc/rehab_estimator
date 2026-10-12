import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { requireUser } from '$lib/server/rehab-auth';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async (event) => {
	await requireUser(event);
	const query = (event.url.searchParams.get('q') || '').trim();
	if (query.length < 4) return json({ suggestions: [] });
	if (query.length > 256 || query.includes(';') || query.split(/\s+/).length > 20)
		error(400, 'Enter a shorter street address.');
	const token = env.MAPBOX_PUBLIC_TOKEN;
	if (!token)
		error(503, 'Address suggestions are unavailable. You can still type the full address.');
	const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
	// Selected addresses can be saved with studio concepts, so request permanent results.
	url.search = new URLSearchParams({
		q: query,
		access_token: token,
		autocomplete: 'true',
		permanent: 'true',
		country: 'us',
		types: 'address',
		limit: '5',
		proximity: '-86.1581,39.7684',
		language: 'en'
	}).toString();
	let response: Response;
	try {
		response = await fetch(url, { signal: AbortSignal.timeout(10000) });
	} catch {
		error(503, 'Address suggestions timed out. Keep typing or enter the full address.');
	}
	if (!response.ok)
		error(503, 'Mapbox suggestions are unavailable. You can still enter the full address.');
	const payload = await response.json();
	const suggestions = (Array.isArray(payload.features) ? payload.features : []).flatMap(
		(feature: {
			id?: string;
			properties?: { mapbox_id?: string; full_address?: string };
			geometry?: { coordinates?: number[] };
		}) => {
			const address = feature.properties?.full_address,
				coordinates = feature.geometry?.coordinates;
			if (
				!address ||
				!coordinates ||
				coordinates.length !== 2 ||
				!coordinates.every(Number.isFinite) ||
				Math.abs(coordinates[0]) > 180 ||
				Math.abs(coordinates[1]) > 90
			)
				return [];
			return [{ id: feature.properties?.mapbox_id || feature.id || address, address, coordinates }];
		}
	);
	return json({ suggestions });
};
