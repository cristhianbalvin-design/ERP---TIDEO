-- 638: Cobro recurrente mensual (segunda entrega del acta de conformidad).
--   1. os_clientes.tarifa_mensual: tarifa fija mensual sin IGV, obligatoria si la OS es recurrente mensual.
--   2. ordenes_trabajo.periodo_mensual: mes (día 1) que cubre la OT de una OS mensual; una OT por OS y mes.
--   3. Trigger que etiqueta con su mes la OT creada a mano para una OS mensual.
--   4. generar_ots_mensuales(): crea en ejecución la OT del mes copiando la OT del mes anterior.
--   5. Tarea diaria pg_cron 'ots-mensuales-diarias' (00:20 hora Lima). Es idempotente.

-- 1. Tarifa mensual en la OS --------------------------------------------------
alter table public.os_clientes add column if not exists tarifa_mensual numeric(14,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'os_clientes_tarifa_mensual_chk') then
    alter table public.os_clientes add constraint os_clientes_tarifa_mensual_chk
      check (
        (tarifa_mensual is null or tarifa_mensual >= 0)
        and (tipo_cobro is distinct from 'recurrente_mensual'
             or (coalesce(tarifa_mensual, 0) > 0 and fecha_inicio is not null))
      );
  end if;
end $$;

comment on column public.os_clientes.tarifa_mensual is
  'Tarifa fija mensual sin IGV. Obligatoria (> 0, con fecha de inicio) cuando tipo_cobro = recurrente_mensual; los meses incompletos se prorratean por días.';

-- 2. Periodo de la OT mensual ---------------------------------------------------
alter table public.ordenes_trabajo add column if not exists periodo_mensual date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ordenes_trabajo_periodo_mensual_chk') then
    alter table public.ordenes_trabajo add constraint ordenes_trabajo_periodo_mensual_chk
      check (periodo_mensual is null or extract(day from periodo_mensual) = 1);
  end if;
end $$;

create unique index if not exists ordenes_trabajo_os_periodo_mensual_uidx
  on public.ordenes_trabajo (os_cliente_id, periodo_mensual)
  where periodo_mensual is not null;

comment on column public.ordenes_trabajo.periodo_mensual is
  'Primer día del mes que cubre la OT de una OS recurrente mensual. Única por OS y mes.';

-- 3. Etiquetar la OT manual de una OS mensual ----------------------------------
create or replace function public.ot_asignar_periodo_mensual()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_tipo_os text;
  v_periodo date;
begin
  if new.periodo_mensual is not null or new.os_cliente_id is null then
    return new;
  end if;

  select os.tipo_cobro into v_tipo_os
  from public.os_clientes os
  where os.id = new.os_cliente_id and os.empresa_id = new.empresa_id;

  if coalesce(new.tipo_cobro, v_tipo_os, 'puntual') <> 'recurrente_mensual' then
    return new;
  end if;

  v_periodo := date_trunc('month', coalesce(new.fecha_programada, (now() at time zone 'America/Lima')::date))::date;

  -- Si el mes ya tiene su OT, esta queda como OT adicional (sin periodo).
  if not exists (
    select 1 from public.ordenes_trabajo ot
    where ot.os_cliente_id = new.os_cliente_id and ot.periodo_mensual = v_periodo
  ) then
    new.periodo_mensual := v_periodo;
  end if;
  return new;
end;
$function$;

create or replace trigger trg_ot_asignar_periodo_mensual
  before insert on public.ordenes_trabajo
  for each row execute function public.ot_asignar_periodo_mensual();

-- 4. Número de OT sin sesión de usuario ------------------------------------------
-- Misma regla que crear_ot_desde_os_cliente / siguiente_numero_orden_trabajo, sin el
-- control de usuario_tiene_empresa (la tarea programada no tiene sesión). Solo uso interno.
create or replace function public.numero_ot_interno(p_empresa_id text, p_numero_caso integer)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_secuencia integer;
  v_yy text := right(to_char((now() at time zone 'America/Lima')::date, 'YYYY'), 2);
  v_serie record;
  v_max integer;
begin
  if session_user = 'authenticator' then
    raise exception 'numero_ot_interno es de uso interno.' using errcode = '42501';
  end if;

  if p_numero_caso is not null then
    perform pg_advisory_xact_lock(hashtextextended('caso_servicio' || p_empresa_id, 0));
    select count(*)::integer + 1 into v_secuencia
    from public.ordenes_trabajo
    where empresa_id = p_empresa_id and numero_caso = p_numero_caso;
    return 'OT-' || p_numero_caso::text || '-' || v_secuencia::text;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('siguiente_numero_orden_trabajo:' || p_empresa_id, 0));
  select * into v_serie
  from public.series_documentarias
  where empresa_id = p_empresa_id and documento = 'Ordenes de Trabajo' and estado = 'activo'
  limit 1
  for update;

  if found then
    update public.series_documentarias
       set siguiente_correlativo = siguiente_correlativo + 1
     where id = v_serie.id;
    return v_serie.serie || '-' || lpad(v_serie.siguiente_correlativo::text, 4, '0');
  end if;

  select coalesce(max((substring(numero from '-([0-9]{4})$'))::int), 0) into v_max
  from public.ordenes_trabajo
  where empresa_id = p_empresa_id and numero ~ ('^OT-' || v_yy || '-[0-9]{4}$');
  return 'OT-' || v_yy || '-' || lpad((v_max + 1)::text, 4, '0');
end;
$function$;

-- 5. Generar las OT del mes -------------------------------------------------------
create or replace function public.generar_ots_mensuales(p_hoy date default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_hoy date := coalesce(p_hoy, (now() at time zone 'America/Lima')::date);
  v_mes date := date_trunc('month', v_hoy)::date;
  v_fin_mes date := (date_trunc('month', v_hoy) + interval '1 month - 1 day')::date;
  v_os record;
  v_plantilla public.ordenes_trabajo%rowtype;
  v_ot_id text;
  v_numero text;
  v_creadas jsonb := '[]'::jsonb;
  v_sin_plantilla jsonb := '[]'::jsonb;
  v_errores jsonb := '[]'::jsonb;
begin
  if session_user = 'authenticator' then
    raise exception 'generar_ots_mensuales solo la ejecuta la tarea programada.' using errcode = '42501';
  end if;

  for v_os in
    select os.*
    from public.os_clientes os
    where os.tipo_cobro = 'recurrente_mensual'
      and os.estado in ('activa', 'en_ejecucion')
      and os.fecha_inicio is not null
      and os.fecha_inicio <= v_fin_mes
      and (os.fecha_fin is null or os.fecha_fin >= v_mes)
      and not exists (
        select 1 from public.ordenes_trabajo ot
        where ot.os_cliente_id = os.id and ot.periodo_mensual = v_mes
      )
    order by os.empresa_id, os.numero
  loop
    begin
      -- Plantilla: la OT mensual más reciente de la OS (la primera la crea el usuario).
      select ot.* into v_plantilla
      from public.ordenes_trabajo ot
      where ot.os_cliente_id = v_os.id
        and ot.empresa_id = v_os.empresa_id
        and ot.periodo_mensual is not null
        and ot.periodo_mensual < v_mes
      order by ot.periodo_mensual desc, ot.created_at desc
      limit 1;

      if not found then
        v_sin_plantilla := v_sin_plantilla || jsonb_build_object('os', v_os.numero, 'empresa_id', v_os.empresa_id);
        continue;
      end if;

      v_ot_id := 'ot_' || replace(gen_random_uuid()::text, '-', '');
      v_numero := public.numero_ot_interno(v_os.empresa_id, v_os.numero_caso);

      insert into public.ordenes_trabajo (
        id, empresa_id, os_cliente_id, numero, numero_caso, secuencia_caso, cuenta_id, servicio, descripcion,
        direccion_ejecucion, ubicacion_gps, fecha_programada, fecha_fin, hora_inicio, hora_fin,
        hora_inicio_estimada, hora_fin_estimada, tecnico_responsable_id, cuadrilla, supervisor,
        estado, avance_pct, costo_estimado, costo_real, moneda, centro_costo_id, centro_beneficio_id,
        facturable, est_mo, est_materiales, est_terceros, est_logistica, est_detalle,
        costo_estimado_ot, estimado_detalle, participantes_admin, sociedad_id, tipo_servicio_interno_id,
        tipo_trabajo, cargo_financiero, linea_negocio, proyecto_id, tipo_cobro, periodo_mensual
      ) values (
        v_ot_id, v_os.empresa_id, v_os.id, v_numero,
        v_os.numero_caso,
        case when v_os.numero_caso is not null then nullif(split_part(v_numero, '-', 3), '')::integer end,
        coalesce(v_plantilla.cuenta_id, v_os.cuenta_id), v_plantilla.servicio, v_plantilla.descripcion,
        v_plantilla.direccion_ejecucion, v_plantilla.ubicacion_gps,
        greatest(v_mes, v_os.fecha_inicio), least(v_fin_mes, coalesce(v_os.fecha_fin, v_fin_mes)),
        v_plantilla.hora_inicio, v_plantilla.hora_fin, v_plantilla.hora_inicio_estimada, v_plantilla.hora_fin_estimada,
        v_plantilla.tecnico_responsable_id, v_plantilla.cuadrilla, v_plantilla.supervisor,
        'ejecucion', 0, coalesce(v_plantilla.costo_estimado, 0), 0, coalesce(v_plantilla.moneda, v_os.moneda, 'PEN'),
        v_plantilla.centro_costo_id, coalesce(v_plantilla.centro_beneficio_id, v_os.centro_beneficio_id),
        v_plantilla.facturable, v_plantilla.est_mo, v_plantilla.est_materiales, v_plantilla.est_terceros,
        v_plantilla.est_logistica, v_plantilla.est_detalle, v_plantilla.costo_estimado_ot, v_plantilla.estimado_detalle,
        v_plantilla.participantes_admin, v_plantilla.sociedad_id, v_plantilla.tipo_servicio_interno_id,
        v_plantilla.tipo_trabajo, v_plantilla.cargo_financiero, v_plantilla.linea_negocio, v_plantilla.proyecto_id,
        v_plantilla.tipo_cobro, v_mes
      );

      -- Las tareas de la OT anterior se copian como pendientes.
      insert into public.ot_tareas (
        empresa_id, ot_id, titulo, descripcion, tecnico_id, tecnico_nombre, tecnico_tipo,
        estado, horas_estimadas, orden, familia_trabajo_id, actividad_id, cargo_id, activo_id, horas_maquina
      )
      select t.empresa_id, v_ot_id, t.titulo, t.descripcion, t.tecnico_id, t.tecnico_nombre, t.tecnico_tipo,
             'pendiente', t.horas_estimadas, t.orden, t.familia_trabajo_id, t.actividad_id, t.cargo_id, t.activo_id, t.horas_maquina
      from public.ot_tareas t
      where t.ot_id = v_plantilla.id;

      update public.os_clientes
         set ots_asociadas = (
               select coalesce(jsonb_agg(distinct value), '[]'::jsonb)
               from (
                 select value from jsonb_array_elements_text(coalesce(ots_asociadas, '[]'::jsonb)) value
                 union all select v_ot_id
               ) items
             ),
             updated_at = now()
       where id = v_os.id;

      v_creadas := v_creadas || jsonb_build_object('os', v_os.numero, 'ot', v_numero, 'empresa_id', v_os.empresa_id);
    exception when others then
      v_errores := v_errores || jsonb_build_object('os', v_os.numero, 'empresa_id', v_os.empresa_id, 'error', sqlerrm);
      raise warning 'generar_ots_mensuales: OS % (%): %', v_os.numero, v_os.empresa_id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object('periodo', v_mes, 'creadas', v_creadas, 'sin_plantilla', v_sin_plantilla, 'errores', v_errores);
end;
$function$;

comment on function public.generar_ots_mensuales(date) is
  'Crea en ejecución la OT del mes de cada OS recurrente mensual vigente, copiando la OT mensual anterior. Idempotente; la ejecuta pg_cron.';

-- 6. Tarea diaria (00:20 hora Lima = 05:20 UTC) -----------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      execute $cron$
        select cron.schedule(
          'ots-mensuales-diarias',
          '20 5 * * *',
          'select public.generar_ots_mensuales();'
        )
        where not exists (select 1 from cron.job where jobname = 'ots-mensuales-diarias')
      $cron$;
    exception when others then
      raise notice 'No se pudo registrar pg_cron ots-mensuales-diarias: %', sqlerrm;
    end;
  end if;
end $$;

-- 7. Comprobación ------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'os_clientes' and column_name = 'tarifa_mensual') then
    raise exception 'Falta os_clientes.tarifa_mensual';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ordenes_trabajo' and column_name = 'periodo_mensual') then
    raise exception 'Falta ordenes_trabajo.periodo_mensual';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_ot_asignar_periodo_mensual') then
    raise exception 'Falta el trigger trg_ot_asignar_periodo_mensual';
  end if;
  if to_regprocedure('public.generar_ots_mensuales(date)') is null then
    raise exception 'Falta generar_ots_mensuales(date)';
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');
