-- SEG-2c / Notificaciones documentarias
-- Corrige la ambigüedad de empresa_id, amplía destinatarios funcionales,
-- hace persistente la deduplicación mientras la alerta siga no leída y
-- registra el job diario independiente a las 07:05 America/Lima (12:05 UTC).
--
-- Fuera de alcance:
--   * generar_solpes_reorden conserva su estado actual y no se programa.
--   * EXISTS seguido de INSERT no serializa ejecuciones concurrentes; el único
--     productor programado por este bloque es un job diario.
--
-- El índice parcial idx_notif_sistema_doc_idempotencia conserva el predicado y
-- el prefijo de igualdad usados por los EXISTS:
-- (user_id, tipo, referencia_tipo, referencia_id) WHERE leida = false AND
-- referencia_tipo = 'personal_documento'. No requiere modificación.

CREATE OR REPLACE FUNCTION public.generar_notificaciones_documentarias_base_213(p_empresa_id text DEFAULT NULL::text)
 RETURNS TABLE(empresa_id text, generadas integer, omitidas integer, detalle text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rol_ejecucion text;
  v_emp record;
  v_alerta record;
  v_user uuid;
  v_generadas integer;
  v_omitidas integer;
  v_detalle text;
  v_tipo text;
  v_titulo text;
  v_mensaje text;
  v_prioridad text;
  v_doc_id text;
  v_payload jsonb;
begin
  -- SECURITY DEFINER hace que current_user sea siempre postgres. Resolver el
  -- rol invocador desde el JWT, SET ROLE o la sesión de conexión.
  IF auth.uid() IS NULL THEN
    v_rol_ejecucion := COALESCE(
      NULLIF(auth.role(), ''),
      NULLIF(current_setting('role', true), 'none'),
      session_user::text
    );

    IF v_rol_ejecucion NOT IN ('postgres', 'service_role') THEN
      RAISE EXCEPTION 'Ejecución permitida solo para procesos automáticos autorizados.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.empresas e
      WHERE (p_empresa_id IS NULL OR e.id = p_empresa_id)
        AND COALESCE(e.estado, 'activo') IN ('activa', 'activo', 'demo')
        AND public.usuario_es_admin_empresa(e.id)
    ) THEN
      RAISE EXCEPTION 'Se requiere ser administrador de la empresa para generar notificaciones.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  for v_emp in
    select e.id
    from public.empresas e
    where (p_empresa_id is null or e.id = p_empresa_id)
      and coalesce(e.estado, 'activo') in ('activa', 'activo', 'demo')
      and (
        (auth.uid() is null and v_rol_ejecucion in ('postgres', 'service_role'))
        or (auth.uid() is not null and public.usuario_es_admin_empresa(e.id))
      )
  loop
    v_generadas := 0;
    v_omitidas := 0;
    v_detalle := null;

    begin
      for v_alerta in
        with hab as (
          select *
          from public.calcular_habilitaciones_personal(v_emp.id)
          where estado in ('por_vencer', 'vencido')
        ),
        personal as (
          select po.id, 'operativo'::text as personal_tipo, po.nombre, po.cargo, po.auth_user_id
          from public.personal_operativo po
          where po.empresa_id = v_emp.id and po.estado <> 'inactivo'

          union all

          select pa.id, 'administrativo'::text as personal_tipo, pa.nombre, pa.cargo, pa.auth_user_id
          from public.personal_administrativo pa
          where pa.empresa_id = v_emp.id
        ),
        doc_activo as (
          select distinct on (pd.personal_id, pd.tipo_documento_id)
            pd.id,
            pd.personal_id,
            pd.tipo_documento_id
          from public.personal_documentos pd
          where pd.empresa_id = v_emp.id
            and pd.activo = true
            and pd.tipo_documento_id is not null
          order by pd.personal_id, pd.tipo_documento_id, pd.version desc
        )
        select
          h.*,
          p.nombre as personal_nombre,
          p.cargo as personal_cargo,
          p.auth_user_id,
          d.id as documento_id
        from hab h
        join personal p on p.id = h.personal_id and p.personal_tipo = h.personal_tipo
        left join doc_activo d
          on d.personal_id = h.personal_id
         and d.tipo_documento_id = h.tipo_documento_id
      loop
        v_doc_id := coalesce(
          v_alerta.documento_id,
          v_alerta.personal_id || ':' || coalesce(v_alerta.tipo_documento_id, 'sin_tipo')
        );
        v_tipo := case when v_alerta.estado = 'vencido' then 'doc_vencido' else 'doc_por_vencer' end;
        v_titulo := case when v_alerta.estado = 'vencido' then 'Documento vencido' else 'Documento por vencer' end;
        v_prioridad := case when v_alerta.estado = 'vencido' then 'alta' else 'media' end;
        v_payload := jsonb_build_object(
          'personal_id', v_alerta.personal_id,
          'personal_tipo', v_alerta.personal_tipo,
          'personal_nombre', v_alerta.personal_nombre,
          'tipo_documento_id', v_alerta.tipo_documento_id,
          'tipo_doc_nombre', v_alerta.tipo_doc_nombre,
          'estado', v_alerta.estado,
          'dias_restantes', v_alerta.dias_restantes,
          'fecha_vencimiento', v_alerta.fecha_vencimiento
        );

        for v_user in
          select distinct ue.user_id
          from public.usuarios_empresas ue
          join public.roles r on r.id = ue.rol_id
          where ue.empresa_id = v_emp.id
            and ue.estado = 'activo'
            and (
              coalesce(r.es_admin_empresa, false) = true
              or exists (
                select 1
                from public.permisos_roles pr
                where pr.rol_id = ue.rol_id
                  and pr.pantalla in ('rrhh_operativo', 'rrhh_admin')
                  and pr.puede_ver = true
              )
            )
        loop
          v_mensaje := case
            when v_alerta.estado = 'vencido'
              then format('%s · %s vencio hace %s dias. El colaborador no esta habilitado para campo.',
                v_alerta.personal_nombre,
                coalesce(v_alerta.tipo_doc_nombre, v_alerta.tipo_documento_id),
                abs(coalesce(v_alerta.dias_restantes, 0))
              )
            else format('%s · %s vence en %s dias. Solicita la renovacion.',
                v_alerta.personal_nombre,
                coalesce(v_alerta.tipo_doc_nombre, v_alerta.tipo_documento_id),
                coalesce(v_alerta.dias_restantes, 0)
              )
          end;

          if exists (
            select 1
            from public.notificaciones_sistema ns
            where ns.user_id = v_user
              and ns.tipo = v_tipo
              and ns.referencia_tipo = 'personal_documento'
              and ns.referencia_id = v_doc_id
              and ns.leida = false
          ) then
            v_omitidas := v_omitidas + 1;
          else
            insert into public.notificaciones_sistema (
              empresa_id, user_id, texto, tipo, titulo, mensaje,
              referencia_tipo, referencia_id, referencia_payload, prioridad, leida, created_at, creada_en
            ) values (
              v_emp.id, v_user, v_mensaje, v_tipo, v_titulo, v_mensaje,
              'personal_documento', v_doc_id, v_payload, v_prioridad, false, now(), now()
            );
            v_generadas := v_generadas + 1;
          end if;
        end loop;

        if not exists (
          select 1
          from public.usuarios_empresas ue
          join public.roles r on r.id = ue.rol_id
          where ue.empresa_id = v_emp.id
            and ue.estado = 'activo'
            and (
              coalesce(r.es_admin_empresa, false) = true
              or exists (
                select 1
                from public.permisos_roles pr
                where pr.rol_id = ue.rol_id
                  and pr.pantalla in ('rrhh_operativo', 'rrhh_admin')
                  and pr.puede_ver = true
              )
            )
        ) then
          v_detalle := concat_ws(' | ', v_detalle, 'Tenant sin destinatario admin/RRHH activo');
        end if;

        if v_alerta.auth_user_id is not null and exists (
          select 1
          from public.usuarios_empresas ue
          where ue.empresa_id = v_emp.id
            and ue.user_id = v_alerta.auth_user_id
            and ue.estado = 'activo'
        ) then
          v_mensaje := case
            when v_alerta.estado = 'vencido'
              then format('Tu %s vencio hace %s dias. Contacta a RRHH para regularizar tu situacion.',
                coalesce(v_alerta.tipo_doc_nombre, v_alerta.tipo_documento_id),
                abs(coalesce(v_alerta.dias_restantes, 0))
              )
            else format('Tu %s vence en %s dias. Coordina con RRHH para renovarlo a tiempo.',
                coalesce(v_alerta.tipo_doc_nombre, v_alerta.tipo_documento_id),
                coalesce(v_alerta.dias_restantes, 0)
              )
          end;

          if exists (
            select 1
            from public.notificaciones_sistema ns
            where ns.user_id = v_alerta.auth_user_id
              and ns.tipo = v_tipo
              and ns.referencia_tipo = 'personal_documento'
              and ns.referencia_id = v_doc_id
              and ns.leida = false
          ) then
            v_omitidas := v_omitidas + 1;
          else
            insert into public.notificaciones_sistema (
              empresa_id, user_id, texto, tipo, titulo, mensaje,
              referencia_tipo, referencia_id, referencia_payload, prioridad, leida, created_at, creada_en
            ) values (
              v_emp.id, v_alerta.auth_user_id, v_mensaje, v_tipo, v_titulo, v_mensaje,
              'personal_documento', v_doc_id, v_payload, v_prioridad, false, now(), now()
            );
            v_generadas := v_generadas + 1;
          end if;
        end if;
      end loop;

      insert into public.notificaciones_documentarias_log (empresa_id, estado, generadas, omitidas, detalle)
      values (v_emp.id, 'ok', v_generadas, v_omitidas, v_detalle);
    exception when others then
      v_detalle := sqlerrm;
      insert into public.notificaciones_documentarias_log (empresa_id, estado, generadas, omitidas, detalle)
      values (v_emp.id, 'error', v_generadas, v_omitidas, v_detalle);
    end;

    empresa_id := v_emp.id;
    generadas := v_generadas;
    omitidas := v_omitidas;
    detalle := v_detalle;
    return next;
  end loop;
end;
$function$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_namespace
    WHERE nspname = 'cron'
  ) THEN
    RAISE EXCEPTION 'pg_cron no está disponible; no se pudo registrar notificaciones-documentarias-diarias';
  END IF;

  PERFORM cron.schedule(
    'notificaciones-documentarias-diarias',
    '5 12 * * *',
    'select public.generar_notificaciones_documentarias();'
  );
END;
$do$;

