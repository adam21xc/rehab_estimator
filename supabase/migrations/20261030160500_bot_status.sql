-- Live status for the bot team office. No seller, lead, or contact data.
-- Browsers may select. Bots write with the service role; there are no write policies.

create table public.bot_status (
	bot_id text primary key,
	name text not null,
	color text,
	status text not null check (status in ('active', 'idle', 'blocked', 'waiting')),
	doing text,
	talking_to text references public.bot_status (bot_id) on delete set null,
	message text,
	updated_at timestamptz not null default now()
);

create index bot_status_talking_to on public.bot_status (talking_to);

create function public.bot_status_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
	new.updated_at := pg_catalog.now();
	return new;
end;
$$;

create trigger bot_status_set_updated_at
	before update on public.bot_status
	for each row
	execute function public.bot_status_touch_updated_at();

revoke all on function public.bot_status_touch_updated_at() from public, anon, authenticated;

alter table public.bot_status enable row level security;

revoke all on table public.bot_status from public, anon, authenticated;
grant select on table public.bot_status to anon, authenticated;
grant select, insert, update, delete on table public.bot_status to service_role;

create policy bot_status_select_anon
	on public.bot_status
	for select
	to anon
	using (true);

create policy bot_status_select_authenticated
	on public.bot_status
	for select
	to authenticated
	using (true);

-- Full row images so Realtime can include the previous row on update and delete.
alter table public.bot_status replica identity full;

alter publication supabase_realtime add table public.bot_status;

insert into public.bot_status (bot_id, name, color, status, doing)
values
	('jarvis', 'Jarvis', '#111111', 'active', null),
	('lead-scout', 'Lead Scout', null, 'idle', null),
	('seller-followup', 'Seller Follow-up', null, 'blocked', 'Needs Full Disk Access on Mac mini'),
	('deal-analyzer', 'Deal Analyzer', null, 'idle', null),
	('research-assistant', 'Research Assistant', '#22C55E', 'idle', null);
