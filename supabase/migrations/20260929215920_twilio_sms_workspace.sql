-- Shared SMS inbox for the server-authorized workspace, not a publicly accessible API.
create table public.sms_messages (
 id uuid primary key default gen_random_uuid(),
 provider_sid text unique,
 phone text not null,
 body text not null,
 direction text not null check(direction in ('inbound','outbound')),
 status text not null,
 error_code text,
 created_by uuid references auth.users(id) on delete set null,
 consent_confirmed_at timestamptz,
 created_at timestamptz not null default now()
);
create index sms_messages_phone_history on public.sms_messages(phone,created_at desc);
create index sms_messages_history on public.sms_messages(created_at desc);
create index sms_messages_author on public.sms_messages(created_by);
create unique index sms_one_uncertain_send_per_phone on public.sms_messages(phone) where direction='outbound' and status in ('submitting','unknown');
create table public.sms_suppressions(phone text primary key,reason text not null,updated_at timestamptz not null default now());
alter table public.sms_messages enable row level security;
alter table public.sms_suppressions enable row level security;
revoke all on public.sms_messages,public.sms_suppressions from anon,authenticated;
grant all on public.sms_messages,public.sms_suppressions to service_role;
