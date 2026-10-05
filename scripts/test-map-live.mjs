// Read-only map verification. Temporary auth user is removed; no paid geocoding is called.
import { loadEnv, createServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const env = loadEnv('development', process.cwd(), '');
const admin = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false }
});
let userId, server;
try {
	const email = `map-test-${randomUUID()}@example.com`,
		password = randomUUID() + randomUUID();
	const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
	if (created.error) throw created.error;
	userId = created.data.user.id;
	const login = await admin.auth.signInWithPassword({ email, password });
	if (login.error) throw login.error;
	const token = login.data.session.access_token;
	process.env.REHAB_ALLOWED_EMAILS = email;
	server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
	const route = await server.ssrLoadModule('/src/routes/api/rehab/map/+server.ts');
	const event = (authenticated = true, origin = 'http://localhost') => ({
		url: new URL('http://localhost/api/rehab/map'),
		request: new Request('http://localhost/api/rehab/map', { headers: { origin } }),
		cookies: {
			get: (name) => (name === 'rehab_access' && authenticated ? token : undefined),
			set: () => {}
		},
		setHeaders: () => {}
	});
	await assert.rejects(route.GET(event(false)), (e) => e.status === 401);
	await assert.rejects(
		route.POST(event(true, 'https://untrusted.invalid')),
		(e) => e.status === 403
	);
	const data = await (await route.GET(event())).json();
	assert.equal(data.cacheReady, true);
	assert.ok(data.properties.length > 0);
	assert.ok(data.properties.some((p) => p.coordinates));
	assert.ok(data.token.startsWith('pk.'));
	assert.ok(!JSON.stringify(data).includes(env.SUPABASE_SERVICE_ROLE_KEY));
	const second = await (await route.GET(event())).json();
	for (const property of data.properties.filter((p) => p.coordinates)) {
		assert.deepEqual(
			second.properties.find((p) => p.key === property.key)?.coordinates,
			property.coordinates
		);
	}
	const { env: serverEnv } = await server.ssrLoadModule('$env/dynamic/private');
	serverEnv.REHAB_ALLOWED_EMAILS = 'different@example.com';
	await assert.rejects(route.GET(event()), (e) => e.status === 401);
	await assert.rejects(route.POST(event()), (e) => e.status === 401);
	console.log(
		JSON.stringify({
			result: 'passed',
			properties: data.properties.length,
			mapped: data.properties.filter((p) => p.coordinates).length,
			checks:
				'allowed authenticated reads, anonymous/non-allowlisted denial, cross-origin denial, persistent coordinate reuse, no service key exposure'
		})
	);
} finally {
	if (userId) {
		const deleted = await admin.auth.admin.deleteUser(userId);
		if (deleted.error) {
			console.error('Temporary test user cleanup failed:', deleted.error.message);
			process.exitCode = 1;
		}
	}
	await server?.close();
}
