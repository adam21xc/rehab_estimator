import { env } from '$env/dynamic/private';
import type { RequestHandler } from '@sveltejs/kit';
import { fetchDue } from '$lib/due';
import { renderEmail } from '$lib/render';
import { sendGmail } from '$lib/gmail';
import { bumpFollowup } from '$lib/supabase';

const BATCH = Number(env.BATCH_SIZE ?? 25);
const SEND_DELAY_MS = Number(env.SEND_DELAY_MS ?? 300);
const SEND_SECRET = env.SEND_DUE_SECRET || '';

export const POST: RequestHandler = async ({ url, request }) => {
  // Optional auth: if SEND_DUE_SECRET is configured, require it
  if (SEND_SECRET) {
    const auth = request.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${SEND_SECRET}`) {
      return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  const dryParam = (url.searchParams.get('dry') || '').toLowerCase();
  const dry = dryParam === '1' || dryParam === 'true' || dryParam === 'yes';

  const limit = Math.max(
    1,
    Number(url.searchParams.get('limit') || BATCH) || BATCH
  );

  const due = await fetchDue(limit);

  const previews: Array<{ nk: string; to: string; stage: number; subject: string }> = [];
  const sentSummaries: Array<{ nk: string; to: string; threadId?: string }> = [];
  const errors: Array<{ nk: string; to?: string; error: string }> = [];

  let sent = 0;

  // Simple recipient validator (loose on purpose)
  const isEmailish = (s: string | null | undefined) =>
    !!s && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

  for (const row of due) {
    try {
      const to = row.email;
      if (!isEmailish(to)) {
        errors.push({ nk: row.contact_email_nk, to, error: 'invalid or missing email' });
        continue;
      }

      // Stage: 0 for first send, otherwise equal to followups already sent
      const stage = row.last_email_date ? row.followup_count : 0;

      // Build rowView from joined lead context (no duplication in emails_table)
      const rv = {
        first: row.lead?.first_name ?? undefined,
        a1: row.lead?.associated_property_address_line_1 ?? undefined,
        fullAddress: row.lead?.associated_property_address_full ?? undefined,
        // optional: pass through leadSource for template anecdotes
        leadSource: row.lead?.lead_source ?? row.lead_source ?? undefined
      } as any;

      console.log(rv, 'before renderEmail');

      const { subject, html, text } = renderEmail(rv, stage, row.open_token ?? undefined);

      if (dry) {
        previews.push({ nk: row.contact_email_nk, to, stage, subject });
        continue;
      }

      const { threadId } = await sendGmail({
        to,
        subject,
        html,
        text
      });

      await bumpFollowup(row.contact_email_nk, threadId);
      sent++;
      sentSummaries.push({ nk: row.contact_email_nk, to, threadId });

      // small throttling to avoid hammering the API
      if (SEND_DELAY_MS > 0) {
        await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
      }
    } catch (e: any) {
      errors.push({
        nk: row.contact_email_nk,
        to: row.email,
        error: e?.message ?? String(e)
      });
    }
  }

  const body = dry
    ? { ok: true, mode: 'dry-run', queued: due.length, previews, errors }
    : { ok: true, mode: 'send', queued: due.length, sent, results: sentSummaries, errors };

  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
};