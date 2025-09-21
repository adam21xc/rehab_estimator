// src/routes/api/scan-replies/+server.ts
import type { RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin, markReplied } from '$lib/supabase';
import { getThread } from '$lib/gmail';

function parseHeader(h: { name?: string; value?: string }[], name: string) {
  return h.find((x) => x.name?.toLowerCase() === name.toLowerCase())?.value || '';
}
function addrOf(s: string) {
  const m = s.match(/<(.+?)>/);
  return (m ? m[1] : s).trim().toLowerCase();
}
function isAutoReplyLike(subject: string, raw?: string) {
  const s = subject.toLowerCase();
  if (s.includes('out of office') || s.includes('automatic reply')) return true;
  if (raw && raw.toLowerCase().includes('auto-submitted:')) return true;
  return false;
}

export const POST: RequestHandler = async ({ url, request }) => {
  // ── 1) AuthN: require shared secret so only your scheduler can invoke
  const auth = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${env.SCAN_REPLIES_SECRET ?? ''}`;
  if (!env.SCAN_REPLIES_SECRET || auth !== expected) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // ── 2) Options: dry run & limit
  const dryParam = (url.searchParams.get('dry') || '').toLowerCase();
  const dryRun = dryParam === '1' || dryParam === 'true' || dryParam === 'yes';
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 1),
    1000
  );

  // ── 3) Fetch candidate rows
  const { data: rows, error } = await supabaseAdmin
    .from('emails_table')
    .select('contact_email_nk, thread_id, last_email_date, responded')
    .eq('responded', false)
    .not('thread_id', 'is', null)
    .order('last_email_date', { ascending: true })
    .limit(limit);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // const myAddrs = await getMyAddresses();
  let updated = 0;
  const matched: string[] = [];
  const scanned = rows?.length ?? 0;

  // ── 4) Scan each thread for prospect replies
  for (const r of rows ?? []) {
    try {
      const thread = await getThread(r.thread_id!);
      const msgs = thread.messages ?? [];
      const lastSent = r.last_email_date ? new Date(r.last_email_date) : null;

      const gotReply = msgs.some((m) => {
        const hdrs = (m.payload?.headers || []) as Array<{ name?: string; value?: string }>;
        const from = addrOf(parseHeader(hdrs, 'From'));
        const subject = parseHeader(hdrs, 'Subject') || '';
        const internalDate = m.internalDate ? new Date(Number(m.internalDate)) : undefined;

        // if (myAddrs.has(from)) return false; // skip our own messages
        if (lastSent && internalDate && internalDate <= lastSent) return false; // only messages after our send
        if (isAutoReplyLike(subject, (m as any).raw)) return false;

        return true;
      });

      if (gotReply) {
        matched.push(r.contact_email_nk);
        if (!dryRun) {
          await markReplied(r.contact_email_nk);
          updated++;
        }
      }
    } catch (e) {
      // Ignore per-thread errors; continue scanning others
    }
  }

  // ── 5) Respond with details (and no side‑effects when dry)
  return new Response(
    JSON.stringify({
      ok: true,
      dryRun,
      scanned,
      repliesDetected: matched.length,
      updated, // 0 when dryRun=true
      nks: dryRun ? matched : undefined
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};