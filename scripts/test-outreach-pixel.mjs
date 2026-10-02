import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';

// This integration test creates only isolated, opted-out test records, never sends
// email, and removes those exact records in finally. Do not run the campaign queue.
const env = { ...parseEnv(readFileSync('.env', 'utf8')), ...process.env };
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const origin = process.argv[2] || `https://${env.PUBLIC_BASE_DOMAIN}`;
const run = `pixel-test-${randomUUID()}`;
const [local, domain] = env.FROM_EMAIL.split('@');
const aliases = ['opened', 'control'].map((kind) => `${local}+${run}-${kind}@${domain}`);
const tokens = [randomUUID(), randomUUID()];
const keys = aliases.map((_, i) => `${run}-${i}`);

async function check(result) {
	if (result.error) throw new Error(`${result.error.code}: ${result.error.message}`);
	return result.data;
}
async function counts() {
	const rows = await check(
		await db
			.from('emails_table')
			.select('email,open_count,first_open_date,last_open_date')
			.eq('contact_id', run)
	);
	return aliases.map((email) => rows.find((row) => row.email === email));
}
async function hit(query = '') {
	const response = await fetch(`${origin}/api/pixel${query}`, {
		signal: AbortSignal.timeout(15000)
	});
	const bytes = Buffer.from(await response.arrayBuffer());
	assert.equal(response.status, 200);
	assert.match(response.headers.get('content-type'), /image\/gif/);
	assert.match(response.headers.get('cache-control'), /no-store/);
	assert.equal(bytes.subarray(0, 6).toString(), 'GIF89a');
	assert.equal(bytes.readUInt16LE(6), 1);
	assert.equal(bytes.readUInt16LE(8), 1);
}

try {
	await check(
		await db.from('deal_machine_leads').insert({
			contact_id: run,
			first_name: 'Pixel test',
			lead_source: 'isolated_pixel_test'
		})
	);
	await check(
		await db.from('emails_table').insert(
			aliases.map((email, i) => ({
				contact_email_prop_nk: keys[i],
				contact_id: run,
				email,
				responded: true,
				open_token: tokens[i],
				lead_source: 'isolated_pixel_test'
			}))
		)
	);
	const before = await counts();
	assert.deepEqual(
		before.map((row) => row.open_count),
		[0, 0]
	);
	await hit(`?t=${tokens[0]}`);
	const first = await counts();
	assert.deepEqual(
		first.map((row) => row.open_count),
		[1, 0]
	);
	assert.ok(first[0].first_open_date);
	assert.ok(first[0].last_open_date);
	await hit(`?token=${tokens[0]}`);
	const repeated = await counts();
	assert.deepEqual(
		repeated.map((row) => row.open_count),
		[2, 0]
	);
	assert.equal(repeated[0].first_open_date, first[0].first_open_date);
	assert.ok(Date.parse(repeated[0].last_open_date) >= Date.parse(first[0].last_open_date));
	await hit();
	await hit(`?t=${randomUUID()}`);
	assert.deepEqual(await counts(), repeated);
	console.log(
		JSON.stringify(
			{
				origin,
				aliases,
				checks: {
					firstRequest: '0 → 1',
					repeatedRequest: '1 → 2',
					control: '0',
					timestamps: 'pass',
					missingAndUnknownTokens: 'no counter changes',
					gifAndNoCache: 'pass'
				}
			},
			null,
			2
		)
	);
} finally {
	await check(await db.from('emails_table').delete().eq('contact_id', run));
	await check(await db.from('deal_machine_leads').delete().eq('contact_id', run));
	console.log('Isolated test records removed. No email was sent.');
}
