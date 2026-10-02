import type { RequestHandler } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase';

// 1x1 transparent GIF (GIF89a) bytes
const GIF_1x1 = Uint8Array.from([
	71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255, 33, 249, 4, 1, 0, 0, 1, 0,
	44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59
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

	// Await the write so serverless execution cannot end before it completes.
	try {
		const { error } = await supabaseAdmin.rpc('track_open', { token });
		if (error?.code === 'PGRST202') {
			// Compatibility with older databases using the _token argument. Retry only
			// a missing signature, never an ambiguous failure that could double count.
			const alternate = await supabaseAdmin.rpc('track_open', { _token: token });
			if (alternate.error) console.error('track_open failed:', alternate.error.message);
		} else if (error) {
			console.error('track_open failed:', error.message);
		}
	} catch (e) {
		console.error('pixel handler error:', e);
		// swallow errors – still return the GIF
	}

	return gifResponse();
};
