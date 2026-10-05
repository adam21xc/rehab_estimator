// Keep provider details and credentials out of client-visible errors.
export function authFailure(failure: { code?: string; status?: number; name?: string }) {
	const code = failure.code;
	if (code === 'otp_expired' || code === 'invalid_credentials')
		return {
			status: 400,
			message: 'That sign-in code is invalid or expired. Request a new code and try again.'
		};
	if (code === 'email_not_confirmed')
		return {
			status: 400,
			message:
				'Confirm your email before signing in. Look for the confirmation email in your inbox or spam folder.'
		};
	if (code === 'email_address_not_authorized')
		return {
			status: 503,
			message:
				'Account emails are not configured for this address. The workspace’s email delivery setup needs to be completed before you can receive a sign-in code.'
		};
	if (
		code === 'over_email_send_rate_limit' ||
		code === 'over_request_rate_limit' ||
		failure.status === 429
	)
		return { status: 429, message: 'Too many attempts. Wait a few minutes before trying again.' };
	if (code === 'signup_disabled' || code === 'email_provider_disabled' || code === 'otp_disabled')
		return {
			status: 503,
			message:
				'Email-code sign-in is unavailable for this account. The workspace authentication settings need to be checked.'
		};
	if (code === 'email_address_invalid')
		return { status: 400, message: 'Check the spelling of your email address and try again.' };
	if (failure.status === 401 || failure.status === 403)
		return {
			status: 503,
			message:
				'The workspace authentication configuration was rejected. The server connection needs to be checked.'
		};
	if (failure.name === 'AuthRetryableFetchError')
		return {
			status: 503,
			message: 'Cannot reach the sign-in service right now. Please try again shortly.'
		};
	return {
		status: 503,
		message:
			'The sign-in service could not complete this request. The workspace authentication logs need to be checked.'
	};
}
