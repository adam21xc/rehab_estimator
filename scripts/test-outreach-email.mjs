import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'vite';

// Explicit send/check/cleanup commands. Only sends to plus addresses of the
// authenticated mailbox; test records are excluded from the campaign queue.
const action = process.argv[2];
assert.ok(
	['send', 'check', 'cleanup'].includes(action),
	'Use send, check <manifest>, or cleanup <manifest>'
);
const env = { ...parseEnv(readFileSync('.env', 'utf8')), ...process.env };
const db = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const source = 'isolated_email_pixel_test';
async function check(result) {
	if (result.error) throw new Error(`${result.error.code}: ${result.error.message}`);
	return result.data;
}

let vite;
try {
	if (action === 'send') {
		vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
		const { getGmail, sendGmail } = await vite.ssrLoadModule('/src/lib/gmail.ts');
		const { renderEmail } = await vite.ssrLoadModule('/src/lib/render.ts');
		const gmail = getGmail();
		const { data: profile } = await gmail.users.getProfile({ userId: 'me' });
		assert.equal(
			profile.emailAddress.toLowerCase(),
			env.FROM_EMAIL.toLowerCase(),
			'Sender must match the authenticated mailbox'
		);
		const [local, domain] = profile.emailAddress.split('@');
		const run = `email-pixel-test-${randomUUID()}`;
		const tag = run.slice(-12);
		const manifest = { run, createdAt: new Date().toISOString(), messages: [] };
		mkdirSync('.outreach-tests', { recursive: true });
		const file = `.outreach-tests/${run}.json`;
		const save = () => writeFileSync(file, JSON.stringify(manifest, null, 2), { mode: 0o600 });
		save();
		await check(
			await db.from('deal_machine_leads').insert({
				contact_id: run,
				first_name: 'Test',
				lead_source: source
			})
		);
		for (const kind of ['opened', 'control']) {
			const to = `${local}+pixel-${tag}-${kind}@${domain}`;
			const token = randomUUID();
			const rows = await check(
				await db
					.from('emails_table')
					.insert({
						contact_email_prop_nk: `${run}-${kind}`,
						contact_id: run,
						email: to,
						responded: true,
						open_token: token,
						lead_source: source
					})
					.select('contact_email_prop_nk')
			);
			const nk = rows[0].contact_email_prop_nk;
			const rendered = renderEmail(
				{ first: 'Test', short_address: 'TEST PROPERTY — no real lead' },
				0,
				token
			);
			const subject = `[PIXEL TEST ${tag}] ${kind === 'control' ? 'CONTROL — leave unopened' : 'OPEN THIS MESSAGE'}`;
			const notice =
				'This is an authorized outreach tracking test sent to your own alias. The property and outreach text below are dummy data.';
			const entry = { kind, to, nk, subject, token };
			manifest.messages.push(entry);
			save(); // Preserve cleanup information even if sending fails.
			const sent = await sendGmail({
				to,
				subject,
				text: `${notice}\n\n${rendered.text}`,
				html: `<p><strong>${notice}</strong></p>${rendered.html}`
			});
			Object.assign(entry, { messageId: sent.id, threadId: sent.threadId });
			save();
			const { data: message } = await gmail.users.messages.get({
				userId: 'me',
				id: sent.id,
				format: 'raw'
			});
			const raw = Buffer.from(message.raw, 'base64url').toString();
			assert.ok(
				raw.includes(`/api/pixel?t=${token}`),
				'Sent MIME must contain the expected tracking pixel'
			);
			console.log(
				JSON.stringify({ to, subject, messageId: sent.id, trackingPixelInSentMime: true })
			);
		}
		console.log(`Manifest: ${file}`);
		console.log(
			'Open only OPEN THIS MESSAGE in Gmail with images enabled, then run check. Test records remain excluded from outreach until cleanup.'
		);
	} else {
		const manifest = JSON.parse(readFileSync(process.argv[3], 'utf8'));
		assert.match(manifest.run, /^email-pixel-test-[0-9a-f-]{36}$/);
		if (action === 'check') {
			const rows = await check(
				await db
					.from('emails_table')
					.select('email,open_count,first_open_date,last_open_date,responded')
					.eq('contact_id', manifest.run)
					.eq('lead_source', source)
			);
			console.log(JSON.stringify(rows, null, 2));
		} else {
			await check(
				await db
					.from('emails_table')
					.delete()
					.eq('contact_id', manifest.run)
					.eq('lead_source', source)
			);
			await check(
				await db
					.from('deal_machine_leads')
					.delete()
					.eq('contact_id', manifest.run)
					.eq('lead_source', source)
			);
			console.log(
				'Removed this test’s database records. The labeled emails remain in your mailbox.'
			);
		}
	}
} catch (error) {
	// Google errors can carry full request headers/tokens; never print the object.
	console.error(
		'Outreach test failed:',
		error.response?.data?.error?.message || error.response?.data?.error || error.message
	);
	process.exitCode = 1;
} finally {
	await vite?.close();
}
