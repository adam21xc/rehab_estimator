// Explicit backfill: node scripts/geocode-properties.mjs --all (or a maximum address count).
// Uses the same permanent-geocoding/cache logic as the authenticated map endpoint.
import { createServer } from 'vite';
const argument = process.argv[2] || '25';
const maximum = argument === '--all' ? Infinity : Number(argument);
if (maximum !== Infinity && (!Number.isInteger(maximum) || maximum < 1)) {
	throw new Error('Pass --all or a positive maximum address count.');
}
let stopped = false;
process.on('SIGINT', () => {
	stopped = true;
	console.log('Stopping after the current batch.');
});
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
let attempted = 0,
	matched = 0,
	review = 0;
try {
	const { geocodeNextBatch } = await server.ssrLoadModule('/src/lib/server/map-geocoding.ts');
	while (!stopped && attempted < maximum) {
		const result = await geocodeNextBatch(Math.min(250, maximum - attempted));
		attempted += result.attempted;
		matched += result.matched;
		review += result.review;
		console.log(JSON.stringify({ attempted, matched, review, remaining: result.remaining }));
		if (!result.attempted || !result.remaining) break;
	}
} catch (failure) {
	console.error(failure.body?.message || failure.message || 'Geocoding stopped.');
	process.exitCode = 1;
} finally {
	await server.close();
}
