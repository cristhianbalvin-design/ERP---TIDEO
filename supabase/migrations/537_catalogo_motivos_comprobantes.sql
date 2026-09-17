-- Catálogos SUNAT 09 y 10 para notas de crédito y débito.
-- motivo_codigo es nullable para preservar las NC históricas con motivo='otro'.

create table if not exists public.catalogo_motivos_comprobante (
  tipo_documento text not null check (tipo_documento in ('nota_credito', 'nota_debito')),
  codigo_sunat text not null,
  descripcion text not null,
  activo boolean not null default true,
  orden integer not null default 0,
  primary key (tipo_documento, codigo_sunat)
);

insert into public.catalogo_motivos_comprobante
  (tipo_documento, codigo_sunat, descripcion, orden)
values
  ('nota_credito', '01', 'Anulación de la operación', 1),
  ('nota_credito', '02', 'Anulación por error en el RUC', 2),
  ('nota_credito', '03', 'Corrección por error en la descripción o atención de reclamo respecto de bienes adquiridos o servicios prestados', 3),
  ('nota_credito', '04', 'Descuento global', 4),
  ('nota_credito', '05', 'Descuento por ítem', 5),
  ('nota_credito', '06', 'Devolución total', 6),
  ('nota_credito', '07', 'Devolución por ítem', 7),
  ('nota_credito', '08', 'Bonificación', 8),
  ('nota_credito', '09', 'Disminución en el valor', 9),
  ('nota_credito', '10', 'Otros conceptos', 10),
  ('nota_credito', '11', 'Ajustes de operaciones de exportación', 11),
  ('nota_credito', '12', 'Ajustes afectos al IVAP', 12),
  ('nota_credito', '13', 'Corrección o modificación del monto neto pendiente de pago y/o las fechas de vencimiento y/o los montos de las cuotas', 13),
  ('nota_debito', '01', 'Intereses por mora', 1),
  ('nota_debito', '02', 'Aumento en el valor', 2),
  ('nota_debito', '03', 'Penalidades/otros conceptos', 3),
  ('nota_debito', '11', 'Ajustes de operaciones de exportación', 11),
  ('nota_debito', '12', 'Ajustes afectos al IVAP', 12)
on conflict (tipo_documento, codigo_sunat) do update
  set descripcion = excluded.descripcion,
      orden = excluded.orden,
      activo = true;

alter table public.facturas
  add column if not exists motivo_codigo text;

alter table public.facturas
  drop constraint if exists facturas_motivo_codigo_catalogo_fkey;

alter table public.facturas
  add constraint facturas_motivo_codigo_catalogo_fkey
  foreign key (tipo_documento, motivo_codigo)
  references public.catalogo_motivos_comprobante(tipo_documento, codigo_sunat);

alter table public.catalogo_motivos_comprobante enable row level security;

drop policy if exists catalogo_motivos_comprobante_select on public.catalogo_motivos_comprobante;
create policy catalogo_motivos_comprobante_select
  on public.catalogo_motivos_comprobante
  for select to authenticated
  using (true);

select pg_notify('pgrst', 'reload schema');
