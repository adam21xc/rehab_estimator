create table public.gateway_imports (
 id uuid primary key default gen_random_uuid(), county text not null, source_year integer not null,
 expected_rows integer not null, loaded_rows integer not null default 0,
 captured_at timestamptz not null, completed_at timestamptz, status text not null default 'loading' check (status in ('loading','complete','failed'))
);
create table public.gateway_sales (
 import_id uuid not null references public.gateway_imports(id) on delete cascade,
 ordinal integer not null, sdf_id text not null, parcel_number text not null, raw jsonb not null,
 primary key(import_id,ordinal), unique(import_id,sdf_id,parcel_number)
);
create index gateway_imports_latest on public.gateway_imports(county,source_year,completed_at desc) where status='complete';
alter table public.gateway_imports enable row level security;
alter table public.gateway_sales enable row level security;
revoke all on public.gateway_imports,public.gateway_sales from public,anon,authenticated;
grant select,insert,update,delete on public.gateway_imports,public.gateway_sales to service_role;
