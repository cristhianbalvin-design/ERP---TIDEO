-- Documenta el criterio de cada columna de tipo de cambio (solo comentarios; no cambia datos).
-- Criterio único desde 2026-11: tasas de cotización guardadas en PEN por unidad de moneda extranjera.

comment on column public.cxp.tipo_cambio is
  'PEN por unidad de moneda extranjera (criterio desde 2026-11). Registros anteriores en USD creados desde Nuevo Egreso o carga masiva pueden estar en USD por PEN (< 1); normalizar al leer (si < 1, invertir).';

comment on column public.movimientos_tesoreria.tc_aplicado is
  'Factor direccional de la moneda del movimiento a la moneda de la cuenta (monto_en_moneda_cuenta = monto * factor). No es una cotización universal; en SPOT puede contener la tasa de la obligación de origen.';

comment on column public.movimientos_tesoreria.monto_en_moneda_cuenta is
  'Monto expresado en la moneda de la cuenta bancaria. Fuente de verdad para saldos cuando las monedas difieren.';

comment on column public.tipo_cambio_historico.usd is
  'USD por cada PEN (moneda_base = PEN). Para obtener PEN por USD, invertir.';

comment on column public.tipo_cambio_historico.eur is
  'EUR por cada PEN (moneda_base = PEN). Para obtener PEN por EUR, invertir.';

do $$
begin
  if col_description('public.cxp'::regclass,
       (select attnum from pg_attribute where attrelid = 'public.cxp'::regclass and attname = 'tipo_cambio')) not like 'PEN por unidad%' then
    raise exception 'No quedó documentado cxp.tipo_cambio';
  end if;
end $$;
