-- TIDEO ERP · Snapshot de nómina v2.
-- Completa los importes que el motor ya calcula pero las RPC vigentes omitían.
-- No recalcula ni modifica snapshots históricos (v1).

alter table public.nomina_detalle
  add column if not exists sobretasa_feriado numeric(14,2) not null default 0,
  add column if not exists ingreso_extra_remunerativo numeric(14,2) not null default 0,
  add column if not exists snapshot_version smallint not null default 1;

create or replace function public._guardar_nomina_detalle_periodo_impl_414(
  p_empresa_id text,
  p_periodo_id text,
  p_filas jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;
  if not public.usuario_puede(p_empresa_id, 'nomina', 'crear') then
    raise exception 'No tienes permiso para procesar nomina en este tenant.';
  end if;
  if not exists (
    select 1 from public.periodos_nomina
    where id = p_periodo_id and empresa_id = p_empresa_id
  ) then
    raise exception 'El periodo % no existe para este tenant.', p_periodo_id;
  end if;
  if exists (
    select 1 from public.periodos_nomina
    where id = p_periodo_id
      and empresa_id = p_empresa_id
      and estado in ('cerrado', 'anulado')
  ) then
    raise exception 'No se puede reprocesar el periodo % porque está cerrado o anulado.', p_periodo_id;
  end if;

  delete from public.nomina_detalle
  where periodo_id = p_periodo_id and empresa_id = p_empresa_id;

  insert into public.nomina_detalle (
    empresa_id, periodo_id, trabajador_id, trabajador_tipo, sistema_pensionario,
    regimen_jornada_snap, regimen_empresa_snap,
    dias_laborables, dias_laborados, dias_computables,
    horas_extra_tramo1_min, horas_extra_tramo2_min,
    sueldo_base, sueldo_proporcional, remuneracion_bruta,
    asignacion_familiar, add_horas_extra, sobretasa_feriado, bonif_altitud,
    ingreso_extra_remunerativo, otros_ingresos,
    desc_faltas, desc_tardanzas, aporte_afp, comision_afp_flujo,
    prima_seguro_afp, desc_onp, fcjmms_trabajador, retencion_ir,
    desc_prestamo, desc_anticipo, desc_judicial, desc_extraordinario,
    total_descuentos, neto, essalud, cts_mensualizado, tiene_cts,
    gratificacion_mensualizada, bonif_extraordinaria, tiene_gratificacion,
    vacaciones_mensualizadas, total_cargas, costo_real_empresa,
    es_quincena, quincena, pct_quincena_aplicado, snapshot_version
  )
  select
    p_empresa_id, p_periodo_id, f->>'trabajador_id', f->>'trabajador_tipo',
    nullif(f->>'sistema_pensionario', ''), f->>'regimen_jornada_snap',
    f->>'regimen_empresa_snap', nullif(f->>'dias_laborables', '')::integer,
    nullif(f->>'dias_laborados', '')::integer, nullif(f->>'dias_computables', '')::integer,
    coalesce((f->>'horas_extra_tramo1_min')::integer, 0),
    coalesce((f->>'horas_extra_tramo2_min')::integer, 0),
    coalesce((f->>'sueldo_base')::numeric, 0),
    coalesce((f->>'sueldo_proporcional')::numeric, 0),
    coalesce((f->>'remuneracion_bruta')::numeric, 0),
    coalesce((f->>'asignacion_familiar')::numeric, 0),
    coalesce((f->>'add_horas_extra')::numeric, 0),
    coalesce((f->>'sobretasa_feriado')::numeric, 0),
    coalesce((f->>'bonif_altitud')::numeric, 0),
    coalesce((f->>'ingreso_extra_remunerativo')::numeric, 0),
    coalesce((f->>'otros_ingresos')::numeric, 0),
    coalesce((f->>'desc_faltas')::numeric, 0),
    coalesce((f->>'desc_tardanzas')::numeric, 0),
    coalesce((f->>'aporte_afp')::numeric, 0),
    coalesce((f->>'comision_afp_flujo')::numeric, 0),
    coalesce((f->>'prima_seguro_afp')::numeric, 0),
    coalesce((f->>'desc_onp')::numeric, 0),
    coalesce((f->>'fcjmms_trabajador')::numeric, 0),
    coalesce((f->>'retencion_ir')::numeric, 0),
    coalesce((f->>'desc_prestamo')::numeric, 0),
    coalesce((f->>'desc_anticipo')::numeric, 0),
    coalesce((f->>'desc_judicial')::numeric, 0),
    coalesce((f->>'desc_extraordinario')::numeric, 0),
    coalesce((f->>'total_descuentos')::numeric, 0),
    coalesce((f->>'neto')::numeric, 0), coalesce((f->>'essalud')::numeric, 0),
    coalesce((f->>'cts_mensualizado')::numeric, 0),
    coalesce((f->>'tiene_cts')::boolean, true),
    coalesce((f->>'gratificacion_mensualizada')::numeric, 0),
    coalesce((f->>'bonif_extraordinaria')::numeric, 0),
    coalesce((f->>'tiene_gratificacion')::boolean, true),
    coalesce((f->>'vacaciones_mensualizadas')::numeric, 0),
    coalesce((f->>'total_cargas')::numeric, 0),
    coalesce((f->>'costo_real_empresa')::numeric, 0),
    coalesce((f->>'es_quincena')::boolean, false),
    nullif(f->>'quincena', '')::integer,
    nullif(f->>'pct_quincena_aplicado', '')::numeric,
    greatest(2, coalesce(nullif(f->>'snapshot_version', '')::smallint, 2))
  from jsonb_array_elements(p_filas) as f;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.guardar_nomina_detalle_periodo_sociedad(
  p_empresa_id text,
  p_periodo_id text,
  p_sociedad_id uuid,
  p_filas jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;
  if not public.usuario_puede(p_empresa_id, 'nomina', 'crear') then
    raise exception 'No tienes permiso para procesar nomina en este tenant.';
  end if;
  if not exists (
    select 1 from public.periodos_nomina
    where id = p_periodo_id and empresa_id = p_empresa_id and sociedad_id = p_sociedad_id
  ) then
    raise exception 'El periodo % no existe para la sociedad indicada.', p_periodo_id;
  end if;
  if exists (
    select 1 from public.periodos_nomina
    where id = p_periodo_id
      and empresa_id = p_empresa_id
      and sociedad_id = p_sociedad_id
      and estado in ('cerrado', 'anulado')
  ) then
    raise exception 'No se puede reprocesar el periodo % porque está cerrado o anulado.', p_periodo_id;
  end if;

  delete from public.nomina_detalle
  where periodo_id = p_periodo_id and empresa_id = p_empresa_id;

  insert into public.nomina_detalle (
    empresa_id, sociedad_id, periodo_id, trabajador_id, trabajador_tipo,
    sistema_pensionario, regimen_jornada_snap, regimen_empresa_snap,
    dias_laborables, dias_laborados, dias_computables,
    horas_extra_tramo1_min, horas_extra_tramo2_min,
    sueldo_base, sueldo_proporcional, remuneracion_bruta,
    asignacion_familiar, add_horas_extra, sobretasa_feriado, bonif_altitud,
    ingreso_extra_remunerativo, otros_ingresos,
    desc_faltas, desc_tardanzas, aporte_afp, comision_afp_flujo,
    prima_seguro_afp, desc_onp, fcjmms_trabajador, retencion_ir,
    desc_prestamo, desc_anticipo, desc_judicial, desc_extraordinario,
    total_descuentos, neto, essalud, cts_mensualizado, tiene_cts,
    gratificacion_mensualizada, bonif_extraordinaria, tiene_gratificacion,
    vacaciones_mensualizadas, total_cargas, costo_real_empresa,
    es_quincena, quincena, pct_quincena_aplicado, snapshot_version
  )
  select
    p_empresa_id, p_sociedad_id, p_periodo_id, f->>'trabajador_id',
    f->>'trabajador_tipo', nullif(f->>'sistema_pensionario', ''),
    f->>'regimen_jornada_snap', f->>'regimen_empresa_snap',
    nullif(f->>'dias_laborables', '')::integer,
    nullif(f->>'dias_laborados', '')::integer,
    nullif(f->>'dias_computables', '')::integer,
    coalesce((f->>'horas_extra_tramo1_min')::integer, 0),
    coalesce((f->>'horas_extra_tramo2_min')::integer, 0),
    coalesce((f->>'sueldo_base')::numeric, 0),
    coalesce((f->>'sueldo_proporcional')::numeric, 0),
    coalesce((f->>'remuneracion_bruta')::numeric, 0),
    coalesce((f->>'asignacion_familiar')::numeric, 0),
    coalesce((f->>'add_horas_extra')::numeric, 0),
    coalesce((f->>'sobretasa_feriado')::numeric, 0),
    coalesce((f->>'bonif_altitud')::numeric, 0),
    coalesce((f->>'ingreso_extra_remunerativo')::numeric, 0),
    coalesce((f->>'otros_ingresos')::numeric, 0),
    coalesce((f->>'desc_faltas')::numeric, 0),
    coalesce((f->>'desc_tardanzas')::numeric, 0),
    coalesce((f->>'aporte_afp')::numeric, 0),
    coalesce((f->>'comision_afp_flujo')::numeric, 0),
    coalesce((f->>'prima_seguro_afp')::numeric, 0),
    coalesce((f->>'desc_onp')::numeric, 0),
    coalesce((f->>'fcjmms_trabajador')::numeric, 0),
    coalesce((f->>'retencion_ir')::numeric, 0),
    coalesce((f->>'desc_prestamo')::numeric, 0),
    coalesce((f->>'desc_anticipo')::numeric, 0),
    coalesce((f->>'desc_judicial')::numeric, 0),
    coalesce((f->>'desc_extraordinario')::numeric, 0),
    coalesce((f->>'total_descuentos')::numeric, 0),
    coalesce((f->>'neto')::numeric, 0), coalesce((f->>'essalud')::numeric, 0),
    coalesce((f->>'cts_mensualizado')::numeric, 0),
    coalesce((f->>'tiene_cts')::boolean, true),
    coalesce((f->>'gratificacion_mensualizada')::numeric, 0),
    coalesce((f->>'bonif_extraordinaria')::numeric, 0),
    coalesce((f->>'tiene_gratificacion')::boolean, true),
    coalesce((f->>'vacaciones_mensualizadas')::numeric, 0),
    coalesce((f->>'total_cargas')::numeric, 0),
    coalesce((f->>'costo_real_empresa')::numeric, 0),
    coalesce((f->>'es_quincena')::boolean, false),
    nullif(f->>'quincena', '')::integer,
    nullif(f->>'pct_quincena_aplicado', '')::numeric,
    greatest(2, coalesce(nullif(f->>'snapshot_version', '')::smallint, 2))
  from jsonb_array_elements(p_filas) as f;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Los wrappers públicos son las únicas entradas autenticadas. El helper legacy
-- queda privado: otorgarle EXECUTE permitiría evitar la validación multisociedad
-- del wrapper creado en la migración 414.
revoke all on function public._guardar_nomina_detalle_periodo_impl_414(text, text, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function public.guardar_nomina_detalle_periodo(text, text, jsonb)
  from public, anon;
grant execute on function public.guardar_nomina_detalle_periodo(text, text, jsonb)
  to authenticated, service_role;
revoke execute on function public.guardar_nomina_detalle_periodo_sociedad(text, text, uuid, jsonb)
  from public, anon;
grant execute on function public.guardar_nomina_detalle_periodo_sociedad(text, text, uuid, jsonb)
  to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
