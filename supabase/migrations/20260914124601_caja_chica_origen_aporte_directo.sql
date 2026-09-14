-- Origen del fondo de caja chica.
-- Los fondos existentes sin cuenta bancaria quedan deliberadamente sin clasificar
-- hasta que el cliente confirme el aportante de cada caso.

alter table public.caja_chica_fondos
  add column if not exists tipo_origen text,
  add column if not exists aportante_id text references public.usuarios(id) on delete set null;

-- Backfill no ambiguo: solo los fondos con cuenta bancaria real.
update public.caja_chica_fondos
set tipo_origen = 'cuenta_bancaria',
    aportante_id = null
where cuenta_bancaria_id is not null
  and tipo_origen is null;

-- Se crean sin validarlas para conservar los fondos legacy pendientes de
-- clasificación manual. No ejecutar VALIDATE CONSTRAINT mientras tipo_origen
-- siga siendo null en algún fondo.
alter table public.caja_chica_fondos
  add constraint caja_chica_fondos_tipo_origen_check
    check (tipo_origen in ('cuenta_bancaria', 'aporte_directo')) not valid,
  add constraint caja_chica_fondos_origen_coherente_check
    check (
      (tipo_origen = 'cuenta_bancaria' and cuenta_bancaria_id is not null and aportante_id is null)
      or
      (tipo_origen = 'aporte_directo' and cuenta_bancaria_id is null and aportante_id is not null)
    ) not valid;

comment on column public.caja_chica_fondos.tipo_origen is
  'Origen del fondo: cuenta_bancaria o aporte_directo. Null solo para fondos legacy pendientes de clasificación manual.';
comment on column public.caja_chica_fondos.aportante_id is
  'Usuario que entrega efectivo cuando tipo_origen es aporte_directo.';

select pg_notify('pgrst', 'reload schema');
