-- 082 — Rediseño del módulo de Cotizaciones
-- Agrega campos para encabezado enriquecido, partidas con tipo recurrente,
-- totales separados (implementación vs recurrente), hitos de pago y
-- condiciones comerciales editables por cotización.

alter table public.cotizaciones
  add column if not exists contacto_id          text references public.contactos(id) on delete set null,
  add column if not exists descripcion_general  text,
  add column if not exists validez_tipo         text default 'dias',
  add column if not exists validez_dias         integer default 30,
  add column if not exists validez_fecha        date,
  -- Totales separados implementación / recurrente
  add column if not exists subtotal_impl        numeric(14,2) default 0,
  add column if not exists igv_impl             numeric(14,2) default 0,
  add column if not exists total_impl           numeric(14,2) default 0,
  add column if not exists subtotal_rec         numeric(14,2) default 0,
  add column if not exists igv_rec              numeric(14,2) default 0,
  add column if not exists total_rec            numeric(14,2) default 0,
  -- Hitos de pago
  add column if not exists hitos_activos        boolean default false,
  add column if not exists hitos_pago           jsonb default '[]'::jsonb,
  add column if not exists glosa_factura        text,
  -- Condiciones comerciales (sobrescriben los de empresa_config para esta cot.)
  add column if not exists cond_forma_pago      text,
  add column if not exists cond_validez         text,
  add column if not exists cond_penalidad       text,
  add column if not exists cond_inicio_proyecto text,
  add column if not exists cond_alcance         text,
  add column if not exists cond_integraciones   text,
  add column if not exists cond_confidencialidad text,
  -- Historial de versiones anteriores (JSONB para no duplicar filas)
  add column if not exists historial_versiones  jsonb default '[]'::jsonb;

-- Constraint de validez_tipo
alter table public.cotizaciones
  drop constraint if exists cotizaciones_validez_tipo_check;

alter table public.cotizaciones
  add constraint cotizaciones_validez_tipo_check
    check (validez_tipo in ('dias', 'fecha_exacta'));

select pg_notify('pgrst', 'reload schema');
