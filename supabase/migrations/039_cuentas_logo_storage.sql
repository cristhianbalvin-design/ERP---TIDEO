-- Logotipos de cuentas/clientes.
-- Guarda la URL publica en public.cuentas y los archivos en Supabase Storage.

alter table public.cuentas
  add column if not exists logo_url text,
  add column if not exists logo_path text;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'logos-cuentas',
  'logos-cuentas',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists logos_cuentas_select on storage.objects;
drop policy if exists logos_cuentas_insert on storage.objects;
drop policy if exists logos_cuentas_update on storage.objects;
drop policy if exists logos_cuentas_delete on storage.objects;

create policy logos_cuentas_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'logos-cuentas'
  and public.usuario_tiene_empresa(split_part(name, '/', 1))
);

create policy logos_cuentas_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'logos-cuentas'
  and public.usuario_tiene_empresa(split_part(name, '/', 1))
  and public.usuario_puede(split_part(name, '/', 1), 'cuentas', 'editar')
);

create policy logos_cuentas_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'logos-cuentas'
  and public.usuario_tiene_empresa(split_part(name, '/', 1))
  and public.usuario_puede(split_part(name, '/', 1), 'cuentas', 'editar')
)
with check (
  bucket_id = 'logos-cuentas'
  and public.usuario_tiene_empresa(split_part(name, '/', 1))
  and public.usuario_puede(split_part(name, '/', 1), 'cuentas', 'editar')
);

create policy logos_cuentas_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'logos-cuentas'
  and public.usuario_tiene_empresa(split_part(name, '/', 1))
  and public.usuario_puede(split_part(name, '/', 1), 'cuentas', 'editar')
);

select pg_notify('pgrst', 'reload schema');
