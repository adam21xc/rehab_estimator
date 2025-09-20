import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID!,
  process.env.GMAIL_CLIENT_SECRET!,
  process.env.GMAIL_REDIRECT_URI!
);
oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN! });

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

function base64UrlEncode(str: string) {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sendGmail({
  to,
  subject,
  html,
  text,
  from = process.env.FROM_EMAIL!,
  name = process.env.SENDING_NAME ?? 'Outreach'
}: {
  to: string; subject: string; html: string; text: string; from?: string; name?: string;
}) {
  const boundary = `boundary_${Math.random().toString(36).slice(2)}`;
  const raw = [
    `From: ${name} <${from}>`,
    `To: <${to}>`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    '',
    html,
    '',
    `--${boundary}--`
  ].join('\r\n');

  const { data } = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: base64UrlEncode(raw) }
  });

  return {
    messageId: data.id as string | undefined,
    threadId: data.threadId as string | undefined
  };
}

// Utilities for reply scanning
export async function getThread(id: string) {
  const { data } = await gmail.users.threads.get({ userId: 'me', id });
  return data;
}
export async function getMyAddresses(): Promise<Set<string>> {
  const profile = await gmail.users.getProfile({ userId: 'me' });
  const primary = (profile.data.emailAddress || '').toLowerCase();
  const aliases = (process.env.GMAIL_ALIASES || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return new Set([primary, ...aliases]);
}