-- TIDEO ERP - Refactor ficha de personal: modalidad, duracion, ciclos y fiscalizacion.

alter table public.empresa_config
  add column if not exists agente_retencion boolean not null default true,
  add column if not exists pct_retencion_ir_honorarios numeric(5,2) not null default 8;

alter table public.personal_operativo
  add column if not exists modalidad_contrato text not null default 'planilla',
  add column if not exists tipo_contrato text not null default 'indefinido',
  add column if not exists fecha_inicio_contrato date,
  add column if not exists fecha_fin_contrato date,
  add column if not exists cargo_confianza boolean not null default false,
  add column if not exists dias_ciclo_trabajo integer,
  add column if not exists dias_ciclo_descanso integer;

alter table public.personal_administrativo
  add column if not exists modalidad_contrato text not null default 'planilla',
  add column if not exists tipo_contrato text not null default 'indefinido',
  add column if not exists cargo_confianza boolean not null default false,
  add column if not exists dias_ciclo_trabajo integer,
  add column if not exists dias_ciclo_descanso integer;

-- Compatibilidad con bases donde tipo_contrato almacenaba la modalidad laboral.
update public.personal_operativo
set modalidad_contrato = case
    when lower(coalesce(tipo_contrato, '')) in ('honorarios', 'recibos por honorarios', 'recibos_por_honorarios') then 'honorarios'
    else 'planilla'
  end,
  tipo_contrato = case
    when lower(coalesce(tipo_contrato, '')) in ('honorarios', 'recibos por honorarios', 'recibos_por_honorarios') then 'por_encargo'
    when lower(coalesce(tipo_contrato, '')) in ('plazo fijo', 'plazo_fijo', 'temporal') then 'plazo_fijo'
    when lower(coalesce(tipo_contrato, '')) in ('obra determinada', 'obra_determinada') then 'obra_determinada'
    when lower(coalesce(tipo_contrato, '')) in ('indefinido', 'plazo_fijo', 'obra_determinada', 'por_encargo') then tipo_contrato
    else 'indefinido'
  end,
  fecha_inicio_contrato = coalesce(fecha_inicio_contrato, fecha_ingreso);

update public.personal_administrativo
set modalidad_contrato = case
    when lower(coalesce(tipo_contrato, '')) in ('honorarios', 'recibos por honorarios', 'recibos_por_honorarios') then 'honorarios'
    else 'planilla'
  end,
  tipo_contrato = case
    when lower(coalesce(tipo_contrato, '')) in ('honorarios', 'recibos por honorarios', 'recibos_por_honorarios') then 'por_encargo'
    when lower(coalesce(tipo_contrato, '')) in ('plazo fijo', 'plazo_fijo', 'temporal') then 'plazo_fijo'
    when lower(coalesce(tipo_contrato, '')) in ('obra determinada', 'obra_determinada') then 'obra_determinada'
    when lower(coalesce(tipo_contrato, '')) in ('indefinido', 'plazo_fijo', 'obra_determinada', 'por_encargo') then tipo_contrato
    else 'indefinido'
  end;

update public.personal_operativo
set dias_ciclo_trabajo = case regimen_jornada
    when 'minero_14x7' then 14
    when 'minero_20x10' then 20
    when 'minero_28x14' then 28
    else dias_ciclo_trabajo
  end,
  dias_ciclo_descanso = case regimen_jornada
    when 'minero_14x7' then 7
    when 'minero_20x10' then 10
    when 'minero_28x14' then 14
    else dias_ciclo_descanso
  end,
  regimen_jornada = case when regimen_jornada in ('minero_14x7','minero_20x10','minero_28x14') then 'ciclo_acumulativo' else regimen_jornada end;

update public.personal_administrativo
set dias_ciclo_trabajo = case regimen_jornada
    when 'minero_14x7' then 14
    when 'minero_20x10' then 20
    when 'minero_28x14' then 28
    else dias_ciclo_trabajo
  end,
  dias_ciclo_descanso = case regimen_jornada
    when 'minero_14x7' then 7
    when 'minero_20x10' then 10
    when 'minero_28x14' then 14
    else dias_ciclo_descanso
  end,
  regimen_jornada = case when regimen_jornada in ('minero_14x7','minero_20x10','minero_28x14') then 'ciclo_acumulativo' else regimen_jornada end;

do $$
declare
  r record;
begin
  for r in
    select conrelid::regclass as table_name, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in ('public.personal_operativo'::regclass, 'public.personal_administrativo'::regclass)
      and pg_get_constraintdef(oid) like '%regimen_jornada%'
  loop
    execute format('alter table %s drop constraint if exists %I', r.table_name, r.conname);
  end loop;
end $$;

alter table public.personal_operativo
  add constraint personal_operativo_modalidad_contrato_check check (modalidad_contrato in ('planilla','honorarios')),
  add constraint personal_operativo_tipo_contrato_check check (tipo_contrato in ('indefinido','plazo_fijo','obra_determinada','por_encargo')),
  add constraint personal_operativo_regimen_jornada_check check (regimen_jornada in ('general','ciclo_acumulativo','minero_14x7','minero_20x10','minero_28x14'));

alter table public.personal_administrativo
  add constraint personal_admin_modalidad_contrato_check check (modalidad_contrato in ('planilla','honorarios')),
  add constraint personal_admin_tipo_contrato_check check (tipo_contrato in ('indefinido','plazo_fijo','obra_determinada','por_encargo')),
  add constraint personal_admin_regimen_jornada_check check (regimen_jornada in ('general','ciclo_acumulativo','minero_14x7','minero_20x10','minero_28x14'));

comment on column public.personal_operativo.regimen_laboral is
  'Deprecated. La fuente de verdad es empresa_config.regimen_laboral_empresa.';
comment on column public.personal_administrativo.regimen_laboral is
  'Deprecated. La fuente de verdad es empresa_config.regimen_laboral_empresa.';
comment on column public.personal_operativo.acceso_campo is
  'Deprecated. La fuente de verdad es usuarios_empresas.acceso_campo.';

select pg_notify('pgrst', 'reload schema');
