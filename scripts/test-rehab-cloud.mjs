// Isolated live RLS/Storage verification. Creates temporary users; always cleans up.
import { loadEnv, createServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const env = loadEnv('development', process.cwd(), '');
const admin = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false }
});
const users = [];
const objects = [];
const tokens = [];
const emails = [];
let vite;
try {
	const clients = [];
	for (let i = 0; i < 2; i++) {
		const email = `rehab-test-${randomUUID()}@example.com`;
		const password = randomUUID() + randomUUID();
		const { data, error } = await admin.auth.admin.createUser({
			email,
			password,
			email_confirm: true
		});
		if (error) throw error;
		users.push(data.user.id);
		emails.push(email);
		const login = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
			auth: { persistSession: false, autoRefreshToken: false }
		});
		const { data: session, error: failure } = await login.auth.signInWithPassword({
			email,
			password
		});
		if (failure) throw failure;
		tokens.push(session.session.access_token);
		clients.push(
			createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
				global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
				auth: { persistSession: false, autoRefreshToken: false }
			})
		);
	}
	const a = clients[0],
		b = clients[1];
	const path = `${users[0]}/photos/${randomUUID()}.png`;
	objects.push(path);
	const png = Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
		'base64'
	);
	assert.equal(
		(await a.storage.from('rehab-media').upload(path, png, { contentType: 'image/png' })).error,
		null
	);
	assert.ok((await b.storage.from('rehab-media').download(path)).error);
	assert.equal((await a.storage.from('rehab-media').download(path)).error, null);
	const { data: saved, error } = await a
		.from('rehab_estimates')
		.insert({
			user_id: users[0],
			project_id: 'test-project',
			address: 'ISOLATED TEST — delete',
			total: 40,
			snapshot: { test: true }
		})
		.select()
		.single();
	if (error) throw error;
	assert.equal((await a.from('rehab_estimates').select('id').eq('id', saved.id)).data.length, 1);
	assert.equal((await b.from('rehab_estimates').select('id').eq('id', saved.id)).data.length, 0);
	assert.ok(
		(
			await b.from('rehab_estimates').insert({
				user_id: users[0],
				project_id: 'spoof',
				address: 'spoof',
				total: 0,
				snapshot: {}
			})
		).error
	);
	assert.ok((await a.from('rehab_estimates').update({ total: 1 }).eq('id', saved.id)).error);
	const job = {
		id: randomUUID(),
		user_id: users[0],
		estimate_id: saved.id,
		source_photo_id: 'test',
		prompt: 'test',
		style: 'Modern warm',
		model: 'test',
		status: 'processing'
	};
	assert.equal((await a.from('rehab_renderings').insert(job)).error, null);
	assert.ok((await a.from('rehab_renderings').insert({ ...job, id: randomUUID() })).error);
	assert.ok(
		(await b.from('rehab_renderings').insert({ ...job, id: randomUUID(), user_id: users[1] })).error
	);
	assert.equal(
		(await b.from('rehab_renderings').select('id').eq('estimate_id', saved.id)).data.length,
		0
	);

	// Exercise the actual SvelteKit save/load/photo handlers with live Auth and RLS.
	// This isolated Vite instance allows only its temporary test accounts; .env is never changed.
	process.env.REHAB_ALLOWED_EMAILS = emails.join(',');
	process.env.OPENAI_API_KEY = 'isolated-test-not-a-real-key';
	vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
	const event = (method, body, params = {}) => ({
		request: new Request('http://localhost/api/rehab/estimates', {
			method,
			headers: { origin: 'http://localhost', 'content-type': 'application/json' },
			body: body ? JSON.stringify(body) : undefined
		}),
		url: new URL('http://localhost/api/rehab/estimates'),
		params,
		cookies: { get: (name) => (name === 'rehab_access' ? tokens[0] : undefined), set: () => {} },
		setHeaders: () => {}
	});
	const photoRoute = await vite.ssrLoadModule('/src/routes/api/rehab/photos/+server.ts');
	const upload = await (
		await photoRoute.POST(
			event('POST', { dataUrl: `data:image/png;base64,${png.toString('base64')}` })
		)
	).json();
	objects.push(upload.path);
	const now = new Date().toISOString();
	const project = {
		meta: { id: randomUUID(), address: 'ISOLATED ROUTE TEST', createdAt: now, updatedAt: now },
		catalog: {
			categories: [
				{
					key: 'roof',
					label: 'Roof',
					items: [{ id: 'roof', description: 'Roof', unit: 'sf', cost: 4 }]
				}
			]
		},
		progress: [
			{
				categoryKey: 'roof',
				lines: [{ itemId: 'roof', quantity: 10 }],
				photos: [
					{
						id: 'photo',
						categoryKey: 'roof',
						fileName: 'roof.png',
						mime: 'image/png',
						url: upload.url,
						storagePath: upload.path
					}
				]
			}
		]
	};
	const saveRoute = await vite.ssrLoadModule('/src/routes/api/rehab/estimates/+server.ts');
	const savedRoute = await (await saveRoute.POST(event('POST', { project }))).json();
	assert.ok(savedRoute.id);
	const openRoute = await vite.ssrLoadModule('/src/routes/api/rehab/estimates/[id]/+server.ts');
	const opened = await (await openRoute.GET(event('GET', undefined, { id: savedRoute.id }))).json();
	assert.equal(opened.snapshot.progress[0].lines[0].quantity, 10);
	assert.ok(opened.snapshot.progress[0].photos[0].url.startsWith('/api/rehab/media?'));

	await a.from('rehab_renderings').update({ status: 'failed' }).eq('id', job.id);
	const realFetch = globalThis.fetch;
	let providerCalls = 0;
	const requestId = randomUUID();
	objects.push(`${users[0]}/renderings/${requestId}.jpeg`);
	globalThis.fetch = async (url, options) => {
		if (String(url) === 'https://api.openai.com/v1/images/edits') {
			providerCalls++;
			assert.equal(options.body.get('model'), 'gpt-image-2.5-sunburst');
			assert.equal(options.body.get('n'), '1');
			assert.ok(options.body.get('image') instanceof Blob);
			return Response.json({ data: [{ b64_json: png.toString('base64') }] });
		}
		return realFetch(url, options);
	};
	try {
		const renderingRoute = await vite.ssrLoadModule('/src/routes/api/rehab/renderings/+server.ts');
		const request = {
			requestId,
			estimateId: savedRoute.id,
			photoId: 'photo',
			prompt: 'Improve the finish while preserving the layout.',
			style: 'Modern warm'
		};
		const result = await (await renderingRoute.POST(event('POST', request))).json();
		assert.equal(result.status, 'completed');
		await renderingRoute.POST(event('POST', request));
		assert.equal(providerCalls, 1, 'A repeated request ID must not charge again');
		const { data: render } = await a
			.from('rehab_renderings')
			.select('output_path,status')
			.eq('id', requestId)
			.single();
		assert.equal(render.status, 'completed');
		assert.ok(render.output_path);
		assert.ok((await b.storage.from('rehab-media').download(render.output_path)).error);
		console.log(
			'PASS: rendering handler, saved output privacy and duplicate-request protection (OpenAI response mocked; no paid call).'
		);
	} finally {
		globalThis.fetch = realFetch;
	}
	console.log('PASS: actual photo upload, save and reopen API handlers against live Supabase.');
	console.log(
		'PASS: cloud save/read, immutable history, private photos, cross-user isolation, render ownership and concurrency lock.'
	);
} finally {
	if (vite) await vite.close();
	if (objects.length) {
		const { error } = await admin.storage.from('rehab-media').remove(objects);
		if (error) {
			console.error('Cleanup failed:', error);
			process.exitCode = 1;
		}
	}
	for (const id of users) {
		const { error } = await admin.auth.admin.deleteUser(id);
		if (error) {
			console.error('Cleanup failed:', error);
			process.exitCode = 1;
		}
	}
	if (!process.exitCode)
		console.log('Temporary test users, estimates, render jobs and photos cleaned up.');
}
