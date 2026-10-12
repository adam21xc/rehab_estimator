import { error } from '@sveltejs/kit';

// Kept as a fail-closed entry point for older callers and backfill scripts.
export async function geocodeNextBatch(_limit = 25) {
	error(410, 'Paid Mapbox address lookups are disabled. Use saved DealMachine coordinates.');
}
