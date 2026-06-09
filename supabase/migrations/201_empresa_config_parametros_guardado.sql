-- Ensure Parametros Generales can persist every field sent by the UI.
-- Safe to run more than once; it only fills missing columns/defaults.

create table if not exists public.empresa_config (
  empresa_id text primary key references public.empresas(id) on delete cascade
);

alter table public.empresa_config
  add column if not exists razon_social text,
  add column if not exists ruc text,
  add column if not exists email_comercial text,
  add column if not exists sitio_web text,
  add column if not exists direccion text,
  add column if not exists firmante text,
  add column if not exists cargo_firmante text,
  add column if not exists logo_url text,
  add column if not exists logo_path text,
  add column if not exists firma_url text,
  add column if not exists firma_path text,
  add column if not exists cond_forma_pago text,
  add column if not exists cond_validez text,
  add column if not exists cond_penalidad text,
  add column if not exists cond_inicio_proyecto text,
  add column if not exists cond_alcance text,
  add column if not exists cond_integraciones text,
  add column if not exists cond_confidencialidad text,
  add column if not exists cond_glosa_factura text,
  add column if not exists color_primario text default '#1A2B4A',
  add column if not exists color_secundario text default '#607D8B',
  add column if not exists moneda_base text default 'PEN',
  add column if not exists igv_defecto numeric default 18,
  add column if not exists zona_horaria text default 'America/Lima',
  add column if not exists plantilla_cotizacion text default 'TIDEO propuesta tecnica v3',
  add column if not exists plantilla_factura text default 'Exportacion fiscal externa',
  add column if not exists condicion_pago_defecto text default '30 días',
  add column if not exists requiere_2fa_financiero boolean default false,
  add column if not exists agente_retencion boolean default false,
  add column if not exists pct_retencion_ir_honorarios numeric(5,2) default 8,
  add column if not exists config_flujos_alertas jsonb default '[]'::jsonb,
  add column if not exists regimen_laboral_empresa text default 'general',
  add column if not exists frecuencia_pago text default 'mensual',
  add column if not exists dia_corte_mensual integer default 25,
  add column if not exists dia_pago_mensual integer default 30,
  add column if not exists dia_corte_q1 integer default 10,
  add column if not exists dia_pago_q1 integer default 15,
  add column if not exists dia_corte_q2 integer default 25,
  add column if not exists dia_pago_q2 integer default 30,
  add column if not exists pct_quincena_1 numeric(5,2) default 50,
  add column if not exists uit_vigente numeric(10,2) default 5500,
  add column if not exists rmv_vigente numeric(10,2) default 1130,
  add column if not exists ram_tope_afp numeric(10,2) default 12598.91,
  add column if not exists eval_peso_autoevaluacion numeric(5,2) default 30,
  add column if not exists eval_peso_jefe numeric(5,2) default 70,
  add column if not exists eval_peso_competencias numeric(5,2) default 50,
  add column if not exists eval_peso_objetivos numeric(5,2) default 50,
  add column if not exists eval_escala_min integer default 1,
  add column if not exists eval_escala_max integer default 5,
  add column if not exists eval_escala_labels jsonb default '{"1":"Insatisfactorio","2":"Por mejorar","3":"Satisfactorio","4":"Destacado","5":"Sobresaliente"}'::jsonb,
  add column if not exists updated_at timestamptz default now();

update public.empresa_config
set
  color_primario = coalesce(color_primario, '#1A2B4A'),
  color_secundario = coalesce(color_secundario, '#607D8B'),
  moneda_base = coalesce(nullif(btrim(moneda_base), ''), 'PEN'),
  igv_defecto = coalesce(igv_defecto, 18),
  zona_horaria = coalesce(nullif(btrim(zona_horaria), ''), 'America/Lima'),
  condicion_pago_defecto = coalesce(nullif(btrim(condicion_pago_defecto), ''), '30 días'),
  config_flujos_alertas = coalesce(config_flujos_alertas, '[]'::jsonb),
  regimen_laboral_empresa = coalesce(nullif(btrim(regimen_laboral_empresa), ''), 'general'),
  frecuencia_pago = coalesce(nullif(btrim(frecuencia_pago), ''), 'mensual'),
  eval_escala_labels = coalesce(eval_escala_labels, '{"1":"Insatisfactorio","2":"Por mejorar","3":"Satisfactorio","4":"Destacado","5":"Sobresaliente"}'::jsonb),
  updated_at = coalesce(updated_at, now());

alter table public.empresa_config enable row level security;

select pg_notify('pgrst', 'reload schema');
