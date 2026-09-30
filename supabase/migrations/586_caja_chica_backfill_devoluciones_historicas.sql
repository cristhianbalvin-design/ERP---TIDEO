-- Backfill histórico posterior al despliegue de 585.
-- Solo completa cierres cuya devolución en Tesorería coincide exactamente con
-- el saldo proyectado. ccf_3gpbbibtelw queda fuera por la diferencia de 0.28.

with saldo_proyectado as (
  select
    f.id,
    round(
      coalesce(f.monto_asignado, 0)
      + coalesce(a.aportes, 0)
      + coalesce(r.reposiciones, 0)
      - coalesce(e.egresos, 0),
      2
    ) as saldo
  from public.caja_chica_fondos f
  left join (
    select fondo_id, sum(monto) as aportes
    from public.caja_chica_aportes
    where lower(coalesce(estado, '')) not in ('anulado', 'anulada')
    group by fondo_id
  ) a on a.fondo_id = f.id
  left join (
    select fondo_id, sum(monto_aprobado) as reposiciones
    from public.caja_chica_rendiciones
    where lower(coalesce(estado, '')) in ('aprobada', 'repuesta')
    group by fondo_id
  ) r on r.fondo_id = f.id
  left join (
    select fondo_id, sum(monto) as egresos
    from public.caja_chica
    where lower(coalesce(estado, '')) not in ('anulado', 'anulada')
    group by fondo_id
  ) e on e.fondo_id = f.id
  where f.id in (
    'ccf_6yj6jic3z8s',
    'ccf_lddn04qh2ep',
    'ccf_mompv8rbvcd'
  )
), movimiento_cierre as (
  select
    mt.*,
    count(*) over (partition by mt.vinculo_id) as cantidad_movimientos
  from public.movimientos_tesoreria mt
  where mt.vinculo_tipo = 'caja_chica_fondo_cierre'
    and mt.tipo = 'ingreso'
    and mt.estado = 'registrado'
    and mt.vinculo_id in (
      'ccf_6yj6jic3z8s',
      'ccf_lddn04qh2ep',
      'ccf_mompv8rbvcd'
    )
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
  and round(mc.monto, 2) = sp.saldo;
