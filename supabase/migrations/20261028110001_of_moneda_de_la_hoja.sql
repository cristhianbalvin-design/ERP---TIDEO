-- F2 · Corrección: la OF que copia la hoja toma la moneda de la hoja (el costo estimado viene de la hoja).
-- La vista previa informa esa moneda y no repite el componente cuando código y nombre son iguales.
-- Ambas funciones parten de pg_get_functiondef de la versión vigente; cada reemplazo debe aplicar exactamente una vez.

set lock_timeout = '10s';

do $$
declare d text; n int;
begin
  -- crear_of_desde_os: moneda de la hoja cuando se copia
  d := pg_get_functiondef('public.crear_of_desde_os(text,boolean)'::regprocedure);
  if position('moneda_hoja' in d) = 0 then
    n := (length(d) - length(replace(d, 'v_os.activo_id, v_os.nombre, v_os.fecha_fin, v_os.moneda)', ''))) / length('v_os.activo_id, v_os.nombre, v_os.fecha_fin, v_os.moneda)');
    if n <> 1 then raise exception 'crear_of_desde_os: patrón de moneda encontrado % veces', n; end if;
    d := replace(d, 'v_os.activo_id, v_os.nombre, v_os.fecha_fin, v_os.moneda)',
      'v_os.activo_id, v_os.nombre, v_os.fecha_fin, coalesce(case when p_copiar_hoja then (select hm.moneda from public.hojas_costeo hm where hm.id = v_hoja) end /* moneda_hoja */, v_os.moneda))');
    execute d;
  end if;

  -- vista_previa_of_desde_os: moneda de la hoja y componente sin duplicar
  d := pg_get_functiondef('public.vista_previa_of_desde_os(text)'::regprocedure);
  if position('moneda_hoja' in d) = 0 then
    n := (length(d) - length(replace(d, 'select h.id, h.numero, h.diagnostico_id into v_hoja', ''))) / length('select h.id, h.numero, h.diagnostico_id into v_hoja');
    if n <> 1 then raise exception 'vista_previa: patrón de hoja encontrado % veces', n; end if;
    d := replace(d, 'select h.id, h.numero, h.diagnostico_id into v_hoja', 'select h.id, h.numero, h.diagnostico_id, h.moneda into v_hoja');

    n := (length(d) - length(replace(d, '''moneda'', coalesce(v_os.moneda, ''PEN''),', ''))) / length('''moneda'', coalesce(v_os.moneda, ''PEN''),');
    if n <> 1 then raise exception 'vista_previa: patrón de moneda encontrado % veces', n; end if;
    d := replace(d, '''moneda'', coalesce(v_os.moneda, ''PEN''),',
      '''moneda'', coalesce(v_os.moneda, ''PEN''), ''moneda_hoja'', v_hoja.moneda,');

    n := (length(d) - length(replace(d, 'concat_ws('' · '', v_os.activo_codigo, v_os.activo_nombre)', ''))) / length('concat_ws('' · '', v_os.activo_codigo, v_os.activo_nombre)');
    if n <> 1 then raise exception 'vista_previa: patrón de componente encontrado % veces', n; end if;
    d := replace(d, 'concat_ws('' · '', v_os.activo_codigo, v_os.activo_nombre)',
      'concat_ws('' · '', nullif(v_os.activo_codigo, v_os.activo_nombre), v_os.activo_nombre)');
    execute d;
  end if;
end $$;

do $$ begin
  if position('moneda_hoja' in pg_get_functiondef('public.crear_of_desde_os(text,boolean)'::regprocedure)) = 0
     or position('moneda_hoja' in pg_get_functiondef('public.vista_previa_of_desde_os(text)'::regprocedure)) = 0 then
    raise exception 'F2: corrección de moneda no aplicada';
  end if;
end $$;
