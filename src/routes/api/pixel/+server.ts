import type { RequestHandler } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase';

// 1x1 transparent GIF (GIF89a) bytes
const GIF_1x1 = Uint8Array.from([
  71,73,70,56,57,97, 1,0,1,0, 128,0,0, 0,0,0, 255,255,255,
  33,249,4,1,0,0,1,0, 44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59
]);

function gifResponse() {
  return new Response(GIF_1x1, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(GIF_1x1.byteLength),
      // avoid caching so each open hits the endpoint
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      // allow embedding in email clients
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

export const GET: RequestHandler = async ({ url }) => {
  // Accept t or token for convenience
  const token = url.searchParams.get('t') || url.searchParams.get('token');
  if (!token) {
    // Even without a token, return the pixel (don’t break the image load)
    return gifResponse();
  }

  // Fire-and-forget: try to record, but never block the GIF
  try {
    // Adjust the RPC name/arg to match your SQL function signature:
    // e.g. create or replace function public.track_open(_token text) returns void ...
    const { error } = await supabaseAdmin.rpc('track_open', { _token: token });
    if (error) {
      // Some projects used 'token' instead of '_token' — try that fallback:
      const alt = await supabaseAdmin.rpc('track_open', { token });
      if (alt.error) {
        // As a last resort, log and still return the pixel
        console.error('track_open failed:', error.message, alt.error.message);
      }
    }
  } catch (e) {
    console.error('pixel handler error:', e);
    // swallow errors – still return the GIF
  }

  return gifResponse();
};