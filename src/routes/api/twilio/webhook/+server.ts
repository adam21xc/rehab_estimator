import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { supabaseAdmin as db } from '$lib/supabase';
import { verifyTwilio, nextSmsStatus, isStop } from '$lib/server/twilio';
import type { RequestHandler } from './$types';
const ok = () => new Response('<Response/>', { headers: { 'content-type': 'text/xml' } });
export const POST: RequestHandler = async (event) => {
	const p = await verifyTwilio(event);
	if (!/^SM[a-f0-9]{32}$/i.test(p.MessageSid || '')) error(400, 'Invalid message ID.');
	const id = event.url.searchParams.get('requestId');
	if (id) {
		if (!z.uuid().safeParse(id).success) error(400, 'Invalid request ID.');
		const { data: row, error: lookup } = await db
			.from('sms_messages')
			.select('id,status,provider_sid')
			.eq('id', id)
			.eq('direction', 'outbound')
			.maybeSingle();
		if (lookup || !row) error(503, 'Message not ready. Retry callback.');
		if (row.provider_sid && row.provider_sid !== p.MessageSid) error(409, 'Message mismatch.');
		const { data: updated, error: failure } = await db
			.from('sms_messages')
			.update({
				provider_sid: p.MessageSid,
				status: nextSmsStatus(row.status, p.MessageStatus),
				error_code: p.ErrorCode || null
			})
			.eq('id', id)
			.eq('status', row.status)
			.select('id');
		if (failure || !updated?.length) error(503, 'Retry callback.');
		return ok();
	}
	if (!/^\+[1-9]\d{7,14}$/.test(p.From || '')) error(400, 'Invalid sender.');
	// Persist STOP before the inbox row so a failed inbox write cannot lose an opt-out.
	if (isStop(p.Body || '', p.OptOutType)) {
		const { error: failure } = await db
			.from('sms_suppressions')
			.upsert({ phone: p.From, reason: 'Inbound opt-out', updated_at: new Date().toISOString() });
		if (failure) error(503, 'Retry opt-out.');
	}
	const { error: failure } = await db.from('sms_messages').upsert(
		{
			provider_sid: p.MessageSid,
			phone: p.From,
			body: (p.Body || '').slice(0, 1600),
			direction: 'inbound',
			status: 'received'
		},
		{ onConflict: 'provider_sid', ignoreDuplicates: true }
	);
	if (failure) error(503, 'Retry message.');
	return ok();
};
