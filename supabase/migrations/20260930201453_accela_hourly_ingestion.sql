-- Private source records; future CRM reads must go through authorized server code.
create table public.accela_cases (
 agency text not null default 'INDY', case_number text not null,
 source_url text not null, filed_date date not null, address text,
 case_type text, record_status text, summary jsonb not null default '{}',
 owners jsonb not null default '[]' check(jsonb_typeof(owners)='array'),
 occupants jsonb not null default '[]' check(jsonb_typeof(occupants)='array'),
 violators jsonb not null default '[]' check(jsonb_typeof(violators)='array'),
 related_contacts jsonb not null default '[]', project_description text,
 violation_details jsonb not null default '[]', parcel_information jsonb not null default '[]',
 raw_detail jsonb, detail_hash text,
 first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
 detail_checked_at timestamptz, detail_changed_at timestamptz,
 next_detail_at timestamptz not null default now(), detail_failures integer not null default 0,
 last_error text, primary key(agency,case_number)
);
create index accela_cases_due on public.accela_cases(next_detail_at,case_number);
create index accela_cases_filed on public.accela_cases(filed_date);
create table public.accela_case_versions (
 id uuid primary key default gen_random_uuid(), agency text not null, case_number text not null,
 captured_at timestamptz not null default now(), detail_hash text not null, detail jsonb not null,
 foreign key(agency,case_number) references public.accela_cases(agency,case_number)
);
create index accela_versions_case on public.accela_case_versions(agency,case_number,captured_at desc);
create table public.accela_import_runs (
 id uuid primary key, started_at timestamptz not null default now(), finished_at timestamptz,
 status text not null default 'running' check(status in ('running','success','partial','failed','abandoned')),
 window_start date, window_end date, metrics jsonb not null default '{}', error text
);
create table public.accela_import_state (
 agency text primary key, lease_run_id uuid, lease_until timestamptz,
 last_discovery_end date, last_success_at timestamptz
);
insert into public.accela_import_state(agency) values('INDY');
alter table public.accela_cases enable row level security;
alter table public.accela_case_versions enable row level security;
alter table public.accela_import_runs enable row level security;
alter table public.accela_import_state enable row level security;
revoke all on public.accela_cases,public.accela_case_versions,public.accela_import_runs,public.accela_import_state from anon, authenticated;
grant all on public.accela_cases,public.accela_case_versions,public.accela_import_runs,public.accela_import_state to service_role;

-- Every mutation checks the same fenced lease in its transaction. An expired worker
-- cannot overwrite data after another worker takes over. No SECURITY DEFINER.
create function public.accela_ingest(p_action text,p_run_id uuid,p_payload jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s public.accela_import_state; r jsonb; c public.accela_cases; h text; result jsonb; changed boolean;
begin
 select * into s from public.accela_import_state where agency='INDY' for update;
 if p_action='start' then
  if s.lease_until > now() then return jsonb_build_object('acquired',false); end if;
  update public.accela_import_runs set status='abandoned',finished_at=now(),error='Worker lease expired'
   where id=s.lease_run_id and status='running';
  insert into public.accela_import_runs(id) values(p_run_id);
  update public.accela_import_state set lease_run_id=p_run_id,lease_until=now()+interval '10 minutes' where agency='INDY';
  return jsonb_build_object('acquired',true,'last_discovery_end',s.last_discovery_end);
 end if;
 if s.lease_run_id is distinct from p_run_id or s.lease_until <= now() then raise exception 'Accela worker lease lost'; end if;
 update public.accela_import_state set lease_until=now()+interval '10 minutes' where agency='INDY';
 if p_action='heartbeat' then return '{}'::jsonb;
 elsif p_action='discover' then
  for r in select value from jsonb_array_elements(p_payload->'records') loop
   if coalesce(r->>'case_number','')='' or r->>'source_url' not like 'https://aca-prod.accela.com/INDY/Cap/CapDetail.aspx?%' then raise exception 'Invalid Accela summary'; end if;
   insert into public.accela_cases(case_number,source_url,filed_date,address,case_type,record_status,summary)
   values(r->>'case_number',r->>'source_url',(r->>'filed_date')::date,r->>'address',r->>'case_type',r->>'record_status',r)
   on conflict(agency,case_number) do update set source_url=excluded.source_url,filed_date=excluded.filed_date,
    address=excluded.address,case_type=excluded.case_type,record_status=excluded.record_status,summary=excluded.summary,last_seen_at=now(),
    next_detail_at=case when public.accela_cases.summary is distinct from excluded.summary then least(public.accela_cases.next_detail_at,now()) else public.accela_cases.next_detail_at end;
  end loop;
 elsif p_action='queue' then
  select coalesce(jsonb_agg(t),'[]'::jsonb) into result from
   (select case_number,source_url from public.accela_cases where next_detail_at<=now()
    order by next_detail_at,case_number limit least(greatest(coalesce((p_payload->>'limit')::int,100),1),1000)) t;
  return result;
 elsif p_action='detail' then
  r=p_payload->'detail';
  select * into c from public.accela_cases where agency='INDY' and case_number=r->>'case_number' for update;
  if not found or c.source_url is distinct from r->>'source_url' then raise exception 'Case identity mismatch'; end if;
  if jsonb_typeof(r->'owners') <> 'array' or jsonb_typeof(r->'occupants') <> 'array' or jsonb_typeof(r->'violators') <> 'array' then raise exception 'Invalid parties'; end if;
  h=md5((r-'fetched_at')::text); changed=c.detail_hash is distinct from h;
  if changed then
   insert into public.accela_case_versions(agency,case_number,detail_hash,detail) values('INDY',c.case_number,h,r);
  end if;
  update public.accela_cases set owners=r->'owners',occupants=r->'occupants',violators=r->'violators',
   related_contacts=r->'related_contacts',project_description=r->>'project_description',violation_details=r->'application_tables',
   parcel_information=r->'parcel_information',record_status=r->>'record_status',raw_detail=r,detail_hash=h,
   detail_checked_at=now(),detail_changed_at=case when changed then now() else detail_changed_at end,
   next_detail_at=now()+case when lower(r->>'record_status') like 'closed%' or lower(r->>'record_status') in ('void','cancelled') then interval '7 days' else interval '1 day' end,
   detail_failures=0,last_error=null where agency='INDY' and case_number=c.case_number;
  return jsonb_build_object('changed',changed);
 elsif p_action='error' then
  update public.accela_cases set detail_failures=detail_failures+1,last_error=left(p_payload->>'error',500),
   next_detail_at=now()+make_interval(hours=>least(24,power(2,least(detail_failures,5))::int))
   where agency='INDY' and case_number=p_payload->>'case_number';
 elsif p_action='finish' then
  update public.accela_import_runs set status=p_payload->>'status',finished_at=now(),
   window_start=(p_payload->>'window_start')::date,window_end=(p_payload->>'window_end')::date,
   metrics=coalesce(p_payload->'metrics','{}'),error=left(p_payload->>'error',500) where id=p_run_id;
  update public.accela_import_state set lease_run_id=null,lease_until=null,
   last_discovery_end=case when (p_payload->>'discovery_complete')::boolean then greatest(last_discovery_end,(p_payload->>'window_end')::date) else last_discovery_end end,
   last_success_at=case when p_payload->>'status'='success' then now() else last_success_at end where agency='INDY';
  return jsonb_build_object('pending_details',(select count(*) from public.accela_cases where next_detail_at<=now()));
 else raise exception 'Unknown action';
 end if;
 return '{}'::jsonb;
end $$;
revoke all on function public.accela_ingest(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.accela_ingest(text,uuid,jsonb) to service_role;
