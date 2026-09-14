-- 529 · Seguimiento comercial y aceptación de Cotización Especial.
-- El snapshot emitido permanece inmutable: sólo se habilitan transiciones de
-- estado y metadatos de envío/aceptación/anulación expresamente permitidos.

begin;

alter table public.cotizaciones_especiales
  drop constraint if exists cotizaciones_especiales_estado_check,
  add constraint cotizaciones_especiales_estado_check
    check (estado in ('borrador', 'emitido', 'enviada', 'aceptada', 'anulado')),
  add column if not exists enviada_at timestamptz,
  add column if not exists enviada_by uuid,
  add column if not exists token_aceptacion text unique,
  add column if not exists token_activo boolean not null default false,
  add column if not exists aceptacion_tipo text,
  add column if not exists aceptacion_canal text,
  add column if not exists aceptacion_nombre text,
  add column if not exists aceptacion_dni text,
  add column if not exists aceptacion_fecha timestamptz,
  add column if not exists aceptacion_ip text,
  add column if not exists aceptacion_registrada_at timestamptz,
  add column if not exists aceptacion_registrada_por uuid,
  add column if not exists aceptacion_notas text,
  add constraint cotizaciones_especiales_aceptacion_tipo_check
    check (aceptacion_tipo is null or aceptacion_tipo in ('digital', 'manual'));

create index if not exists cotizaciones_especiales_token_aceptacion_idx
  on public.cotizaciones_especiales (token_aceptacion)
  where token_aceptacion is not null;

create or replace function public.proteger_inmutabilidad_cotizacion_especial()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_permitidas text[];
begin
  if old.estado = 'anulado' then
    raise exception 'Una Cotización Especial anulada es inmutable.' using errcode = '55000';
  end if;

  -- El borrador conserva su comportamiento actual: puede modificarse hasta emitir.
  if old.estado = 'borrador' then
    return new;
  end if;

  if old.estado = 'emitido' and new.estado = 'enviada' then
    v_permitidas := array['estado', 'enviada_at', 'enviada_by', 'token_aceptacion', 'token_activo', 'updated_at'];
  elsif old.estado = 'enviada' and new.estado = 'aceptada' then
    v_permitidas := array[
      'estado', 'token_activo', 'aceptacion_tipo', 'aceptacion_canal',
      'aceptacion_nombre', 'aceptacion_dni', 'aceptacion_fecha', 'aceptacion_ip',
      'aceptacion_registrada_at', 'aceptacion_registrada_por', 'aceptacion_notas', 'updated_at'
    ];
  elsif old.estado in ('emitido', 'enviada', 'aceptada') and new.estado = 'anulado' then
    v_permitidas := array['estado', 'anulada_at', 'anulada_by', 'updated_at'];
  else
    raise exception 'Transición no permitida para una Cotización Especial emitida: % -> %.', old.estado, new.estado
      using errcode = '55000';
  end if;

  if (to_jsonb(new) - v_permitidas) is distinct from (to_jsonb(old) - v_permitidas) then
    raise exception 'El snapshot de una Cotización Especial emitida no puede modificarse durante su seguimiento comercial.'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create or replace function public.enviar_cotizacion_especial(p_id uuid)
returns table(id uuid, numero text, estado text, token_aceptacion text, enviada_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_cotizacion public.cotizaciones_especiales%rowtype;
  v_alcance uuid[];
  v_ahora timestamptz := now();
  v_token text := gen_random_uuid()::text;
begin
  if v_usuario_id is null then
    raise exception 'Debe iniciar sesión para enviar una Cotización Especial.' using errcode = '42501';
  end if;

  select * into v_cotizacion
  from public.cotizaciones_especiales
  where cotizaciones_especiales.id = p_id
  for update;

  if not found then
    raise exception 'La Cotización Especial no existe.' using errcode = 'P0002';
  end if;
  if v_cotizacion.estado <> 'emitido' then
    raise exception 'Sólo se puede enviar una Cotización Especial emitida.' using errcode = '22023';
  end if;
  if not public.usuario_tiene_empresa(v_cotizacion.empresa_id)
     or not public.usuario_puede(v_cotizacion.empresa_id, 'cotizaciones', 'editar') then
    raise exception 'No tiene permiso para enviar esta Cotización Especial.' using errcode = '42501';
  end if;
  v_alcance := public.usuario_alcance_sociedades(v_cotizacion.empresa_id);
  if v_alcance is not null and not coalesce(v_cotizacion.sociedad_id = any(v_alcance), false) then
    raise exception 'No tiene alcance sobre la sociedad de esta Cotización Especial.' using errcode = '42501';
  end if;

  update public.cotizaciones_especiales
  set estado = 'enviada',
      enviada_at = v_ahora,
      enviada_by = v_usuario_id,
      token_aceptacion = v_token,
      token_activo = true,
      updated_at = v_ahora
  where cotizaciones_especiales.id = p_id;

  id := v_cotizacion.id;
  numero := v_cotizacion.numero;
  estado := 'enviada';
  token_aceptacion := v_token;
  enviada_at := v_ahora;
  return next;
end;
$$;

create or replace function public.registrar_aceptacion_manual_cotizacion_especial(
  p_id uuid,
  p_nombre text,
  p_dni text,
  p_fecha date,
  p_canal text,
  p_notas text default null
)
returns table(id uuid, numero text, estado text, aceptacion_fecha timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_cotizacion public.cotizaciones_especiales%rowtype;
  v_alcance uuid[];
  v_ahora timestamptz := now();
begin
  if v_usuario_id is null then
    raise exception 'Debe iniciar sesión para registrar una aceptación manual.' using errcode = '42501';
  end if;
  if nullif(btrim(p_nombre), '') is null or p_fecha is null or nullif(btrim(p_canal), '') is null then
    raise exception 'Nombre, fecha y canal de aceptación son obligatorios.' using errcode = '22023';
  end if;

  select * into v_cotizacion
  from public.cotizaciones_especiales
  where cotizaciones_especiales.id = p_id
  for update;

  if not found then
    raise exception 'La Cotización Especial no existe.' using errcode = 'P0002';
  end if;
  if v_cotizacion.estado <> 'enviada' then
    raise exception 'Sólo se puede aceptar manualmente una Cotización Especial enviada.' using errcode = '22023';
  end if;
  if not public.usuario_tiene_empresa(v_cotizacion.empresa_id)
     or not public.usuario_puede(v_cotizacion.empresa_id, 'cotizaciones', 'editar') then
    raise exception 'No tiene permiso para registrar esta aceptación.' using errcode = '42501';
  end if;
  v_alcance := public.usuario_alcance_sociedades(v_cotizacion.empresa_id);
  if v_alcance is not null and not coalesce(v_cotizacion.sociedad_id = any(v_alcance), false) then
    raise exception 'No tiene alcance sobre la sociedad de esta Cotización Especial.' using errcode = '42501';
  end if;

  update public.cotizaciones_especiales
  set estado = 'aceptada',
      token_activo = false,
      aceptacion_tipo = 'manual',
      aceptacion_canal = btrim(p_canal),
      aceptacion_nombre = btrim(p_nombre),
      aceptacion_dni = nullif(btrim(p_dni), ''),
      aceptacion_fecha = p_fecha::timestamptz,
      aceptacion_registrada_at = v_ahora,
      aceptacion_registrada_por = v_usuario_id,
      aceptacion_notas = nullif(btrim(p_notas), ''),
      updated_at = v_ahora
  where cotizaciones_especiales.id = p_id;

  if v_cotizacion.oportunidad_id is not null then
    update public.oportunidades
    set estado = 'ganada', fecha_cierre_real = current_date
    where id = v_cotizacion.oportunidad_id;
  end if;

  id := v_cotizacion.id;
  numero := v_cotizacion.numero;
  estado := 'aceptada';
  aceptacion_fecha := p_fecha::timestamptz;
  return next;
end;
$$;

create or replace function public.get_cotizacion_especial_publica(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cot public.cotizaciones_especiales%rowtype;
  v_cfg public.empresa_config%rowtype;
  v_cta public.cuentas%rowtype;
begin
  select * into v_cot
  from public.cotizaciones_especiales
  where token_aceptacion = p_token
  limit 1;

  if not found or v_cot.estado = 'anulado' then
    return jsonb_build_object('status', 'token_invalido');
  end if;
  if v_cot.estado = 'aceptada' or v_cot.aceptacion_fecha is not null then
    return jsonb_build_object(
      'status', 'ya_aceptada',
      'aceptacion_fecha', v_cot.aceptacion_fecha,
      'aceptacion_nombre', v_cot.aceptacion_nombre
    );
  end if;
  if v_cot.estado <> 'enviada' or not v_cot.token_activo then
    return jsonb_build_object('status', 'token_invalido');
  end if;

  select * into v_cfg from public.empresa_config where empresa_id = v_cot.empresa_id limit 1;
  select * into v_cta from public.cuentas where id = v_cot.cuenta_id limit 1;
  return jsonb_build_object('status', 'ok', 'cot', to_jsonb(v_cot), 'cfg', to_jsonb(v_cfg), 'cuenta', to_jsonb(v_cta));
end;
$$;

create or replace function public.registrar_aceptacion_cotizacion_especial(
  p_token text,
  p_nombre text,
  p_dni text,
  p_ip text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cot public.cotizaciones_especiales%rowtype;
  v_ahora timestamptz := now();
begin
  if nullif(btrim(p_nombre), '') is null or nullif(btrim(p_dni), '') is null then
    return jsonb_build_object('ok', false, 'error', 'campos_incompletos');
  end if;

  select * into v_cot
  from public.cotizaciones_especiales
  where token_aceptacion = p_token
  for update;

  if not found or v_cot.estado = 'anulado' then
    return jsonb_build_object('ok', false, 'error', 'token_invalido_o_inactivo');
  end if;
  if v_cot.estado = 'aceptada' or v_cot.aceptacion_fecha is not null then
    return jsonb_build_object('ok', false, 'error', 'ya_aceptada');
  end if;
  if v_cot.estado <> 'enviada' or not v_cot.token_activo then
    return jsonb_build_object('ok', false, 'error', 'token_invalido_o_inactivo');
  end if;

  update public.cotizaciones_especiales
  set estado = 'aceptada',
      token_activo = false,
      aceptacion_tipo = 'digital',
      aceptacion_canal = 'link_publico',
      aceptacion_nombre = btrim(p_nombre),
      aceptacion_dni = btrim(p_dni),
      aceptacion_fecha = v_ahora,
      aceptacion_ip = nullif(btrim(p_ip), ''),
      aceptacion_registrada_at = v_ahora,
      updated_at = v_ahora
  where id = v_cot.id;

  if v_cot.oportunidad_id is not null then
    update public.oportunidades
    set estado = 'ganada', fecha_cierre_real = current_date
    where id = v_cot.oportunidad_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'cotizacion_id', v_cot.id,
    'numero', v_cot.numero,
    'empresa_id', v_cot.empresa_id,
    'oportunidad_id', v_cot.oportunidad_id
  );
end;
$$;

revoke all on function public.enviar_cotizacion_especial(uuid) from public, anon, service_role;
revoke all on function public.registrar_aceptacion_manual_cotizacion_especial(uuid, text, text, date, text, text) from public, anon, service_role;
revoke all on function public.get_cotizacion_especial_publica(text) from public, service_role;
revoke all on function public.registrar_aceptacion_cotizacion_especial(text, text, text, text) from public, service_role;

grant execute on function public.enviar_cotizacion_especial(uuid) to authenticated;
grant execute on function public.registrar_aceptacion_manual_cotizacion_especial(uuid, text, text, date, text, text) to authenticated;
grant execute on function public.get_cotizacion_especial_publica(text) to anon, authenticated;
grant execute on function public.registrar_aceptacion_cotizacion_especial(text, text, text, text) to anon, authenticated;

select pg_notify('pgrst', 'reload schema');

commit;
