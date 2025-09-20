// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

if (!PUBLIC_SUPABASE_URL) throw new Error('PUBLIC_SUPABASE_URL is not set');
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');

// IMPORTANT: only import this module from server routes (+server.ts) or hooks.server.ts
export const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

export async function bumpFollowup(nk: string, threadId?: string) {
  const { error } = await supabaseAdmin.rpc('bump_followup', { _nk: nk, _thread: threadId ?? null });
  if (error) throw error;
}

export async function markReplied(nk: string) {
  const { error } = await supabaseAdmin
    .from('emails_table')
    .update({ responded: true, response_date: new Date().toISOString() })
    .eq('contact_email_nk', nk);
  if (error) throw error;
}