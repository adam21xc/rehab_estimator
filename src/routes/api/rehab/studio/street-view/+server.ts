import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { z } from 'zod';
import { authClient, requireUser, sameOrigin, readJson } from '$lib/server/rehab-auth';
import { findStudioLocation } from '$lib/server/studio-location';
import { streetView } from '$lib/intelligence/map-icons';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async (event) => {
	sameOrigin(event);
	await requireUser(event);
	const input = z
		.object({ address: z.string().trim().min(8).max(256) })
		.safeParse(await readJson(event, 2048));
	if (!input.success) error(400, 'Enter a full street address, city, state and ZIP.');
	const location = await findStudioLocation(
		authClient(),
		input.data.address,
		env.DEALMACHINE_API_KEY || ''
	);
	const view = streetView(location.coordinates)!;
	// Fetch only our constructed provider URL; clients cannot make arbitrary server requests.
	const response = await fetch(view.image, {
		redirect: 'error',
		signal: AbortSignal.timeout(30000)
	});
	if (!response.ok || !response.headers.get('content-type')?.startsWith('image/'))
		error(404, 'Street View is unavailable here. Upload a photo instead.');
	const reader = response.body?.getReader();
	if (!reader) error(502, 'Unable to load the photo.');
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.length;
		if (size > 5 * 1024 * 1024) {
			await reader.cancel();
			error(413, 'This photo is too large. Upload a smaller photo.');
		}
		chunks.push(value);
	}
	const bytes = Buffer.concat(chunks);
	const mime = response.headers.get('content-type')!.split(';')[0];
	if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime) || !bytes.length)
		error(404, 'A usable Street View photo is unavailable here.');
	return json({
		address: location.address,
		warning: location.warning,
		link: view.link,
		dataUrl: `data:${mime};base64,${bytes.toString('base64')}`,
		mime
	});
};
