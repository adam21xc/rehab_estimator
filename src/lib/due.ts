import { supabaseAdmin } from './supabase';

export const DAYS_BETWEEN_FOLLOWUPS = Number(process.env.DAYS_BETWEEN_FOLLOWUPS ?? 7);
export const MAX_FOLLOWUPS = Number(process.env.MAX_FOLLOWUPS ?? 10);

export type DueRow = {
  contact_email_nk: string;
  contact_id: string;
  associated_property_id: string | null;
  email: string;
  followup_count: number;
  responded: boolean;
  last_email_date: string | null;
  open_token: string | null;
  lead_source: string | null;
  // joined lead context (from deal_machine_leads via FK)
  lead: {
    first_name: string | null;
    associated_property_address_line_1: string | null;
    associated_property_address_full: string | null;
    lead_source: string | null;
  } | null;
};

/**
 * A record is due if:
 *  - responded = false
 *  - followup_count < MAX_FOLLOWUPS
 *  - and (last_email_date is null) OR (last_email_date older than cadence cutoff)
 */
export async function fetchDue(batchSize: number): Promise<DueRow[]> {
  const cutoffISO = daysAgoISO(DAYS_BETWEEN_FOLLOWUPS);

  const { data, error } = await supabaseAdmin
    .from('emails_table')
    .select(`
      contact_email_nk,
      contact_id,
      associated_property_id,
      email,
      followup_count,
      responded,
      last_email_date,
      open_token,
      lead_source,
      lead:deal_machine_leads (
        first_name,
        associated_property_address_line_1,
        associated_property_address_full,
        lead_source
      )
    `)
    .eq('responded', false)
    .lt('followup_count', MAX_FOLLOWUPS)
    .or(`last_email_date.is.null,last_email_date.lt.${cutoffISO}`)
    .order('last_email_date', { ascending: true, nullsFirst: true })
    .limit(batchSize);

  if (error) throw error;
  return (data ?? []) as unknown as DueRow[];
}

function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}