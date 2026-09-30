-- ARSKEIL production data layer for the updated project.
-- Run in the NEW Supabase project after creating/confirming profiles, access_requests and audit_logs.

create extension if not exists pgcrypto;

create table if not exists public.app_records (
  table_name text not null,
  record_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (table_name, record_id)
);

create index if not exists idx_app_records_table on public.app_records(table_name);
create index if not exists idx_app_records_payload_case on public.app_records using gin(payload);

alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists branch text;
alter table public.profiles add column if not exists active boolean not null default true;
alter table public.profiles add column if not exists approved boolean not null default false;
alter table public.profiles add column if not exists email_verified boolean not null default false;

-- Security: authenticated users may read/write only through the application policies you define.
alter table public.app_records enable row level security;

drop policy if exists "authenticated read app records" on public.app_records;
create policy "authenticated read app records" on public.app_records
  for select to authenticated using (true);

drop policy if exists "authenticated insert app records" on public.app_records;
create policy "authenticated insert app records" on public.app_records
  for insert to authenticated with check (true);

drop policy if exists "authenticated update app records" on public.app_records;
create policy "authenticated update app records" on public.app_records
  for update to authenticated using (true) with check (true);

-- Login-page Help queries are stored as app_records(table_name='help_queries').
-- Case, document, message and MIS records use the same durable data layer.
-- For large production document volumes, move binary document payloads to Supabase Storage
-- and keep only storage paths/metadata in app_records.

-- Login-page branding: public images are readable before authentication,
-- but only Vendor Admins may change them.
create table if not exists public.login_page_assets (
  id integer primary key default 1,
  logo text,
  secureLogin text,
  roleAccess text,
  noiLifecycle text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.login_page_assets (id, logo, secureLogin, roleAccess, noiLifecycle)
values (1, '/assets/ar-skeil.jpg', '/assets/secure-login.jpg', '/assets/role-access.jpg', '/assets/noi-lifecycle.jpg')
on conflict (id) do nothing;

alter table public.login_page_assets enable row level security;
drop policy if exists "public read login page assets" on public.login_page_assets;
create policy "public read login page assets" on public.login_page_assets
  for select to anon, authenticated using (true);
drop policy if exists "admin insert login page assets" on public.login_page_assets;
create policy "admin insert login page assets" on public.login_page_assets
  for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Vendor Admin'));
drop policy if exists "admin update login page assets" on public.login_page_assets;
create policy "admin update login page assets" on public.login_page_assets
  for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Vendor Admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Vendor Admin'));

alter table public.profiles add column if not exists notification_preferences jsonb not null default '{"email":true,"documents":true,"completion":true}'::jsonb;

-- Public-read storage bucket for login-page images; uploads are restricted to Vendor Admins.
insert into storage.buckets (id, name, public)
values ('platform-assets', 'platform-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "public read platform assets" on storage.objects;
create policy "public read platform assets" on storage.objects
  for select to public using (bucket_id = 'platform-assets');
drop policy if exists "vendor admin upload platform assets" on storage.objects;
create policy "vendor admin upload platform assets" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'platform-assets' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Vendor Admin'));
drop policy if exists "vendor admin update platform assets" on storage.objects;
create policy "vendor admin update platform assets" on storage.objects
  for update to authenticated
  using (bucket_id = 'platform-assets' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Vendor Admin'))
  with check (bucket_id = 'platform-assets' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Vendor Admin'));
