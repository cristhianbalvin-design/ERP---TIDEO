-- 652: Hora de envío configurable para el resumen de tardanzas.
-- Si la regla de tardanzas de una empresa tiene parametros.hora_envio (HH:MM, hora de Lima, tramos de 15 min),
-- el resumen sale a esa hora con las tardanzas de HOY registradas hasta ese momento.
-- Sin hora_envio, todo sigue igual: resumen del día anterior en la rutina de las 07:20.
-- Las tardanzas marcadas después de la hora de envío se ignoran (un solo resumen por día, clave tardanzas:<fecha>).
-- Las funciones existentes se modifican a partir de pg_get_functiondef de la versión remota vigente,
-- con reemplazos puntuales verificados (si un fragmento no se encuentra, la migración se revierte).

-- 1) Helper: hora de envío válida de una regla (o null).
create or replace function public.notif_tardanzas_hora_envio(p_parametros jsonb)
returns time
language sql
immutable
set search_path to 'public'
as $$
  select case
    when coalesce(p_parametros ->> 'hora_envio', '') ~ '^([01][0-9]|2[0-3]):(00|15|30|45)$'
      then (p_parametros ->> 'hora_envio')::time
  end
$$;

-- 2) Ejecuta tardanzas solo si corresponde (sin hora: siempre; con hora: solo si ya pasó la hora en Lima).
create or replace function public.notif_tardanzas_si_corresponde(p_empresa_id text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_hora time;
begin
  select public.notif_tardanzas_hora_envio(r.parametros) into v_hora
  from public.notif_reglas_empresa r
  where r.empresa_id = p_empresa_id and r.evento_codigo = 'tardanza_resumen_diario' and r.activo;
  if not found then return 0; end if;
  if v_hora is not null and (now() at time zone 'America/Lima')::time < v_hora then
    return 0;
  end if;
  return public.notif_generar_tardanzas_resumen(p_empresa_id);
end;
$$;

-- 3) Rutina cada 15 min: empresas con hora de envío dentro del tramo actual.
create or replace function public.notif_rutina_tardanzas_horaria()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record; v_n integer; v_ahora time := (now() at time zone 'America/Lima')::time; v_hubo boolean := false;
begin
  for r in
    select x.empresa_id
    from public.notif_reglas_empresa x
    join public.empresas e on e.id = x.empresa_id
    where x.evento_codigo = 'tardanza_resumen_diario' and x.activo
      and coalesce(e.estado, 'activo') in ('activa', 'activo', 'demo')
      and public.notif_tardanzas_hora_envio(x.parametros) is not null
      and v_ahora >= public.notif_tardanzas_hora_envio(x.parametros)
      and v_ahora < public.notif_tardanzas_hora_envio(x.parametros) + interval '15 minutes'
  loop
    begin
      v_n := public.notif_generar_tardanzas_resumen(r.empresa_id);
      insert into public.notif_ejecuciones (empresa_id, evento_codigo, estado, generadas)
      values (r.empresa_id, 'tardanza_resumen_diario', 'ok', v_n);
      v_hubo := v_hubo or v_n > 0;
    exception when others then
      insert into public.notif_ejecuciones (empresa_id, evento_codigo, estado, detalle)
      values (r.empresa_id, 'tardanza_resumen_diario', 'error', sqlerrm);
    end;
  end loop;
  if v_hubo then
    perform public.notif_disparar_dispatch();
  end if;
end;
$$;

revoke all on function public.notif_tardanzas_si_corresponde(text) from public, anon, authenticated;
revoke all on function public.notif_rutina_tardanzas_horaria() from public, anon, authenticated;

-- 4) Reemplazos puntuales en funciones existentes.
do $mig$
declare
  v_def text; v_new text;
begin
  -- 4a) notif_generar_tardanzas_resumen: fecha = hoy si hay hora de envío; ayer si no.
  v_def := pg_get_functiondef('public.notif_generar_tardanzas_resumen(text,date)'::regprocedure);
  v_new := replace(v_def,
    'v_fecha date := coalesce(p_fecha, public.notif_hoy_lima() - 1);',
    'v_fecha date;');
  v_new := replace(v_new,
    'and evento_codigo = ''tardanza_resumen_diario'' and activo;' || chr(13) || chr(10) || '  if not found then return 0; end if;',
    'and evento_codigo = ''tardanza_resumen_diario'' and activo;' || chr(13) || chr(10) || '  if not found then return 0; end if;'
      || chr(10) || '  v_fecha := coalesce(p_fecha, case when public.notif_tardanzas_hora_envio(v_regla.parametros) is not null'
      || ' then public.notif_hoy_lima() else public.notif_hoy_lima() - 1 end);');
  if v_new = v_def or position('v_fecha := coalesce(p_fecha, case when public.notif_tardanzas_hora_envio' in v_new) = 0
     or position('v_fecha date := coalesce' in v_new) > 0 then
    raise exception '652: no se pudo ajustar notif_generar_tardanzas_resumen';
  end if;
  execute v_new;

  -- 4b) notif_ejecutar_empresa: tardanzas respeta la hora de envío.
  v_def := pg_get_functiondef('public.notif_ejecutar_empresa(text)'::regprocedure);
  v_new := replace(v_def,
    'when ''tardanza_resumen_diario'' then public.notif_generar_tardanzas_resumen(p_empresa_id)',
    'when ''tardanza_resumen_diario'' then public.notif_tardanzas_si_corresponde(p_empresa_id)');
  if v_new = v_def then
    raise exception '652: no se pudo ajustar notif_ejecutar_empresa';
  end if;
  execute v_new;

  -- 4c) notif_config_guardar: valida y guarda hora_envio (opcional) de tardanzas.
  v_def := pg_get_functiondef('public.notif_config_guardar(text,text,boolean,jsonb,jsonb)'::regprocedure);
  v_new := replace(v_def,
    'v_param := jsonb_build_object(''umbral_minutos'', v_umbral);',
    'v_param := jsonb_build_object(''umbral_minutos'', v_umbral);'
      || chr(10) || '    if nullif(trim(coalesce(p_parametros ->> ''hora_envio'', '''')), '''') is not null then'
      || chr(10) || '      if public.notif_tardanzas_hora_envio(jsonb_build_object(''hora_envio'', trim(p_parametros ->> ''hora_envio''))) is null then'
      || chr(10) || '        raise exception ''La hora de envío debe tener el formato HH:MM en tramos de 15 minutos (por ejemplo 09:30).'';'
      || chr(10) || '      end if;'
      || chr(10) || '      v_param := v_param || jsonb_build_object(''hora_envio'', trim(p_parametros ->> ''hora_envio''));'
      || chr(10) || '    end if;');
  if v_new = v_def then
    raise exception '652: no se pudo ajustar notif_config_guardar';
  end if;
  execute v_new;
end
$mig$;

-- 5) Catálogo: descripción actualizada.
update public.notif_eventos_catalogo
set descripcion = 'Resumen de las tardanzas que superan el umbral. Sin hora de envío, sale cada mañana con las del día anterior; con hora de envío, sale a esa hora con las de hoy. RRHH recibe todas; el jefe directo, solo las de su equipo.'
where codigo = 'tardanza_resumen_diario';

-- 6) Tarea programada cada 15 minutos.
do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'notificaciones-tardanzas-horaria') then
    perform cron.unschedule('notificaciones-tardanzas-horaria');
  end if;
  perform cron.schedule('notificaciones-tardanzas-horaria', '*/15 * * * *', 'select public.notif_rutina_tardanzas_horaria();');
end
$cron$;

-- 7) Comprobación final.
do $chk$
begin
  if position('notif_tardanzas_hora_envio' in pg_get_functiondef('public.notif_generar_tardanzas_resumen(text,date)'::regprocedure)) = 0 then
    raise exception '652 chk: tardanzas sin ajuste';
  end if;
  if position('notif_tardanzas_si_corresponde' in pg_get_functiondef('public.notif_ejecutar_empresa(text)'::regprocedure)) = 0 then
    raise exception '652 chk: ejecutar_empresa sin ajuste';
  end if;
  if position('hora_envio' in pg_get_functiondef('public.notif_config_guardar(text,text,boolean,jsonb,jsonb)'::regprocedure)) = 0 then
    raise exception '652 chk: config_guardar sin ajuste';
  end if;
  if not exists (select 1 from cron.job where jobname = 'notificaciones-tardanzas-horaria' and schedule = '*/15 * * * *') then
    raise exception '652 chk: falta la tarea programada';
  end if;
  if public.notif_tardanzas_hora_envio('{"hora_envio":"09:30"}') <> time '09:30'
     or public.notif_tardanzas_hora_envio('{"hora_envio":"09:20"}') is not null
     or public.notif_tardanzas_hora_envio('{}') is not null then
    raise exception '652 chk: helper de hora inválido';
  end if;
end
$chk$;
