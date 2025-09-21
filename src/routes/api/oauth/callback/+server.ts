import type { RequestHandler } from '@sveltejs/kit';
import { makeOauthClient } from '$lib/google-oauth';
import { google } from 'googleapis';

export const GET: RequestHandler = async ({ url, cookies }) => {
  const code = url.searchParams.get('code');
  const incomingState = url.searchParams.get('state');
  const cookieState = cookies.get('oauth_state');

  if (!code) return new Response('Missing code', { status: 400 });
  if (!incomingState || !cookieState || incomingState !== cookieState) {
    return new Response('Invalid state', { status: 400 });
  }

  // clear state cookie now that we validated it
  cookies.delete('oauth_state', { path: '/' });

  const redirectUri = `${url.origin}/api/oauth/callback`;
  const oauth2 = makeOauthClient(redirectUri);

  try {
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);

    const gmail = google.gmail({ version: 'v1', auth: oauth2 });
    const profile = await gmail.users.getProfile({ userId: 'me' });

    const rt = tokens.refresh_token ?? '';
    const html = `
      <html><body style="font-family:system-ui;padding:2rem">
        <h2>Gmail OAuth complete</h2>
        <p><strong>Account:</strong> ${profile.data.emailAddress ?? '(unknown)'}</p>
        ${
          rt
            ? `<p><strong>Refresh Token (copy to your env):</strong></p>
               <pre style="white-space:pre-wrap;word-break:break-all;background:#f6f6f6;padding:12px;border-radius:8px;">${rt}</pre>`
            : `<p style="color:#b00">No refresh_token returned. Ensure <code>access_type=offline</code> and <code>prompt=consent</code>, and that this account is a Test User in the OAuth consent screen.</p>`
        }
        <p>You can close this tab.</p>
      </body></html>
    `.trim();

    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (e) {
    console.error(e);
    return new Response('Token exchange failed', { status: 500 });
  }
};