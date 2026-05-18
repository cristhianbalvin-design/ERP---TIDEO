-- 086 — Campos de aprobación manual en cotizaciones + bucket de sustento

alter table public.cotizaciones
  add column if not exists aprobacion_tipo           text,         -- 'digital' | 'manual'
  add column if not exists aprobacion_canal          text,         -- solo manual
  add column if not exists aprobacion_fecha_cliente  date,         -- cuando aprobó el cliente
  add column if not exists aprobacion_notas          text,
  add column if not exists aprobacion_registrada_por text,         -- nombre del usuario ERP
  add column if not exists aprobacion_registrada_at  timestamptz,
  add column if not exists aprobacion_archivos       jsonb default '[]'::jsonb;

-- Backfill: las cotizaciones aprobadas digitalmente ya tienen aceptacion_fecha
update public.cotizaciones
  set aprobacion_tipo = 'digital'
  where estado = 'aprobada'
    and aceptacion_fecha is not null
    and aprobacion_tipo is null;

-- Bucket para archivos de sustento
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cotizaciones-sustento',
  'cotizaciones-sustento',
  true,
  10485760,
  array[
    'application/pdf',
    'image/jpeg','image/png','image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
) on conflict (id) do nothing;

do $$ begin
  create policy "sustento_insert" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'cotizaciones-sustento');
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "sustento_select" on storage.objects
    for select to authenticated
    using (bucket_id = 'cotizaciones-sustento');
exception when duplicate_object then null;
end $$;

select pg_notify('pgrst', 'reload schema');
