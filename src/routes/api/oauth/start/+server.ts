import type { RequestHandler } from '@sveltejs/kit';
import { makeOauthClient } from '$lib/google-oauth';
import crypto from 'node:crypto';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.compose'

];



export const GET: RequestHandler = async ({ url, cookies }) => {
  const redirectUri = `${url.origin}/api/oauth/callback`; // must also be whitelisted in Google console
  const oauth2 = makeOauthClient(redirectUri);

  const state = crypto.randomBytes(16).toString('hex');

  // Set CSRF cookie properly
  cookies.set('oauth_state', state, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: url.protocol === 'https:', // true in prod
    maxAge: 600
  });

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state
  });

  return new Response(null, { status: 302, headers: { Location: authUrl } });
};