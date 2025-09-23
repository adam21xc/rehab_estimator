import type { RowView } from '$lib/templates';
import { getTemplate } from '$lib/templates';
import { env as pub } from '$env/dynamic/public';

export function paragraphsToHtml(parts: string[]) {
  return parts.map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`).join('\n');
}
export function paragraphsToText(parts: string[]) {
  return parts.join('\n\n');
}
function escapeHtml(s: string) {
  return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

// Normalize PUBLIC_BASE_DOMAIN and build a safe absolute URL
function getBaseOrigin(): string {
  // Default to your prod domain if not provided
  let base = pub.PUBLIC_BASE_DOMAIN || 'rehab-estimator-two.vercel.app';
  // Strip protocol if someone sets it with https://
  base = base.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return `https://${base}`;
}

export function getPixelUrl(token: string, nk?: string, cacheBust = false) {
  const u = new URL('/api/pixel', getBaseOrigin());
  u.searchParams.set('t', token);
  if (nk) u.searchParams.set('nk', nk);
  if (cacheBust) u.searchParams.set('ts', String(Date.now())); // optional cache buster
  return u.toString();
}

/**
 * Render subject/text/html. If openToken is provided, appends a 1x1 pixel <img>.
 * Pass `nk` (contact_email_nk) if you want richer server logs/analytics.
 */
export function renderEmail(rv: RowView, stage: number, openToken?: string, nk?: string) {
  const tpl = getTemplate(stage);
  const subject = tpl.subject(rv);
  const paragraphs = tpl.paragraphs(rv);
  let html = paragraphsToHtml(paragraphs);
  const text = paragraphsToText(paragraphs);

  if (openToken) {
    const pixelUrl = getPixelUrl(openToken, nk /* optional */, false /* cacheBust */);
    html += `\n<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;overflow:hidden;opacity:0;max-height:0;max-width:0;border:0" />`;
  }

  return { subject, html, text };
}