-- Fix + automatizacion de la alerta SAR no-llegada.
--
-- Bug critico encontrado en auditoria: evaluar_sar_no_llegada (237_ola5b_geo_sar.sql)
-- llamaba a notificar_rrhh_ola2_once(..., null, ...) con p_user_id hardcodeado a
-- null. notificar_rrhh_ola2_once retorna de inmediato cuando p_user_id is null,
-- asi que ninguna notificacion se insertaba jamas -- ni siquiera al presionar el
-- boton manual "Generar alertas" del Panel SAR.
--
-- Ademas la funcion no validaba sar_habilitado ni sar_hora_limite/sar_gracia_minutos:
-- disparaba para cualquier trabajador sin marcacion 'dentro' sin importar la hora.
--
-- Este archivo:
-- 1) Reemplaza evaluar_sar_no_llegada para resolver usuarios reales con acceso a
--    la pantalla 'asistencia' (admin/superadmin o permisos_roles.puede_ver) y
--    notificarlos uno por uno -- reutiliza notificar_rrhh_ola2_once sin tocarla.
-- 2) La hace multi-tenant (p_empresa_id default null -> loop sobre empresas),
--    mismo patron que generar_solpes_reorden (218_stock_seguridad_solpe_automatica.sql).
-- 3) Valida sar_habilitado y hora limite + gracia (en la zona horaria del tenant)
--    antes de evaluar, para no disparar fuera de ventana.
-- 4) Registra el pg_cron cada 15 min en horario 08:00-13:00 hora Peru
--    (13:00-18:00 UTC, mismo offset -5h documentado en 249_gap05_job_sin_contrato_conectado.sql),
--    mismo patron ya usado en 213/218/249. La ventana del cron es solo una
--    optimizacion gruesa para no correr de madrugada; el filtro real de hora
--    limite + gracia por tenant ya ocurre dentro de la funcion (paso 3).
--
-- El envio de WhatsApp NO se toca aqui: el trigger trg_whatsapp_enqueue_notificacion
-- (234_ola5a_biometrico_whatsapp.sql) ya escucha inserts en notificaciones_sistema
-- y whatsapp_tipo_alerta_desde_notificacion ya mapea 'sar_no_llegada' desde
-- 237_ola5b_geo_sar.sql. Al insertar notificaciones reales (punto 1), la cola de
-- whatsapp_envios en modo simulado se llena automaticamente via ese trigger
-- existente -- no se agrega ningun insert nuevo a whatsapp_envios en este archivo.

create or replace function public.evaluar_sar_no_llegada(p_empresa_id text default null, p_fecha date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_total integer := 0;
  v_emp record;
  v_cfg record;
  v_zona text;
  v_hora_ok boolean;
  r record;
  v_user record;
begin
  if p_empresa_id is null then
    for v_emp in select id from public.empresas loop
      v_total := v_total + public.evaluar_sar_no_llegada(v_emp.id, p_fecha);
    end loop;
    return v_total;
  end if;

  select * into v_cfg from public.empresa_config where empresa_id = p_empresa_id;
  if not coalesce(v_cfg.sar_habilitado, false) then
    return 0;
  end if;

  if p_fecha = current_date then
    v_zona := coalesce(nullif(btrim(v_cfg.zona_horaria), ''), 'America/Lima');
    v_hora_ok := (now() at time zone v_zona)::time
      >= (coalesce(v_cfg.sar_hora_limite, '09:00'::time) + (coalesce(v_cfg.sar_gracia_minutos, 0) || ' minutes')::interval);
    if not v_hora_ok then
      return 0;
    end if;
  end if;

  for r in
    select distinct a.personal_id, a.personal_tipo, g.id as geocerca_id, g.nombre as geocerca_nombre
      from public.rrhh_geocerca_asignaciones a
      join public.rrhh_geocercas g on g.id = a.geocerca_id
     where a.empresa_id = p_empresa_id and a.estado = 'activo' and g.estado = 'activo'
       and a.personal_id is not null
  loop
    if not exists (
      select 1 from public.registros_asistencia ra
       where ra.empresa_id = p_empresa_id
         and ra.trabajador_id = r.personal_id
         and ra.fecha = p_fecha
         and coalesce(ra.geofence_entrada_estado, '') = 'dentro'
    ) then
      for v_user in
        select distinct ue.user_id
          from public.usuarios_empresas ue
          join public.roles ro on ro.id = ue.rol_id
         where ue.empresa_id = p_empresa_id
           and ue.estado = 'activo'
           and (
             ro.es_admin_empresa = true
             or ro.es_superadmin = true
             or exists (
               select 1 from public.permisos_roles pr
                where pr.rol_id = ue.rol_id and pr.pantalla = 'asistencia' and pr.puede_ver = true
             )
           )
      loop
        perform public.notificar_rrhh_ola2_once(
          p_empresa_id, v_user.user_id, 'sar_no_llegada', 'SAR: no llegada',
          'Trabajador esperado sin marcacion dentro de perimetro en ' || r.geocerca_nombre,
          'rrhh_geocercas', r.geocerca_id, 'alta'
        );
      end loop;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      execute $cron$
        select cron.schedule(
          'sar-no-llegada-check',
          '*/15 13-18 * * *',
          'select public.evaluar_sar_no_llegada();'
        )
        where not exists (
          select 1 from cron.job where jobname = 'sar-no-llegada-check'
        )
      $cron$;
    exception when others then
      raise notice 'No se pudo registrar pg_cron sar-no-llegada-check: %', sqlerrm;
    end;
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');
