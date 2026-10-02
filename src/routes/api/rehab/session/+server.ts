import { json, error } from '@sveltejs/kit';
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
			email: z.email(),
			password: z.string().min(8).max(128),
			mode: z.enum(['signin', 'signup'])
		})
		.safeParse(await readJson(event, 4096));
	if (!parsed.success) error(400, 'Enter a valid email and a password with at least 8 characters.');
	const { email, password, mode } = parsed.data;
	if (!allowedEmail(email)) error(403, 'This email is not enabled for this workspace.');
	const client = authClient();
	const { data, error: authError } =
		mode === 'signup'
			? await client.auth.signUp({
					email,
					password,
					options: { emailRedirectTo: `${event.url.origin}/rehab` }
				})
			: await client.auth.signInWithPassword({ email, password });
	if (authError)
		error(
			400,
			mode === 'signin'
				? 'Unable to sign in. Check your credentials and confirm your email.'
				: 'Unable to create account. Try signing in or contact the workspace owner.'
		);
	if (data.session) setSession(event, data.session);
	return json({
		signedIn: !!data.session,
		message: data.session
			? 'Signed in.'
			: 'Check your email to confirm your account, then sign in here.'
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
