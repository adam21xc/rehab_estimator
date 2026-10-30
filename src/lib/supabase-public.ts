import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';

/**
 * Browser client for the public bot office.
 * The anon or publishable key is read-only on bot_status. Never pass the service role here.
 */
export function officeSupabase(): SupabaseClient | null {
	const url = env.PUBLIC_SUPABASE_URL?.trim();
	const key = env.PUBLIC_SUPABASE_ANON_KEY?.trim();
	if (!url || !key) return null;
	return createClient(url, key, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
	});
}
