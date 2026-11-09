-- Aria: egreso de caja chica desde el chat en tres pasos.
-- 1) asistente_preparar_egreso_caja_chica (herramienta de Aria): valida y guarda un borrador.
-- 2) La persona revisa la tarjeta, adjunta la foto y pulsa Confirmar (Aria no puede confirmar).
-- 3) asistente_confirmar_borrador (solo desde el panel): revalida y graba en una transacción
--    compras_gastos + caja_chica mediante registrar_egreso_caja_chica_atomico.

create table if not exists public.asistente_borradores (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  user_id uuid not null,
  tipo text not null check (tipo in ('egreso_caja_chica')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'confirmado', 'cancelado', 'vencido')),
  payload jsonb not null,
  resultado jsonb,
  creado_en timestamptz not null default now(),
  vence_en timestamptz not null default (now() + interval '30 minutes'),
  cerrado_en timestamptz
);

create index if not exists asistente_borradores_user_idx
  on public.asistente_borradores (user_id, creado_en desc);

alter table public.asistente_borradores enable row level security;

drop policy if exists asistente_borradores_select_propios on public.asistente_borradores;
create policy asistente_borradores_select_propios on public.asistente_borradores
  for select to authenticated using (user_id = auth.uid());

revoke all on public.asistente_borradores from anon;
revoke insert, update, delete on public.asistente_borradores from authenticated;
grant select on public.asistente_borradores to authenticated;

create or replace function public.asistente_norm(p text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select lower(btrim(translate(coalesce(p, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')));
$$;

-- Saldo de un fondo sin abortar la transacción si el fondo tiene datos inconsistentes.
create or replace function public.asistente_saldo_fondo_seguro(p_fondo_id text)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return public.calcular_saldo_fondo_caja_chica(p_fondo_id);
exception when others then
  return null;
end;
$$;

revoke all on function public.asistente_saldo_fondo_seguro(text) from public, anon, authenticated;

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
      'tipos_de_gasto', coalesce((select jsonb_agg(jsonb_build_object('tipo', t.nombre, 'categoria', t.categoria_er) order by t.orden nulls last, t.nombre)
                                  from public.tipos_gasto_empresa t
                                  where t.empresa_id = p_empresa_id and coalesce(t.activo, true) and coalesce(t.aplica_caja_chica, true)), '[]'::jsonb),
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
  delete from _aria_cecos;
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

create or replace function public.asistente_confirmar_borrador(
  p_borrador_id uuid,
  p_comprobante_url text default null,
  p_num_comprobante text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_b public.asistente_borradores%rowtype;
  v_p jsonb;
  v_cc public.caja_chica%rowtype;
  v_num text;
  v_url text := left(nullif(btrim(coalesce(p_comprobante_url, '')), ''), 1000);
  v_saldo numeric(14,2);
begin
  if auth.uid() is null then
    raise exception 'NO_AUTENTICADO: Sesión no autenticada.';
  end if;

  select * into v_b
  from public.asistente_borradores
  where id = p_borrador_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'BORRADOR_NO_ENCONTRADO: El borrador no existe o no es tuyo.';
  end if;

  if v_b.estado = 'confirmado' then
    return jsonb_build_object('estado', 'confirmado', 'ya_registrado', true) || coalesce(v_b.resultado, '{}'::jsonb);
  end if;
  if v_b.estado <> 'pendiente' then
    return jsonb_build_object('estado', v_b.estado, 'mensaje', 'Este borrador ya no está vigente. Pídele a Aria que lo prepare de nuevo.');
  end if;
  if v_b.vence_en < now() then
    update public.asistente_borradores set estado = 'vencido', cerrado_en = now() where id = v_b.id;
    return jsonb_build_object('estado', 'vencido', 'mensaje', 'El borrador venció. Pídele a Aria que lo prepare de nuevo.');
  end if;

  if not public.usuario_tiene_empresa(v_b.empresa_id) or not public.usuario_puede(v_b.empresa_id, 'caja', 'crear') then
    raise exception 'PERMISO_DENEGADO: No tienes permiso para registrar egresos de caja chica.';
  end if;

  v_p := v_b.payload;
  v_num := coalesce(left(nullif(btrim(coalesce(p_num_comprobante, '')), ''), 60), v_p ->> 'num_comprobante');

  -- La categoría debe seguir activa (si la empresa tiene catálogo).
  if exists (select 1 from public.er_categorias where empresa_id = v_b.empresa_id and activo)
     and not exists (select 1 from public.er_categorias
                     where empresa_id = v_b.empresa_id and activo
                       and nombre = v_p ->> 'categoria' and not coalesce(es_capitalizacion, false)) then
    raise exception 'CATEGORIA_REQUERIDA: La categoría del Estado de Resultados ya no está activa. Pídele a Aria otra categoría.';
  end if;

  insert into public.compras_gastos (
    id, empresa_id, sociedad_id, tipo, descripcion, categoria, subcategoria, monto, moneda, fecha,
    origen_registro, estado, excluir_de_er, estado_pago, metodo_pago, centro_costo_id,
    num_comprobante, proveedor_referencia, archivo_url, es_activo_fijo, creado_por, created_at
  ) values (
    v_p ->> 'gasto_id', v_b.empresa_id, nullif(v_p ->> 'sociedad_id', '')::uuid, 'gasto', v_p ->> 'concepto',
    v_p ->> 'categoria', v_p ->> 'tipo_gasto', (v_p ->> 'monto')::numeric, v_p ->> 'moneda', (v_p ->> 'fecha')::date,
    'backoffice', 'registrado', coalesce((v_p ->> 'es_no_gasto')::boolean, false), 'pagado', 'Caja chica', v_p ->> 'ceco_id',
    v_num, v_p ->> 'proveedor', v_url, false, auth.uid(), now()
  );

  v_cc := public.registrar_egreso_caja_chica_atomico(jsonb_build_object(
    'empresa_id', v_b.empresa_id,
    'sociedad_id', v_p ->> 'sociedad_id',
    'fondo_id', v_p ->> 'fondo_id',
    'fecha', v_p ->> 'fecha',
    'concepto', v_p ->> 'concepto',
    'monto', v_p ->> 'monto',
    'moneda', v_p ->> 'moneda',
    'responsable_id', auth.uid()::text,
    'ceco_id', v_p ->> 'ceco_id',
    'categoria', v_p ->> 'categoria',
    'num_comprobante', v_num,
    'comprobante_url', v_url,
    'estado', 'registrado',
    'origen_registro', 'backoffice',
    'gasto_id', v_p ->> 'gasto_id',
    'creado_por', auth.uid()::text
  ));

  v_saldo := public.calcular_saldo_fondo_caja_chica(v_p ->> 'fondo_id');

  update public.asistente_borradores
     set estado = 'confirmado', cerrado_en = now(),
         payload = payload || jsonb_build_object('num_comprobante', v_num, 'con_foto', v_url is not null),
         resultado = jsonb_build_object('gasto_id', v_p ->> 'gasto_id', 'caja_chica_id', v_cc.id,
                                        'monto', v_cc.monto, 'moneda', v_cc.moneda, 'fondo', v_p ->> 'fondo',
                                        'saldo_restante', v_saldo)
   where id = v_b.id;

  return jsonb_build_object('estado', 'confirmado', 'gasto_id', v_p ->> 'gasto_id', 'caja_chica_id', v_cc.id,
    'monto', v_cc.monto, 'moneda', v_cc.moneda, 'fondo', v_p ->> 'fondo', 'saldo_restante', v_saldo);
end;
$$;

create or replace function public.asistente_cancelar_borrador(p_borrador_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.asistente_borradores
     set estado = 'cancelado', cerrado_en = now()
   where id = p_borrador_id and user_id = auth.uid() and estado = 'pendiente';
  return jsonb_build_object('estado', case when found then 'cancelado' else 'sin_cambios' end);
end;
$$;

revoke all on function public.asistente_preparar_egreso_caja_chica(text, text, numeric, text, text, text, text, text, date, text, text, text, uuid) from public, anon;
revoke all on function public.asistente_confirmar_borrador(uuid, text, text) from public, anon;
revoke all on function public.asistente_cancelar_borrador(uuid) from public, anon;
grant execute on function public.asistente_preparar_egreso_caja_chica(text, text, numeric, text, text, text, text, text, date, text, text, text, uuid) to authenticated;
grant execute on function public.asistente_confirmar_borrador(uuid, text, text) to authenticated;
grant execute on function public.asistente_cancelar_borrador(uuid) to authenticated;
grant execute on function public.asistente_norm(text) to authenticated;

-- Comprobación: si algo no quedó como se espera, la migración se revierte completa.
do $$
begin
  if to_regclass('public.asistente_borradores') is null then
    raise exception 'Falta la tabla asistente_borradores';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.asistente_borradores'::regclass) then
    raise exception 'RLS no activo en asistente_borradores';
  end if;
  if to_regprocedure('public.asistente_preparar_egreso_caja_chica(text,text,numeric,text,text,text,text,text,date,text,text,text,uuid)') is null
     or to_regprocedure('public.asistente_confirmar_borrador(uuid,text,text)') is null
     or to_regprocedure('public.asistente_cancelar_borrador(uuid)') is null then
    raise exception 'Faltan funciones del egreso de Aria';
  end if;
  if has_function_privilege('anon', 'public.asistente_confirmar_borrador(uuid,text,text)', 'execute') then
    raise exception 'anon no debe poder confirmar borradores';
  end if;
end;
$$;
