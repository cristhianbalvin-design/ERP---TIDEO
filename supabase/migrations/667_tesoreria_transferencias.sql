-- Transferencias y cambio de moneda entre cuentas bancarias propias.
-- Una transferencia genera dos movimientos_tesoreria (egreso en origen e ingreso
-- en destino), cada uno en la moneda de su cuenta, enlazados por
-- vinculo_tipo = 'transferencia_cuenta' y vinculo_id = id de la transferencia.
-- No es ingreso ni gasto: la diferencia de cambio se guarda como referencia y
-- no se lleva al Estado de Resultados.

create table if not exists public.tesoreria_transferencias (
  id text primary key,
  empresa_id text not null,
  sociedad_id uuid,
  fecha date not null,
  cuenta_origen_id text not null references public.cuentas_bancarias(id),
  cuenta_destino_id text not null references public.cuentas_bancarias(id),
  moneda_origen text not null,
  monto_origen numeric(14,2) not null check (monto_origen > 0),
  moneda_destino text not null,
  monto_destino numeric(14,2) not null check (monto_destino > 0),
  tipo_cambio numeric(14,6),
  tc_referencia numeric(14,6),
  diferencia_cambio_pen numeric(14,2),
  referencia text,
  descripcion text,
  estado text not null default 'registrada',
  creado_por text,
  creado_en timestamptz not null default now(),
  constraint tesoreria_transferencias_cuentas_distintas check (cuenta_origen_id <> cuenta_destino_id)
);

comment on table public.tesoreria_transferencias is 'Transferencias entre cuentas propias (misma o distinta moneda). Se registran solo con registrar_transferencia_tesoreria.';
comment on column public.tesoreria_transferencias.tipo_cambio is 'Soles por unidad de la moneda extranjera aplicados en la operación (null si misma moneda).';
comment on column public.tesoreria_transferencias.tc_referencia is 'Soles por unidad de moneda extranjera según tipo_cambio_historico a la fecha.';
comment on column public.tesoreria_transferencias.diferencia_cambio_pen is 'Valor en soles recibido menos entregado, a tc_referencia. Referencial; no va al Estado de Resultados.';

create index if not exists tesoreria_transferencias_empresa_fecha_idx on public.tesoreria_transferencias (empresa_id, fecha);

alter table public.tesoreria_transferencias enable row level security;
drop policy if exists tesoreria_transferencias_select on public.tesoreria_transferencias;
create policy tesoreria_transferencias_select on public.tesoreria_transferencias
  for select to authenticated
  using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'tesoreria', 'ver'));
revoke all on public.tesoreria_transferencias from anon;
grant select on public.tesoreria_transferencias to authenticated;

create or replace function public.registrar_transferencia_tesoreria(p_payload jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_origen public.cuentas_bancarias%rowtype;
  v_destino public.cuentas_bancarias%rowtype;
  v_origen_id text := nullif(btrim(p_payload ->> 'cuenta_origen_id'), '');
  v_destino_id text := nullif(btrim(p_payload ->> 'cuenta_destino_id'), '');
  v_empresa_payload text := nullif(btrim(p_payload ->> 'empresa_id'), '');
  v_fecha date := coalesce(nullif(p_payload ->> 'fecha', '')::date, (now() at time zone 'America/Lima')::date);
  v_monto_origen numeric(14,2) := round(coalesce(nullif(p_payload ->> 'monto_origen', '')::numeric, 0), 2);
  v_tc numeric(14,6) := nullif(p_payload ->> 'tipo_cambio', '')::numeric;
  v_referencia text := nullif(btrim(p_payload ->> 'referencia'), '');
  v_descripcion text := nullif(btrim(p_payload ->> 'descripcion'), '');
  v_mon_o text;
  v_mon_d text;
  v_monto_destino numeric(14,2);
  v_tc_ref numeric(14,6);
  v_tasa numeric;
  v_dif numeric(14,2);
  v_alcance uuid[];
  v_id text := 'trf_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  v_mov_egreso text := 'tes_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  v_mov_ingreso text := 'tes_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
begin
  if auth.uid() is null then
    raise exception 'NO_AUTENTICADO: Sesión no autenticada.';
  end if;
  if v_origen_id is null or v_destino_id is null then
    raise exception 'CUENTAS_REQUERIDAS: Seleccione la cuenta de origen y la de destino.';
  end if;
  if v_origen_id = v_destino_id then
    raise exception 'CUENTAS_IGUALES: La cuenta de origen y la de destino deben ser distintas.';
  end if;
  if v_monto_origen <= 0 then
    raise exception 'MONTO_INVALIDO: El monto a transferir debe ser mayor a cero.';
  end if;

  select * into v_origen from public.cuentas_bancarias where id = v_origen_id for update;
  if not found then
    raise exception 'CUENTA_NO_ENCONTRADA: La cuenta de origen no existe.';
  end if;
  select * into v_destino from public.cuentas_bancarias where id = v_destino_id for update;
  if not found then
    raise exception 'CUENTA_NO_ENCONTRADA: La cuenta de destino no existe.';
  end if;

  if v_origen.empresa_id is distinct from v_destino.empresa_id
     or (v_empresa_payload is not null and v_empresa_payload <> v_origen.empresa_id) then
    raise exception 'EMPRESA_NO_COINCIDE: Las cuentas deben pertenecer a la misma empresa.';
  end if;
  if not public.usuario_tiene_empresa(v_origen.empresa_id)
     or not public.usuario_puede(v_origen.empresa_id, 'tesoreria', 'crear') then
    raise exception 'PERMISO_DENEGADO: No tiene permisos para registrar movimientos de Tesorería.';
  end if;
  if lower(coalesce(v_origen.estado, '')) <> 'activo' or lower(coalesce(v_destino.estado, '')) <> 'activo' then
    raise exception 'CUENTA_INACTIVA: Ambas cuentas deben estar activas.';
  end if;
  if coalesce(v_origen.es_cuenta_detracciones, false) or coalesce(v_destino.es_cuenta_detracciones, false) then
    raise exception 'CUENTA_DETRACCIONES: Las cuentas de detracciones no admiten transferencias entre cuentas propias.';
  end if;
  if v_origen.sociedad_id is distinct from v_destino.sociedad_id then
    raise exception 'SOCIEDAD_DISTINTA: Las cuentas pertenecen a sociedades distintas; eso no es una transferencia interna.';
  end if;
  v_alcance := public.usuario_alcance_sociedades(v_origen.empresa_id);
  if v_alcance is not null and v_origen.sociedad_id is not null and not (v_origen.sociedad_id = any(v_alcance)) then
    raise exception 'ALCANCE_DENEGADO: Las cuentas están fuera del alcance societario del usuario.';
  end if;

  v_mon_o := upper(coalesce(nullif(v_origen.moneda, ''), 'PEN'));
  v_mon_d := upper(coalesce(nullif(v_destino.moneda, ''), 'PEN'));

  if v_mon_o = v_mon_d then
    v_monto_destino := v_monto_origen;
    v_tc := null;
  else
    if v_mon_o <> 'PEN' and v_mon_d <> 'PEN' then
      raise exception 'CONVERSION_NO_SOPORTADA: No se puede convertir directamente de % a %.', v_mon_o, v_mon_d;
    end if;
    if v_tc is null or v_tc <= 0 then
      raise exception 'TIPO_CAMBIO_REQUERIDO: Indique el tipo de cambio (soles por %).', case when v_mon_o = 'PEN' then v_mon_d else v_mon_o end;
    end if;
    v_monto_destino := case when v_mon_o = 'PEN' then round(v_monto_origen / v_tc, 2) else round(v_monto_origen * v_tc, 2) end;
    if v_monto_destino <= 0 then
      raise exception 'MONTO_INVALIDO: El monto recibido debe ser mayor a cero.';
    end if;

    select case when (case when v_mon_o = 'PEN' then v_mon_d else v_mon_o end) = 'USD' then h.usd else h.eur end
      into v_tasa
    from public.tipo_cambio_historico h
    where h.moneda_base = 'PEN' and h.fecha <= v_fecha
    order by h.fecha desc
    limit 1;
    if v_tasa is not null and v_tasa > 0 then
      v_tc_ref := round(1 / v_tasa, 6);
      v_dif := case when v_mon_o = 'PEN'
                    then round(v_monto_destino * v_tc_ref - v_monto_origen, 2)
                    else round(v_monto_destino - v_monto_origen * v_tc_ref, 2) end;
    end if;
  end if;

  insert into public.tesoreria_transferencias (
    id, empresa_id, sociedad_id, fecha, cuenta_origen_id, cuenta_destino_id,
    moneda_origen, monto_origen, moneda_destino, monto_destino,
    tipo_cambio, tc_referencia, diferencia_cambio_pen, referencia, descripcion, creado_por
  ) values (
    v_id, v_origen.empresa_id, v_origen.sociedad_id, v_fecha, v_origen.id, v_destino.id,
    v_mon_o, v_monto_origen, v_mon_d, v_monto_destino,
    v_tc, v_tc_ref, v_dif, v_referencia, v_descripcion, auth.uid()::text
  );

  insert into public.movimientos_tesoreria (
    id, empresa_id, tipo, descripcion, monto, moneda, fecha, cuenta_bancaria, cuenta_bancaria_id,
    referencia, vinculo_tipo, vinculo_id, estado, categoria, es_manual, tc_aplicado, monto_en_moneda_cuenta
  ) values
  (v_mov_egreso, v_origen.empresa_id, 'egreso',
   coalesce(v_descripcion, 'Transferencia a ' || coalesce(v_destino.nombre, v_destino.id)),
   v_monto_origen, v_mon_o, v_fecha, v_origen.nombre, v_origen.id,
   v_referencia, 'transferencia_cuenta', v_id, 'registrado', 'transferencia', true, coalesce(v_tc, 1), v_monto_origen),
  (v_mov_ingreso, v_origen.empresa_id, 'ingreso',
   coalesce(v_descripcion, 'Transferencia desde ' || coalesce(v_origen.nombre, v_origen.id)),
   v_monto_destino, v_mon_d, v_fecha, v_destino.nombre, v_destino.id,
   v_referencia, 'transferencia_cuenta', v_id, 'registrado', 'transferencia', true, coalesce(v_tc, 1), v_monto_destino);

  return jsonb_build_object(
    'id', v_id,
    'moneda_origen', v_mon_o, 'monto_origen', v_monto_origen,
    'moneda_destino', v_mon_d, 'monto_destino', v_monto_destino,
    'tipo_cambio', v_tc, 'tc_referencia', v_tc_ref, 'diferencia_cambio_pen', v_dif,
    'movimiento_egreso_id', v_mov_egreso, 'movimiento_ingreso_id', v_mov_ingreso
  );
end;
$function$;

revoke all on function public.registrar_transferencia_tesoreria(jsonb) from public, anon;
grant execute on function public.registrar_transferencia_tesoreria(jsonb) to authenticated;

-- Aria: los movimientos de transferencia entre cuentas propias no son
-- ingresos ni egresos del mes.
do $$
declare
  v_def text := pg_get_functiondef('public.asistente_resumen_tesoreria(text,uuid,text)'::regprocedure);
  v_old text := 'WHERE mv.empresa_id=p_empresa_id AND mv.estado IS DISTINCT FROM ''anulado'' AND mv.fecha>=mes_ini';
  v_new text := 'WHERE mv.empresa_id=p_empresa_id AND mv.estado IS DISTINCT FROM ''anulado'' AND coalesce(mv.vinculo_tipo,'''') <> ''transferencia_cuenta'' AND mv.fecha>=mes_ini';
begin
  if md5(v_def) <> 'ff50124b60e659551fedaf75a74b4ad2' then
    raise exception 'asistente_resumen_tesoreria cambió respecto de la versión revisada; abortando';
  end if;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'El fragmento a reemplazar en asistente_resumen_tesoreria no aparece exactamente una vez';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

do $$
begin
  if to_regclass('public.tesoreria_transferencias') is null then
    raise exception 'No se creó tesoreria_transferencias';
  end if;
  if not exists (select 1 from pg_class where oid = 'public.tesoreria_transferencias'::regclass and relrowsecurity) then
    raise exception 'tesoreria_transferencias sin RLS';
  end if;
  if to_regprocedure('public.registrar_transferencia_tesoreria(jsonb)') is null then
    raise exception 'No se creó registrar_transferencia_tesoreria';
  end if;
  if position('transferencia_cuenta' in pg_get_functiondef('public.asistente_resumen_tesoreria(text,uuid,text)'::regprocedure)) = 0 then
    raise exception 'asistente_resumen_tesoreria no quedó excluyendo transferencias';
  end if;
end $$;
