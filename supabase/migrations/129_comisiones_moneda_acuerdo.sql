-- 129 - Referencias completas para el modulo de Comisiones
-- Persiste moneda, porcentaje base y marca de acuerdo especial para reportes y recibos.

alter table public.comisiones
  add column if not exists moneda text,
  add column if not exists porcentaje_base numeric(5,2),
  add column if not exists acuerdo_especial boolean not null default false;

alter table public.recibos_honorarios
  add column if not exists moneda text not null default 'PEN';

update public.comisiones co
set
  factura_id = coalesce(co.factura_id, cx.factura_id),
  os_cliente_id = coalesce(co.os_cliente_id, cx.os_cliente_id)
from public.cxc cx
where co.cxc_id = cx.id
  and (co.factura_id is null or co.os_cliente_id is null);

update public.comisiones co
set os_cliente_id = f.os_cliente_id
from public.facturas f
where co.os_cliente_id is null
  and co.factura_id = f.id
  and f.os_cliente_id is not null;

update public.comisiones co
set oportunidad_id = os.oportunidad_id
from public.os_clientes os
where co.oportunidad_id is null
  and co.os_cliente_id = os.id
  and os.oportunidad_id is not null;

update public.comisiones co
set moneda = coalesce(
  nullif(co.moneda, ''),
  (select nullif(cx.moneda, '') from public.cxc cx where cx.id = co.cxc_id),
  (select nullif(f.moneda, '') from public.facturas f where f.id = co.factura_id),
  (select nullif(os.moneda, '') from public.os_clientes os where os.id = co.os_cliente_id),
  (select nullif(e.moneda_base, '') from public.empresas e where e.id = co.empresa_id),
  'PEN'
)
where co.moneda is null or trim(co.moneda) = '';

update public.comisiones co
set porcentaje_base = pa.porcentaje_comision
from public.personal_administrativo pa
where co.porcentaje_base is null
  and co.empresa_id = pa.empresa_id
  and co.vendedor_id = pa.id;

update public.comisiones co
set acuerdo_especial = true
from public.oportunidades o
where co.oportunidad_id = o.id
  and co.empresa_id = o.empresa_id
  and o.acuerdo_estado = 'aprobado'
  and co.porcentaje_base is not null
  and abs(coalesce(co.porcentaje_comision, 0) - co.porcentaje_base) > 0.0001;

create index if not exists idx_comisiones_referencias
  on public.comisiones (empresa_id, oportunidad_id, os_cliente_id, factura_id);

select pg_notify('pgrst', 'reload schema');
