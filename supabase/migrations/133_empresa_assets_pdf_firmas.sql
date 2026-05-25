-- Asegura que logos y firmas corporativas sean accesibles para PDFs y vistas publicas.

alter table public.empresa_config
  add column if not exists logo_url text,
  add column if not exists firma_url text,
  add column if not exists logo_path text,
  add column if not exists firma_path text;

insert into storage.buckets (id, name, public)
  values ('empresa-assets', 'empresa-assets', true)
  on conflict (id) do update set public = true;

drop policy if exists "empresa_assets_read" on storage.objects;
drop policy if exists "empresa_assets_write" on storage.objects;
drop policy if exists "empresa_assets_update" on storage.objects;

create policy "empresa_assets_read" on storage.objects
  for select using (bucket_id = 'empresa-assets');

create policy "empresa_assets_write" on storage.objects
  for insert with check (bucket_id = 'empresa-assets' and auth.role() = 'authenticated');

create policy "empresa_assets_update" on storage.objects
  for update using (bucket_id = 'empresa-assets' and auth.role() = 'authenticated');

select pg_notify('pgrst', 'reload schema');
