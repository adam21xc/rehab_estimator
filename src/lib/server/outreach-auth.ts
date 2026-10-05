import { timingSafeEqual } from 'node:crypto';
import { json } from '@sveltejs/kit';

// Machine/admin endpoints must fail closed, including dry runs that expose contacts.
export function authorizeOutreach(request: Request, secret: string | undefined) {
	const supplied = Buffer.from(request.headers.get('authorization') || '');
	const expected = Buffer.from(`Bearer ${secret || ''}`);
	if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
		return json(
			{ ok: false, error: 'unauthorized' },
			{ status: 401, headers: { 'cache-control': 'no-store' } }
		);
	}
}
