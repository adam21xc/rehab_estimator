// src/routes/api/scan-replies/+server.ts
import type { RequestHandler } from '@sveltejs/kit';
import { supabaseAdmin, markReplied } from '$lib/supabase';
import { getThread, getMyAddresses } from '$lib/gmail';

function parseHeader(h: { name?: string; value?: string }[], name: string) {
  return h.find(x => x.name?.toLowerCase() === name.toLowerCase())?.value || '';
}
function addrOf(s: string) {
  const m = s.match(/<(.+?)>/);
  return (m ? m[1] : s).trim().toLowerCase();
}

export const POST: RequestHandler = async () => {
  const { data: rows, error } = await supabaseAdmin
    .from('emails_table')
    .select('contact_email_nk, thread_id, last_email_date')
    .eq('responded', false)
    .not('thread_id', 'is', null)
    .order('last_email_date', { ascending: true })
    .limit(200);

  if (error) return new Response(error.message, { status: 500 });

  const myAddrs = await getMyAddresses();
  let updated = 0;

  for (const r of rows ?? []) {
    try {
      const thread = await getThread(r.thread_id!);
      const msgs = thread.messages ?? [];

      const lastSent = r.last_email_date ? new Date(r.last_email_date) : null;

      const gotReply = msgs.some(m => {
        const hdrs = (m.payload?.headers || []) as Array<{ name?: string; value?: string }>;
        const from = addrOf(parseHeader(hdrs, 'From'));
        const date = m.internalDate ? new Date(Number(m.internalDate)) : undefined;
        if (myAddrs.has(from)) return false;
        if (lastSent && date && date <= lastSent) return false;

        const subject = parseHeader(hdrs, 'Subject').toLowerCase();
        if (subject.includes('out of office') || subject.includes('automatic reply')) return false;
        return true;
      });

      if (gotReply) {
        await markReplied(r.contact_email_nk);
        updated++;
      }
    } catch {
      // ignore thread fetch errors
    }
  }

  return new Response(JSON.stringify({ scanned: rows?.length ?? 0, replied: updated }), {
    headers: { 'Content-Type': 'application/json' }
  });
};