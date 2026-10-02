// Read-only case verification with a temporary auth user; no source records are changed.
import { loadEnv, createServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const env = loadEnv('development', process.cwd(), '');
const admin = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false }
});
let userId, vite;
try {
	const email = `crm-test-${randomUUID()}@example.com`,
		password = randomUUID() + randomUUID();
	const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
	if (created.error) throw created.error;
	userId = created.data.user.id;
	const login = await admin.auth.signInWithPassword({ email, password });
	if (login.error) throw login.error;
	const token = login.data.session.access_token;
	process.env.REHAB_ALLOWED_EMAILS = email;
	vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
	const list = await vite.ssrLoadModule('/src/routes/api/rehab/leads/+server.ts');
	const detail = await vite.ssrLoadModule('/src/routes/api/rehab/leads/[id]/+server.ts');
	const event = (search = '', id = '', authenticated = true) => ({
		url: new URL('http://localhost/api/rehab/leads' + search),
		params: { id },
		cookies: {
			get: (name) => (name === 'rehab_access' && authenticated ? token : undefined),
			set: () => {}
		},
		setHeaders: () => {}
	});
	await assert.rejects(list.GET(event('', '', false)), (e) => e.status === 401);
	const first = await (await list.GET(event())).json();
	assert.ok(first.count > 0);
	assert.ok(first.leads.length <= 25);
	const second = await (await list.GET(event('?page=2'))).json();
	assert.ok(!second.leads.some((b) => first.leads.some((a) => a.case_number === b.case_number)));
	const filtered = await (
		await list.GET(event('?q=' + encodeURIComponent(first.leads[0].case_number)))
	).json();
	assert.equal(filtered.count, 1);
	const closed = await (await list.GET(event('?status=closed'))).json();
	assert.ok(closed.leads.every((r) => r.record_status.startsWith('Closed')));
	const pending = await (await list.GET(event('?readiness=pending'))).json();
	assert.ok(pending.leads.every((r) => !r.detail_checked_at));
	const item = await (await detail.GET(event('', first.leads[0].case_number))).json();
	assert.equal(item.lead.case_number, first.leads[0].case_number);
	await assert.rejects(detail.GET(event('', 'NONEXISTENT-CASE')), (e) => e.status === 404);
	const mycase = await vite.ssrLoadModule('/src/routes/api/rehab/mycase/+server.ts');
	const mycaseDetail = await vite.ssrLoadModule('/src/routes/api/rehab/mycase/[id]/+server.ts');
	await assert.rejects(mycase.GET(event('', '', false)), (e) => e.status === 401);
	await assert.rejects(mycaseDetail.GET(event('', 'test', false)), (e) => e.status === 401);
	const cases = await (await mycase.GET(event())).json();
	assert.ok(cases.total > 0);
	const mf = await (await mycase.GET(event('?type=MF&county=49'))).json();
	assert.ok(mf.cases.length > 0);
	assert.ok(mf.cases.every((r) => r.case_type_code === 'MF' && r.county_code === '49'));
	const caseDetail = await (await mycaseDetail.GET(event('', mf.cases[0].case_number))).json();
	assert.equal(caseDetail.case.case_number, mf.cases[0].case_number);
	assert.ok(!('raw_json' in caseDetail.case));
	assert.ok(!('token' in caseDetail.case));
	await assert.rejects(mycaseDetail.GET(event('', 'NONEXISTENT')), (e) => e.status === 404);
	console.log(
		JSON.stringify({ mycase: 'passed', total: cases.total, lastUpdated: cases.lastUpdated })
	);
	const { env: serverEnv } = await vite.ssrLoadModule('$env/dynamic/private');
	serverEnv.REHAB_ALLOWED_EMAILS = 'different@example.com';
	await assert.rejects(mycase.GET(event()), (e) => e.status === 401);
	await assert.rejects(
		mycaseDetail.GET(event('', mf.cases[0].case_number)),
		(e) => e.status === 401
	);
	await assert.rejects(list.GET(event()), (e) => e.status === 401);
	console.log(
		JSON.stringify({
			result: 'passed',
			totalCases: first.stats.total,
			detailsAvailable: first.stats.ready,
			checks:
				'authorized reads, denied anonymous/non-allowlisted users, pagination, search, filters, detail, missing case'
		})
	);
} finally {
	if (userId) {
		const cleanup = await admin.auth.admin.deleteUser(userId);
		if (cleanup.error) {
			console.error('Cleanup failed:', cleanup.error);
			process.exitCode = 1;
		}
	}
	await vite?.close();
}
