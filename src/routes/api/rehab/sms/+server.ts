import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { requireUser, sameOrigin, readJson } from '$lib/server/rehab-auth';
import { supabaseAdmin as db } from '$lib/supabase';
import { smsConfig, sendSms } from '$lib/server/twilio';
import type { RequestHandler } from './$types';
const requestZ = z.object({
	requestId: z.uuid(),
	to: z.string().regex(/^\+[1-9]\d{7,14}$/),
	body: z.string().trim().min(1).max(1600),
	consentConfirmed: z.literal(true)
});
export const GET: RequestHandler = async (event) => {
	await requireUser(event);
	const config = smsConfig();
	const phone = event.url.searchParams.get('phone') || '';
	const page = Math.max(0, Number(event.url.searchParams.get('page')) || 0);
	let query = db
		.from('sms_messages')
		.select('id,phone,body,direction,status,provider_sid,error_code,created_at')
		.order('created_at', { ascending: false })
		.range(page * 30, page * 30 + 29);
	if (phone) query = query.eq('phone', phone);
	const { data, error: failure } = await query;
	if (failure) error(503, 'SMS history is unavailable.');
	const { data: block, error: blockError } = phone
		? await db.from('sms_suppressions').select('phone').eq('phone', phone).maybeSingle()
		: { data: null, error: null };
	if (blockError) error(503, 'Unable to check opt-out status.');
	return json({
		messages: data,
		configured: config.ready,
		missing: config.missing,
		sender: config.sender,
		suppressed: !!block
	});
};
export const POST: RequestHandler = async (event) => {
	sameOrigin(event);
	const { user } = await requireUser(event);
	const parsed = requestZ.safeParse(await readJson(event, 12000));
	if (!parsed.success)
		error(
			400,
			'Enter an international phone number (+1…), a message, and confirm permission to text.'
		);
	const input = parsed.data;
	if (!smsConfig().ready) error(503, 'Complete Twilio configuration before sending.');
	const { data: existing, error: lookupError } = await db
		.from('sms_messages')
		.select('id,status')
		.eq('id', input.requestId)
		.maybeSingle();
	if (lookupError) error(503, 'Unable to verify this request.');
	if (existing) return json(existing);
	const { data: block, error: blockError } = await db
		.from('sms_suppressions')
		.select('phone')
		.eq('phone', input.to)
		.maybeSingle();
	if (blockError) error(503, 'Unable to verify opt-out status.');
	if (block) error(409, 'This number opted out. Sending is blocked.');
	const { error: insertError } = await db.from('sms_messages').insert({
		id: input.requestId,
		phone: input.to,
		body: input.body,
		direction: 'outbound',
		status: 'submitting',
		created_by: user.id,
		consent_confirmed_at: new Date().toISOString()
	});
	if (insertError)
		error(409, 'This request may already be submitting. Refresh history before sending again.');
	let status = 'unknown';
	let providerSid: string | null = null;
	let errorCode: string | null = null;
	try {
		const result = await sendSms(input.to, input.body, input.requestId);
		if (result.accepted) {
			status = result.status;
			providerSid = result.sid;
		} else {
			status = result.uncertain ? 'unknown' : 'failed';
			errorCode = result.code;
		}
	} catch {
		status = 'unknown';
	}
	// A webhook may have already progressed the row. Do not overwrite its later status.
	const { error: saveError } = await db
		.from('sms_messages')
		.update({ status, provider_sid: providerSid, error_code: errorCode })
		.eq('id', input.requestId)
		.eq('status', 'submitting');
	if (saveError)
		error(
			503,
			'Twilio may have accepted the message, but its status could not be saved. Check Twilio before trying again.'
		);
	return json({ id: input.requestId, status }, { status: status === 'failed' ? 422 : 200 });
};
