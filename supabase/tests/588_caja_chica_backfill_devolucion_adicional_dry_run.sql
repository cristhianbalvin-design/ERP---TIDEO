begin;

-- Dry run del backfill adicional de ccf_oggguoo3tl.
-- La operación se revierte al final de esta prueba.

create temporary table _cc588_before on commit drop as
select
  f.id,
  f.empresa_id,
  f.moneda,
  f.estado,
  f.monto_devuelto,
  f.devolucion_cuenta_bancaria_id,
  f.devolucion_fecha,
  f.devolucion_referencia,
  public.calcular_saldo_fondo_caja_chica(f.id) as saldo
from public.caja_chica_fondos f
where f.estado = 'cerrado';

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
  and round(mc.monto, 2) = sp.saldo
;

create temporary table _cc588_after on commit drop as
select
  f.id,
  f.empresa_id,
  f.moneda,
  f.estado,
  f.monto_devuelto,
  f.devolucion_cuenta_bancaria_id,
  f.devolucion_fecha,
  f.devolucion_referencia,
  public.calcular_saldo_fondo_caja_chica(f.id) as saldo
from public.caja_chica_fondos f
where f.estado = 'cerrado';

do $$
declare
  v_saldo numeric;
  v_monto_devuelto numeric;
begin
  select saldo, monto_devuelto
    into v_saldo, v_monto_devuelto
  from _cc588_after
  where id = 'ccf_oggguoo3tl';

  if round(v_saldo, 2) <> 0 then
    raise exception 'DRY_RUN_588_SALDO_NO_CERO: saldo=%', v_saldo;
  end if;
  if round(v_monto_devuelto, 2) <> 555.00 then
    raise exception 'DRY_RUN_588_MONTO_DEVUELTO_INCORRECTO: monto=%', v_monto_devuelto;
  end if;

  if exists (
    select 1
    from _cc588_before b
    full join _cc588_after a using (id)
    where coalesce(b.id, a.id) <> 'ccf_oggguoo3tl'
      and (
        b.id is null
        or a.id is null
        or (b.empresa_id, b.moneda, b.estado, b.monto_devuelto,
            b.devolucion_cuenta_bancaria_id, b.devolucion_fecha,
            b.devolucion_referencia, b.saldo)
           is distinct from
           (a.empresa_id, a.moneda, a.estado, a.monto_devuelto,
            a.devolucion_cuenta_bancaria_id, a.devolucion_fecha,
            a.devolucion_referencia, a.saldo)
      )
  ) then
    raise exception 'DRY_RUN_588_OTROS_CERRADOS_CAMBIARON';
  end if;

  if not exists (
    select 1
    from _cc588_before b
    join _cc588_after a using (id)
    where b.id = 'ccf_3gpbbibtelw'
      and (b.empresa_id, b.moneda, b.estado, b.monto_devuelto,
           b.devolucion_cuenta_bancaria_id, b.devolucion_fecha,
           b.devolucion_referencia, b.saldo)
          is not distinct from
          (a.empresa_id, a.moneda, a.estado, a.monto_devuelto,
           a.devolucion_cuenta_bancaria_id, a.devolucion_fecha,
           a.devolucion_referencia, a.saldo)
  ) then
    raise exception 'DRY_RUN_588_3GPBBIBTELW_CAMBIO';
  end if;
end;
$$;

select 'ANTES' as etapa, b.* from _cc588_before b
union all
select 'DESPUES' as etapa, a.* from _cc588_after a
order by etapa, id;

rollback;
