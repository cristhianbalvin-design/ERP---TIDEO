-- Crea los buckets documentos-generales y documentos-privados si no existen.
-- Necesario porque la migración 145 no fue aplicada en producción.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
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
  ),
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
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Políticas de acceso para documentos-generales
drop policy if exists storage_docs_generales_select on storage.objects;
drop policy if exists storage_docs_generales_insert on storage.objects;
drop policy if exists storage_docs_generales_update on storage.objects;
drop policy if exists storage_docs_generales_delete on storage.objects;

create policy storage_docs_generales_select
on storage.objects for select to authenticated
using (
  bucket_id = 'documentos-generales'
  and public.usuario_tiene_empresa(split_part(name, '/', 1))
);

create policy storage_docs_generales_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'documentos-generales'
  and public.usuario_tiene_empresa(split_part(name, '/', 1))
);

create policy storage_docs_generales_update
on storage.objects for update to authenticated
using (bucket_id = 'documentos-generales' and public.usuario_tiene_empresa(split_part(name, '/', 1)))
with check (bucket_id = 'documentos-generales' and public.usuario_tiene_empresa(split_part(name, '/', 1)));

create policy storage_docs_generales_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'documentos-generales'
  and public.usuario_tiene_empresa(split_part(name, '/', 1))
);

-- Políticas de acceso para documentos-privados
drop policy if exists storage_docs_privados_select on storage.objects;
drop policy if exists storage_docs_privados_insert on storage.objects;
drop policy if exists storage_docs_privados_update on storage.objects;
drop policy if exists storage_docs_privados_delete on storage.objects;

create policy storage_docs_privados_select
on storage.objects for select to authenticated
using (
  bucket_id = 'documentos-privados'
  and public.usuario_tiene_empresa(split_part(name, '/', 1))
);

create policy storage_docs_privados_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'documentos-privados'
  and public.usuario_tiene_empresa(split_part(name, '/', 1))
);

create policy storage_docs_privados_update
on storage.objects for update to authenticated
using (bucket_id = 'documentos-privados' and public.usuario_tiene_empresa(split_part(name, '/', 1)))
with check (bucket_id = 'documentos-privados' and public.usuario_tiene_empresa(split_part(name, '/', 1)));

create policy storage_docs_privados_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'documentos-privados'
  and public.usuario_tiene_empresa(split_part(name, '/', 1))
);

select pg_notify('pgrst', 'reload schema');
