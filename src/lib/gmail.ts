// import { google } from 'googleapis';

// const oauth2Client = new google.auth.OAuth2(
//   process.env.GMAIL_CLIENT_ID!,
//   process.env.GMAIL_CLIENT_SECRET!,
//   process.env.GMAIL_REDIRECT_URI!
// );
// oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN! });

// const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

// function base64UrlEncode(str: string) {
//   return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
// }

// export async function sendGmail({
//   to,
//   subject,
//   html,
//   text,
//   from = process.env.FROM_EMAIL!,
//   name = process.env.SENDING_NAME ?? 'Outreach'
// }: {
//   to: string; subject: string; html: string; text: string; from?: string; name?: string;
// }) {
//   const boundary = `boundary_${Math.random().toString(36).slice(2)}`;
//   const raw = [
//     `From: ${name} <${from}>`,
//     `To: <${to}>`,
//     `Subject: ${subject}`,
//     'MIME-Version: 1.0',
//     `Content-Type: multipart/alternative; boundary="${boundary}"`,
//     '',
//     `--${boundary}`,
//     'Content-Type: text/plain; charset="UTF-8"',
//     '',
//     text,
//     '',
//     `--${boundary}`,
//     'Content-Type: text/html; charset="UTF-8"',
//     '',
//     html,
//     '',
//     `--${boundary}--`
//   ].join('\r\n');

//   const { data } = await gmail.users.messages.send({
//     userId: 'me',
//     requestBody: { raw: base64UrlEncode(raw) }
//   });

//   return {
//     messageId: data.id as string | undefined,
//     threadId: data.threadId as string | undefined
//   };
// }

// // Utilities for reply scanning
// export async function getThread(id: string) {
//   const { data } = await gmail.users.threads.get({ userId: 'me', id });
//   return data;
// }
// export async function getMyAddresses(): Promise<Set<string>> {
//   const profile = await gmail.users.getProfile({ userId: 'me' });
//   const primary = (profile.data.emailAddress || '').toLowerCase();
//   const aliases = (process.env.GMAIL_ALIASES || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
//   return new Set([primary, ...aliases]);
// }

import { google } from 'googleapis';
import { env } from '$env/dynamic/private';

function assertEnv() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = env;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    throw new Error('Missing Gmail env: GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN');
  }
  return { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN };
}

export function getOAuth2() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = assertEnv();
  const oauth2 = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET /* redirect not needed here */);
  // ✨ THIS is what the error says is missing:
  oauth2.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
  return oauth2;
}

export function getGmail() {
  return google.gmail({ version: 'v1', auth: getOAuth2() });
}

export async function sendGmail(opts: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  fromName?: string;
  fromEmail?: string;
}) {
  const gmail = getGmail();
  const fromName = opts.fromName ?? (env.SENDING_NAME || 'Me');
  const fromEmail = opts.fromEmail ?? (env.FROM_EMAIL || 'me'); // "me" lets Gmail default to the authed account

  const headers = [
    `To: ${opts.to}`,
    `From: ${fromName} <${fromEmail}>`,
    `Subject: ${opts.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="bnd"',
    '',
    '--bnd',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    opts.text ?? '',
    '',
    '--bnd',
    'Content-Type: text/html; charset=UTF-8',
    '',
    opts.html ?? `<pre>${(opts.text ?? '').replace(/[<&>]/g,(c)=>({ '<':'&lt;','>':'&gt;','&':'&amp;' } as any)[c])}</pre>`,
    '',
    '--bnd--'
  ].join('\n');

  const raw = Buffer.from(headers).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw }
  });

  return res.data; // { id, threadId, ... }
}

// export async function getMyAddresses(): Promise<Set<string>> {
//   // If you maintain aliases, load them from env:
//   const bases = (env.GMAIL_ALIASES || '')
//     .split(',')
//     .map((s) => s.trim().toLowerCase())
//     .filter(Boolean);
//   // Also include FROM_EMAIL if present
//   if (env.FROM_EMAIL) bases.push(env.FROM_EMAIL.toLowerCase());
//   return new Set(bases);
// }

// Minimal thread fetch using Gmail API
export async function getThread(threadId: string) {
  const gmail = getGmail();
  const { data } = await gmail.users.threads.get({ userId: 'me', id: threadId });
  return data;
}