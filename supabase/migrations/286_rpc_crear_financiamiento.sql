-- TIDEO ERP - RPC transaccional para crear Financiamiento + su tabla de amortizacion.
-- Evita el insert directo desde frontend contra financiamientos con columnas anidadas
-- (tabla_amortizacion/pagos_realizados) que no existen en esa tabla relacional.
-- Inserta la cabecera y el bulk de cuotas en una sola transaccion y retorna el registro
-- persistido, siguiendo el mismo patron de 023_rpc_crear_hoja_costeo.sql.

create or replace function public.crear_financiamiento(
  p_empresa_id text,
  p_id text,
  p_codigo text,
  p_tipo text,
  p_entidad text,
  p_monto_original numeric,
  p_cuotas jsonb,
  p_tipo_entidad text default null,
  p_contacto_nombre text default null,
  p_contacto_telefono text default null,
  p_contacto_email text default null,
  p_moneda text default 'PEN',
  p_tasa_anual numeric default 0,
  p_tipo_tasa text default 'TEA',
  p_plazo_meses integer default null,
  p_meses_gracia integer default 0,
  p_dia_pago integer default null,
  p_tipo_cuota text default 'frances',
  p_cuota_mensual numeric default 0,
  p_fecha_desembolso date default null,
  p_fecha_primer_pago date default null,
  p_fecha_ultimo_pago date default null,
  p_proposito text default null,
  p_centro_costo text default null,
  p_cuenta_bancaria_destino text default null,
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.financiamientos%rowtype;
  v_cuotas jsonb;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;

  if not public.usuario_puede(p_empresa_id, 'financiamiento', 'crear') then
    raise exception 'No tienes permiso para crear financiamientos en este tenant.';
  end if;

  insert into public.financiamientos (
    id, empresa_id, codigo, tipo, entidad, tipo_entidad,
    contacto_nombre, contacto_telefono, contacto_email,
    monto_original, moneda, tasa_anual, tipo_tasa,
    plazo_meses, meses_gracia, dia_pago, tipo_cuota, cuota_mensual,
    fecha_desembolso, fecha_primer_pago, fecha_ultimo_pago,
    saldo_pendiente, cuotas_pagadas, intereses_pagados_total,
    proposito, centro_costo, cuenta_bancaria_destino, notas, estado
  )
  values (
    p_id, p_empresa_id, p_codigo, p_tipo, p_entidad, p_tipo_entidad,
    p_contacto_nombre, p_contacto_telefono, p_contacto_email,
    p_monto_original, coalesce(p_moneda, 'PEN'), coalesce(p_tasa_anual, 0), coalesce(p_tipo_tasa, 'TEA'),
    p_plazo_meses, coalesce(p_meses_gracia, 0), p_dia_pago, coalesce(p_tipo_cuota, 'frances'), coalesce(p_cuota_mensual, 0),
    p_fecha_desembolso, p_fecha_primer_pago, p_fecha_ultimo_pago,
    p_monto_original, 0, 0,
    p_proposito, p_centro_costo, p_cuenta_bancaria_destino, p_notas, 'vigente'
  )
  returning * into v_row;

  insert into public.tabla_amortizacion (
    empresa_id, financiamiento_id, numero, fecha, capital, interes, total, saldo, estado
  )
  select
    p_empresa_id, p_id,
    (c ->> 'numero')::integer,
    (c ->> 'fecha')::date,
    coalesce((c ->> 'capital')::numeric, 0),
    coalesce((c ->> 'interes')::numeric, 0),
    coalesce((c ->> 'total')::numeric, 0),
    coalesce((c ->> 'saldo')::numeric, 0),
    coalesce(c ->> 'estado', 'futura')
  from jsonb_array_elements(coalesce(p_cuotas, '[]'::jsonb)) as c;

  select coalesce(jsonb_agg(t order by t.numero), '[]'::jsonb)
  into v_cuotas
  from public.tabla_amortizacion t
  where t.financiamiento_id = p_id;

  return to_jsonb(v_row) || jsonb_build_object('tabla_amortizacion', v_cuotas);
end;
$$;

grant execute on function public.crear_financiamiento(
  text, text, text, text, text, numeric, jsonb,
  text, text, text, text, text, numeric, text,
  integer, integer, integer, text, numeric,
  date, date, date, text, text, text, text
) to authenticated;

select pg_notify('pgrst', 'reload schema');
