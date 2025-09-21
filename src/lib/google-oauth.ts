import { google } from 'googleapis';
import { env } from '$env/dynamic/private';

export function makeOauthClient() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI } = env;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REDIRECT_URI) {
    throw new Error('Missing GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REDIRECT_URI');
  }
  return new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI);
}

// Pass origin so the redirect is always correct in dev/prod
// export function makeOauthClient(redirectUri: string) {
//   const clientId = process.env.GMAIL_CLIENT_ID!;
//   const clientSecret = process.env.GMAIL_CLIENT_SECRET!;
//   if (!clientId || !clientSecret || !redirectUri) {
//     throw new Error('Missing GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / redirectUri');
//   }
//   return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
// }