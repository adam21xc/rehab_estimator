// // src/routes/api/send-due/+server.ts
// import type { RequestHandler } from '@sveltejs/kit';
// import { fetchDue } from '$lib/due';
// import { renderEmail } from '$lib/render';
// import { sendGmail } from '$lib/gmail';
// import { bumpFollowup, supabaseAdmin } from '$lib/supabase';

// const BATCH = Number(process.env.BATCH_SIZE ?? 25);

// export const POST: RequestHandler = async () => {
//   const due = await fetchDue(BATCH);
//   let sent = 0;

//   for (const row of due) {
//     // stage rule: stage = 0 if never sent, else = followup_count
//     const stage = row.last_email_date ? row.followup_count : 0;

//     // You can enrich rv with name/address if you store them in emails_table or join contacts
//     const rv = { first: undefined, a1: undefined, fullAddress: undefined };
//     const { subject, html, text } = renderEmail(rv, stage, row.open_token ?? undefined);

//     const { threadId } = await sendGmail({
//       to: row.email!,
//       subject,
//       html,
//       text
//     });

//     await bumpFollowup(row.contact_email_nk, threadId);
//     sent++;
//     // Optional: simple throttle to look human-ish
//     await new Promise(r => setTimeout(r, 500)); // 0.5s
//   }

//   return new Response(JSON.stringify({ queued: due.length, sent }), { headers: { 'Content-Type': 'application/json' } });
// };


import type { RequestHandler } from '@sveltejs/kit';
import { fetchDue } from '$lib/due';
import { renderEmail } from '$lib/render';
import { sendGmail } from '$lib/gmail';
import { bumpFollowup } from '$lib/supabase';

const BATCH = Number(process.env.BATCH_SIZE ?? 25);

export const POST: RequestHandler = async ({ url }) => {
  const dry = url.searchParams.get('dry') === '1';

  const due = await fetchDue(BATCH);
  const previews: Array<{ nk: string; to: string; stage: number; subject: string }> = [];
  let sent = 0;

  for (const row of due) {
    const stage = row.last_email_date ? row.followup_count : 0;

    // Build rowView (extend with your data if you store it)
    const rv = {
      first: undefined,
      a1: undefined,
      fullAddress: undefined
    };

    const { subject, html, text } = renderEmail(rv, stage, row.open_token ?? undefined);

    if (dry) {
      previews.push({ nk: row.contact_email_nk, to: row.email, stage, subject });
      continue; // no send/bump
    }

    const { threadId } = await sendGmail({
      to: row.email!,
      subject,
      html,
      text
    });

    await bumpFollowup(row.contact_email_nk, threadId);
    sent++;
    await new Promise(r => setTimeout(r, 300)); // tiny delay
  }

  const body = dry
    ? { mode: 'dry-run', queued: due.length, previews }
    : { mode: 'send', queued: due.length, sent };

  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
};