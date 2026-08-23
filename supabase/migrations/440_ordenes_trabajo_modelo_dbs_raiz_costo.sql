-- 440 · Modelo DBS y raíces de costo de órdenes de trabajo.
-- Propuesta para revisión humana: esta migración no se ejecuta desde este cambio.
--
-- Las constraints NOT VALID preservan las OTs históricas al desplegar esta
-- migración y se aplican a toda inserción o actualización posterior. Tras el
-- saneamiento de históricos, deberán validarse en una migración separada.

alter table public.ordenes_trabajo
  add column if not exists tipo_trabajo text,
  add column if not exists cargo_financiero text,
  add column if not exists motivo_rework text,
  add column if not exists contrato_alquiler_id text
    references public.contratos_alquiler(id) on delete restrict,
  add column if not exists equipo_id text,
  add column if not exists horometro_actual numeric(14,2);

alter table public.ordenes_trabajo
  add constraint ordenes_trabajo_tipo_trabajo_dbs_chk
    check (
      tipo_trabajo in (
        'Preventivo_PM',
        'Correctivo',
        'Acondicionamiento',
        'Overhaul'
      )
    ) not valid,
  add constraint ordenes_trabajo_cargo_financiero_dbs_chk
    check (
      cargo_financiero in (
        'Cliente_Contrato',
        'Interno_Plataforma',
        'Garantia_Fabrica',
        'Reclamo_Rework'
      )
    ) not valid,
  add constraint ordenes_trabajo_combinacion_dbs_valida_chk
    check (
      not (
        tipo_trabajo = 'Preventivo_PM'
        and cargo_financiero in ('Garantia_Fabrica', 'Reclamo_Rework')
      )
      and not (
        tipo_trabajo = 'Overhaul'
        and cargo_financiero = 'Reclamo_Rework'
      )
    ) not valid,
  add constraint ordenes_trabajo_motivo_rework_obligatorio_chk
    check (
      cargo_financiero <> 'Reclamo_Rework'
      or nullif(btrim(motivo_rework), '') is not null
    ) not valid,
  add constraint ordenes_trabajo_horometro_raiz_equipo_chk
    check (
      (contrato_alquiler_id is null and equipo_id is null)
      or horometro_actual is not null
    ) not valid,
  add constraint ordenes_trabajo_horometro_actual_no_negativo_chk
    check (horometro_actual is null or horometro_actual >= 0) not valid;

create index if not exists idx_ot_contrato_alquiler
  on public.ordenes_trabajo (empresa_id, contrato_alquiler_id)
  where contrato_alquiler_id is not null;

create index if not exists idx_ot_equipo_interno
  on public.ordenes_trabajo (empresa_id, equipo_id)
  where equipo_id is not null;

create index if not exists idx_ot_dbs_clasificacion
  on public.ordenes_trabajo (empresa_id, sociedad_id, tipo_trabajo, cargo_financiero, estado)
  where tipo_trabajo is not null and cargo_financiero is not null;

select pg_notify('pgrst', 'reload schema');
