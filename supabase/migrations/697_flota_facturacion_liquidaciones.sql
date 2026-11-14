-- 697 · Facturación de líneas de liquidaciones aprobadas de Flota.
-- La emisión y los vínculos se confirman o revierten en una sola transacción.

-- 1. Vínculos históricos por equipo; solo las RPC escriben.
create table public.flota_liquidacion_facturas (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  liquidacion_id uuid not null references public.flota_liquidaciones(id) on delete restrict,
  liquidacion_linea_id uuid not null references public.flota_liquidacion_lineas(id) on delete restrict,
  factura_id text not null references public.facturas(id) on delete restrict,
  importe numeric(14,2) not null check (importe >= 0),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  unique (liquidacion_linea_id, factura_id)
);
create index flota_liquidacion_facturas_liquidacion_idx on public.flota_liquidacion_facturas (empresa_id, liquidacion_id);
create index flota_liquidacion_facturas_factura_idx on public.flota_liquidacion_facturas (factura_id);
alter table public.flota_liquidacion_facturas enable row level security;
create policy flota_liquidacion_facturas_select on public.flota_liquidacion_facturas for select to authenticated
  using (public.usuario_tiene_empresa(empresa_id) and
    (public.usuario_puede(empresa_id, 'facturacion', 'ver') or public.usuario_puede(empresa_id, 'liquidacion_flota', 'ver'))
    and exists (select 1 from public.flota_liquidaciones l where l.id = liquidacion_id
      and public.flota_sociedad_en_alcance(l.empresa_id, l.sociedad_id)));

-- 2. Factura vigente de una línea: una reversión parcial no libera la línea.
create function public.flota__factura_vigente_linea(p_linea_id uuid)
returns table (factura_id text, numero text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select f.id, f.numero
  from public.flota_liquidacion_facturas lf
  join public.facturas f on f.id = lf.factura_id and f.empresa_id = lf.empresa_id
  where lf.liquidacion_linea_id = p_linea_id and f.estado <> 'anulada'
    and coalesce((select sum(nc.total) from public.facturas nc
      where nc.empresa_id = f.empresa_id and nc.factura_origen_id = f.id
        and nc.tipo_documento = 'nota_credito' and nc.estado <> 'anulada'), 0) < f.total
  order by lf.created_at desc, lf.id desc
  limit 1;
$$;
revoke all on function public.flota__factura_vigente_linea(uuid) from public, anon, authenticated;

-- 3. Consulta autorizada de liquidaciones aprobadas y sus líneas.
create function public.flota_liquidaciones_por_facturar(p_empresa_id text)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_resultado jsonb;
begin
  -- La empresa inexistente se resuelve sin depender de la sesión.
  if not exists (select 1 from public.empresas where id = p_empresa_id) then
    return '[]'::jsonb;
  end if;
  if not coalesce(public.usuario_tiene_empresa(p_empresa_id), false)
     or not coalesce(public.usuario_puede(p_empresa_id, 'facturacion', 'ver'), false) then
    raise exception 'No tiene permiso para consultar la facturación de esta empresa.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(x.datos order by x.periodo desc, x.numero), '[]'::jsonb) into v_resultado
  from (
    select l.periodo, l.numero, jsonb_build_object(
      'id', l.id, 'numero', l.numero, 'periodo', l.periodo,
      'contrato_id', c.id, 'contrato_numero', c.numero,
      'cuenta_id', c.cuenta_id, 'cliente', coalesce(nullif(cu.razon_social, ''), cu.nombre_comercial),
      'sociedad_id', l.sociedad_id, 'sociedad', s.nombre, 'moneda', l.moneda,
      'meta_dmr', l.meta_dmr, 'importe_base', l.importe_base, 'penalidad', l.penalidad, 'total', l.total,
      'facturado_vigente', lineas.facturado, 'saldo', l.total - lineas.facturado, 'lineas', lineas.datos
    ) datos
    from public.flota_liquidaciones l
    join public.contratos_alquiler c on c.id = l.contrato_alquiler_id and c.empresa_id = l.empresa_id
    join public.cuentas cu on cu.id = c.cuenta_id and cu.empresa_id = l.empresa_id
    join public.sociedades s on s.id = l.sociedad_id and s.empresa_id = l.empresa_id
    cross join lateral (
      select coalesce(sum(case when fv.factura_id is not null then ll.total else 0 end), 0) facturado,
        coalesce(jsonb_agg(jsonb_build_object(
          'id', ll.id, 'activo_id', ll.activo_id, 'codigo', a.codigo, 'nombre', a.nombre,
          'horas_facturables', ll.horas_facturables, 'tarifa_hora', ll.tarifa_hora, 'dmr', ll.dmr,
          'importe_base', ll.importe_base, 'penalidad', ll.penalidad, 'total', ll.total,
          'factura_vigente', case when fv.factura_id is null then null
            else jsonb_build_object('id', fv.factura_id, 'numero', fv.numero) end
        ) order by a.codigo, ll.id), '[]'::jsonb) datos
      from public.flota_liquidacion_lineas ll
      join public.activos a on a.id = ll.activo_id
      left join lateral public.flota__factura_vigente_linea(ll.id) fv on true
      where ll.liquidacion_id = l.id and ll.empresa_id = l.empresa_id
    ) lineas
    where l.empresa_id = p_empresa_id and l.estado = 'aprobada'
      and public.flota_sociedad_en_alcance(l.empresa_id, l.sociedad_id)
  ) x;
  return v_resultado;
end;
$$;

-- 4. Emisión atómica: el bloqueo de la cabecera serializa todas sus facturaciones.
create function public.flota_facturar_liquidacion(p_liquidacion_id uuid, p_linea_ids uuid[], p_datos jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_l public.flota_liquidaciones%rowtype;
  v_cuenta_id text;
  v_spot_id uuid;
  v_fecha date;
  v_linea record;
  v_items jsonb := '[]'::jsonb;
  v_subtotal numeric := 0;
  v_igv numeric;
  v_resultado jsonb;
  v_saldo numeric;
  v_mes text;
begin
  select * into v_l from public.flota_liquidaciones where id = p_liquidacion_id for update;
  if not found then raise exception 'La liquidación no existe.' using errcode = '22023'; end if;
  if not coalesce(public.usuario_tiene_empresa(v_l.empresa_id), false)
     or not coalesce(public.usuario_puede(v_l.empresa_id, 'facturacion', 'crear'), false) then
    raise exception 'No tiene permiso para facturar esta liquidación.' using errcode = '42501';
  end if;
  if not coalesce(public.flota_sociedad_en_alcance(v_l.empresa_id, v_l.sociedad_id), false) then
    raise exception 'La sociedad de la liquidación está fuera de su alcance.' using errcode = '42501';
  end if;
  if v_l.estado <> 'aprobada' then raise exception 'La liquidación debe estar aprobada.' using errcode = '22023'; end if;
  if coalesce(cardinality(p_linea_ids), 0) = 0
     or array_position(p_linea_ids, null) is not null
     or cardinality(p_linea_ids) <> (select count(distinct id) from unnest(p_linea_ids) as t(id)) then
    raise exception 'Seleccione líneas válidas sin duplicados.' using errcode = '22023';
  end if;
  if cardinality(p_linea_ids) <> (select count(*) from public.flota_liquidacion_lineas
      where liquidacion_id = v_l.id and empresa_id = v_l.empresa_id and id = any(p_linea_ids)) then
    raise exception 'Todas las líneas deben pertenecer a la liquidación.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_linea_ids) t(id)
      cross join lateral public.flota__factura_vigente_linea(t.id)) then
    raise exception 'Una línea seleccionada ya tiene factura vigente.' using errcode = '22023';
  end if;
  select c.cuenta_id into v_cuenta_id from public.contratos_alquiler c
    where c.id = v_l.contrato_alquiler_id and c.empresa_id = v_l.empresa_id;
  if v_cuenta_id is null then raise exception 'El contrato no tiene cliente válido.' using errcode = '22023'; end if;
  v_fecha := nullif(p_datos->>'fecha_emision', '')::date;
  select id into v_spot_id from public.spot_catalogo
    where codigo = '019' and estado = 'activo' and vigencia_desde <= v_fecha
      and (vigencia_hasta is null or vigencia_hasta >= v_fecha)
    order by vigencia_desde desc limit 1;
  if v_spot_id is null then raise exception 'No hay SPOT 019 vigente para la fecha de emisión.' using errcode = '22023'; end if;
  v_mes := (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from v_l.periodo)::integer]
    || ' ' || extract(year from v_l.periodo)::integer::text;
  for v_linea in select ll.*, a.codigo, a.nombre from public.flota_liquidacion_lineas ll
    join public.activos a on a.id = ll.activo_id
    where ll.liquidacion_id = v_l.id and ll.empresa_id = v_l.empresa_id and ll.id = any(p_linea_ids)
    order by a.codigo, ll.id
  loop
    if v_linea.importe_base < 0 or v_linea.penalidad < 0 or v_linea.total <> v_linea.importe_base - v_linea.penalidad then
      raise exception 'Los importes de la línea % no son válidos.', v_linea.id using errcode = '22023';
    end if;
    -- El importe base incorpora las tarifas históricas del periodo, no solo la tarifa final.
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'descripcion', 'Alquiler ' || v_linea.codigo || ' · ' || v_linea.nombre || ' · ' || v_mes,
      'cantidad', v_linea.horas_facturables, 'precio_unitario', v_linea.tarifa_hora,
      'importe', v_linea.importe_base, 'spot_catalogo_id', v_spot_id));
    if v_linea.penalidad > 0 then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'descripcion', 'Penalidad DMR ' || v_linea.codigo, 'cantidad', 1,
        'precio_unitario', -v_linea.penalidad, 'importe', -v_linea.penalidad, 'spot_catalogo_id', v_spot_id));
    end if;
    v_subtotal := v_subtotal + v_linea.total;
  end loop;
  v_igv := round(v_subtotal * 0.18, 2);
  v_resultado := public.emitir_factura_cxc_atomico(jsonb_build_object(
    'empresa_id', v_l.empresa_id, 'cuenta_id', v_cuenta_id, 'sociedad_id', v_l.sociedad_id,
    'moneda', v_l.moneda, 'tipo_documento', 'factura', 'items', v_items,
    'subtotal', v_subtotal, 'igv', v_igv, 'total', v_subtotal + v_igv,
    'factura_id', p_datos->'factura_id', 'cxc_id', p_datos->'cxc_id', 'numero', p_datos->'numero',
    'fecha_emision', p_datos->'fecha_emision', 'fecha_vencimiento', p_datos->'fecha_vencimiento',
    'condicion_pago', p_datos->'condicion_pago', 'centro_beneficio_id', p_datos->'centro_beneficio_id',
    'glosa', p_datos->'glosa', 'tipo_cambio_detraccion', p_datos->'tipo_cambio_detraccion',
    'tipo_cambio_fuente', p_datos->'tipo_cambio_fuente',
    'confirmar_numero_duplicado', p_datos->'confirmar_numero_duplicado'));
  insert into public.flota_liquidacion_facturas (empresa_id, liquidacion_id, liquidacion_linea_id, factura_id, importe, created_by)
    select v_l.empresa_id, v_l.id, ll.id, v_resultado->'factura'->>'id', ll.total, auth.uid()
    from public.flota_liquidacion_lineas ll where ll.liquidacion_id = v_l.id and ll.id = any(p_linea_ids);
  select v_l.total - coalesce(sum(ll.total) filter (where fv.factura_id is not null), 0) into v_saldo
    from public.flota_liquidacion_lineas ll
    left join lateral public.flota__factura_vigente_linea(ll.id) fv on true
    where ll.liquidacion_id = v_l.id and ll.empresa_id = v_l.empresa_id;
  return v_resultado || jsonb_build_object('saldo_restante', v_saldo);
end;
$$;

-- 5. Privilegios de las RPC públicas.
revoke all on function public.flota_liquidaciones_por_facturar(text) from public, anon;
revoke all on function public.flota_facturar_liquidacion(uuid, uuid[], jsonb) from public, anon;
grant execute on function public.flota_liquidaciones_por_facturar(text) to authenticated;
grant execute on function public.flota_facturar_liquidacion(uuid, uuid[], jsonb) to authenticated;

-- 6. Comprobación de objetos, RLS, privilegios y empresa inexistente.
do $$
declare
  v_inexistente text := '__flota_facturacion_comprobacion_inexistente__';
begin
  if to_regclass('public.flota_liquidacion_facturas') is null or not exists (
    select 1 from pg_class where oid = to_regclass('public.flota_liquidacion_facturas') and relrowsecurity
  ) then raise exception 'Falta la tabla de vínculos o su RLS.'; end if;
  if to_regprocedure('public.flota__factura_vigente_linea(uuid)') is null
     or to_regprocedure('public.flota_liquidaciones_por_facturar(text)') is null
     or to_regprocedure('public.flota_facturar_liquidacion(uuid,uuid[],jsonb)') is null then
    raise exception 'Falta alguna función de facturación de Flota.';
  end if;
  if has_function_privilege('anon', 'public.flota__factura_vigente_linea(uuid)', 'execute')
     or has_function_privilege('anon', 'public.flota_liquidaciones_por_facturar(text)', 'execute')
     or has_function_privilege('anon', 'public.flota_facturar_liquidacion(uuid,uuid[],jsonb)', 'execute') then
    raise exception 'anon no debe ejecutar las funciones de facturación de Flota.';
  end if;
  while exists (select 1 from public.empresas where id = v_inexistente) loop
    v_inexistente := v_inexistente || '_';
  end loop;
  if public.flota_liquidaciones_por_facturar(v_inexistente) <> '[]'::jsonb then
    raise exception 'La empresa inexistente no debe devolver datos.';
  end if;
end;
$$;
