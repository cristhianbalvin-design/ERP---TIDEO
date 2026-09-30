-- Backfill histórico adicional posterior al despliegue de 585.
-- Solo completa ccf_oggguoo3tl cuando el único cierre de Tesorería
-- coincide exactamente con el saldo calculado por la función canónica.

with saldo_proyectado as (
  select
    f.id,
    round(public.calcular_saldo_fondo_caja_chica(f.id), 2) as saldo,
    upper(coalesce(f.moneda, 'PEN')) as moneda_fondo
  from public.caja_chica_fondos f
  where f.id = 'ccf_oggguoo3tl'
    and f.estado = 'cerrado'
    and coalesce(f.monto_devuelto, 0) = 0
), movimiento_cierre as (
  select
    mt.*,
    count(*) over (partition by mt.vinculo_id) as cantidad_movimientos
  from public.movimientos_tesoreria mt
  where mt.vinculo_tipo = 'caja_chica_fondo_cierre'
    and mt.tipo = 'ingreso'
    and mt.estado = 'registrado'
    and mt.vinculo_id = 'ccf_oggguoo3tl'
)
update public.caja_chica_fondos f
set monto_devuelto = mc.monto,
    devolucion_cuenta_bancaria_id = mc.cuenta_bancaria_id,
    devolucion_fecha = mc.fecha,
    devolucion_referencia = mc.referencia
from saldo_proyectado sp
join movimiento_cierre mc on mc.vinculo_id = sp.id
where f.id = sp.id
  and mc.cantidad_movimientos = 1
  and upper(coalesce(mc.moneda, 'PEN')) = sp.moneda_fondo
  and round(mc.monto, 2) = sp.saldo;
