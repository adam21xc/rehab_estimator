import { createClient, type Session } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { error, type RequestEvent } from '@sveltejs/kit';

export function authClient() {
	return createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
	});
}
export function allowedEmail(email?: string) {
	const allowed = (env.REHAB_ALLOWED_EMAILS || env.FROM_EMAIL || '')
		.split(',')
		.map((v) => v.trim().toLowerCase())
		.filter(Boolean);
	return !!email && allowed.includes(email.toLowerCase());
}
export function sameOrigin(event: RequestEvent) {
	if (event.request.headers.get('origin') !== event.url.origin)
		error(403, 'Please use the calculator to submit this request.');
}
export function setSession(event: RequestEvent, session: Session) {
	const options = {
		path: '/api/rehab',
		httpOnly: true,
		secure: event.url.protocol === 'https:',
		sameSite: 'strict' as const
	};
	event.cookies.set('rehab_access', session.access_token, { ...options, maxAge: 3600 });
	event.cookies.set('rehab_refresh', session.refresh_token, {
		...options,
		maxAge: 60 * 60 * 24 * 30
	});
}
export async function requireUser(event: RequestEvent) {
	event.setHeaders({ 'cache-control': 'private, no-store' });
	const client = authClient();
	let token = event.cookies.get('rehab_access');
	let user = token ? (await client.auth.getUser(token)).data.user : null;
	const refresh = event.cookies.get('rehab_refresh');
	if (!user && refresh) {
		const { data } = await client.auth.refreshSession({ refresh_token: refresh });
		if (data.session) {
			setSession(event, data.session);
			token = data.session.access_token;
			user = data.user;
		}
	}
	if (!user || !allowedEmail(user.email))
		error(401, 'Sign in to save estimates and view your history.');
	// User JWT applies RLS even though the server holds the service key. No keys reach the browser.
	const db = createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
		global: { headers: { Authorization: `Bearer ${token}` } },
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
	});
	return { user, db };
}
export async function readJson(event: RequestEvent, maxBytes = 1024 * 1024) {
	const reader = event.request.body?.getReader();
	if (!reader) error(400, 'Missing request body.');
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.length;
		if (size > maxBytes) {
			await reader.cancel();
			error(413, 'Request is too large.');
		}
		chunks.push(value);
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8'));
	} catch {
		error(400, 'Invalid JSON.');
	}
}
