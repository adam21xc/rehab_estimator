import type { RequestHandler } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase';
const GIF = Uint8Array.from([71,73,70,56,57,97,1,0,1,0,128,0,0,0,0,0,255,255,255,33,249,4,1,0,0,1,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59]);

export const GET: RequestHandler = async ({ url }) => {
  const token = url.searchParams.get('t')?.trim();
  if (token) await supabaseAdmin.rpc('track_open', { token }).catch(() => {});
  return new Response(GIF, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
    }
  });
};