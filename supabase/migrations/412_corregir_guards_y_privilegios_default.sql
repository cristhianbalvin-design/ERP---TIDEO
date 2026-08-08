-- SEG-2c: corrige guards invertidos y cierra la ejecución anónima por defecto.
--
-- Las funciones existentes conservan sus ACL. Las seis RPC públicas no se
-- modifican. Los ALTER DEFAULT PRIVILEGES solo afectan funciones futuras.

CREATE OR REPLACE FUNCTION public.eliminar_asignacion_jornada(p_id text, p_forzar_override boolean DEFAULT false, p_motivo_override text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_row record;
  v_prev_id text;
  v_conflictos text;
  v_nombre text;
BEGIN
  -- 1. Obtener el tramo a eliminar
  SELECT * INTO v_row
  FROM public.personal_asignaciones_jornada
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asignación de jornada no encontrada.';
  END IF;

  -- 2. Permisos (requiere sesión y acceso de edición a asistencia)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesión autenticada para eliminar asignaciones de jornada.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.usuario_tiene_empresa(v_row.empresa_id)
     OR NOT public.usuario_puede(v_row.empresa_id, 'asistencia', 'editar') THEN
    RAISE EXCEPTION 'Acceso denegado para eliminar asignación de jornada.'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Solo permitir eliminar el último tramo cronológico (bloquear tramos intermedios)
  IF EXISTS (
    SELECT 1 FROM public.personal_asignaciones_jornada
    WHERE empresa_id = v_row.empresa_id
      AND personal_id = v_row.personal_id
      AND personal_tipo = v_row.personal_tipo
      AND fecha_inicio > v_row.fecha_inicio
  ) THEN
    RAISE EXCEPTION 'Solo se permite eliminar el último tramo cronológico del historial. No se pueden eliminar tramos intermedios.';
  END IF;

  -- 4. Buscar el tramo inmediatamente anterior para reabrirlo
  SELECT id INTO v_prev_id
  FROM public.personal_asignaciones_jornada
  WHERE empresa_id = v_row.empresa_id
    AND personal_id = v_row.personal_id
    AND personal_tipo = v_row.personal_tipo
    AND id <> p_id
  ORDER BY fecha_inicio DESC
  LIMIT 1;

  -- 5. Chequeo de Retro Wall EXPRESO para el tramo que estamos borrando
  SELECT string_agg(pn.periodo, ', ' ORDER BY pn.anio, pn.mes, pn.quincena)
  INTO v_conflictos
  FROM public.periodos_nomina pn
  WHERE pn.empresa_id = v_row.empresa_id
    AND EXISTS (
      SELECT 1 FROM public.nomina_detalle nd
      WHERE nd.periodo_id = pn.id::text
        AND nd.trabajador_id = v_row.personal_id
        AND nd.trabajador_tipo = v_row.personal_tipo
    )
    AND (CASE WHEN pn.quincena = 2 THEN make_date(pn.anio, pn.mes, 16)
              ELSE make_date(pn.anio, pn.mes, 1) END) <= COALESCE(v_row.fecha_fin, 'infinity'::date)
    AND COALESCE(pn.fecha_corte, (make_date(pn.anio, pn.mes, 1) + interval '1 month - 1 day')::date)
        >= v_row.fecha_inicio;

  IF v_conflictos IS NOT NULL THEN
    IF NOT p_forzar_override THEN
      IF v_row.personal_tipo = 'operativo' THEN
        SELECT nombre INTO v_nombre FROM public.personal_operativo WHERE id = v_row.personal_id;
      ELSE
        SELECT nombre INTO v_nombre FROM public.personal_administrativo WHERE id = v_row.personal_id;
      END IF;
      RAISE EXCEPTION 'RETRO_WALL: no se puede eliminar la asignación de jornada de % porque se cruza con nómina ya procesada en el/los periodo(s): %. Requiere autorización para forzar el cambio.',
        v_nombre, v_conflictos;
    ELSE
      IF p_motivo_override IS NULL OR trim(p_motivo_override) = '' THEN
        RAISE EXCEPTION 'Debe proporcionar un motivo para forzar la eliminación retroactiva.';
      END IF;
      -- Registrar en el log de auditoría
      INSERT INTO public.auditoria_cambios_nomina (
        empresa_id,
        trabajador_id,
        trabajador_tipo,
        accion,
        descripcion,
        motivo,
        usuario_id
      ) VALUES (
        v_row.empresa_id,
        v_row.personal_id,
        v_row.personal_tipo,
        'eliminar_asignacion_jornada_retroactiva',
        'Se forzó la eliminación del tramo (Inicio: ' || v_row.fecha_inicio::text || ', Fin: ' || COALESCE(v_row.fecha_fin::text, 'Vigente') || ', Régimen: ' || v_row.regimen_jornada || ') cruzando periodos: ' || v_conflictos,
        p_motivo_override,
        auth.uid()
      );
    END IF;
  END IF;

  -- 6. Eliminar el tramo actual
  DELETE FROM public.personal_asignaciones_jornada
  WHERE id = p_id;

  -- 7. Reabrir el tramo anterior (si lo hay)
  IF v_prev_id IS NOT NULL THEN
    UPDATE public.personal_asignaciones_jornada
    SET fecha_fin = NULL
    WHERE id = v_prev_id;
  END IF;

END;
$function$;

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
          select id, 'operativo'::text as personal_tipo, nombre, cargo, auth_user_id
          from public.personal_operativo
          where empresa_id = v_emp.id and estado <> 'inactivo'

          union all

          select id, 'administrativo'::text as personal_tipo, nombre, cargo, auth_user_id
          from public.personal_administrativo
          where empresa_id = v_emp.id
        ),
        doc_activo as (
          select distinct on (personal_id, tipo_documento_id)
            id,
            personal_id,
            tipo_documento_id
          from public.personal_documentos
          where empresa_id = v_emp.id
            and activo = true
            and tipo_documento_id is not null
          order by personal_id, tipo_documento_id, version desc
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
            and coalesce(r.es_admin_empresa, false) = true
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
              and ns.created_at >= now() - interval '20 hours'
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
            and coalesce(r.es_admin_empresa, false) = true
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
              and ns.created_at >= now() - interval '20 hours'
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

CREATE OR REPLACE FUNCTION public.generar_notificaciones_oc_vencidas(p_empresa_id text DEFAULT NULL::text)
 RETURNS TABLE(empresa_id text, generadas integer, omitidas integer, detalle text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rol_ejecucion text;
  v_emp record;
  v_oc record;
  v_generadas integer;
  v_omitidas integer;
  v_detalle text;
  v_mensaje text;
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
      for v_oc in
        select
          oc.id,
          oc.codigo,
          oc.empresa_id,
          oc.proveedor_id,
          oc.descripcion,
          oc.estado,
          oc.fecha_emision,
          oc.fecha_entrega_esperada,
          oc.creado_por,
          p.razon_social as proveedor_nombre
        from public.ordenes_compra oc
        left join public.proveedores p on p.id = oc.proveedor_id
        where oc.empresa_id = v_emp.id
          and oc.fecha_entrega_esperada is not null
          and oc.fecha_entrega_esperada::date < current_date
          and lower(coalesce(oc.estado, '')) not in ('cerrada', 'anulada', 'recibida')
      loop
        if v_oc.creado_por is null then
          v_omitidas := v_omitidas + 1;
          v_detalle := concat_ws(' | ', v_detalle, format('OC %s sin creado_por', coalesce(v_oc.codigo, v_oc.id)));
          continue;
        end if;

        v_mensaje := format(
          '%s vencio el %s y aun no registra recepcion.%s',
          coalesce(v_oc.codigo, v_oc.id),
          to_char(v_oc.fecha_entrega_esperada::date, 'YYYY-MM-DD'),
          case when v_oc.proveedor_nombre is not null then format(' Proveedor: %s.', v_oc.proveedor_nombre) else '' end
        );

        if exists (
          select 1
          from public.notificaciones_sistema ns
          where ns.user_id = v_oc.creado_por
            and ns.tipo = 'oc_vencida'
            and ns.referencia_tipo = 'orden_compra'
            and ns.referencia_id = v_oc.id
            and ns.created_at >= now() - interval '24 hours'
        ) then
          v_omitidas := v_omitidas + 1;
        else
          insert into public.notificaciones_sistema (
            empresa_id, user_id, texto, tipo, titulo, mensaje,
            referencia_tipo, referencia_id, referencia_payload, prioridad, leida, created_at, creada_en
          ) values (
            v_emp.id,
            v_oc.creado_por,
            v_mensaje,
            'oc_vencida',
            'OC vencida sin recepción',
            v_mensaje,
            'orden_compra',
            v_oc.id,
            jsonb_build_object(
              'orden_compra_id', v_oc.id,
              'codigo', v_oc.codigo,
              'proveedor_id', v_oc.proveedor_id,
              'proveedor_nombre', v_oc.proveedor_nombre,
              'estado', v_oc.estado,
              'fecha_emision', v_oc.fecha_emision,
              'fecha_entrega_esperada', v_oc.fecha_entrega_esperada
            ),
            'alta',
            false,
            now(),
            now()
          );
          v_generadas := v_generadas + 1;
        end if;
      end loop;

      insert into public.notificaciones_documentarias_log (empresa_id, estado, generadas, omitidas, detalle)
      values (v_emp.id, 'ok', v_generadas, v_omitidas, concat_ws(' | ', 'oc_vencida', v_detalle));
    exception when others then
      v_detalle := sqlerrm;
      insert into public.notificaciones_documentarias_log (empresa_id, estado, generadas, omitidas, detalle)
      values (v_emp.id, 'error', v_generadas, v_omitidas, concat_ws(' | ', 'oc_vencida', v_detalle));
    end;

    empresa_id := v_emp.id;
    generadas := v_generadas;
    omitidas := v_omitidas;
    detalle := v_detalle;
    return next;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.generar_notificaciones_documentarias(p_empresa_id text DEFAULT NULL::text)
 RETURNS TABLE(empresa_id text, generadas integer, omitidas integer, detalle text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rol_ejecucion text;
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

  begin
    return query
    select *
    from public.generar_notificaciones_documentarias_base_213(p_empresa_id);
  end;

  begin
    return query
    select *
    from public.generar_notificaciones_oc_vencidas(p_empresa_id);
  end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.generar_solpes_reorden(p_empresa_id text DEFAULT NULL::text)
 RETURNS TABLE(empresa_id text, generadas integer, omitidas integer, detalle text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rol_ejecucion text;
  v_emp record;
  v_mat record;
  v_solpe_id text;
  v_codigo text;
  v_cantidad numeric;
  v_destinatario uuid;
  v_mensaje text;
  v_generadas integer;
  v_omitidas integer;
  v_detalle text;
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
      for v_mat in
        with stock_material as (
          select
            s.empresa_id,
            s.material_id,
            sum(coalesce(s.disponible, 0)) as disponible
          from public.stock s
          where s.empresa_id = v_emp.id
          group by s.empresa_id, s.material_id
        )
        select
          m.id,
          m.codigo,
          m.descripcion,
          m.empresa_id,
          m.punto_reorden,
          coalesce(m.stock_seguridad, 0) as stock_seguridad,
          m.stock_maximo,
          m.unidad,
          m.creado_por,
          coalesce(sm.disponible, 0) as disponible,
          coalesce(m.punto_reorden, 0) + coalesce(m.stock_seguridad, 0) as punto_reorden_efectivo
        from public.materiales m
        left join stock_material sm on sm.material_id = m.id and sm.empresa_id = m.empresa_id
        where m.empresa_id = v_emp.id
          and m.punto_reorden is not null
          and m.punto_reorden > 0
          and coalesce(sm.disponible, 0) <= (coalesce(m.punto_reorden, 0) + coalesce(m.stock_seguridad, 0))
      loop
        if exists (
          select 1
          from public.solpe_interna si
          where si.empresa_id = v_emp.id
            and si.material_id = v_mat.id
            and si.estado in ('borrador', 'solicitada', 'aprobada')
        ) then
          v_omitidas := v_omitidas + 1;
          continue;
        end if;

        v_cantidad := case
          when v_mat.stock_maximo is not null and v_mat.stock_maximo > 0
            then greatest(v_mat.stock_maximo - v_mat.disponible, 0)
          else greatest(v_mat.punto_reorden * 2, 0)
        end;

        v_solpe_id := 'slp_auto_' || replace(gen_random_uuid()::text, '-', '');
        v_codigo := 'SLP-AUTO-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

        insert into public.solpe_interna (
          id, empresa_id, codigo, descripcion, tipo, prioridad, urgencia, estado,
          origen, material_id, cantidad_solicitada, disponible_actual, punto_reorden_efectivo,
          fecha, items, creado_por
        ) values (
          v_solpe_id,
          v_emp.id,
          v_codigo,
          'Reorden automático: ' || coalesce(v_mat.descripcion, v_mat.codigo, v_mat.id),
          'bien',
          'normal',
          'normal',
          'solicitada',
          'automatico',
          v_mat.id,
          v_cantidad,
          v_mat.disponible,
          v_mat.punto_reorden_efectivo,
          current_date,
          jsonb_build_array(jsonb_build_object(
            'material_id', v_mat.id,
            'codigo', v_mat.codigo,
            'nombre', v_mat.descripcion,
            'cantidad', v_cantidad,
            'unidad', v_mat.unidad,
            'punto_reorden', v_mat.punto_reorden,
            'stock_seguridad', v_mat.stock_seguridad,
            'disponible', v_mat.disponible
          )),
          v_mat.creado_por
        );

        v_destinatario := public.responsable_solpe_reorden(v_emp.id, v_mat.creado_por);
        if v_destinatario is not null then
          v_mensaje := format(
            'Se generó una SOLPE para %s (stock actual: %s, punto de reorden: %s)',
            coalesce(v_mat.descripcion, v_mat.codigo, v_mat.id),
            trim(to_char(v_mat.disponible, 'FM999999990.##')),
            trim(to_char(v_mat.punto_reorden_efectivo, 'FM999999990.##'))
          );

          insert into public.notificaciones_sistema (
            empresa_id, user_id, texto, tipo, titulo, mensaje,
            referencia_tipo, referencia_id, referencia_payload, prioridad, leida, created_at, creada_en
          ) values (
            v_emp.id,
            v_destinatario,
            v_mensaje,
            'solpe_reorden',
            'Reorden automático generado',
            v_mensaje,
            'solpe_interna',
            v_solpe_id,
            jsonb_build_object(
              'material_id', v_mat.id,
              'codigo_material', v_mat.codigo,
              'disponible', v_mat.disponible,
              'punto_reorden', v_mat.punto_reorden,
              'stock_seguridad', v_mat.stock_seguridad,
              'punto_reorden_efectivo', v_mat.punto_reorden_efectivo,
              'cantidad_solicitada', v_cantidad
            ),
            'media',
            false,
            now(),
            now()
          );
        end if;

        v_generadas := v_generadas + 1;
      end loop;
    exception when others then
      v_detalle := sqlerrm;
    end;

    empresa_id := v_emp.id;
    generadas := v_generadas;
    omitidas := v_omitidas;
    detalle := v_detalle;
    return next;
  end loop;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Privilegios por defecto para funciones futuras creadas por postgres.
-- ---------------------------------------------------------------------------

-- PostgreSQL suma los defaults por esquema al default global: un REVOKE
-- limitado a public no puede neutralizar el EXECUTE global de PUBLIC.
alter default privileges for role postgres
revoke execute on functions from public;

alter default privileges for role postgres in schema public
revoke execute on functions from anon;

alter default privileges for role postgres in schema public
grant execute on functions to authenticated, service_role;
