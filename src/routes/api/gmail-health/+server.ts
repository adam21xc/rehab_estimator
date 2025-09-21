import { json } from '@sveltejs/kit';
import { google } from 'googleapis';
import { env } from '$env/dynamic/private';

export async function GET() {
  try {
    const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = env;
    if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
      throw new Error('Missing Gmail env vars (CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN)');
    }

    // Build OAuth client
    const oauth2 = new google.auth.OAuth2(
      GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET,
      // redirectUri not needed here because we’re just refreshing
    );
    oauth2.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });

    // Gmail API client
    const gmail = google.gmail({ version: 'v1', auth: oauth2 });

    // Verify identity
    const profile = await gmail.users.getProfile({ userId: 'me' });

    return json({
      ok: true,
      email: profile.data.emailAddress,
      messagesTotal: profile.data.messagesTotal,
      threadsTotal: profile.data.threadsTotal
    });
  } catch (err: any) {
    console.error('gmail-health error', err);
    return json({ ok: false, error: err.message }, { status: 500 });
  }
}