// Live storage/RLS integration test. Only image generation is mocked; no paid API call.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer, loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';
const env = loadEnv('development', process.cwd(), '');
const admin = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false }
});
const pixel =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
let userId, server;
const paths = [];
const realFetch = globalThis.fetch;
let generations = 0;
try {
	const email = `studio-test-${randomUUID()}@example.com`,
		password = randomUUID() + randomUUID();
	const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
	if (created.error) throw created.error;
	userId = created.data.user.id;
	const login = await admin.auth.signInWithPassword({ email, password });
	if (login.error) throw login.error;
	const token = login.data.session.access_token;
	process.env.REHAB_ALLOWED_EMAILS = email;
	server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
	const privateEnv = (await server.ssrLoadModule('$env/dynamic/private')).env;
	privateEnv.REHAB_ALLOWED_EMAILS = email;
	privateEnv.OPENAI_API_KEY = 'mocked-generation-only';
	const event = (route, body) => ({
		url: new URL(`http://localhost/api/rehab/${route}`),
		request: new Request(`http://localhost/api/rehab/${route}`, {
			method: body ? 'POST' : 'GET',
			headers: { origin: 'http://localhost', 'content-type': 'application/json' },
			body: body ? JSON.stringify(body) : undefined
		}),
		cookies: { get: (n) => (n === 'rehab_access' ? token : undefined), set: () => {} },
		setHeaders: () => {}
	});
	const photos = await server.ssrLoadModule('/src/routes/api/rehab/photos/+server.ts');
	const photo = await (
		await photos.POST(event('photos', { dataUrl: `data:image/png;base64,${pixel}` }))
	).json();
	paths.push(photo.path);
	const { studioProject } = await server.ssrLoadModule('/src/lib/domain/studio.ts');
	const project = studioProject(
		{
			id: randomUUID(),
			categoryKey: 'studio',
			fileName: 'Integration test.png',
			mime: 'image/png',
			url: photo.url,
			storagePath: photo.path
		},
		''
	);
	const estimates = await server.ssrLoadModule('/src/routes/api/rehab/estimates/+server.ts');
	const saved = await (await estimates.POST(event('estimates', { project }))).json();
	assert.ok(saved.id);
	const estimateHistory = await (await estimates.GET(event('estimates'))).json();
	assert.equal(estimateHistory.estimates.length, 0);
	globalThis.fetch = async (input, options) => {
		if (String(input) === 'https://api.openai.com/v1/images/edits') {
			generations++;
			return new Response(JSON.stringify({ data: [{ b64_json: pixel }] }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			});
		}
		return realFetch(input, options);
	};
	const render = await server.ssrLoadModule('/src/routes/api/rehab/renderings/+server.ts');
	const request = {
		requestId: randomUUID(),
		estimateId: saved.id,
		photoId: project.progress[0].photos[0].id,
		prompt: 'Test a fresh coat of paint and preserve the layout.',
		style: 'Modern warm'
	};
	const result = await (await render.POST(event('renderings', request))).json();
	assert.equal(result.status, 'completed');
	paths.push(`${userId}/renderings/${request.requestId}.jpeg`);
	await render.POST(event('renderings', request));
	assert.equal(generations, 1);
	const studio = await server.ssrLoadModule('/src/routes/api/rehab/studio/+server.ts');
	const sessions = await (await studio.GET(event('studio'))).json();
	assert.equal(sessions.sessions[0].snapshot.meta.kind, 'studio');
	assert.equal(sessions.sessions[0].snapshot.meta.address, '');
	const library = await server.ssrLoadModule('/src/routes/api/rehab/image-library/+server.ts');
	const groups = await (await library.GET(event('image-library'))).json();
	assert.equal(groups.properties[0].images.length, 2);
	console.log(
		JSON.stringify({
			result: 'passed',
			checks:
				'private photo upload, unassigned studio save, mocked generation persisted, idempotent request, studio history, original and concept in image library',
			paidRequests: 0
		})
	);
} finally {
	globalThis.fetch = realFetch;
	if (paths.length) {
		const cleanup = await admin.storage.from('rehab-media').remove(paths);
		if (cleanup.error) throw cleanup.error;
	}
	if (userId) {
		const cleanup = await admin.auth.admin.deleteUser(userId);
		if (cleanup.error) throw cleanup.error;
	}
	await server?.close();
}
