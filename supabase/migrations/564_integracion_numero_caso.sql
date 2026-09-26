-- Integración hacia adelante de numero_caso.
-- No modifica el formato ni el valor de numero visible.

alter table public.ordenes_trabajo
  add column if not exists secuencia_caso integer;
comment on column public.ordenes_trabajo.secuencia_caso is
  'Posición de la OT dentro del caso de servicio; se persiste para la futura composición del número visible.';
-- La creación de Cotizaciones Especiales inserta en una implementación interna
-- versionada. Se conserva el wrapper público y se modifica solo el INSERT real.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(
    'public._crear_cotizacion_especial_impl_544(uuid,uuid,text,text,text,text,text,jsonb,text,text,integer,date,boolean,jsonb,text,text)'::regprocedure
  ) into v_def;

  if position('numero_caso' in v_def) > 0 then
    return;
  end if;

  if position('  v_hitos jsonb;' in v_def) = 0
     or position('  v_numero := public.siguiente_numero_cotizacion(v_tipo.empresa_id);' in v_def) = 0
     or position('recepcion_id, origen_items, numero, moneda, items, subtotal, igv_pct,' in v_def) = 0
     or position('case when p_origen_items = ''hoja_costeo'' then ''manual'' else p_origen_items end,' in v_def) = 0 then
    raise exception 'No se pudo localizar el cuerpo esperado de _crear_cotizacion_especial_impl_544';
  end if;

  v_def := replace(v_def,
    '  v_hitos jsonb;',
    E'  v_hitos jsonb;\n  v_numero_caso integer;');
  v_def := replace(v_def,
    '  v_numero := public.siguiente_numero_cotizacion(v_tipo.empresa_id);',
    E'  v_numero := public.siguiente_numero_cotizacion(v_tipo.empresa_id);\n  v_numero_caso := public.abrir_o_heredar_numero_caso(v_tipo.empresa_id, p_recepcion_id, ''recepciones_activos_cliente'', p_cuenta_id);');
  v_def := replace(v_def,
    'recepcion_id, origen_items, numero, moneda, items, subtotal, igv_pct,',
    'recepcion_id, origen_items, numero_caso, numero, moneda, items, subtotal, igv_pct,');
  v_def := replace(v_def,
    E'case when p_origen_items = ''hoja_costeo'' then ''manual'' else p_origen_items end,\n    v_numero, v_moneda,',
    E'case when p_origen_items = ''hoja_costeo'' then ''manual'' else p_origen_items end,\n    v_numero_caso, v_numero, v_moneda,');

  execute v_def;
end;
$$;
-- El flujo de Hoja de Costeo tiene dos implementaciones de INSERT según
-- multisociedad. Ambas reciben recepcion_id desde hojas_costeo cuando existe.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(
    'public._aprobar_hoja_costeo_y_crear_cotizacion_impl_414(text,text,text,text,text,text)'::regprocedure
  ) into v_def;

  if position('numero_caso' in v_def) = 0 then
    if position('  v_divisor numeric;' in v_def) = 0
       or position('insert into public.cotizaciones (' in v_def) = 0
       or position('id, empresa_id, oportunidad_id, cuenta_id, numero, version, estado, fecha,' in v_def) = 0 then
      raise exception 'No se pudo localizar el cuerpo esperado de _aprobar_hoja_costeo_y_crear_cotizacion_impl_414';
    end if;

    v_def := replace(v_def,
      '  v_divisor numeric;',
      E'  v_divisor numeric;\n  v_numero_caso integer;');
    v_def := replace(v_def,
      '  insert into public.cotizaciones (',
      E'  v_numero_caso := public.abrir_o_heredar_numero_caso(p_empresa_id, v_hc.recepcion_id, ''recepciones_activos_cliente'', v_hc.cuenta_id);\n\n  insert into public.cotizaciones (');
    v_def := replace(v_def,
      'id, empresa_id, oportunidad_id, cuenta_id, numero, version, estado, fecha,',
      'id, empresa_id, oportunidad_id, cuenta_id, numero_caso, numero, version, estado, fecha,');
    v_def := replace(v_def,
      E'p_cotizacion_id, p_empresa_id, v_hc.oportunidad_id, v_hc.cuenta_id,\n    p_numero, 1,',
      E'p_cotizacion_id, p_empresa_id, v_hc.oportunidad_id, v_hc.cuenta_id,\n    v_numero_caso, p_numero, 1,');

    execute v_def;
  end if;
end;
$$;
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(
    'public._aprobar_hoja_costeo_y_crear_cotizacion_sociedad_impl_544(text,uuid,text,text,text,text,text)'::regprocedure
  ) into v_def;

  if position('numero_caso' in v_def) = 0 then
    if position('  v_owner_user_id uuid;' in v_def) = 0
       or position('insert into public.cotizaciones (' in v_def) = 0
       or position(E'responsable_id,\n    numero, version, estado, fecha, items, subtotal, descuento_global_pct,' in v_def) = 0 then
      raise exception 'No se pudo localizar el cuerpo esperado de _aprobar_hoja_costeo_y_crear_cotizacion_sociedad_impl_544';
    end if;

    v_def := replace(v_def,
      '  v_owner_user_id uuid;',
      E'  v_owner_user_id uuid;\n  v_numero_caso integer;');
    v_def := replace(v_def,
      '  insert into public.cotizaciones (',
      E'  v_numero_caso := public.abrir_o_heredar_numero_caso(p_empresa_id, v_hc.recepcion_id, ''recepciones_activos_cliente'', v_hc.cuenta_id);\n\n  insert into public.cotizaciones (');
    v_def := replace(v_def,
      E'responsable_id,\n    numero, version, estado, fecha, items, subtotal, descuento_global_pct,',
      E'responsable_id, numero_caso,\n    numero, version, estado, fecha, items, subtotal, descuento_global_pct,');
    v_def := replace(v_def,
      'v_hc.cuenta_id, v_owner_user_id, p_numero, 1,',
      'v_hc.cuenta_id, v_owner_user_id, v_numero_caso, p_numero, 1,');

    execute v_def;
  end if;
end;
$$;
-- El RPC conserva p_numero como número visible y persiste el caso/sufijo
-- calculados dentro de la misma transacción que el INSERT de la OT.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(
    'public.crear_ot_desde_os_cliente(text,text,text,text,text,text,text,date,text,text,numeric,text,text)'::regprocedure
  ) into v_def;

  if position('secuencia_caso' in v_def) > 0 then
    return;
  end if;

  if position('  v_cebe_id text;' in v_def) = 0
     or position('insert into public.ordenes_trabajo (' in v_def) = 0
     or position('id, empresa_id, os_cliente_id, numero, cuenta_id, servicio, descripcion,' in v_def) = 0
     or position('p_ot_id, p_empresa_id, p_os_cliente_id, p_numero, v_os.cuenta_id,' in v_def) = 0 then
    raise exception 'No se pudo localizar el cuerpo esperado de crear_ot_desde_os_cliente';
  end if;

  v_def := replace(v_def,
    '  v_cebe_id text;',
    E'  v_cebe_id text;\n  v_numero_caso integer;\n  v_secuencia_caso integer;');
  v_def := replace(v_def,
    E'  insert into public.ordenes_trabajo (',
    E'  v_numero_caso := public.abrir_o_heredar_numero_caso(p_empresa_id, p_os_cliente_id, ''os_clientes'', v_os.cuenta_id);\n  if v_numero_caso is not null then\n    v_secuencia_caso := public.secuencia_ot_en_caso(p_empresa_id, v_numero_caso);\n  end if;\n\n  insert into public.ordenes_trabajo (');
  v_def := replace(v_def,
    'id, empresa_id, os_cliente_id, numero, cuenta_id, servicio, descripcion,',
    'id, empresa_id, os_cliente_id, numero, numero_caso, secuencia_caso, cuenta_id, servicio, descripcion,');
  v_def := replace(v_def,
    'p_ot_id, p_empresa_id, p_os_cliente_id, p_numero, v_os.cuenta_id,',
    'p_ot_id, p_empresa_id, p_os_cliente_id, p_numero, v_numero_caso, v_secuencia_caso, v_os.cuenta_id,');

  execute v_def;
end;
$$;
