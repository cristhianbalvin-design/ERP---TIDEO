-- TIDEO ERP — Aplicabilidad del catálogo de tipos de gasto en Caja Chica.
-- El catálogo sigue siendo único por empresa; esta columna solo expresa si
-- cada tipo puede seleccionarse desde el origen caja_chica.

begin;

alter table public.tipos_gasto_empresa
  add column if not exists aplica_caja_chica boolean not null default true;

comment on column public.tipos_gasto_empresa.aplica_caja_chica is
  'Indica si el tipo de gasto puede seleccionarse desde el wizard abierto en Caja Chica.';

-- Backfill conservador: las categorías genéricas permanecen disponibles.
-- En el catálogo actual, Mano de obra agrupa los conceptos técnicos/OT que no
-- deben aparecer como tipos de gasto de Caja Chica.
update public.tipos_gasto_empresa
set aplica_caja_chica = false
where categoria_er = 'Mano de obra';

create index if not exists tipos_gasto_empresa_caja_chica_idx
  on public.tipos_gasto_empresa (empresa_id, activo, aplica_caja_chica, orden);

-- Dry run / verificación manual antes y después de aplicar la migración:
-- select categoria_er, count(*)
-- from public.tipos_gasto_empresa
-- group by categoria_er
-- order by categoria_er;
-- select count(*) as excluidos_caja_chica
-- from public.tipos_gasto_empresa
-- where aplica_caja_chica = false;

select pg_notify('pgrst', 'reload schema');

commit;
