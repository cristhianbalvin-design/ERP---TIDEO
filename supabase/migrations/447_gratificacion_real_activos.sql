-- TIDEO ERP - Pago real de gratificacion para trabajadores activos.
--
-- Camino A: la gratificacion pagada es independiente de la provision mensual.
-- Se confirma en una operacion separada, sobre el snapshot ya procesado de
-- nomina_detalle. Reprocesar vuelve el periodo a su estado base (sin pago real).

alter table public.nomina_detalle
  add column if not exists sueldo_proporcional numeric(14,2) not null default 0,
  add column if not exists gratificacion_pagada numeric(14,2) not null default 0,
  add column if not exists bonif_extraordinaria_pagada numeric(14,2) not null default 0;

alter table public.periodos_nomina
  add column if not exists gratificacion_real_confirmada boolean not null default false;

-- La persistencia de nomina usa INSERT explicito. Reprocesar descarta cualquier
-- confirmacion anterior y vuelve a insertar los importes de pago real en cero.
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
    raise exception 'No se puede reprocesar el periodo % porque esta cerrado o anulado.', p_periodo_id;
  end if;

  update public.periodos_nomina
     set gratificacion_real_confirmada = false
   where id = p_periodo_id
     and empresa_id = p_empresa_id;

  delete from public.nomina_detalle
  where periodo_id = p_periodo_id and empresa_id = p_empresa_id;

  insert into public.nomina_detalle (
    empresa_id, periodo_id, trabajador_id, trabajador_tipo, sistema_pensionario,
    regimen_jornada_snap, regimen_empresa_snap,
    dias_laborables, dias_laborados, dias_computables,
    horas_extra_tramo1_min, horas_extra_tramo2_min,
    sueldo_base, sueldo_proporcional, remuneracion_bruta, asignacion_familiar, add_horas_extra, bonif_altitud, otros_ingresos,
    gratificacion_pagada, bonif_extraordinaria_pagada,
    desc_faltas, desc_tardanzas, aporte_afp, comision_afp_flujo, prima_seguro_afp, desc_onp, fcjmms_trabajador,
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
    coalesce((f->>'sueldo_proporcional')::numeric, 0),
    (f->>'remuneracion_bruta')::numeric,
    coalesce((f->>'asignacion_familiar')::numeric, 0),
    coalesce((f->>'add_horas_extra')::numeric, 0),
    coalesce((f->>'bonif_altitud')::numeric, 0),
    coalesce((f->>'otros_ingresos')::numeric, 0),
    0::numeric,
    0::numeric,
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
    select 1
    from public.periodos_nomina
    where id = p_periodo_id
      and empresa_id = p_empresa_id
      and sociedad_id = p_sociedad_id
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
    raise exception 'No se puede reprocesar el periodo % porque esta cerrado o anulado.', p_periodo_id;
  end if;

  update public.periodos_nomina
     set gratificacion_real_confirmada = false
   where id = p_periodo_id
     and empresa_id = p_empresa_id
     and sociedad_id = p_sociedad_id;

  delete from public.nomina_detalle
  where periodo_id = p_periodo_id
    and empresa_id = p_empresa_id;

  insert into public.nomina_detalle (
    empresa_id, sociedad_id, periodo_id, trabajador_id, trabajador_tipo,
    sistema_pensionario, regimen_jornada_snap, regimen_empresa_snap,
    dias_laborables, dias_laborados, dias_computables,
    horas_extra_tramo1_min, horas_extra_tramo2_min,
    sueldo_base, sueldo_proporcional, remuneracion_bruta, asignacion_familiar, add_horas_extra,
    bonif_altitud, otros_ingresos, gratificacion_pagada, bonif_extraordinaria_pagada,
    desc_faltas, desc_tardanzas, aporte_afp, comision_afp_flujo, prima_seguro_afp, desc_onp, fcjmms_trabajador,
    retencion_ir, desc_prestamo, desc_anticipo, desc_judicial,
    desc_extraordinario, total_descuentos, neto, essalud,
    cts_mensualizado, tiene_cts, gratificacion_mensualizada,
    bonif_extraordinaria, tiene_gratificacion, vacaciones_mensualizadas,
    total_cargas, costo_real_empresa, es_quincena, quincena,
    pct_quincena_aplicado
  )
  select
    p_empresa_id, p_sociedad_id, p_periodo_id,
    f->>'trabajador_id', f->>'trabajador_tipo', nullif(f->>'sistema_pensionario', ''),
    f->>'regimen_jornada_snap', f->>'regimen_empresa_snap',
    nullif(f->>'dias_laborables', '')::integer,
    nullif(f->>'dias_laborados', '')::integer,
    nullif(f->>'dias_computables', '')::integer,
    coalesce((f->>'horas_extra_tramo1_min')::integer, 0),
    coalesce((f->>'horas_extra_tramo2_min')::integer, 0),
    (f->>'sueldo_base')::numeric,
    coalesce((f->>'sueldo_proporcional')::numeric, 0),
    (f->>'remuneracion_bruta')::numeric,
    coalesce((f->>'asignacion_familiar')::numeric, 0),
    coalesce((f->>'add_horas_extra')::numeric, 0),
    coalesce((f->>'bonif_altitud')::numeric, 0),
    coalesce((f->>'otros_ingresos')::numeric, 0),
    0::numeric,
    0::numeric,
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
    (f->>'total_descuentos')::numeric, (f->>'neto')::numeric,
    coalesce((f->>'essalud')::numeric, 0),
    coalesce((f->>'cts_mensualizado')::numeric, 0),
    coalesce((f->>'tiene_cts')::boolean, true),
    coalesce((f->>'gratificacion_mensualizada')::numeric, 0),
    coalesce((f->>'bonif_extraordinaria')::numeric, 0),
    coalesce((f->>'tiene_gratificacion')::boolean, true),
    coalesce((f->>'vacaciones_mensualizadas')::numeric, 0),
    (f->>'total_cargas')::numeric, (f->>'costo_real_empresa')::numeric,
    coalesce((f->>'es_quincena')::boolean, false),
    nullif(f->>'quincena', '')::integer,
    nullif(f->>'pct_quincena_aplicado', '')::numeric
  from jsonb_array_elements(p_filas) as f;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Nucleo comun para las rutas legacy y multisociedad. La confirmacion es
-- intencionalmente idempotente por rechazo: un segundo intento no duplica montos.
create or replace function public._confirmar_gratificacion_real_periodo_impl_447(
  p_empresa_id text,
  p_periodo_id text,
  p_sociedad_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fecha_pago date;
  v_estado_periodo text;
  v_confirmada boolean;
  v_sociedad_periodo uuid;
  v_quincena integer;
  v_uit numeric(10,2);
  v_detalle record;
  v_fecha_ingreso date;
  v_fecha_cese date;
  v_estado_laboral text;
  v_inicio_semestre date;
  v_fin_semestre date;
  v_primer_mes_computable date;
  v_meses_completos integer;
  v_rem_computable numeric(14,2);
  v_factor numeric(4,2);
  v_gratificacion numeric(14,2);
  v_bonificacion numeric(14,2);
  v_remuneracion_bruta_original numeric(14,2);
  v_retencion_ir_original numeric(14,2);
  v_ingreso_anual_recalculado numeric(14,2);
  v_renta_bruta_anual numeric(14,2);
  v_base_ir numeric(14,2);
  v_impuesto_ir numeric(14,2);
  v_pendiente_ir numeric(14,2);
  v_retencion_ir_nueva numeric(14,2);
  v_delta_retencion_ir numeric(14,2);
  v_pagados integer := 0;
  v_total_gratificacion numeric(14,2) := 0;
  v_total_bonificacion numeric(14,2) := 0;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;

  if not public.usuario_puede(p_empresa_id, 'nomina', 'crear') then
    raise exception 'No tienes permiso para confirmar gratificacion real en este tenant.';
  end if;

  select fecha_pago, estado, gratificacion_real_confirmada, sociedad_id, quincena
    into v_fecha_pago, v_estado_periodo, v_confirmada, v_sociedad_periodo, v_quincena
  from public.periodos_nomina
  where id = p_periodo_id
    and empresa_id = p_empresa_id
    and (
      (p_sociedad_id is null and sociedad_id is null)
      or sociedad_id = p_sociedad_id
    )
  for update;

  if not found then
    raise exception 'El periodo % no existe para el tenant o sociedad indicados.', p_periodo_id;
  end if;

  if v_estado_periodo in ('cerrado', 'anulado') then
    raise exception 'No se puede confirmar gratificacion real en un periodo cerrado o anulado.';
  end if;

  if v_confirmada then
    raise exception 'La gratificacion real del periodo % ya fue confirmada. Reprocesa el periodo para reiniciar la confirmacion.', p_periodo_id;
  end if;

  if v_fecha_pago is null or extract(month from v_fecha_pago) not in (7, 12) then
    raise exception 'El periodo % no tiene una fecha de pago en julio o diciembre.', p_periodo_id;
  end if;

  if v_quincena is not null and v_quincena <> 1 then
    raise exception 'La confirmacion de gratificacion real solo aplica a la primera quincena del mes de pago.';
  end if;

  if not exists (
    select 1
    from public.nomina_detalle
    where empresa_id = p_empresa_id
      and periodo_id = p_periodo_id
      and (p_sociedad_id is null or sociedad_id = p_sociedad_id)
  ) then
    raise exception 'El periodo % no tiene nomina procesada. Debes procesarlo antes de confirmar la gratificacion.', p_periodo_id;
  end if;

  if extract(month from v_fecha_pago) = 7 then
    v_inicio_semestre := make_date(extract(year from v_fecha_pago)::integer, 1, 1);
    v_fin_semestre := make_date(extract(year from v_fecha_pago)::integer, 6, 30);
  else
    v_inicio_semestre := make_date(extract(year from v_fecha_pago)::integer, 7, 1);
    v_fin_semestre := make_date(extract(year from v_fecha_pago)::integer, 12, 31);
  end if;

  -- Misma UIT que usa el motor al invocar calcularIR5ta; si aun no existe
  -- configuracion para el tenant, conserva su valor por defecto (5500).
  select coalesce(uit_vigente, 5500)
    into v_uit
  from public.empresa_config
  where empresa_id = p_empresa_id;

  if not found then
    v_uit := 5500;
  end if;

  for v_detalle in
    select id, trabajador_id, trabajador_tipo, sueldo_proporcional,
           asignacion_familiar, bonif_altitud, regimen_empresa_snap,
           remuneracion_bruta, gratificacion_mensualizada,
           bonif_extraordinaria, retencion_ir, total_descuentos, neto
    from public.nomina_detalle
    where empresa_id = p_empresa_id
      and periodo_id = p_periodo_id
      and (p_sociedad_id is null or sociedad_id = p_sociedad_id)
    for update
  loop
    v_fecha_ingreso := null;
    v_fecha_cese := null;
    v_estado_laboral := null;

    if v_detalle.trabajador_tipo = 'operativo' then
      select fecha_ingreso, fecha_cese, estado_laboral
        into v_fecha_ingreso, v_fecha_cese, v_estado_laboral
      from public.personal_operativo
      where id = v_detalle.trabajador_id
        and empresa_id = p_empresa_id;
    elsif v_detalle.trabajador_tipo = 'administrativo' then
      select fecha_ingreso, fecha_cese, estado_laboral
        into v_fecha_ingreso, v_fecha_cese, v_estado_laboral
      from public.personal_administrativo
      where id = v_detalle.trabajador_id
        and empresa_id = p_empresa_id;
    else
      raise exception 'El trabajador % tiene tipo de personal no soportado: %.', v_detalle.trabajador_id, v_detalle.trabajador_tipo;
    end if;

    if not found then
      raise exception 'No existe la ficha de personal % usada por el snapshot de nomina.', v_detalle.trabajador_id;
    end if;

    v_gratificacion := 0;
    v_bonificacion := 0;

    if v_estado_laboral = 'activo'
       and v_fecha_ingreso is not null
       and v_fecha_ingreso <= v_fecha_pago
       and (v_fecha_cese is null or v_fecha_cese > v_fecha_pago)
       and coalesce(v_detalle.regimen_empresa_snap, 'general') <> 'microempresa' then
      if v_fecha_ingreso <= v_inicio_semestre then
        v_primer_mes_computable := v_inicio_semestre;
      elsif extract(day from v_fecha_ingreso) = 1 then
        v_primer_mes_computable := date_trunc('month', v_fecha_ingreso)::date;
      else
        v_primer_mes_computable := (date_trunc('month', v_fecha_ingreso) + interval '1 month')::date;
      end if;

      v_primer_mes_computable := greatest(v_primer_mes_computable, v_inicio_semestre);

      if v_primer_mes_computable <= v_fin_semestre then
        v_meses_completos := least(
          6,
          greatest(
            0,
            ((extract(year from v_fin_semestre)::integer - extract(year from v_primer_mes_computable)::integer) * 12)
            + extract(month from v_fin_semestre)::integer
            - extract(month from v_primer_mes_computable)::integer
            + 1
          )
        );

        v_rem_computable := coalesce(v_detalle.sueldo_proporcional, 0)
          + coalesce(v_detalle.asignacion_familiar, 0)
          + coalesce(v_detalle.bonif_altitud, 0);
        v_factor := case when v_detalle.regimen_empresa_snap = 'pequena_empresa' then 0.5 else 1 end;
        v_gratificacion := round(v_rem_computable * v_meses_completos / 6 * v_factor, 2);
        v_bonificacion := round(v_gratificacion * 0.09, 2);
      end if;
    end if;

    if v_gratificacion > 0 or v_bonificacion > 0 then
      -- Debe conservarse antes del UPDATE: es la remuneracion recurrente que
      -- calcularIR5ta multiplica por 12, sin anualizar la gratificacion real.
      v_remuneracion_bruta_original := coalesce(v_detalle.remuneracion_bruta, 0);
      v_retencion_ir_original := coalesce(v_detalle.retencion_ir, 0);

      -- Limitacion conocida: el semestre ya pagado entra por su monto real;
      -- el semestre futuro sigue estimado una sola vez por la provision vigente.
      v_ingreso_anual_recalculado := v_gratificacion + v_bonificacion
        + coalesce(v_detalle.gratificacion_mensualizada, 0)
        + coalesce(v_detalle.bonif_extraordinaria, 0);

      -- Replica exacta de calcularIR5ta(remuneracionBruta, UIT, 12, 0, ingresoAnualAdicional).
      v_renta_bruta_anual := (v_remuneracion_bruta_original * 12) + v_ingreso_anual_recalculado;
      v_base_ir := v_renta_bruta_anual - (7 * v_uit);
      if v_base_ir <= 0 then
        v_retencion_ir_nueva := 0;
      else
        if v_base_ir <= 5 * v_uit then
          v_impuesto_ir := v_base_ir * 0.08;
        elsif v_base_ir <= 20 * v_uit then
          v_impuesto_ir := 5 * v_uit * 0.08 + (v_base_ir - 5 * v_uit) * 0.14;
        elsif v_base_ir <= 35 * v_uit then
          v_impuesto_ir := 5 * v_uit * 0.08 + 15 * v_uit * 0.14 + (v_base_ir - 20 * v_uit) * 0.17;
        elsif v_base_ir <= 45 * v_uit then
          v_impuesto_ir := 5 * v_uit * 0.08 + 15 * v_uit * 0.14 + 15 * v_uit * 0.17 + (v_base_ir - 35 * v_uit) * 0.20;
        else
          v_impuesto_ir := 5 * v_uit * 0.08 + 15 * v_uit * 0.14 + 15 * v_uit * 0.17 + 10 * v_uit * 0.20 + (v_base_ir - 45 * v_uit) * 0.30;
        end if;
        v_pendiente_ir := greatest(0, v_impuesto_ir - 0);
        v_retencion_ir_nueva := v_pendiente_ir / greatest(1, 12);
      end if;
      v_delta_retencion_ir := v_retencion_ir_nueva - v_retencion_ir_original;

      update public.nomina_detalle
         set gratificacion_pagada = v_gratificacion,
             bonif_extraordinaria_pagada = v_bonificacion,
             remuneracion_bruta = coalesce(remuneracion_bruta, 0) + v_gratificacion + v_bonificacion,
             retencion_ir = v_retencion_ir_nueva,
             total_descuentos = coalesce(total_descuentos, 0) + v_delta_retencion_ir,
             neto = coalesce(neto, 0) + v_gratificacion + v_bonificacion - v_delta_retencion_ir
       where id = v_detalle.id;
    else
      -- Procesar inserta ambos importes en cero. Este ajuste es solo defensivo
      -- y no altera remuneracion_bruta, retencion_ir, descuentos ni neto.
      update public.nomina_detalle
         set gratificacion_pagada = 0,
             bonif_extraordinaria_pagada = 0
       where id = v_detalle.id
         and (
           coalesce(gratificacion_pagada, 0) <> 0
           or coalesce(bonif_extraordinaria_pagada, 0) <> 0
         );
    end if;

    if v_gratificacion > 0 or v_bonificacion > 0 then
      v_pagados := v_pagados + 1;
      v_total_gratificacion := v_total_gratificacion + v_gratificacion;
      v_total_bonificacion := v_total_bonificacion + v_bonificacion;
    end if;
  end loop;

  update public.periodos_nomina
     set gratificacion_real_confirmada = true
   where id = p_periodo_id
     and empresa_id = p_empresa_id
     and sociedad_id is not distinct from v_sociedad_periodo;

  return jsonb_build_object(
    'periodo_id', p_periodo_id,
    'trabajadores_con_pago', v_pagados,
    'gratificacion_total', v_total_gratificacion,
    'bonif_extraordinaria_total', v_total_bonificacion,
    'monto_total', v_total_gratificacion + v_total_bonificacion
  );
end;
$$;

create or replace function public.confirmar_gratificacion_real_periodo(
  p_empresa_id text,
  p_periodo_id text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public._confirmar_gratificacion_real_periodo_impl_447(
    p_empresa_id,
    p_periodo_id,
    null
  );
$$;

create or replace function public.confirmar_gratificacion_real_periodo_sociedad(
  p_empresa_id text,
  p_periodo_id text,
  p_sociedad_id uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public._confirmar_gratificacion_real_periodo_impl_447(
    p_empresa_id,
    p_periodo_id,
    p_sociedad_id
  );
$$;

revoke all on function public._confirmar_gratificacion_real_periodo_impl_447(text, text, uuid) from public, anon, authenticated;
revoke all on function public.confirmar_gratificacion_real_periodo(text, text) from public, anon;
revoke all on function public.confirmar_gratificacion_real_periodo_sociedad(text, text, uuid) from public, anon;
grant execute on function public.confirmar_gratificacion_real_periodo(text, text) to authenticated, service_role;
grant execute on function public.confirmar_gratificacion_real_periodo_sociedad(text, text, uuid) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
