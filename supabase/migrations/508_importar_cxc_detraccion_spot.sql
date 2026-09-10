-- Extiende la importación masiva CxC para registrar el depósito neto y el
-- depósito SPOT como dos cobros del mismo documento. La detracción no reduce
-- el saldo objetivo: ambos importes se acumulan en monto_pagado.
alter function public.importar_cxc_masiva_fila(jsonb)
  rename to importar_cxc_masiva_fila_base;

create function public.importar_cxc_masiva_fila(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_monto_pagado numeric(14,2) := coalesce(nullif(p_payload ->> 'monto_pagado', '')::numeric, 0);
  v_monto_detraccion numeric(14,2) := coalesce(nullif(p_payload ->> 'monto_detraccion', '')::numeric, 0);
  v_payload_base jsonb;
  v_resultado jsonb;
  v_cobro_neto_id text;
  v_cobro_neto jsonb;
  v_cobro_detraccion public.cobros_cxc%rowtype;
  v_factura public.facturas%rowtype;
begin
  if v_monto_detraccion < 0 then
    raise exception 'Monto de detraccion invalido.';
  end if;

  -- Mantiene el comportamiento histórico intacto cuando no se informa SPOT.
  if v_monto_detraccion = 0 then
    return public.importar_cxc_masiva_fila_base(p_payload);
  end if;

  if v_monto_pagado <= 0 then
    raise exception 'Monto pagado debe incluir el deposito neto cuando se informa monto_detraccion.';
  end if;

  -- La función base valida que el total acumulado conserve saldo pendiente,
  -- crea la factura/CxC y registra inicialmente el cobro por el total recibido.
  v_payload_base := jsonb_set(
    p_payload,
    '{monto_pagado}',
    to_jsonb(round(v_monto_pagado + v_monto_detraccion, 2))
  );
  v_resultado := public.importar_cxc_masiva_fila_base(v_payload_base);
  v_cobro_neto_id := nullif(v_resultado -> 'cobro' ->> 'id', '');
  if v_cobro_neto_id is null then
    raise exception 'No se pudo registrar el cobro neto de la importacion.';
  end if;

  update public.cobros_cxc
  set monto_capital = v_monto_pagado
  where id = v_cobro_neto_id
  returning to_jsonb(cobros_cxc.*) into v_cobro_neto;

  insert into public.cobros_cxc (
    id, empresa_id, cxc_id, factura_id, cuenta_id, monto_capital, monto_mora,
    medio_pago, cuenta_bancaria, numero_operacion, fecha_cobro, notas, registrado_por
  )
  select
    'cob_imp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20),
    empresa_id, cxc_id, factura_id, cuenta_id, v_monto_detraccion, 0,
    'Detraccion', null, numero_operacion, fecha_cobro,
    concat_ws(E'\n', notas, 'Deposito por detraccion SPOT'), registrado_por
  from public.cobros_cxc
  where id = v_cobro_neto_id
  returning * into v_cobro_detraccion;

  update public.facturas
  set aplica_detraccion = true,
      monto_detraccion = v_monto_detraccion
  where id = (v_resultado -> 'factura' ->> 'id')
  returning * into v_factura;

  return v_resultado || jsonb_build_object(
    'factura', to_jsonb(v_factura),
    'cobro', v_cobro_neto,
    'cobros', jsonb_build_array(v_cobro_neto, to_jsonb(v_cobro_detraccion))
  );
end;
$$;

grant execute on function public.importar_cxc_masiva_fila(jsonb) to authenticated;

select pg_notify('pgrst', 'reload schema');
