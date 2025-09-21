// // src/routes/api/scan-replies/+server.ts
// import type { RequestHandler } from '@sveltejs/kit';
// import { env } from '$env/dynamic/private';
// import { supabaseAdmin, markReplied } from '$lib/supabase';
// import { getThread } from '$lib/gmail';

// type H = { name?: string; value?: string };

// function parseHeader(h: H[] = [], name: string) {
//   return h.find((x) => x.name?.toLowerCase() === name.toLowerCase())?.value || '';
// }
// function addrOnly(s?: string) {
//   const raw = String(s || '').trim();
//   const m = raw.match(/<(.+?)>/);
//   return (m ? m[1] : raw).toLowerCase();
// }
// function isAutoReplyLike(subject: string, raw?: string) {
//   const s = (subject || '').toLowerCase();
//   if (s.includes('out of office') || s.includes('automatic reply')) return true;
//   if ((raw || '').toLowerCase().includes('auto-submitted:')) return true;
//   return false;
// }
// function toISO(d?: Date | null) {
//   return d ? new Date(d).toISOString() : undefined;
// }
// function asDateFromMsg(m: any): Date | null {
//   // Gmail threads.get returns messages with internalDate (ms since epoch) as a string
//   if (m?.internalDate) {
//     const n = Number(m.internalDate);
//     if (!Number.isNaN(n)) return new Date(n);
//   }
//   const hdrs: H[] = m?.payload?.headers || [];
//   const hDate = parseHeader(hdrs, 'Date');
//   if (hDate) {
//     const d = new Date(hDate);
//     if (!Number.isNaN(d.getTime())) return d;
//   }
//   return null;
// }

// function getMyAddresses(): Set<string> {
//   const mine = new Set<string>();
//   const from = (env.GMAIL_FROM || '').trim().toLowerCase();
//   if (from) mine.add(from);
//   // Only include true aliases you control; DO NOT include plus-aliases you want to count as replies
//   const aliases = (env.GMAIL_ALIASES || '')
//     .split(',')
//     .map((s) => s.trim().toLowerCase())
//     .filter(Boolean);
//   for (const a of aliases) mine.add(a);
//   return mine;
// }

// export const POST: RequestHandler = async ({ url, request }) => {
//   // 1) AuthN: shared secret
//   const auth = request.headers.get('authorization') ?? '';
//   const expected = `Bearer ${env.SCAN_REPLIES_SECRET ?? ''}`;
//   if (!env.SCAN_REPLIES_SECRET || auth !== expected) {
//     return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
//       status: 401,
//       headers: { 'Content-Type': 'application/json' }
//     });
//   }

//   const dryParam = (url.searchParams.get('dry') || '').toLowerCase();
//   const dry = dryParam === '1' || dryParam === 'true' || dryParam === 'yes';
//   const logParam = (url.searchParams.get('log') || '').toLowerCase();
//   const verbose = logParam === '1' || logParam === 'true';
//   const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') || 200)));

//   // 2) Fetch candidates
//   const { data: rows, error } = await supabaseAdmin
//     .from('emails_table')
//     .select('contact_email_nk, email, thread_id, last_email_date, responded')
//     .eq('responded', false)
//     .not('thread_id', 'is', null)
//     .order('last_email_date', { ascending: true })
//     .limit(limit);

//   if (error) {
//     return new Response(JSON.stringify({ ok: false, error: error.message }), {
//       status: 500,
//       headers: { 'Content-Type': 'application/json' }
//     });
//   }

//   const myAddrs = getMyAddresses();

//   let updated = 0;
//   const matched: string[] = [];
//   const details: Array<{
//     nk: string;
//     msgs: Array<{ from: string; date?: string; used: boolean; reason?: string }>;
//   }> = [];

//   // 3) Scan each thread
//   for (const r of rows ?? []) {
//     const nk = r.contact_email_nk as string;
//     const lastSent = r.last_email_date ? new Date(r.last_email_date as string) : null;
//     const perMsgs: Array<{ from: string; date?: string; used: boolean; reason?: string }> = [];
//     let gotReply = false;

//     try {
//       const t = await getThread(r.thread_id!);
//       // Support both shapes: either the thread object itself or { data: thread }
//       const thread: any = (t && (t as any).messages) ? t : (t as any)?.data ?? t;
//       const msgs: any[] = thread?.messages || [];

//       for (const m of msgs) {
//         const hdrs: H[] = m?.payload?.headers || [];
//         const from = addrOnly(parseHeader(hdrs, 'From'));
//         const subject = parseHeader(hdrs, 'Subject') || '';
//         const d = asDateFromMsg(m);

//         const used =
//           !myAddrs.has(from) &&
//           (!lastSent || (d && d.getTime() > lastSent.getTime())) &&
//           !isAutoReplyLike(subject, (m as any).raw);

//         if (verbose) {
//           perMsgs.push({
//             from,
//             date: toISO(d),
//             used,
//             reason: used
//               ? 'counted'
//               : myAddrs.has(from)
//               ? 'from me'
//               : lastSent && d && d.getTime() <= lastSent.getTime()
//               ? 'before last send'
//               : isAutoReplyLike(subject, (m as any).raw)
//               ? 'auto-reply'
//               : 'unknown'
//           });
//         }

//         if (used) {
//           gotReply = true;
//           break;
//         }
//       }
//     } catch (e: any) {
//       if (verbose) {
//         perMsgs.push({ from: '(thread fetch failed)', used: false, reason: e?.message || String(e) });
//       }
//     }

//     if (verbose) details.push({ nk, msgs: perMsgs });

//     if (gotReply) {
//       matched.push(nk);
//       if (!dry) {
//         await markReplied(nk);
//         updated++;
//       }
//     }
//   }

//   return new Response(
//     JSON.stringify({
//       ok: true,
//       dryRun: dry,
//       scanned: rows?.length ?? 0,
//       repliesDetected: matched.length,
//       updated,
//       nks: dry ? matched : undefined,
//       details: verbose ? details : undefined
//     }),
//     { headers: { 'Content-Type': 'application/json' } }
//   );
// };


// src/routes/api/scan-replies/+server.ts
import type { RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/supabase';
import { getGmail } from '$lib/gmail';

type H = { name?: string; value?: string };

const FIVE_MIN_MS = 5 * 60 * 1000;

function header(h: H[] = [], name: string) {
  return h.find((x) => x.name?.toLowerCase() === name.toLowerCase())?.value || '';
}
function addrOnly(s?: string) {
  const raw = String(s || '').trim();
  const m = raw.match(/<(.+?)>/);
  return (m ? m[1] : raw).toLowerCase();
}
function isAutoReplyLike(subject: string, raw?: string) {
  const s = (subject || '').toLowerCase();
  if (s.includes('out of office') || s.includes('automatic reply')) return true;
  if ((raw || '').toLowerCase().includes('auto-submitted:')) return true;
  return false;
}
function dateFromMessage(m: any): Date | null {
  if (m?.internalDate) {
    const n = Number(m.internalDate);
    if (!Number.isNaN(n)) return new Date(n);
  }
  const d = header(m?.payload?.headers || [], 'Date');
  if (d) {
    const dt = new Date(d);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  return null;
}
function myAddresses(): Set<string> {
  const mine = new Set<string>();
  const from = (env.FROM_EMAIL || '').trim().toLowerCase();
  if (from) mine.add(from);

  const aliases = (env.GMAIL_ALIASES || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  // IMPORTANT while testing: do NOT add plus-aliases to "me"
  for (const a of aliases) {
    if (a.includes('+')) continue; // treat plus addresses as NOT me
    mine.add(a);
  }
  return mine;
}

export const POST: RequestHandler = async ({ url, request }) => {
  // Auth
  const auth = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${env.SCAN_REPLIES_SECRET ?? ''}`;
  if (!env.SCAN_REPLIES_SECRET || auth !== expected) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const dry = ['1', 'true', 'yes'].includes((url.searchParams.get('dry') || '').toLowerCase());
  const verbose = ['1', 'true'].includes((url.searchParams.get('log') || '').toLowerCase());
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') || 200)));
  const filterNk = url.searchParams.get('nk')?.trim().toLowerCase();

  // Load candidates
  let q = supabaseAdmin
    .from('emails_table')
    .select('contact_email_nk, email, thread_id, last_email_date, responded')
    .eq('responded', false)
    .not('thread_id', 'is', null)
    .order('last_email_date', { ascending: true })
    .limit(limit);

  if (filterNk) q = q.eq('contact_email_nk', filterNk);

  const { data: rows, error } = await q;
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const gmail = getGmail();
  const mine = myAddresses();
  let updated = 0;
  const matched: string[] = [];
  const details: Array<{ nk: string; msgs: Array<{ from: string; date?: string; used: boolean; reason?: string }> }> = [];

  for (const r of rows ?? []) {
    const nk = r.contact_email_nk as string;
    const lastSent = r.last_email_date ? new Date(r.last_email_date as string) : null;
    const cutoff = lastSent ? new Date(lastSent.getTime() - FIVE_MIN_MS) : null; // buffer 5 min
    let gotReply = false;
    const perMsgs: Array<{ from: string; date?: string; used: boolean; reason?: string }> = [];

    try {
      const { data: thread } = await gmail.users.threads.get({ userId: 'me', id: r.thread_id as string });
      const msgs = thread?.messages || [];

      for (const m of msgs) {
        const hdrs = (m?.payload?.headers || []) as H[];
        const from = addrOnly(header(hdrs, 'From'));
        const subject = header(hdrs, 'Subject') || '';
        const d = dateFromMessage(m);

        const afterCutoff = !cutoff || (d && d.getTime() > cutoff.getTime());
        const used = !mine.has(from) && afterCutoff && !isAutoReplyLike(subject);

        if (verbose) {
          perMsgs.push({
            from,
            date: d ? new Date(d).toISOString() : undefined,
            used,
            reason: used
              ? 'counted'
              : mine.has(from)
              ? 'from me'
              : cutoff && d && d.getTime() <= cutoff.getTime()
              ? 'before/near last send'
              : isAutoReplyLike(subject)
              ? 'auto-reply'
              : 'unknown'
          });
        }

        if (used) {
          gotReply = true;
          break;
        }
      }
    } catch (e: any) {
      if (verbose) perMsgs.push({ from: '(thread fetch failed)', used: false, reason: e?.message || String(e) });
    }

    if (verbose) details.push({ nk, msgs: perMsgs });

    if (gotReply) {
      matched.push(nk);
      if (!dry) {
        const { error: updErr } = await supabaseAdmin
          .from('emails_table')
          .update({ responded: true, response_date: new Date().toISOString() })
          .eq('contact_email_nk', nk);
        if (!updErr) updated++;
      }
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      dryRun: dry,
      scanned: rows?.length ?? 0,
      repliesDetected: matched.length,
      updated,
      nks: dry ? matched : undefined,
      details: verbose ? details : undefined
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};