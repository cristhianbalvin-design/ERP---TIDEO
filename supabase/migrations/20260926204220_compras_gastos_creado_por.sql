-- Registrar el autor de los gastos para Mis compras de campo.
-- Las filas existentes quedan NULL si no se puede reconstruir el autor.

alter table public.compras_gastos
  add column if not exists creado_por uuid null;

alter table public.compras_gastos
  alter column creado_por set default auth.uid();

-- Primero se toma el autor de la OC de regularización.
update public.compras_gastos g
set creado_por = oc.creado_por
from public.ordenes_compra oc
where g.creado_por is null
  and g.orden_compra_id is not null
  and g.orden_compra_id = oc.id
  and oc.creado_por is not null;

-- Para gastos sin OC, se intenta reconstruir el autor desde la CxP vinculada.
update public.compras_gastos g
set creado_por = (
  select c1.creado_por::uuid
  from public.cxp c1
  where (c1.gasto_id = g.id or c1.id = g.cxp_id)
    and c1.creado_por ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  order by c1.created_at desc nulls last, c1.id
  limit 1
)
where g.creado_por is null
  and g.orden_compra_id is null
  and exists (
    select 1
    from public.cxp c2
    where (c2.gasto_id = g.id or c2.id = g.cxp_id)
      and c2.creado_por ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  );

create index if not exists idx_compras_gastos_empresa_creado_por
  on public.compras_gastos (empresa_id, creado_por);
