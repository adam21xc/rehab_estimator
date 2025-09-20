import type { RowView } from '$lib/templates';
import { getTemplate} from '$lib/templates';

export function paragraphsToHtml(parts: string[]) {
  return parts.map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`).join('\n');
}
export function paragraphsToText(parts: string[]) {
  return parts.join('\n\n');
}
function escapeHtml(s: string) {
  return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

export function getPixelUrl(token: string) {
  const base = process.env.PUBLIC_BASE_DOMAIN ?? 'your-domain.com';
  return `https://${base}/api/pixel?t=${encodeURIComponent(token)}`;
}

export function renderEmail(rv: RowView, stage: number, openToken?: string) {
  const tpl = getTemplate(stage);
  const subject = tpl.subject(rv);
  const paragraphs = tpl.paragraphs(rv);
  let html = paragraphsToHtml(paragraphs);
  const text = paragraphsToText(paragraphs);
  if (openToken) {
    html += `\n<img src="${getPixelUrl(openToken)}" width="1" height="1" alt="" style="display:block;opacity:0;border:0;max-height:0;max-width:0"/>`;
  }
  return { subject, html, text };
}