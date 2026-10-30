// Website queue consumer. OAuth only; no public gateway, API-key fallback, or generation retries.
import { readFile, writeFile, mkdir, open, unlink, realpath, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';
import { RENOVATION_MODEL, renovationPrompt } from '../../src/lib/renovation-standard.js';
import { QUEUED_MODEL, RUNNING_MODEL, COMPLETED_MODEL } from '../../src/lib/renovation-queue.js';
const root = fileURLToPath(new URL('../../', import.meta.url)),
	dir = resolve(root, 'output/renovation-studio');
const env = { ...loadEnv('development', root, ''), ...process.env };
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false }
});
const allowed = (env.REHAB_ALLOWED_EMAILS || env.FROM_EMAIL || '')
	.split(',')
	.map((x) => x.trim().toLowerCase());
await mkdir(dir, { recursive: true });
const lock = resolve(dir, 'worker.lock');
try {
	const old = JSON.parse(await readFile(lock));
	let live = true;
	try {
		process.kill(old.pid, 0);
	} catch (e) {
		if (e.code === 'ESRCH') live = false;
		else throw e;
	}
	if (live) throw Error('Studio worker is already running');
	await unlink(lock);
} catch (e) {
	if (e.code !== 'ENOENT') throw e;
}
const handle = await open(lock, 'wx', 0o600);
await handle.writeFile(JSON.stringify({ pid: process.pid }));
await handle.close();
const cfg = JSON.parse(await readFile(resolve(homedir(), '.openclaw/openclaw.json')));
const provider = cfg.models?.providers?.openai;
if (
	provider?.apiKey ||
	provider?.auth === 'api-key' ||
	provider?.baseUrl ||
	provider?.headers ||
	provider?.api ||
	!Object.values(cfg.auth?.profiles || {}).some(
		(p) => p.provider === 'openai' && p.mode === 'oauth'
	)
)
	throw Error('OAuth-only configuration required');
async function exists(path) {
	try {
		await access(path);
		return true;
	} catch (e) {
		if (e.code === 'ENOENT') return false;
		throw e;
	}
}
async function status(extra) {
	await writeFile(
		resolve(dir, 'status.json'),
		JSON.stringify({
			pid: process.pid,
			mode: 'oauth_only',
			updatedAt: new Date().toISOString(),
			...extra
		}),
		{ mode: 0o600 }
	);
}
async function resultBytes(result) {
	if (
		!result.ok ||
		result.result?.isError ||
		result.result?.details?.model !== RENOVATION_MODEL ||
		result.result?.details?.paths?.length !== 1
	)
		throw Error('OAuth generation did not return the expected image.');
	const base = await realpath(resolve(homedir(), '.openclaw/media/tool-image-generation')),
		file = await realpath(result.result.details.paths[0]);
	if (!file.startsWith(base + '/')) throw Error('Unexpected image output path.');
	const bytes = await readFile(file);
	if (bytes.length > 10 * 1024 * 1024 || bytes[0] !== 255 || bytes[1] !== 216)
		throw Error('Invalid generated JPEG.');
	return bytes;
}
async function processJob(job, recover = false) {
	const responsePath = resolve(dir, job.id + '-response.json');
	let invoked = recover;
	await status({ status: 'processing', jobId: job.id, recovering: recover });
	try {
		let result;
		if (recover) result = JSON.parse(await readFile(responsePath));
		else {
			const user = await db.auth.admin.getUserById(job.user_id);
			if (user.error || !allowed.includes(user.data.user?.email?.toLowerCase()))
				throw Error('Workspace access must be reviewed.');
			const estimate = await db
				.from('rehab_estimates')
				.select('snapshot')
				.eq('id', job.estimate_id)
				.eq('user_id', job.user_id)
				.single();
			if (estimate.error) throw Error('Saved photo unavailable.');
			const photo = estimate.data.snapshot?.progress
				?.flatMap((p) => p.photos)
				.find((p) => p.id === job.source_photo_id);
			if (
				!photo?.storagePath?.startsWith(job.user_id + '/photos/') ||
				photo.storagePath.includes('..')
			)
				throw Error('Saved photo ownership is invalid.');
			const source = await db.storage.from('rehab-media').download(photo.storagePath);
			if (source.error) throw Error('Saved photo could not be loaded.');
			const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[
				source.data.type
			];
			if (!ext || source.data.size > 10 * 1024 * 1024) throw Error('Unsupported source photo.');
			const imageDir = resolve(homedir(), '.openclaw/media/renovation-studio');
			await mkdir(imageDir, { recursive: true });
			const image = resolve(imageDir, job.id + '.' + ext);
			await writeFile(image, Buffer.from(await source.data.arrayBuffer()), { mode: 0o600 });
			invoked = true;
			const response = await fetch(`http://127.0.0.1:${cfg.gateway.port || 18789}/tools/invoke`, {
				method: 'POST',
				headers: {
					Authorization: 'Bearer ' + cfg.gateway.auth.token,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					tool: 'image_generate',
					agentId: 'main',
					sessionKey: 'agent:main:studio-' + job.id,
					idempotencyKey: job.id,
					args: {
						action: 'generate',
						model: 'openai/' + RENOVATION_MODEL,
						image,
						prompt: renovationPrompt(job.style, job.prompt),
						size: '1024x1024',
						quality: 'medium',
						count: 1,
						outputFormat: 'jpeg',
						filename: 'studio-' + job.id + '.jpg',
						timeoutMs: 300000
					}
				}),
				signal: AbortSignal.timeout(360000)
			});
			result = await response.json();
			await writeFile(responsePath, JSON.stringify(result), { mode: 0o600 });
		}
		if (!result.ok || result.result?.isError) {
			invoked = false;
			throw Error('OAuth generation failed. Review the request before starting another.');
		}
		const bytes = await resultBytes(result),
			path = `${job.user_id}/renderings/${job.id}.jpeg`;
		const upload = await db.storage
			.from('rehab-media')
			.upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
		if (upload.error && String(upload.error.statusCode) !== '409')
			throw Error('Unable to save generated image.');
		if (upload.error) {
			const existing = await db.storage.from('rehab-media').download(path);
			if (existing.error || !Buffer.from(await existing.data.arrayBuffer()).equals(bytes))
				throw Error('Saved image differs; manual review required.');
		}
		const saved = await db
			.from('rehab_renderings')
			.update({
				status: 'completed',
				model: COMPLETED_MODEL,
				output_path: path,
				error_message: null
			})
			.eq('id', job.id)
			.eq('model', RUNNING_MODEL)
			.eq('status', 'processing')
			.select('id');
		if (saved.error || saved.data?.length !== 1)
			throw Error('Image saved but database completion is unconfirmed.');
		console.log(JSON.stringify({ jobId: job.id, status: 'completed', transport: 'oauth' }));
	} catch (e) {
		const message = invoked
			? 'Generation outcome needs reconciliation. No automatic regeneration will occur.'
			: e.message;
		const updated = await db
			.from('rehab_renderings')
			.update({ status: invoked ? 'processing' : 'failed', error_message: message })
			.eq('id', job.id)
			.eq('model', RUNNING_MODEL)
			.eq('status', 'processing');
		if (updated.error) throw Error('Could not record job state.');
		console.log(
			JSON.stringify({
				jobId: job.id,
				status: invoked ? 'needs_reconciliation' : 'failed',
				message
			})
		);
	}
}
const recovered = new Set();
async function gatewayAvailable() {
	return new Promise((resolveReady) => {
		const socket = createConnection({ host: '127.0.0.1', port: cfg.gateway.port || 18789 });
		const done = (ok) => {
			socket.destroy();
			resolveReady(ok);
		};
		socket.setTimeout(1500);
		socket.once('connect', () => done(true));
		socket.once('error', () => done(false));
		socket.once('timeout', () => done(false));
	});
}
try {
	while (!(await exists(resolve(dir, 'STOP')))) {
		if (!(await gatewayAvailable())) {
			await status({ status: 'waiting_for_gateway' });
			if (process.env.STUDIO_WORKER_ONCE === '1') break;
			await new Promise((r) => setTimeout(r, 10000));
			continue;
		}
		const pending = await db
			.from('rehab_renderings')
			.select('*')
			.eq('status', 'processing')
			.in('model', [QUEUED_MODEL, RUNNING_MODEL])
			.order('created_at')
			.limit(50);
		if (pending.error) throw Error('Cannot read OAuth queue.');
		let worked = false;
		for (const job of pending.data || []) {
			if (job.model === RUNNING_MODEL) {
				if (!recovered.has(job.id) && (await exists(resolve(dir, job.id + '-response.json')))) {
					recovered.add(job.id);
					await processJob(job, true);
					worked = true;
				}
				continue;
			}
			const claim = await db
				.from('rehab_renderings')
				.update({ model: RUNNING_MODEL, error_message: null })
				.eq('id', job.id)
				.eq('model', QUEUED_MODEL)
				.eq('status', 'processing')
				.select('*');
			if (claim.error) throw Error('Could not claim queued request.');
			if (claim.data?.length) {
				await processJob(claim.data[0]);
				worked = true;
			}
			if (await exists(resolve(dir, 'STOP'))) break;
		}
		await status({
			status: 'waiting',
			queued: pending.data?.filter((j) => j.model === QUEUED_MODEL).length || 0
		});
		if (process.env.STUDIO_WORKER_ONCE === '1') break;
		await new Promise((r) => setTimeout(r, worked ? 1000 : 10000));
	}
	await status({ status: 'stopped' });
} catch (e) {
	await status({ status: 'blocked', reason: e.message });
	console.error(e.message);
	process.exitCode = 1;
} finally {
	await unlink(lock);
}
