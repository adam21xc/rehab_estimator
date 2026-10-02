-- Saved estimates are immutable snapshots; each save creates a historical version.
create table public.rehab_estimates (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 project_id text not null,
 address text not null,
 total numeric not null check(total >= 0 and total <= 1000000000000),
 snapshot jsonb not null,
 created_at timestamptz not null default now()
);
create index rehab_estimates_owner_history on public.rehab_estimates(user_id,created_at desc);
alter table public.rehab_estimates enable row level security;
revoke all on public.rehab_estimates from anon, authenticated;
grant select,insert on public.rehab_estimates to authenticated;
create policy rehab_estimates_read on public.rehab_estimates for select to authenticated using ((select auth.uid())=user_id);
create policy rehab_estimates_create on public.rehab_estimates for insert to authenticated with check ((select auth.uid())=user_id);
create table public.rehab_renderings (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 estimate_id uuid not null references public.rehab_estimates(id) on delete cascade,
 source_photo_id text not null,
 prompt text not null,
 style text not null,
 model text not null,
 status text not null check(status in ('processing','completed','failed')),
 output_path text,
 error_message text,
 created_at timestamptz not null default now()
);
create index rehab_renderings_estimate on public.rehab_renderings(estimate_id);
create index rehab_renderings_owner on public.rehab_renderings(user_id,created_at desc);
create unique index rehab_renderings_one_active on public.rehab_renderings(user_id) where status='processing';
alter table public.rehab_renderings enable row level security;
revoke all on public.rehab_renderings from anon, authenticated;
grant select,insert,update on public.rehab_renderings to authenticated;
create policy rehab_renderings_read on public.rehab_renderings for select to authenticated using ((select auth.uid())=user_id);
create policy rehab_renderings_create on public.rehab_renderings for insert to authenticated with check ((select auth.uid())=user_id and exists(select 1 from public.rehab_estimates e where e.id=estimate_id and e.user_id=(select auth.uid())));
create policy rehab_renderings_update on public.rehab_renderings for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id and exists(select 1 from public.rehab_estimates e where e.id=estimate_id and e.user_id=(select auth.uid())));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('rehab-media','rehab-media',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy rehab_media_read on storage.objects for select to authenticated using (bucket_id='rehab-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy rehab_media_create on storage.objects for insert to authenticated with check (bucket_id='rehab-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
