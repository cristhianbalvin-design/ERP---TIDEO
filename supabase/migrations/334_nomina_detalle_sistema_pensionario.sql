-- TIDEO ERP - Agrega sistema_pensionario (AFP/ONP) a nomina_detalle.
-- Antes cerrarPeriodo inferia AFP/ONP desde los montos (aporte_afp>0, desc_onp>0) para
-- las CxP de "Aportes previsionales" -- fragil (un trabajador AFP con bruta 0 no se
-- detectaria). Se persiste el dato explicito que ya calcula el motor (calculos[i].sistema_pensionario).

alter table public.nomina_detalle
  add column if not exists sistema_pensionario text
    check (sistema_pensionario is null or sistema_pensionario in ('AFP', 'ONP'));

-- guardar_nomina_detalle_periodo (migracion 333) hace mapeo explicito de columnas en el
-- INSERT -- una columna nueva no se persiste sola, hay que agregarla ahi tambien.
create or replace function public.guardar_nomina_detalle_periodo(
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

  delete from public.nomina_detalle
  where periodo_id = p_periodo_id and empresa_id = p_empresa_id;

  insert into public.nomina_detalle (
    empresa_id, periodo_id, trabajador_id, trabajador_tipo, sistema_pensionario,
    regimen_jornada_snap, regimen_empresa_snap,
    dias_laborables, dias_laborados, dias_computables,
    horas_extra_tramo1_min, horas_extra_tramo2_min,
    sueldo_base, remuneracion_bruta, asignacion_familiar, add_horas_extra, bonif_altitud, otros_ingresos,
    desc_faltas, desc_tardanzas, aporte_afp, comision_afp_flujo, prima_seguro_afp, desc_onp,
    retencion_ir, desc_prestamo, desc_anticipo, desc_judicial, desc_extraordinario, total_descuentos, neto,
    essalud, cts_mensualizado, tiene_cts, gratificacion_mensualizada, bonif_extraordinaria, tiene_gratificacion, vacaciones_mensualizadas,
    total_cargas, costo_real_empresa,
    es_quincena, quincena, pct_quincena_aplicado
  )
  select
    p_empresa_id,
    p_periodo_id,
    f->>'trabajador_id',
    f->>'trabajador_tipo',
    nullif(f->>'sistema_pensionario', ''),
    f->>'regimen_jornada_snap',
    f->>'regimen_empresa_snap',
    nullif(f->>'dias_laborables', '')::integer,
    nullif(f->>'dias_laborados', '')::integer,
    nullif(f->>'dias_computables', '')::integer,
    coalesce((f->>'horas_extra_tramo1_min')::integer, 0),
    coalesce((f->>'horas_extra_tramo2_min')::integer, 0),
    (f->>'sueldo_base')::numeric,
    (f->>'remuneracion_bruta')::numeric,
    coalesce((f->>'asignacion_familiar')::numeric, 0),
    coalesce((f->>'add_horas_extra')::numeric, 0),
    coalesce((f->>'bonif_altitud')::numeric, 0),
    coalesce((f->>'otros_ingresos')::numeric, 0),
    coalesce((f->>'desc_faltas')::numeric, 0),
    coalesce((f->>'desc_tardanzas')::numeric, 0),
    coalesce((f->>'aporte_afp')::numeric, 0),
    coalesce((f->>'comision_afp_flujo')::numeric, 0),
    coalesce((f->>'prima_seguro_afp')::numeric, 0),
    coalesce((f->>'desc_onp')::numeric, 0),
    coalesce((f->>'retencion_ir')::numeric, 0),
    coalesce((f->>'desc_prestamo')::numeric, 0),
    coalesce((f->>'desc_anticipo')::numeric, 0),
    coalesce((f->>'desc_judicial')::numeric, 0),
    coalesce((f->>'desc_extraordinario')::numeric, 0),
    (f->>'total_descuentos')::numeric,
    (f->>'neto')::numeric,
    coalesce((f->>'essalud')::numeric, 0),
    coalesce((f->>'cts_mensualizado')::numeric, 0),
    coalesce((f->>'tiene_cts')::boolean, true),
    coalesce((f->>'gratificacion_mensualizada')::numeric, 0),
    coalesce((f->>'bonif_extraordinaria')::numeric, 0),
    coalesce((f->>'tiene_gratificacion')::boolean, true),
    coalesce((f->>'vacaciones_mensualizadas')::numeric, 0),
    (f->>'total_cargas')::numeric,
    (f->>'costo_real_empresa')::numeric,
    coalesce((f->>'es_quincena')::boolean, false),
    nullif(f->>'quincena', '')::integer,
    nullif(f->>'pct_quincena_aplicado', '')::numeric
  from jsonb_array_elements(p_filas) as f;

  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

select pg_notify('pgrst', 'reload schema');
