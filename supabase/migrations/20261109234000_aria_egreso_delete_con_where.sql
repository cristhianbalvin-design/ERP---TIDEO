-- La API (PostgREST) bloquea DELETE sin WHERE (pg-safeupdate): la tabla temporal se vacía con WHERE true.
-- Reemplaza asistente_preparar_egreso_caja_chica de 20261109231000; único cambio: esa línea.

create or replace function public.asistente_preparar_egreso_caja_chica(
  p_empresa_id text,
  p_concepto text default null,
  p_monto numeric default null,
  p_moneda text default null,
  p_fondo text default null,
  p_categoria text default null,
  p_tipo_gasto text default null,
  p_ceco text default null,
  p_fecha date default null,
  p_proveedor text default null,
  p_tipo_comprobante text default null,
  p_num_comprobante text default null,
  p_sociedad_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_alcance uuid[];
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Lima')::date);
  v_concepto text := left(nullif(btrim(coalesce(p_concepto, '')), ''), 300);
  v_monto numeric(14,2) := round(p_monto, 2);
  v_fondos jsonb;
  v_nfondos integer;
  v_fondo record;
  v_saldo numeric(14,2);
  v_moneda text;
  v_catalogo integer;
  v_tipo record;
  v_tipo_nombre text;
  v_es_no_gasto boolean := false;
  v_categoria text;
  v_cap boolean := false;
  v_opciones jsonb;
  v_cecos jsonb;
  v_nceco integer;
  v_ceco_id text;
  v_ceco_codigo text;
  v_ceco_nombre text;
  v_ceco_soc uuid;
  v_sociedad uuid;
  v_comp text;
  v_num text := left(nullif(btrim(coalesce(p_num_comprobante, '')), ''), 60);
  v_proveedor text := left(nullif(btrim(coalesce(p_proveedor, '')), ''), 200);
  v_gasto_id text;
  v_borrador uuid;
  v_vence timestamptz;
  v_payload jsonb;
  c_tipos constant text[] := array['Factura', 'Boleta', 'Recibo honorarios', 'Ticket', 'Sin comprobante'];
begin
  if v_uid is null then
    raise exception 'NO_AUTENTICADO: Sesión no autenticada.';
  end if;
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'PERMISO_DENEGADO: No tiene acceso a esta empresa.';
  end if;
  if not public.usuario_puede(p_empresa_id, 'caja', 'crear') then
    return jsonb_build_object('estado', 'sin_permiso',
      'mensaje', 'La persona no tiene permiso para registrar egresos de caja chica (Caja chica: crear).');
  end if;
  v_alcance := public.usuario_alcance_sociedades(p_empresa_id);

  -- Datos básicos
  if v_concepto is null or v_monto is null or v_monto <= 0 then
    return jsonb_build_object('estado', 'faltan_datos',
      'faltan', to_jsonb(array_remove(array[
        case when v_concepto is null then 'concepto' end,
        case when v_monto is null or v_monto <= 0 then 'monto' end], null)),
      'mensaje', 'Pide los datos que faltan antes de preparar el borrador.');
  end if;
  if v_fecha > v_hoy then
    return jsonb_build_object('estado', 'dato_invalido', 'mensaje', 'La fecha del egreso no puede ser futura.');
  end if;

  -- Fondo: activo, dentro del alcance societario y, si se indicó, por nombre o responsable
  with c as (
    select f.id, f.nombre, upper(coalesce(f.moneda, 'PEN')) as moneda, f.sociedad_id,
           u.nombre as responsable
    from public.caja_chica_fondos f
    left join public.usuarios u on u.id = f.responsable_id
    where f.empresa_id = p_empresa_id
      and f.estado = 'activo'
      and (p_sociedad_id is null or f.sociedad_id is null or f.sociedad_id = p_sociedad_id)
      and (v_alcance is null or f.sociedad_id is null or f.sociedad_id = any(v_alcance))
      and (nullif(btrim(coalesce(p_fondo, '')), '') is null
           or public.asistente_norm(f.nombre) like '%' || public.asistente_norm(p_fondo) || '%'
           or public.asistente_norm(u.nombre) like '%' || public.asistente_norm(p_fondo) || '%')
  )
  select count(*),
         coalesce(jsonb_agg(jsonb_build_object('nombre', c.nombre, 'moneda', c.moneda, 'responsable', c.responsable,
           'saldo', public.asistente_saldo_fondo_seguro(c.id)) order by c.nombre), '[]'::jsonb)
    into v_nfondos, v_fondos
  from c;

  if v_nfondos <> 1 then
    if v_nfondos = 0 and nullif(btrim(coalesce(p_fondo, '')), '') is not null then
      select coalesce(jsonb_agg(jsonb_build_object('nombre', f.nombre, 'moneda', upper(coalesce(f.moneda, 'PEN')))
               order by f.nombre), '[]'::jsonb)
        into v_fondos
      from public.caja_chica_fondos f
      where f.empresa_id = p_empresa_id and f.estado = 'activo'
        and (p_sociedad_id is null or f.sociedad_id is null or f.sociedad_id = p_sociedad_id)
        and (v_alcance is null or f.sociedad_id is null or f.sociedad_id = any(v_alcance));
    end if;
    return jsonb_build_object('estado', 'faltan_datos', 'faltan', jsonb_build_array('fondo'),
      'mensaje', case when jsonb_array_length(v_fondos) = 0 then 'No hay fondos de caja chica activos a los que la persona tenga acceso.'
                      else 'Pregunta de qué fondo sale el egreso.' end,
      'fondos', v_fondos);
  end if;

  select f.id, f.nombre, upper(coalesce(f.moneda, 'PEN')) as moneda, f.sociedad_id
    into v_fondo
  from public.caja_chica_fondos f
  left join public.usuarios u on u.id = f.responsable_id
  where f.empresa_id = p_empresa_id
    and f.estado = 'activo'
    and (p_sociedad_id is null or f.sociedad_id is null or f.sociedad_id = p_sociedad_id)
    and (v_alcance is null or f.sociedad_id is null or f.sociedad_id = any(v_alcance))
    and (nullif(btrim(coalesce(p_fondo, '')), '') is null
         or public.asistente_norm(f.nombre) like '%' || public.asistente_norm(p_fondo) || '%'
         or public.asistente_norm(u.nombre) like '%' || public.asistente_norm(p_fondo) || '%')
  limit 1;

  v_moneda := upper(coalesce(nullif(btrim(coalesce(p_moneda, '')), ''), v_fondo.moneda));
  if v_moneda <> v_fondo.moneda then
    return jsonb_build_object('estado', 'no_soportado',
      'mensaje', format('El fondo %s está en %s. Desde Aria el egreso se registra en la moneda del fondo; para otra moneda usa el formulario Nuevo Egreso.', v_fondo.nombre, v_fondo.moneda));
  end if;

  v_saldo := public.asistente_saldo_fondo_seguro(v_fondo.id);
  if v_saldo is null then
    return jsonb_build_object('estado', 'no_soportado',
      'mensaje', format('No se pudo calcular el saldo del fondo %s; revisa el fondo en Caja chica.', v_fondo.nombre));
  end if;
  if v_monto > v_saldo then
    return jsonb_build_object('estado', 'saldo_insuficiente', 'fondo', v_fondo.nombre, 'moneda', v_fondo.moneda,
      'saldo_disponible', v_saldo, 'monto', v_monto,
      'mensaje', 'El monto supera el saldo disponible del fondo; no se puede registrar.');
  end if;

  -- Categoría del Estado de Resultados (y tipo de gasto si se indicó)
  select count(*) into v_catalogo from public.er_categorias where empresa_id = p_empresa_id and activo;

  if nullif(btrim(coalesce(p_tipo_gasto, '')), '') is not null then
    select t.nombre, t.categoria_er, coalesce(t.es_no_gasto, false) as es_no_gasto
      into v_tipo
    from public.tipos_gasto_empresa t
    where t.empresa_id = p_empresa_id
      and coalesce(t.activo, true)
      and coalesce(t.aplica_caja_chica, true)
      and (public.asistente_norm(t.nombre) = public.asistente_norm(p_tipo_gasto)
           or public.asistente_norm(t.nombre) like '%' || public.asistente_norm(p_tipo_gasto) || '%')
    order by (public.asistente_norm(t.nombre) = public.asistente_norm(p_tipo_gasto)) desc, t.orden nulls last
    limit 1;
    if found then
      v_tipo_nombre := v_tipo.nombre;
      v_es_no_gasto := v_tipo.es_no_gasto;
      v_categoria := v_tipo.categoria_er;
    end if;
  end if;

  if nullif(btrim(coalesce(p_categoria, '')), '') is not null then
    v_categoria := p_categoria;
  end if;

  if v_catalogo > 0 then
    select c.nombre, coalesce(c.es_capitalizacion, false)
      into v_categoria, v_cap
    from public.er_categorias c
    where c.empresa_id = p_empresa_id and c.activo
      and public.asistente_norm(c.nombre) = public.asistente_norm(v_categoria)
    limit 1;
    if not found then v_categoria := null; end if;
  elsif v_categoria is not null then
    if public.asistente_norm(v_categoria) not in (
        select public.asistente_norm(t.categoria_er) from public.tipos_gasto_empresa t
        where t.empresa_id = p_empresa_id and coalesce(t.activo, true)
        union select public.asistente_norm(x) from unnest(array['Materiales', 'Servicios terceros', 'Administrativos', 'Logística']) x) then
      v_categoria := null;
    end if;
    v_cap := public.asistente_norm(v_categoria) = public.asistente_norm('Inversiones / Activos');
  end if;

  if v_categoria is null then
    select jsonb_build_object(
      -- Solo los tipos parecidos a lo que dijo la persona (máximo 15), para no saturar a Aria.
      'tipos_parecidos', coalesce((select jsonb_agg(jsonb_build_object('tipo', x.nombre, 'categoria', x.categoria_er))
                                   from (select t.nombre, t.categoria_er
                                         from public.tipos_gasto_empresa t
                                         where t.empresa_id = p_empresa_id and coalesce(t.activo, true) and coalesce(t.aplica_caja_chica, true)
                                           and exists (select 1 from regexp_split_to_table(public.asistente_norm(coalesce(p_tipo_gasto, '') || ' ' || v_concepto), '[^a-z0-9]+') w
                                                       where length(w) >= 4 and public.asistente_norm(t.nombre) like '%' || w || '%')
                                         order by t.orden nulls last, t.nombre limit 15) x), '[]'::jsonb),
      'categorias', coalesce((select jsonb_agg(c.nombre order by c.orden nulls last, c.nombre)
                              from public.er_categorias c
                              where c.empresa_id = p_empresa_id and c.activo and not coalesce(c.es_capitalizacion, false)), '[]'::jsonb))
      into v_opciones;
    return jsonb_build_object('estado', 'faltan_datos', 'faltan', jsonb_build_array('categoria'),
      'mensaje', 'Pregunta el tipo de gasto o la categoría del Estado de Resultados; solo valen las opciones listadas.',
      'opciones', v_opciones);
  end if;

  if v_cap then
    return jsonb_build_object('estado', 'no_soportado',
      'mensaje', 'Los activos fijos se registran desde el formulario Nuevo Egreso, porque piden datos del activo.');
  end if;

  -- CECO compatible con la sociedad del fondo
  create temporary table if not exists _aria_cecos (id text, codigo text, nombre text, sociedad_id uuid, exacto boolean) on commit drop;
  delete from _aria_cecos where true;
  insert into _aria_cecos
  select cc.id, cc.codigo, cc.nombre, cc.sociedad_id,
         nullif(btrim(coalesce(p_ceco, '')), '') is not null and public.asistente_norm(cc.codigo) = public.asistente_norm(p_ceco)
  from public.centros_costo cc
  where cc.empresa_id = p_empresa_id
    and coalesce(cc.estado, 'activo') <> 'inactivo'
    and (v_fondo.sociedad_id is null or cc.sociedad_id is null or cc.sociedad_id = v_fondo.sociedad_id)
    and (v_alcance is null or cc.sociedad_id is null or cc.sociedad_id = any(v_alcance))
    and (nullif(btrim(coalesce(p_ceco, '')), '') is null
         or public.asistente_norm(cc.codigo) like '%' || public.asistente_norm(p_ceco) || '%'
         or public.asistente_norm(cc.nombre) like '%' || public.asistente_norm(p_ceco) || '%');

  select count(*) into v_nceco from _aria_cecos;
  if v_nceco = 1 then
    select id, codigo, nombre, sociedad_id into v_ceco_id, v_ceco_codigo, v_ceco_nombre, v_ceco_soc from _aria_cecos;
  elsif v_nceco > 1 and (select count(*) from _aria_cecos where exacto) = 1 then
    select id, codigo, nombre, sociedad_id into v_ceco_id, v_ceco_codigo, v_ceco_nombre, v_ceco_soc from _aria_cecos where exacto;
  end if;

  if v_ceco_id is null then
    select coalesce(jsonb_agg(jsonb_build_object('codigo', x.codigo, 'nombre', x.nombre) order by x.codigo), '[]'::jsonb)
      into v_cecos
    from (select codigo, nombre from _aria_cecos order by codigo limit 25) x;
    return jsonb_build_object('estado', 'faltan_datos', 'faltan', jsonb_build_array('ceco'),
      'mensaje', case when v_nceco = 0 then 'No hay un centro de costo que coincida y sea compatible con la sociedad del fondo; pide otro.'
                      else 'Pregunta a qué centro de costo (CECO) se carga el egreso.' end,
      'cecos', v_cecos);
  end if;

  -- Sociedad: la del fondo manda; luego la del CECO; luego la activa; luego la principal.
  v_sociedad := coalesce(v_fondo.sociedad_id, v_ceco_soc, p_sociedad_id);
  if v_sociedad is null then
    select id into v_sociedad from public.sociedades
    where empresa_id = p_empresa_id order by es_principal desc nulls last, id limit 1;
  end if;
  if v_sociedad is not null and v_alcance is not null and not (v_sociedad = any(v_alcance)) then
    return jsonb_build_object('estado', 'sin_permiso', 'mensaje', 'La sociedad del egreso está fuera del alcance de la persona.');
  end if;

  -- Comprobante
  select t into v_comp from unnest(c_tipos) t
  where public.asistente_norm(t) = public.asistente_norm(p_tipo_comprobante) limit 1;
  v_comp := coalesce(v_comp, case when v_num is null then 'Sin comprobante' else 'Factura' end);

  -- Un solo borrador vivo por persona
  update public.asistente_borradores
     set estado = 'cancelado', cerrado_en = now()
   where user_id = v_uid and tipo = 'egreso_caja_chica' and estado = 'pendiente';

  v_gasto_id := 'gasto_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  v_payload := jsonb_build_object(
    'gasto_id', v_gasto_id,
    'fondo_id', v_fondo.id, 'fondo', v_fondo.nombre,
    'sociedad_id', v_sociedad,
    'moneda', v_fondo.moneda, 'monto', v_monto,
    'concepto', v_concepto,
    'categoria', v_categoria, 'tipo_gasto', v_tipo_nombre, 'es_no_gasto', v_es_no_gasto,
    'ceco_id', v_ceco_id, 'ceco', trim(both ' ·' from coalesce(v_ceco_codigo, '') || ' · ' || coalesce(v_ceco_nombre, '')),
    'fecha', v_fecha,
    'proveedor', v_proveedor,
    'tipo_comprobante', v_comp, 'num_comprobante', v_num,
    'saldo_actual', v_saldo, 'saldo_despues', v_saldo - v_monto);

  insert into public.asistente_borradores (empresa_id, user_id, tipo, payload)
  values (p_empresa_id, v_uid, 'egreso_caja_chica', v_payload)
  returning id, vence_en into v_borrador, v_vence;

  return jsonb_build_object(
    'estado', 'listo',
    'mensaje', 'Borrador preparado, todavía NO registrado. La persona debe revisar la tarjeta, adjuntar la foto si la tiene y pulsar Confirmar.',
    'borrador', (v_payload - 'fondo_id' - 'sociedad_id' - 'ceco_id' - 'gasto_id' - 'es_no_gasto')
                 || jsonb_build_object('id', v_borrador, 'vence_en', v_vence));
end;
$$;

do $$
begin
  if position('delete from _aria_cecos where true' in pg_get_functiondef('public.asistente_preparar_egreso_caja_chica(text,text,numeric,text,text,text,text,text,date,text,text,text,uuid)'::regprocedure)) = 0 then
    raise exception 'La función no quedó con el DELETE acotado';
  end if;
end;
$$;
