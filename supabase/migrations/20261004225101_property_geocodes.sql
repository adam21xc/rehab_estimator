-- Shared source-address cache. Access only through allowlisted, authenticated server endpoints.
create table public.property_geocodes (
 address_key text primary key,
 address text not null,
 status text not null check (status in ('pending','matched','review','failed')),
 longitude double precision check (longitude between -180 and 180),
 latitude double precision check (latitude between -90 and 90),
 provider text not null default 'mapbox',
 provider_id text,
 accuracy text,
 match_confidence text,
 matched_address text,
 error_code text,
 lease_id uuid,
 attempted_at timestamptz not null default now(),
 geocoded_at timestamptz,
 check ((status = 'matched' and longitude is not null and latitude is not null) or
        (status <> 'matched' and longitude is null and latitude is null))
);
alter table public.property_geocodes enable row level security;
revoke all on public.property_geocodes from public, anon, authenticated;
grant select, insert, update, delete on public.property_geocodes to service_role;
comment on table public.property_geocodes is 'Mapbox permanent=true results, keyed by conservative normalized address including units. No automatic retry of failed or uncertain matches.';
