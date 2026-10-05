import { json, error } from '@sveltejs/kit';
import { authFailure } from '$lib/server/auth-errors';
import { z } from 'zod';
import { env } from '$env/dynamic/private';
import {
	authClient,
	allowedEmail,
	requireUser,
	sameOrigin,
	setSession,
	readJson
} from '$lib/server/rehab-auth';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async (event) => {
	if (!event.cookies.get('rehab_access') && !event.cookies.get('rehab_refresh'))
		return json(
			{ user: null, renderingEnabled: !!env.OPENAI_API_KEY },
			{ headers: { 'cache-control': 'no-store' } }
		);
	const { user } = await requireUser(event);
	return json({ user: { email: user.email }, renderingEnabled: !!env.OPENAI_API_KEY });
};
export const POST: RequestHandler = async (event) => {
	sameOrigin(event);
	const parsed = z
		.object({
			email: z.string().trim().toLowerCase().pipe(z.email()),
			code: z
				.string()
				.regex(/^[0-9]{6,10}$/)
				.optional(),
			mode: z.enum(['send-code', 'verify'])
		})
		.safeParse(await readJson(event, 4096));
	if (!parsed.success) error(400, 'Enter a valid email and sign-in code.');
	const { email, code, mode } = parsed.data;
	if (!allowedEmail(email)) error(403, 'This email is not enabled for this workspace.');
	const client = authClient();
	if (mode === 'verify' && !code) error(400, 'Enter the code from your email.');
	const result =
		mode === 'send-code'
			? await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
			: await client.auth.verifyOtp({ email, token: code!, type: 'email' });
	const { data, error: authError } = result;
	if (authError) {
		const failure = authFailure(authError);
		console.warn('Workspace authentication failed', {
			mode,
			code: authError.code,
			status: authError.status
		});
		error(failure.status, failure.message);
	}
	if (data.session) setSession(event, data.session);
	return json({
		signedIn: !!data.session,
		message: data.session ? 'Signed in.' : 'Check your inbox for your sign-in code.'
	});
};
export const DELETE: RequestHandler = async (event) => {
	sameOrigin(event);
	const token = event.cookies.get('rehab_access');
	if (token) await authClient().auth.admin.signOut(token, 'local');
	event.cookies.delete('rehab_access', { path: '/api/rehab' });
	event.cookies.delete('rehab_refresh', { path: '/api/rehab' });
	return json({ ok: true });
};
