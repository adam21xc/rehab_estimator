import { supabaseAdmin } from './supabase';

const DAYS = Number(process.env.DAYS_BETWEEN_FOLLOWUPS ?? 7);
const MAXF = Number(process.env.MAX_FOLLOWUPS ?? 10);

export type DueRow = {
  contact_email_nk: string;
  email: string;
  followup_count: number;
  responded: boolean;
  last_email_date: string | null;
  open_token: string | null;
  first_name?: string | null;    // if you denormalize into emails_table, or fetch via join
  a1?: string | null;
  fullAddress?: string | null;
};

export async function fetchDue(batchSize: number): Promise<DueRow[]> {
  // Let the DB do the date math (Postgres)
  const { data, error } = await supabaseAdmin
    .from('emails_table')
    .select('contact_email_nk,email,followup_count,responded,last_email_date,open_token')
    .eq('responded', false)
    .lt('followup_count', MAXF)
    .or(`last_email_date.is.null,last_email_date.lte.${daysAgoISO(DAYS)}`)
    .order('last_email_date', { ascending: true, nullsFirst: true })
    .limit(batchSize);

  if (error) throw error;
  return (data ?? []) as DueRow[];
}

function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}