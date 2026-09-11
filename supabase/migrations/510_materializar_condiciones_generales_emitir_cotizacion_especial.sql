-- 510 · Materializa los segmentos publicados de Condiciones Generales al emitir
-- una Cotización Especial. El snapshot queda autosuficiente e inmutable.
-- Ejecutar con el rol propietario del esquema (SET ROLE postgres).
-- El COMMIT de producción queda bajo control manual.

create or replace function public.emitir_cotizacion_especial(p_id uuid)
returns table(
  id uuid,
  documento_generado_id uuid,
  numero text,
  estado text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_cotizacion public.cotizaciones_especiales%rowtype;
  v_plantilla public.plantillas_documento_bloques%rowtype;
  v_alcance uuid[];
  v_empresa_contexto jsonb;
  v_cuenta_contexto jsonb;
  v_contacto_contexto jsonb := '{}'::jsonb;
  v_oportunidad_contexto jsonb := '{}'::jsonb;
  v_contexto jsonb;
  v_bloques jsonb := '[]'::jsonb;
  v_bloque public.documento_bloques%rowtype;
  v_contenido_bloque jsonb;
  v_tipo_condiciones_id uuid;
  v_tipo_condiciones public.tipos_documento_electronico%rowtype;
  v_biblioteca_condiciones public.biblioteca_condiciones_generales%rowtype;
  v_segmentos_condiciones jsonb;
  v_contenido_plantilla jsonb;
  v_documento_id uuid := gen_random_uuid();
  v_emitida_at timestamptz := now();
begin
  if v_usuario_id is null then
    raise exception 'Debe iniciar sesión para emitir una Cotización Especial.'
      using errcode = '42501';
  end if;

  select cotizacion.* into v_cotizacion
  from public.cotizaciones_especiales cotizacion
  where cotizacion.id = p_id
  for update;

  if not found then
    raise exception 'La Cotización Especial no existe.' using errcode = 'P0002';
  end if;

  if v_cotizacion.estado <> 'borrador'
     or v_cotizacion.documento_generado_id is not null
     or v_cotizacion.contexto_emitido_json is not null then
    raise exception 'Sólo se puede emitir una Cotización Especial en borrador sin documento ni contexto emitido.'
      using errcode = '22023';
  end if;

  if not public.usuario_tiene_empresa(v_cotizacion.empresa_id)
     or not public.usuario_puede(v_cotizacion.empresa_id, 'cotizaciones', 'editar') then
    raise exception 'No tiene permiso para emitir cotizaciones en esta empresa.' using errcode = '42501';
  end if;

  v_alcance := public.usuario_alcance_sociedades(v_cotizacion.empresa_id);
  if v_alcance is not null
     and not coalesce(v_cotizacion.sociedad_id = any(v_alcance), false) then
    raise exception 'No tiene alcance sobre la sociedad de esta cotización.' using errcode = '42501';
  end if;

  -- Replica la restricción de visibilidad de responsable de la política SELECT de 491.
  if v_cotizacion.oportunidad_id is not null
     and not exists (
       select 1
       from public.oportunidades oportunidad
       where oportunidad.id = v_cotizacion.oportunidad_id
         and (
           oportunidad.responsable_id is null
           or public.usuario_puede_ver_registro(v_cotizacion.empresa_id, oportunidad.responsable_id)
         )
     ) then
    raise exception 'No tiene visibilidad sobre la oportunidad vinculada.' using errcode = '42501';
  end if;

  -- Defensa adicional al trigger: la plantilla debe seguir siendo la versión publicada
  -- del mismo tipo, empresa y sociedad al momento exacto de emitir.
  select plantilla.* into v_plantilla
  from public.plantillas_documento_bloques plantilla
  where plantilla.id = v_cotizacion.plantilla_documento_id;

  if not found
     or v_plantilla.estado <> 'publicada'
     or v_plantilla.empresa_id is distinct from v_cotizacion.empresa_id
     or v_plantilla.sociedad_id is distinct from v_cotizacion.sociedad_id
     or v_plantilla.tipo_documento_id is distinct from v_cotizacion.tipo_documento_id then
    raise exception 'La plantilla debe seguir publicada y pertenecer al mismo tipo, empresa y sociedad.'
      using errcode = '22023';
  end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'id', empresa.id,
    'razon_social', coalesce(configuracion.razon_social, empresa.razon_social),
    'nombre_comercial', empresa.nombre_comercial,
    'ruc', coalesce(configuracion.ruc, empresa.ruc),
    'email_comercial', configuracion.email_comercial,
    'direccion', configuracion.direccion,
    'firmante', configuracion.firmante,
    'moneda_base', empresa.moneda_base
  )) into v_empresa_contexto
  from public.empresas empresa
  left join public.empresa_config configuracion
    on configuracion.empresa_id = empresa.id
  where empresa.id = v_cotizacion.empresa_id;

  if v_empresa_contexto is null then
    raise exception 'La empresa de la Cotización Especial no existe.' using errcode = 'P0002';
  end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'id', cuenta.id,
    'razon_social', cuenta.razon_social,
    'nombre_comercial', cuenta.nombre_comercial,
    'ruc', cuenta.ruc,
    'direccion', cuenta.direccion,
    'moneda', cuenta.moneda
  )) into v_cuenta_contexto
  from public.cuentas cuenta
  where cuenta.id = v_cotizacion.cuenta_id
    and cuenta.empresa_id = v_cotizacion.empresa_id;

  if v_cuenta_contexto is null then
    raise exception 'La cuenta de la Cotización Especial no existe o no pertenece a la empresa.'
      using errcode = '22023';
  end if;

  if v_cotizacion.contacto_id is not null then
    select jsonb_strip_nulls(jsonb_build_object(
      'id', contacto.id,
      'nombre', contacto.nombre,
      'cargo', contacto.cargo,
      'email', contacto.email
    )) into v_contacto_contexto
    from public.contactos contacto
    where contacto.id = v_cotizacion.contacto_id
      and contacto.empresa_id = v_cotizacion.empresa_id
      and contacto.cuenta_id = v_cotizacion.cuenta_id;

    if v_contacto_contexto is null then
      raise exception 'El contacto de la Cotización Especial no existe o no pertenece a su cuenta y empresa.'
        using errcode = '22023';
    end if;
  end if;

  if v_cotizacion.oportunidad_id is not null then
    select jsonb_strip_nulls(jsonb_build_object(
      'id', oportunidad.id,
      'nombre', oportunidad.nombre,
      'servicio_interes', oportunidad.servicio_interes,
      'monto_estimado', oportunidad.monto_estimado,
      'moneda', oportunidad.moneda
    )) into v_oportunidad_contexto
    from public.oportunidades oportunidad
    where oportunidad.id = v_cotizacion.oportunidad_id
      and oportunidad.empresa_id = v_cotizacion.empresa_id;

    if v_oportunidad_contexto is null then
      raise exception 'La oportunidad de la Cotización Especial no existe o no pertenece a la empresa.'
        using errcode = '22023';
    end if;
  end if;

  v_contexto := jsonb_build_object(
    'empresa', v_empresa_contexto,
    'cliente', v_cuenta_contexto,
    'cuenta', v_cuenta_contexto,
    'contacto', v_contacto_contexto,
    'oportunidad', v_oportunidad_contexto,
    'cotizacion', jsonb_build_object(
      'id', v_cotizacion.id,
      'numero', v_cotizacion.numero,
      'fecha', v_emitida_at::date,
      'moneda', v_cotizacion.moneda,
      'items', v_cotizacion.items,
      'subtotal', v_cotizacion.subtotal,
      'igv_pct', v_cotizacion.igv_pct,
      'igv', v_cotizacion.igv,
      'total', v_cotizacion.total,
      'validez_tipo', v_cotizacion.validez_tipo,
      'validez_dias', v_cotizacion.validez_dias,
      'validez_fecha', v_cotizacion.validez_fecha,
      'hitos_activos', v_cotizacion.hitos_activos,
      'hitos_pago', v_cotizacion.hitos_pago
    ),
    'emision', jsonb_build_object(
      'fecha', v_emitida_at::date,
      'emitida_at', v_emitida_at,
      'emitida_by', v_usuario_id
    )
  );

  -- Congela cada bloque activo. Los bloques de Condiciones Generales incorporan
  -- los segmentos publicados vigentes para no depender de la biblioteca en vivo.
  for v_bloque in
    select bloque.*
    from public.documento_bloques bloque
    where bloque.plantilla_documento_id = v_plantilla.id
      and bloque.activo = true
    order by bloque.bloque_padre_id nulls first, bloque.orden, bloque.id
  loop
    v_contenido_bloque := v_bloque.contenido_json;

    if v_bloque.tipo_bloque = 'condiciones_generales' then
      begin
        v_tipo_condiciones_id := nullif(trim(v_bloque.contenido_json ->> 'condiciones_tipo_documento_id'), '')::uuid;
      exception
        when invalid_text_representation then
          raise exception 'El bloque de Condiciones Generales no tiene un Documento de Condiciones seleccionado.'
            using errcode = '22023';
      end;

      if v_tipo_condiciones_id is null then
        raise exception 'El bloque de Condiciones Generales no tiene un Documento de Condiciones seleccionado.'
          using errcode = '22023';
      end if;

      select tipo.* into v_tipo_condiciones
      from public.tipos_documento_electronico tipo
      where tipo.id = v_tipo_condiciones_id;

      if not found
         or v_tipo_condiciones.empresa_id is distinct from v_cotizacion.empresa_id
         or v_tipo_condiciones.sociedad_id is distinct from v_cotizacion.sociedad_id then
        raise exception 'El Documento de Condiciones seleccionado no pertenece a la misma empresa y sociedad de la Cotización Especial.'
          using errcode = '22023';
      end if;

      select biblioteca.* into v_biblioteca_condiciones
      from public.biblioteca_condiciones_generales biblioteca
      where biblioteca.empresa_id = v_cotizacion.empresa_id
        and biblioteca.sociedad_id is not distinct from v_cotizacion.sociedad_id
        and biblioteca.tipo_documento_id = v_tipo_condiciones_id
        and biblioteca.estado = 'publicada'
      order by biblioteca.version desc, biblioteca.publicada_at desc nulls last, biblioteca.id desc
      limit 1;

      if not found then
        raise exception 'El Documento de Condiciones seleccionado no tiene una versión publicada; publíquelo antes de emitir.'
          using errcode = '22023';
      end if;

      select coalesce(jsonb_agg(jsonb_build_object(
        'id', segmento.id,
        'titulo', segmento.titulo,
        'contenido_json', segmento.contenido_json,
        'contenido_texto_plano', segmento.contenido_texto_plano,
        'orden', segmento.orden
      ) order by segmento.orden), '[]'::jsonb)
      into v_segmentos_condiciones
      from public.condiciones_generales_segmentos segmento
      where segmento.condiciones_generales_id = v_biblioteca_condiciones.id
        and segmento.activo = true;

      if jsonb_array_length(v_segmentos_condiciones) = 0 then
        raise exception 'El Documento de Condiciones seleccionado no tiene segmentos activos.'
          using errcode = '22023';
      end if;

      v_contenido_bloque := coalesce(v_bloque.contenido_json, '{}'::jsonb) || jsonb_build_object(
        'condiciones_tipo_documento_id', v_tipo_condiciones_id,
        'biblioteca_resuelta', jsonb_strip_nulls(jsonb_build_object(
          'id', v_biblioteca_condiciones.id,
          'tipo_documento_id', v_biblioteca_condiciones.tipo_documento_id,
          'nombre', v_biblioteca_condiciones.nombre_interno,
          'version', v_biblioteca_condiciones.version,
          'publicada_at', v_biblioteca_condiciones.publicada_at
        )),
        'segmentos', v_segmentos_condiciones
      );
    end if;

    v_bloques := v_bloques || jsonb_build_array(jsonb_build_object(
      'id', v_bloque.id,
      'bloque_padre_id', v_bloque.bloque_padre_id,
      'tipo_bloque', v_bloque.tipo_bloque,
      'titulo', v_bloque.titulo,
      'contenido_json', v_contenido_bloque,
      'contenido_texto_plano', v_bloque.contenido_texto_plano,
      'orden', v_bloque.orden,
      'activo', v_bloque.activo
    ));
  end loop;

  v_contenido_plantilla := jsonb_build_object(
    'plantilla', jsonb_strip_nulls(jsonb_build_object(
      'id', v_plantilla.id,
      'nombre_interno', v_plantilla.nombre_interno,
      'version', v_plantilla.version,
      'estado', v_plantilla.estado,
      'vigente_desde', v_plantilla.vigente_desde,
      'vigente_hasta', v_plantilla.vigente_hasta,
      'encabezado_json', v_plantilla.encabezado_json,
      'encabezado_texto_plano', v_plantilla.encabezado_texto_plano,
      'encabezado_alcance', v_plantilla.encabezado_alcance,
      'pie_json', v_plantilla.pie_json,
      'pie_texto_plano', v_plantilla.pie_texto_plano,
      'pie_alcance', v_plantilla.pie_alcance
    )),
    'bloques', v_bloques
  );

  -- El trigger de 496 exige que el documento exista en borrador al vincularlo.
  insert into public.documentos_generados (
    id,
    empresa_id,
    sociedad_id,
    tipo_documento_id,
    condiciones_generales_version_id,
    entidad_tipo,
    entidad_id,
    contexto_json,
    contenido_resuelto_json,
    estado,
    created_by
  ) values (
    v_documento_id,
    v_cotizacion.empresa_id,
    v_cotizacion.sociedad_id,
    v_cotizacion.tipo_documento_id,
    null,
    'cotizacion_especial',
    v_cotizacion.id::text,
    v_contexto,
    v_contenido_plantilla,
    'borrador',
    v_usuario_id
  );

  update public.cotizaciones_especiales cotizacion
  set documento_generado_id = v_documento_id,
      contexto_emitido_json = v_contexto,
      estado = 'emitido',
      emitida_at = v_emitida_at,
      emitida_by = v_usuario_id,
      updated_at = v_emitida_at
  where cotizacion.id = v_cotizacion.id;

  update public.documentos_generados documento
  set estado = 'emitido'
  where documento.id = v_documento_id;

  id := v_cotizacion.id;
  documento_generado_id := v_documento_id;
  numero := v_cotizacion.numero;
  estado := 'emitido';
  return next;
end;
$$;

revoke all on function public.emitir_cotizacion_especial(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.emitir_cotizacion_especial(uuid)
  to authenticated;

select pg_notify('pgrst', 'reload schema');
