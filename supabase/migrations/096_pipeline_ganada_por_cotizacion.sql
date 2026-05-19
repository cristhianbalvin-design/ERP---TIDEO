-- 096 — Pipeline ganado solo por aprobacion de cotizacion
-- Alinea el link publico con el flujo comercial completo y corrige la etapa
-- transitoria "cierre" generada anteriormente desde mobile.

create or replace function public.registrar_aceptacion_cotizacion(
  p_token  text,
  p_nombre text,
  p_dni    text,
  p_ip     text
) returns jsonb language plpgsql security definer as $$
declare
  v_cot public.cotizaciones%rowtype;
  v_monto numeric;
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
    estado                    = 'aprobada',
    token_activo              = false,
    aceptacion_nombre         = p_nombre,
    aceptacion_dni            = p_dni,
    aceptacion_fecha          = now(),
    aceptacion_ip             = p_ip,
    aprobacion_tipo           = 'digital',
    aprobacion_canal          = 'link_publico',
    aprobacion_fecha_cliente  = current_date,
    aprobacion_registrada_at  = now()
  where id = v_cot.id;

  if v_cot.oportunidad_id is not null then
    v_monto := coalesce(v_cot.total_impl, v_cot.total, 0);
    update public.oportunidades set
      estado            = 'ganada',
      etapa             = 'ganada',
      probabilidad      = 100,
      monto_estimado    = v_monto,
      moneda            = coalesce(v_cot.moneda, public.oportunidades.moneda),
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

update public.oportunidades
set etapa = 'negociacion'
where etapa = 'cierre'
  and coalesce(estado, 'abierta') not in ('ganada', 'perdida');

select pg_notify('pgrst', 'reload schema');
