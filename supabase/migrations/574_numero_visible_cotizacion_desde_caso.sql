-- Deriva el numero visible de las cotizaciones nuevas desde numero_caso.
-- Los casos sin numero_caso conservan el generador anterior como respaldo.

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(
    'public._crear_cotizacion_especial_impl_544(uuid,uuid,text,text,text,text,text,jsonb,text,text,integer,date,boolean,jsonb,text,text)'::regprocedure
  ) into v_def;

  if position('lpad(v_numero_caso::text, 5, ''0'')' in v_def) > 0 then
    return;
  end if;

  if position('  v_numero := public.siguiente_numero_cotizacion(v_tipo.empresa_id);' in v_def) = 0
     or position('  v_numero_caso := public.abrir_o_heredar_numero_caso(' in v_def) = 0 then
    raise exception 'No se pudo localizar el cuerpo esperado de _crear_cotizacion_especial_impl_544';
  end if;

  v_def := replace(
    v_def,
    E'  v_numero := public.siguiente_numero_cotizacion(v_tipo.empresa_id);\n  v_numero_caso := public.abrir_o_heredar_numero_caso(v_tipo.empresa_id, p_recepcion_id, ''recepciones_activos_cliente'', p_cuenta_id);',
    E'  v_numero_caso := public.abrir_o_heredar_numero_caso(v_tipo.empresa_id, p_recepcion_id, ''recepciones_activos_cliente'', p_cuenta_id);\n  if v_numero_caso is not null then\n    v_numero := ''COT-'' || to_char(current_date, ''YYYY'') || ''-'' || lpad(v_numero_caso::text, 5, ''0'');\n  else\n    v_numero := public.siguiente_numero_cotizacion(v_tipo.empresa_id);\n  end if;'
  );

  execute v_def;
end;
$$;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(
    'public._aprobar_hoja_costeo_y_crear_cotizacion_impl_414(text,text,text,text,text,text)'::regprocedure
  ) into v_def;

  if position('lpad(v_numero_caso::text, 5, ''0'')' in v_def) > 0 then
    return;
  end if;

  if position('  v_numero_caso integer;' in v_def) = 0
     or position('  v_numero_caso := public.abrir_o_heredar_numero_caso(' in v_def) = 0
     or position('    v_numero_caso, p_numero, 1,' in v_def) = 0 then
    raise exception 'No se pudo localizar el cuerpo esperado de _aprobar_hoja_costeo_y_crear_cotizacion_impl_414';
  end if;

  v_def := replace(v_def,
    '  v_numero_caso integer;',
    E'  v_numero_caso integer;\n  v_numero text;');
  v_def := replace(v_def,
    E'  v_numero_caso := public.abrir_o_heredar_numero_caso(p_empresa_id, v_hc.recepcion_id, ''recepciones_activos_cliente'', v_hc.cuenta_id);\n\n  insert into public.cotizaciones (',
    E'  v_numero_caso := public.abrir_o_heredar_numero_caso(p_empresa_id, v_hc.recepcion_id, ''recepciones_activos_cliente'', v_hc.cuenta_id);\n  if v_numero_caso is not null then\n    v_numero := ''COT-'' || to_char(current_date, ''YYYY'') || ''-'' || lpad(v_numero_caso::text, 5, ''0'');\n  else\n    v_numero := public.siguiente_numero_cotizacion(p_empresa_id);\n  end if;\n\n  insert into public.cotizaciones (');
  v_def := replace(v_def,
    '    v_numero_caso, p_numero, 1,',
    '    v_numero_caso, v_numero, 1,');

  execute v_def;
end;
$$;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(
    'public._aprobar_hoja_costeo_y_crear_cotizacion_sociedad_impl_544(text,uuid,text,text,text,text,text)'::regprocedure
  ) into v_def;

  if position('lpad(v_numero_caso::text, 5, ''0'')' in v_def) > 0 then
    return;
  end if;

  if position('  v_numero_caso integer;' in v_def) = 0
     or position('  v_numero_caso := public.abrir_o_heredar_numero_caso(' in v_def) = 0
     or position('v_hc.cuenta_id, v_owner_user_id, v_numero_caso, p_numero, 1,' in v_def) = 0 then
    raise exception 'No se pudo localizar el cuerpo esperado de _aprobar_hoja_costeo_y_crear_cotizacion_sociedad_impl_544';
  end if;

  v_def := replace(v_def,
    '  v_numero_caso integer;',
    E'  v_numero_caso integer;\n  v_numero text;');
  v_def := replace(v_def,
    E'  v_numero_caso := public.abrir_o_heredar_numero_caso(p_empresa_id, v_hc.recepcion_id, ''recepciones_activos_cliente'', v_hc.cuenta_id);\n\n  insert into public.cotizaciones (',
    E'  v_numero_caso := public.abrir_o_heredar_numero_caso(p_empresa_id, v_hc.recepcion_id, ''recepciones_activos_cliente'', v_hc.cuenta_id);\n  if v_numero_caso is not null then\n    v_numero := ''COT-'' || to_char(current_date, ''YYYY'') || ''-'' || lpad(v_numero_caso::text, 5, ''0'');\n  else\n    v_numero := public.siguiente_numero_cotizacion(p_empresa_id);\n  end if;\n\n  insert into public.cotizaciones (');
  v_def := replace(v_def,
    'v_hc.cuenta_id, v_owner_user_id, v_numero_caso, p_numero, 1,',
    'v_hc.cuenta_id, v_owner_user_id, v_numero_caso, v_numero, 1,');

  execute v_def;
end;
$$;
