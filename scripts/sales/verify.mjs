import { loadEnv, createServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const env = loadEnv('development', process.cwd(), '');
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false }
});
let id, vite;
try {
	const email = `sales-test-${randomUUID()}@example.com`,
		password = randomUUID() + randomUUID();
	const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
	if (created.error) throw created.error;
	id = created.data.user.id;
	const login = await db.auth.signInWithPassword({ email, password });
	if (login.error) throw login.error;
	const token = login.data.session.access_token;
	process.env.REHAB_ALLOWED_EMAILS = email;
	vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
	const route = await vite.ssrLoadModule('/src/routes/api/rehab/sales/+server.ts');
	const event = (search = '', authenticated = true) => ({
		url: new URL('http://localhost/api/rehab/sales' + search),
		cookies: {
			get: (name) => (name === 'rehab_access' && authenticated ? token : undefined),
			set: () => {}
		},
		setHeaders: () => {}
	});
	await assert.rejects(route.GET(event('', false)), (e) => e.status === 401);
	const response = await (await route.GET(event())).json();
	assert.ok(response.snapshot);
	assert.equal(response.snapshot.expected_rows, response.snapshot.loaded_rows);
	assert.ok(response.stats.buyers > 0);
	const all = await (await route.GET(event('?scope=all'))).json();
	assert.ok(all.stats.rows >= response.stats.rows);
	const name = response.actors[0].name;
	const filtered = await (await route.GET(event('?q=' + encodeURIComponent(name)))).json();
	assert.ok(filtered.actors.length > 0);
	const inventory = await (
		await route.GET(
			event('?q=GRISE%20HOME%20AND%20PROPERTY%20GROUP%20LLC&view=inventory&dateOrder=oldest')
		)
	).json();
	assert.equal(inventory.inventory.length, 12);
	assert.equal(inventory.inventoryAsOf, '2026-07-31');
	assert.ok(inventory.inventory.some((r) => r.buyer.includes('GROUP, LLC')));
	assert.deepEqual(
		inventory.inventory.map((r) => r.bought),
		inventory.inventory.map((r) => r.bought).sort()
	);
	const second = await (await route.GET(event('?view=transfers&page=2&dateOrder=oldest'))).json();
	assert.equal(second.page, 2);
	assert.equal(second.transactions.length, 50);
	const first = await (await route.GET(event('?view=transfers&dateOrder=oldest'))).json();
	assert.ok(first.transactions.at(-1).date <= second.transactions[0].date);
	assert.ok(
		!first.transactions.some((a) =>
			second.transactions.some((b) => a.id === b.id && a.parcel === b.parcel)
		)
	);
	const propertyRoute = await vite.ssrLoadModule(
		'/src/routes/api/rehab/properties/[parcel]/+server.ts'
	);
	const sample = inventory.inventory[0];
	const propertyEvent = {
		...event('?record=' + encodeURIComponent(sample.id)),
		params: { parcel: sample.parcel }
	};
	const property = await (await propertyRoute.GET(propertyEvent)).json();
	assert.equal(property.selectedId, sample.id);
	assert.equal(property.parcel, sample.parcel);
	assert.ok(property.transactions.every((r) => r.parcel === sample.parcel));
	await assert.rejects(
		propertyRoute.GET({ ...event('', false), params: { parcel: sample.parcel } }),
		(e) => e.status === 401
	);
	await assert.rejects(
		propertyRoute.GET({ ...event(), params: { parcel: 'missing-parcel' } }),
		(e) => e.status === 404
	);
	const restricted = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
		global: { headers: { Authorization: `Bearer ${token}` } },
		auth: { persistSession: false }
	});
	assert.ok((await restricted.from('gateway_sales').select('ordinal').limit(1)).error);
	await writeFile('.sales-data/dashboard-residential.json', JSON.stringify(response));
	console.log(
		JSON.stringify({
			status: 'passed',
			loaded: response.snapshot.loaded_rows,
			stats: response.stats,
			topBuyers: response.actors.slice(0, 3).map((a) => ({ name: a.name, purchases: a.purchases }))
		})
	);
} finally {
	if (id) {
		const result = await db.auth.admin.deleteUser(id);
		if (result.error) {
			console.error('Cleanup failed:', result.error);
			process.exitCode = 1;
		}
	}
	await vite?.close();
}
