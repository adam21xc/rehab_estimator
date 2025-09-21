import type { RequestHandler } from '@sveltejs/kit';
import { google } from 'googleapis';
import { env } from '$env/dynamic/private';

function b64url(s: string) {
  return Buffer.from(s).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

export const POST: RequestHandler = async ({ request }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const to = body.to;
  if (typeof to !== 'string' || !to.trim()) {
    return new Response(JSON.stringify({ error: '`to` field is required and must be a non-empty string' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  // Basic email regex validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    return new Response(JSON.stringify({ error: '`to` field must be a valid email address' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const subject = typeof body.subject === 'string' && body.subject.trim() ? body.subject : 'Test from SvelteKit Gmail';
  const text = typeof body.message === 'string' && body.message.trim() ? body.message : 'Hello from your server!';
  const html = `<p>${text}</p>`;

  const oauth2 = new google.auth.OAuth2(env.GMAIL_CLIENT_ID, env.GMAIL_CLIENT_SECRET, env.GMAIL_REDIRECT_URI);
  oauth2.setCredentials({ refresh_token: env.GMAIL_REFRESH_TOKEN });
  const gmail = google.gmail({ version: 'v1', auth: oauth2 });

  const boundary = `b_${Math.random().toString(36).slice(2)}`;
  const raw = [
    `From: ${env.SENDING_NAME ?? 'Outreach'} <${env.FROM_EMAIL}>`,
    `To: <${to}>`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '', text, '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    '', html, '',
    `--${boundary}--`
  ].join('\r\n');

  const { data } = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: b64url(raw) } });
  return new Response(JSON.stringify({ ok: true, id: data.id, threadId: data.threadId }), {
    headers: { 'Content-Type': 'application/json' }
  });
};