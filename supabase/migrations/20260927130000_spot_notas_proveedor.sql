-- SPOT / Bloque 3c: notas de credito/debito de proveedor.
-- Las NC no crean CxP negativas: la relacion conserva el documento y reduce
-- atomicamente la CxP original. Las ND crean una CxP positiva vinculada.

do $guard$
begin
  if to_regclass('public.cxp_notas_proveedor') is not null
     or to_regprocedure('public.registrar_nota_proveedor_spot(jsonb)') is not null then
    raise exception 'B3C_GUARD|tabla_o_funcion_ya_existe';
  end if;
end;
$guard$;

create table public.cxp_notas_proveedor (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         text not null references public.empresas(id),
  sociedad_id        uuid,
  cxp_origen_id      text not null references public.cxp(id),
  cxp_nota_id        text references public.cxp(id),
  devolucion_id      text references public.devoluciones_proveedor(id),
  tipo_nota          text not null check (tipo_nota in ('nota_credito','nota_debito')),
  numero_nota        text not null,
  fecha_nota         date not null,
  monto_aplicado     numeric(14,2) not null check (monto_aplicado > 0),
  moneda             text not null default 'PEN' check (upper(moneda) in ('PEN','USD')),
  motivo             text not null,
  archivo_url        text,
  creado_por         text,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  constraint cxp_notas_proveedor_tipo_vinculo_ck check (
    (tipo_nota = 'nota_credito' and cxp_nota_id is null)
    or (tipo_nota = 'nota_debito' and cxp_nota_id is not null)
  ),
  constraint cxp_notas_proveedor_cxp_distinta_ck check (cxp_nota_id is null or cxp_nota_id <> cxp_origen_id),
  constraint cxp_notas_proveedor_numero_ck check (btrim(numero_nota) <> ''),
  constraint cxp_notas_proveedor_motivo_ck check (btrim(motivo) <> '')
);

create unique index cxp_notas_proveedor_nc_unq
  on public.cxp_notas_proveedor (empresa_id, cxp_origen_id, tipo_nota, numero_nota);

create unique index cxp_notas_proveedor_nd_cxp_unq
  on public.cxp_notas_proveedor (cxp_nota_id)
  where cxp_nota_id is not null;

create index cxp_notas_proveedor_origen_idx on public.cxp_notas_proveedor (cxp_origen_id, fecha_nota);
create index cxp_notas_proveedor_devolucion_idx on public.cxp_notas_proveedor (devolucion_id);

create or replace function public.validar_tenant_cxp_nota_proveedor()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_origen public.cxp%rowtype;
  v_nota public.cxp%rowtype;
  v_devolucion public.devoluciones_proveedor%rowtype;
begin
  select * into v_origen from public.cxp where id = new.cxp_origen_id;
  if not found then raise exception 'La CxP original de la nota no existe.'; end if;
  if new.empresa_id is distinct from v_origen.empresa_id
     or new.sociedad_id is distinct from v_origen.sociedad_id then
    raise exception 'La nota y la CxP original deben pertenecer a la misma empresa y sociedad.';
  end if;

  if new.cxp_nota_id is not null then
    select * into v_nota from public.cxp where id = new.cxp_nota_id;
    if not found then raise exception 'La CxP de la nota no existe.'; end if;
    if v_nota.empresa_id is distinct from new.empresa_id
       or v_nota.sociedad_id is distinct from new.sociedad_id
       or v_nota.proveedor_id is distinct from v_origen.proveedor_id then
      raise exception 'La CxP de la nota debe compartir empresa, sociedad y proveedor con la CxP original.';
    end if;
  end if;

  if new.devolucion_id is not null then
    select * into v_devolucion from public.devoluciones_proveedor where id = new.devolucion_id;
    if not found or v_devolucion.empresa_id is distinct from new.empresa_id
       or v_devolucion.proveedor_id is distinct from v_origen.proveedor_id then
      raise exception 'La devolucion no pertenece al mismo tenant/proveedor de la CxP original.';
    end if;
  end if;
  return new;
end;
$function$;

create trigger cxp_notas_proveedor_tenant_trg
before insert or update on public.cxp_notas_proveedor
for each row execute function public.validar_tenant_cxp_nota_proveedor();

alter table public.cxp_notas_proveedor enable row level security;
drop policy if exists cxp_notas_proveedor_select on public.cxp_notas_proveedor;
create policy cxp_notas_proveedor_select on public.cxp_notas_proveedor
for select to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and (
    public.usuario_puede(empresa_id, 'cxp', 'ver')
    or public.usuario_puede(empresa_id, 'cxp', 'editar')
    or public.usuario_puede(empresa_id, 'cxp', 'ver_finanzas')
    or public.usuario_es_admin_empresa(empresa_id)
  )
);

revoke all on table public.cxp_notas_proveedor from public, anon, authenticated;
grant select on table public.cxp_notas_proveedor to authenticated;

create or replace function public.registrar_nota_proveedor_spot(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_origen_id text := nullif(btrim(p_payload ->> 'cxp_origen_id'), '');
  v_tipo text := lower(nullif(btrim(p_payload ->> 'tipo_nota'), ''));
  v_numero text := nullif(btrim(p_payload ->> 'numero_nota'), '');
  v_fecha date := coalesce(nullif(p_payload ->> 'fecha_nota', '')::date, current_date);
  v_monto numeric := round(coalesce(nullif(p_payload ->> 'monto', '')::numeric, 0), 2);
  v_codigo text := nullif(btrim(coalesce(p_payload ->> 'codigo_spot', '')), '');
  v_spot_id uuid := nullif(btrim(coalesce(p_payload ->> 'spot_catalogo_id', '')), '')::uuid;
  v_porcentaje_payload numeric := nullif(btrim(coalesce(p_payload ->> 'porcentaje', '')), '')::numeric;
  v_moneda text;
  v_motivo text := nullif(btrim(p_payload ->> 'motivo'), '');
  v_archivo text := nullif(btrim(p_payload ->> 'archivo_url'), '');
  v_origen text := lower(coalesce(nullif(btrim(p_payload ->> 'origen'), ''), 'cxp_finanzas'));
  v_empresa_id text;
  v_ver_finanzas boolean;
  v_cxp public.cxp%rowtype;
  v_cxp_nota public.cxp%rowtype;
  v_rel public.cxp_notas_proveedor%rowtype;
  v_detraccion public.detracciones%rowtype;
  v_spot public.spot_catalogo%rowtype;
  v_nuevo_total numeric(14,2);
  v_nuevo_saldo numeric(14,2);
  v_base_soles numeric(18,2);
  v_monto_soles numeric(18,2);
  v_monto_origen numeric(18,2);
  v_aplica boolean;
  v_cxp_nota_id text;
  v_tipo_cambio numeric;
  v_spot_creada boolean := false;
  v_spot_motivo text := 'sin_codigo';
  v_nd_base_soles numeric;
  v_nd_monto_soles numeric;
  v_nd_monto_origen numeric;
  v_nd_tipo_cambio numeric;
  v_nd_tipo_cambio_fuente text;
begin
  if v_origen_id is null or v_tipo not in ('nota_credito','nota_debito')
     or v_numero is null or v_motivo is null then
    raise exception 'DATOS_NOTA_INVALIDOS: CxP original, tipo, numero y motivo son obligatorios.';
  end if;
  if v_monto <= 0 then
    raise exception 'MONTO_NOTA_INVALIDO: el monto de la nota debe ser mayor que cero.';
  end if;

  select * into v_cxp from public.cxp where id = v_origen_id for update;
  if not found then raise exception 'La CxP original no existe.'; end if;
  v_empresa_id := v_cxp.empresa_id;
  if not public.usuario_tiene_empresa(v_empresa_id) then
    raise exception 'No tienes acceso al tenant de la CxP original.';
  end if;
  v_ver_finanzas := public.usuario_es_admin_empresa(v_empresa_id)
    or exists (
      select 1 from public.usuarios_empresas ue
      join public.permisos_roles pr on pr.rol_id = ue.rol_id
      where ue.user_id = auth.uid() and ue.empresa_id = v_empresa_id
        and ue.estado = 'activo' and pr.puede_ver_finanzas = true
    );
  if v_origen = 'devolucion_proveedor' then
    if not public.usuario_puede(v_empresa_id, 'recepciones', 'crear') then
      raise exception 'No tienes permiso recepciones.crear para registrar la NC desde una devolucion.';
    end if;
  elsif not (public.usuario_puede(v_empresa_id, 'cxp', 'editar') or v_ver_finanzas) then
    raise exception 'No tienes permiso cxp.editar o ver_finanzas para registrar la nota.';
  end if;
  if v_cxp.proveedor_id is null then raise exception 'La CxP original no tiene proveedor.'; end if;
  if lower(coalesce(v_cxp.estado, '')) in ('anulada','pagada','pago_parcial')
     or coalesce(v_cxp.monto_pagado, 0) <> 0
     or coalesce(v_cxp.saldo, 0) <= 0
     or exists (select 1 from public.cxp_pagos p where p.cxp_id = v_cxp.id)
     or exists (select 1 from public.detracciones d where d.cxp_id = v_cxp.id and d.direccion = 'compra' and d.estado = 'depositada') then
    raise exception 'Nota sobre CxP con pagos o depositada: fuera de alcance; regulariza con contabilidad.';
  end if;
  if v_tipo = 'nota_credito'
     and v_monto > round(coalesce(v_cxp.saldo, v_cxp.monto_total), 2) then
    raise exception 'MONTO_NOTA_EXCEDE_SALDO: la nota (%) no puede superar el saldo actual de la CxP (%).', v_monto, round(coalesce(v_cxp.saldo, v_cxp.monto_total), 2);
  end if;
  v_moneda := upper(coalesce(v_cxp.moneda, 'PEN'));
  if upper(coalesce(p_payload ->> 'moneda', v_moneda)) <> v_moneda then
    raise exception 'La moneda de la nota debe coincidir con la moneda de la CxP original.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_empresa_id || '|CXP_NOTA|' || v_cxp.id || '|' || v_numero));
  if exists (select 1 from public.cxp_notas_proveedor r where r.empresa_id = v_empresa_id and r.cxp_origen_id = v_cxp.id and r.tipo_nota = v_tipo and r.numero_nota = v_numero) then
    raise exception 'NOTA_DUPLICADA: ya existe una nota % vinculada a esta CxP.', v_numero;
  end if;

  v_nuevo_total := greatest(0, round(coalesce(v_cxp.monto_total, 0) - case when v_tipo = 'nota_credito' then v_monto else 0 end, 2));
  v_nuevo_saldo := greatest(0, round(coalesce(v_cxp.saldo, 0) - case when v_tipo = 'nota_credito' then v_monto else 0 end, 2));

  if v_tipo = 'nota_credito' then
    select d.* into v_detraccion
    from public.detracciones d
    where d.cxp_id = v_cxp.id and d.direccion = 'compra' and d.estado = 'pendiente'
    order by d.creado_en desc limit 1 for update;
    if found then
      select c.* into v_spot from public.spot_catalogo c where c.id = v_detraccion.spot_catalogo_id;
      if not found then raise exception 'No se encontro el catalogo SPOT de la obligacion pendiente.'; end if;
      if v_moneda = 'USD' then
        v_tipo_cambio := v_detraccion.tipo_cambio;
        if v_tipo_cambio is null or v_tipo_cambio <= 0 then raise exception 'La obligacion USD no tiene tipo de cambio guardado.'; end if;
        v_base_soles := round(v_nuevo_total * v_tipo_cambio, 2);
        v_monto_origen := round(v_nuevo_total * v_detraccion.porcentaje / 100, 2);
      else
        v_base_soles := round(v_nuevo_total, 2);
        v_monto_origen := round(v_base_soles * v_detraccion.porcentaje / 100, 0);
      end if;
      v_monto_soles := round(v_base_soles * v_detraccion.porcentaje / 100, 0);
      v_aplica := (v_spot.umbral_operador = '>' and v_base_soles > v_spot.monto_minimo)
        or (v_spot.umbral_operador = '>=' and v_base_soles >= v_spot.monto_minimo);
      if not v_aplica then
        update public.detracciones set base_soles = 0, monto_detraccion_soles = 0, monto_detraccion_origen = 0, estado = 'anulada', actualizado_en = now() where id = v_detraccion.id;
      else
        update public.detracciones set base_soles = v_base_soles, monto_detraccion_soles = v_monto_soles, monto_detraccion_origen = v_monto_origen, actualizado_en = now() where id = v_detraccion.id;
      end if;
    end if;
  end if;

  if v_tipo = 'nota_debito' and (p_payload ? 'codigo_spot' or p_payload ? 'spot_catalogo_id') then
    if v_spot_id is not null then
      select c.* into v_spot
      from public.spot_catalogo c
      where c.id = v_spot_id and c.estado = 'activo'
        and c.vigencia_desde <= v_fecha
        and (c.vigencia_hasta is null or c.vigencia_hasta >= v_fecha);
    else
      select c.* into v_spot
      from public.spot_catalogo c
      where c.codigo = v_codigo and c.estado = 'activo'
        and c.vigencia_desde <= v_fecha
        and (c.vigencia_hasta is null or c.vigencia_hasta >= v_fecha)
      order by c.vigencia_desde desc limit 1;
    end if;
    if not found then
      raise exception 'El codigo SPOT % no tiene una version vigente para la fecha de la nota.', v_codigo;
    end if;
    if v_porcentaje_payload is not null
       and abs(v_porcentaje_payload - v_spot.porcentaje) > 0.0001 then
      raise exception 'El porcentaje informado no coincide con el porcentaje vigente del catalogo.';
    end if;
    if v_moneda = 'USD' then
      v_nd_tipo_cambio := nullif(btrim(coalesce(p_payload ->> 'tipo_cambio_detraccion', '')), '')::numeric;
      v_nd_tipo_cambio_fuente := nullif(lower(btrim(coalesce(p_payload ->> 'tipo_cambio_fuente', ''))), '');
      if v_nd_tipo_cambio is null or v_nd_tipo_cambio <= 0
         or v_nd_tipo_cambio_fuente not in ('manual', 'referencial') then
        raise exception 'Para una ND USD con SPOT debes informar tipo de cambio y fuente validos.';
      end if;
      v_nd_base_soles := round(v_monto * v_nd_tipo_cambio, 2);
      v_nd_monto_origen := round(v_monto * v_spot.porcentaje / 100, 2);
    else
      v_nd_base_soles := round(v_monto, 2);
      v_nd_tipo_cambio := null;
      v_nd_tipo_cambio_fuente := null;
      v_nd_monto_origen := round(v_nd_base_soles * v_spot.porcentaje / 100, 0);
    end if;
    v_nd_monto_soles := round(v_nd_base_soles * v_spot.porcentaje / 100, 0);
    if not ((v_spot.umbral_operador = '>' and v_nd_base_soles > v_spot.monto_minimo)
       or (v_spot.umbral_operador = '>=' and v_nd_base_soles >= v_spot.monto_minimo)) then
      v_spot_motivo := 'bajo_umbral';
    else
      v_spot_creada := true;
      v_spot_motivo := 'creada';
    end if;
  end if;

  if v_tipo = 'nota_debito' then
    v_cxp_nota_id := 'cxp_nd_' || substr(md5(v_empresa_id || '|' || v_numero || '|' || clock_timestamp()::text), 1, 24);
    insert into public.cxp (
      id, empresa_id, sociedad_id, proveedor_id, factura_numero, fecha_emision, fecha_vencimiento,
      monto_total, monto_pagado, saldo, moneda, estado, tipo_beneficiario, tipo_comprobante, origen,
      concepto, created_at, updated_at
    ) values (
      v_cxp_nota_id, v_cxp.empresa_id, v_cxp.sociedad_id, v_cxp.proveedor_id, v_numero, v_fecha,
      coalesce(nullif(p_payload ->> 'fecha_vencimiento', '')::date, v_fecha), v_monto, 0, v_monto, v_moneda,
      'por_pagar', 'proveedor', 'Nota de débito', 'nota_proveedor',
      coalesce(nullif(btrim(p_payload ->> 'concepto'), ''), 'Nota de débito de proveedor ' || v_numero), now(), now()
    ) returning * into v_cxp_nota;
  end if;

  insert into public.cxp_notas_proveedor (
    empresa_id, sociedad_id, cxp_origen_id, cxp_nota_id, devolucion_id, tipo_nota,
    numero_nota, fecha_nota, monto_aplicado, moneda, motivo, archivo_url, creado_por
  ) values (
    v_empresa_id, v_cxp.sociedad_id, v_cxp.id, v_cxp_nota_id,
    nullif(btrim(p_payload ->> 'devolucion_id'), '')::text, v_tipo, v_numero, v_fecha,
    v_monto, v_moneda, v_motivo, v_archivo, auth.uid()::text
  ) returning * into v_rel;

  if v_tipo = 'nota_credito' then
    update public.cxp set
      monto_total = v_nuevo_total,
      saldo = v_nuevo_saldo,
      monto_pagado = 0,
      estado = case when v_nuevo_saldo = 0 then 'anulada' else v_cxp.estado end,
      motivo_anulacion = case when v_nuevo_saldo = 0 then 'Cancelada por nota de crédito ' || v_numero else v_cxp.motivo_anulacion end,
      anulado_por = case when v_nuevo_saldo = 0 then auth.uid()::text else v_cxp.anulado_por end,
      anulado_en = case when v_nuevo_saldo = 0 then now() else v_cxp.anulado_en end,
      updated_at = now()
    where id = v_cxp.id;
  end if;

  if v_tipo = 'nota_debito' and v_spot_creada then
    insert into public.detracciones (
      direccion, cxp_id, empresa_id, sociedad_id, spot_catalogo_id, codigo_spot, porcentaje,
      base_soles, monto_detraccion_soles, monto_detraccion_origen, moneda_origen,
      tipo_cambio, tipo_cambio_fuente, origen, estado
    ) select 'compra', v_cxp_nota.id, v_cxp_nota.empresa_id, v_cxp_nota.sociedad_id,
      (calculo ->> 'spot_catalogo_id')::uuid, calculo ->> 'codigo_spot', (calculo ->> 'porcentaje')::numeric,
      (calculo ->> 'base_soles')::numeric, (calculo ->> 'monto_detraccion_soles')::numeric,
      (calculo ->> 'monto_detraccion_origen')::numeric, calculo ->> 'moneda_origen',
      nullif(calculo ->> 'tipo_cambio', '')::numeric, nullif(calculo ->> 'tipo_cambio_fuente', ''),
      'registro_compra', 'pendiente'
    from (select public.calcular_detraccion_compra(v_cxp_nota_id, p_payload) calculo) x;
  end if;

  if v_tipo = 'nota_credito' and nullif(btrim(p_payload ->> 'devolucion_id'), '') is not null then
    update public.devoluciones_proveedor
    set estado = 'nota_credito_recibida', actualizado_en = now()
    where id = nullif(btrim(p_payload ->> 'devolucion_id'), '') and empresa_id = v_empresa_id;
  end if;

  select * into v_cxp from public.cxp where id = v_cxp.id;
  return jsonb_build_object(
    'cxp', to_jsonb(v_cxp),
    'cxp_nota', case when v_cxp_nota_id is null then null else to_jsonb(v_cxp_nota) end,
    'relacion', to_jsonb(v_rel),
    'spot_creada', v_spot_creada,
    'spot_motivo', v_spot_motivo
  );
end;
$function$;

revoke all on function public.registrar_nota_proveedor_spot(jsonb) from public, anon, authenticated;
grant execute on function public.registrar_nota_proveedor_spot(jsonb) to authenticated;

do $variables$
declare
  v_def text;
  v_declare text;
  v_name text;
  v_required text[] := array[
    'v_origen_id','v_tipo','v_numero','v_fecha','v_monto','v_codigo','v_spot_id',
    'v_porcentaje_payload','v_moneda','v_motivo','v_archivo','v_origen','v_empresa_id',
    'v_ver_finanzas','v_cxp','v_cxp_nota','v_rel','v_detraccion','v_spot',
    'v_nuevo_total','v_nuevo_saldo','v_base_soles','v_monto_soles','v_monto_origen',
    'v_aplica','v_cxp_nota_id','v_tipo_cambio','v_spot_creada','v_spot_motivo',
    'v_nd_base_soles','v_nd_monto_soles','v_nd_monto_origen','v_nd_tipo_cambio',
    'v_nd_tipo_cambio_fuente'
  ];
begin
  select pg_get_functiondef('public.registrar_nota_proveedor_spot(jsonb)'::regprocedure)
    into v_def;
  v_declare := split_part(split_part(lower(v_def), 'declare', 2), 'begin', 1);
  foreach v_name in array v_required loop
    if position(lower(v_name) in v_declare) = 0 then
      raise exception 'B3C_VALIDACION|variable_no_declarada=%', v_name;
    end if;
  end loop;
  raise notice 'B3C_VALIDACION|variables_declaradas=ok|cantidad=%', cardinality(v_required);
end;
$variables$;

do $validate$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.cxp_notas_proveedor'::regclass and tgname = 'cxp_notas_proveedor_tenant_trg') then
    raise exception 'B3C_VALIDACION|trigger_tenant_ausente';
  end if;
  if not has_function_privilege('authenticated', 'public.registrar_nota_proveedor_spot(jsonb)', 'EXECUTE') then
    raise exception 'B3C_VALIDACION|grant_authenticated_ausente';
  end if;
  if has_function_privilege('anon', 'public.registrar_nota_proveedor_spot(jsonb)', 'EXECUTE') then
    raise exception 'B3C_VALIDACION|anon_tiene_execute';
  end if;
  raise notice 'B3C_VALIDACION|tabla=ok|trigger_tenant=ok|rls=ok|rpc=ok|grant=ok';
end;
$validate$;

select pg_notify('pgrst', 'reload schema');
