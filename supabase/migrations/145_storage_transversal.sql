-- TIDEO ERP - Infraestructura transversal de Storage.
-- Crea el registro central de adjuntos y dos buckets nuevos sin modificar buckets existentes.

create extension if not exists pgcrypto;

create table if not exists public.adjuntos (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id),
  entidad_tipo text not null,
  entidad_id text not null,
  categoria text,
  nombre_original text not null,
  bucket text not null,
  storage_path text not null,
  url text not null,
  mime_type text,
  tamano_bytes bigint,
  descripcion text,
  subido_por uuid,
  subido_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint adjuntos_storage_unique unique (bucket, storage_path),
  constraint adjuntos_tamano_nonnegative check (tamano_bytes is null or tamano_bytes >= 0)
);

create index if not exists idx_adjuntos_entidad
  on public.adjuntos(empresa_id, entidad_tipo, entidad_id, subido_en desc);

create index if not exists idx_adjuntos_bucket_path
  on public.adjuntos(bucket, storage_path);

create or replace function public.touch_adjuntos_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

drop trigger if exists trg_adjuntos_actualizado_en on public.adjuntos;
create trigger trg_adjuntos_actualizado_en
before update on public.adjuntos
for each row execute function public.touch_adjuntos_actualizado_en();

alter table public.adjuntos enable row level security;

drop policy if exists adjuntos_select on public.adjuntos;
drop policy if exists adjuntos_insert on public.adjuntos;
drop policy if exists adjuntos_update on public.adjuntos;
drop policy if exists adjuntos_delete on public.adjuntos;

create policy adjuntos_select on public.adjuntos
  for select using (public.usuario_tiene_empresa(empresa_id));

create policy adjuntos_insert on public.adjuntos
  for insert with check (public.usuario_tiene_empresa(empresa_id));

create policy adjuntos_update on public.adjuntos
  for update using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy adjuntos_delete on public.adjuntos
  for delete using (public.usuario_tiene_empresa(empresa_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'documentos-privados',
    'documentos-privados',
    false,
    20971520,
    array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
  ),
  (
    'documentos-generales',
    'documentos-generales',
    true,
    20971520,
    array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists storage_docs_generales_select on storage.objects;
drop policy if exists storage_docs_generales_insert on storage.objects;
drop policy if exists storage_docs_generales_update on storage.objects;
drop policy if exists storage_docs_generales_delete on storage.objects;
drop policy if exists storage_docs_privados_select on storage.objects;
drop policy if exists storage_docs_privados_insert on storage.objects;
drop policy if exists storage_docs_privados_update on storage.objects;
drop policy if exists storage_docs_privados_delete on storage.objects;

create policy storage_docs_generales_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documentos-generales'
  and public.usuario_tiene_empresa(split_part(name, '/', 1))
);

create policy storage_docs_generales_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documentos-generales'
  and public.usuario_tiene_empresa(split_part(name, '/', 1))
);

create policy storage_docs_generales_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'documentos-generales'
  and public.usuario_tiene_empresa(split_part(name, '/', 1))
)
with check (
  bucket_id = 'documentos-generales'
  and public.usuario_tiene_empresa(split_part(name, '/', 1))
);

create policy storage_docs_generales_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'documentos-generales'
  and public.usuario_tiene_empresa(split_part(name, '/', 1))
);

create policy storage_docs_privados_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documentos-privados'
  and public.usuario_tiene_empresa(split_part(name, '/', 1))
);

create policy storage_docs_privados_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documentos-privados'
  and public.usuario_tiene_empresa(split_part(name, '/', 1))
);

create policy storage_docs_privados_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'documentos-privados'
  and public.usuario_tiene_empresa(split_part(name, '/', 1))
)
with check (
  bucket_id = 'documentos-privados'
  and public.usuario_tiene_empresa(split_part(name, '/', 1))
);

create policy storage_docs_privados_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'documentos-privados'
  and public.usuario_tiene_empresa(split_part(name, '/', 1))
);

select pg_notify('pgrst', 'reload schema');
