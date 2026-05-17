-- 084 — Tokens de aceptación digital + colores de marca
-- Añade campos para el flujo QR: token por versión, registro de aceptación del cliente,
-- y colores primario/secundario en empresa_config para PDF y documentos.

alter table public.cotizaciones
  add column if not exists token_aceptacion  text unique,
  add column if not exists token_activo      boolean default true,
  add column if not exists aceptacion_nombre text,
  add column if not exists aceptacion_dni    text,
  add column if not exists aceptacion_fecha  timestamptz,
  add column if not exists aceptacion_ip     text;

alter table public.empresa_config
  add column if not exists color_primario   text default '#1A2B4A',
  add column if not exists color_secundario text default '#607D8B';

-- RPC pública: devuelve cotización + config + cuenta dado un token activo
create or replace function public.get_cotizacion_publica(p_token text)
returns jsonb language plpgsql security definer as $$
declare
  v_cot  public.cotizaciones%rowtype;
  v_cfg  public.empresa_config%rowtype;
  v_cta  public.cuentas%rowtype;
begin
  select * into v_cot from public.cotizaciones
    where token_aceptacion = p_token limit 1;

  if not found then
    return jsonb_build_object('status', 'token_invalido');
  end if;

  if v_cot.aceptacion_fecha is not null then
    return jsonb_build_object(
      'status',             'ya_aceptada',
      'aceptacion_fecha',   v_cot.aceptacion_fecha,
      'aceptacion_nombre',  v_cot.aceptacion_nombre
    );
  end if;

  if not v_cot.token_activo then
    return jsonb_build_object('status', 'token_invalido');
  end if;

  select * into v_cfg from public.empresa_config where empresa_id = v_cot.empresa_id limit 1;
  if v_cot.cuenta_id is not null then
    select * into v_cta from public.cuentas where id = v_cot.cuenta_id limit 1;
  end if;

  return jsonb_build_object(
    'status',  'ok',
    'cot',     to_jsonb(v_cot),
    'cfg',     to_jsonb(v_cfg),
    'cuenta',  to_jsonb(v_cta)
  );
end;
$$;

grant execute on function public.get_cotizacion_publica(text) to anon, authenticated;

-- RPC pública: registra la aceptación y actualiza oportunidad
create or replace function public.registrar_aceptacion_cotizacion(
  p_token  text,
  p_nombre text,
  p_dni    text,
  p_ip     text
) returns jsonb language plpgsql security definer as $$
declare
  v_cot public.cotizaciones%rowtype;
begin
  select * into v_cot from public.cotizaciones
    where token_aceptacion = p_token and token_activo = true limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'token_invalido_o_inactivo');
  end if;

  if v_cot.aceptacion_fecha is not null then
    return jsonb_build_object('ok', false, 'error', 'ya_aceptada');
  end if;

  update public.cotizaciones set
    estado            = 'aprobada',
    token_activo      = false,
    aceptacion_nombre = p_nombre,
    aceptacion_dni    = p_dni,
    aceptacion_fecha  = now(),
    aceptacion_ip     = p_ip
  where id = v_cot.id;

  if v_cot.oportunidad_id is not null then
    update public.oportunidades set
      estado            = 'ganada',
      fecha_cierre_real = current_date
    where id = v_cot.oportunidad_id;
  end if;

  return jsonb_build_object(
    'ok',             true,
    'cotizacion_id',  v_cot.id,
    'numero',         v_cot.numero,
    'empresa_id',     v_cot.empresa_id,
    'oportunidad_id', v_cot.oportunidad_id
  );
end;
$$;

grant execute on function public.registrar_aceptacion_cotizacion(text, text, text, text) to anon, authenticated;

select pg_notify('pgrst', 'reload schema');
