-- Private, persistent enrichment. Source case tables remain authoritative and untouched.
create table public.dm_rollouts (
 id text primary key, lead_limit integer not null check(lead_limit between 1 and 100),
 created_at timestamptz not null default now()
);
insert into public.dm_rollouts(id,lead_limit) values('initial-100',100);
create table public.dm_requests (
 cache_key text primary key, status text not null default 'pending' check(status in ('pending','complete','failed')),
 request jsonb not null, response jsonb, credits integer not null default 0 check(credits>=0),
 started_at timestamptz not null default now(), completed_at timestamptz, error text
);
create table public.dm_properties (
 id text primary key, facts jsonb not null default '{}', estimates jsonb not null default '{}',
 raw_data jsonb not null, observed_at timestamptz not null,
 request_key text not null references public.dm_requests(cache_key)
);
create index dm_properties_request on public.dm_properties(request_key);
create table public.dm_contacts (
 id text primary key, data jsonb not null, observed_at timestamptz not null,
 request_key text not null references public.dm_requests(cache_key)
);
create index dm_contacts_request on public.dm_contacts(request_key);
create table public.dm_property_contacts (
 property_id text not null references public.dm_properties(id),
 contact_id text not null references public.dm_contacts(id), role text not null default 'provider_owner_candidate',
 primary key(property_id,contact_id)
);
create index dm_property_contacts_contact on public.dm_property_contacts(contact_id);
create table public.dm_source_links (
 id text primary key, rollout_id text not null references public.dm_rollouts(id),
 source text not null check(source in ('accela','mycase')), record_type text not null, county text,
 source_id text not null, source_record jsonb not null, candidate_address text,
 address_role text not null, property_id text references public.dm_properties(id),
 request_key text references public.dm_requests(cache_key),
 status text not null check(status in ('needs_match','ready','review','accepted','rejected','no_match')),
 review_reasons jsonb not null default '[]', reviewed_by uuid, reviewed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index dm_source_links_rollout on public.dm_source_links(rollout_id,status);
create index dm_source_links_property on public.dm_source_links(property_id);
create index dm_source_links_request on public.dm_source_links(request_key);
create table public.dm_review_events (
 id uuid primary key default gen_random_uuid(), source_link_id text not null references public.dm_source_links(id),
 actor uuid not null, action text not null, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index dm_review_events_source on public.dm_review_events(source_link_id,created_at);

create function public.dm_enforce_lead_limit() returns trigger language plpgsql security invoker set search_path='' as $$
declare cap integer;
begin
 select lead_limit into cap from public.dm_rollouts where id=new.rollout_id for update;
 if not exists(select 1 from public.dm_source_links where id=new.id) and
    (select count(*) from public.dm_source_links where rollout_id=new.rollout_id)>=cap then
   raise exception 'Rollout lead limit reached';
 end if;
 return new;
end $$;
create trigger dm_lead_limit before insert on public.dm_source_links for each row execute function public.dm_enforce_lead_limit();

-- A cache key can be claimed only once. An interrupted request stays pending for reconciliation.
create function public.dm_claim_request(p_key text,p_request jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 insert into public.dm_requests(cache_key,request) values(p_key,p_request) on conflict do nothing;
 get diagnostics n=row_count; return n=1;
end $$;

create function public.dm_review(p_id text,p_actor uuid,p_action text,p_address text default null)
returns void language plpgsql security invoker set search_path='' as $$
declare r public.dm_source_links;
begin
 select * into r from public.dm_source_links where id=p_id for update;
 if not found then raise exception 'Source record not found'; end if;
 if p_action='accept' and r.property_id is not null then
   update public.dm_source_links set status='accepted',reviewed_by=p_actor,reviewed_at=now(),updated_at=now() where id=p_id;
 elsif p_action='reject' then
   update public.dm_source_links set status='rejected',reviewed_by=p_actor,reviewed_at=now(),updated_at=now() where id=p_id;
 elsif p_action='confirm_address' and length(trim(p_address)) between 8 and 300 then
   update public.dm_source_links set candidate_address=trim(p_address),address_role='reviewed_subject_property',
     property_id=null,request_key=null,status='ready',reviewed_by=p_actor,reviewed_at=now(),updated_at=now() where id=p_id;
 else raise exception 'Invalid review action'; end if;
 insert into public.dm_review_events(source_link_id,actor,action,details)
 values(p_id,p_actor,p_action,jsonb_build_object('previous_status',r.status,'previous_property_id',r.property_id,'address',p_address));
end $$;

alter table public.dm_rollouts enable row level security;
alter table public.dm_requests enable row level security;
alter table public.dm_properties enable row level security;
alter table public.dm_contacts enable row level security;
alter table public.dm_property_contacts enable row level security;
alter table public.dm_source_links enable row level security;
alter table public.dm_review_events enable row level security;
revoke all on public.dm_rollouts,public.dm_requests,public.dm_properties,public.dm_contacts,public.dm_property_contacts,public.dm_source_links,public.dm_review_events from anon,authenticated;
grant all on public.dm_rollouts,public.dm_requests,public.dm_properties,public.dm_contacts,public.dm_property_contacts,public.dm_source_links,public.dm_review_events to service_role;
revoke all on function public.dm_enforce_lead_limit(),public.dm_claim_request(text,jsonb),public.dm_review(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.dm_enforce_lead_limit(),public.dm_claim_request(text,jsonb),public.dm_review(text,uuid,text,text) to service_role;
