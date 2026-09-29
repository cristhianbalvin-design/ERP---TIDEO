-- Deriva el numero visible de OT desde numero_caso y secuencia_caso.
-- Las OT sin caso conservan el numero recibido por el camino anterior.

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(
    'public.crear_ot_desde_os_cliente(text,text,text,text,text,text,text,date,text,text,numeric,text,text)'::regprocedure
  ) into v_def;

  if position('  p_numero := ''OT-'' || v_numero_caso::text || ''-'' || v_secuencia_caso::text;' in v_def) > 0 then
    return;
  end if;

  if position('  v_numero_caso integer;' in v_def) = 0
     or position('  v_secuencia_caso integer;' in v_def) = 0
     or position('  v_numero_caso := public.abrir_o_heredar_numero_caso(' in v_def) = 0
     or position('    p_ot_id, p_empresa_id, p_os_cliente_id, p_numero, v_numero_caso, v_secuencia_caso,' in v_def) = 0 then
    raise exception 'No se pudo localizar el cuerpo esperado de crear_ot_desde_os_cliente';
  end if;

  v_def := replace(v_def,
    E'  if v_numero_caso is not null then\n    v_secuencia_caso := public.secuencia_ot_en_caso(p_empresa_id, v_numero_caso);\n  end if;\n\n  insert into public.ordenes_trabajo (',
    E'  if v_numero_caso is not null then\n    v_secuencia_caso := public.secuencia_ot_en_caso(p_empresa_id, v_numero_caso);\n  end if;\n\n  if v_numero_caso is not null then\n    p_numero := ''OT-'' || v_numero_caso::text || ''-'' || v_secuencia_caso::text;\n  end if;\n\n  insert into public.ordenes_trabajo (');

  execute v_def;
end;
$$;
