-- Corrección de datos: 8 CxP anuladas antes de la migración 665 dejaron su gasto
-- (compras_gastos) en estado registrado, por lo que seguía sumando en el ER.
-- Se anulan solo esos gastos, verificando que no tengan otra CxP activa.
do $$
declare
  v_ids text[] := array['gasto_2ptxe4fk141','gasto_5h0c7b7i2vu','gasto_o720urjjhs','gasto_5zdg6qqasql','gasto_n66nz1el82','gasto_tdhlrf75lb','gasto_9co7n0bok35','gasto_6i4kz85qmq'];
  v_n int;
begin
  if exists (
    select 1 from public.cxp c
    where c.gasto_id = any(v_ids) and c.estado <> 'anulada'
  ) then
    raise exception 'Algún gasto tiene una CxP activa; abortando';
  end if;

  update public.compras_gastos g
  set estado = 'anulado'
  where g.id = any(v_ids)
    and g.estado <> 'anulado'
    and coalesce(g.estado_pago, 'pendiente') <> 'pagado'
    and exists (
      select 1 from public.cxp c
      where c.gasto_id = g.id and c.estado = 'anulada'
        and lower(coalesce(c.origen, '')) in ('gasto', 'carga_masiva', 'rhe_externo')
    );
  get diagnostics v_n = row_count;

  if v_n <> 8 then
    raise exception 'Se esperaban 8 gastos corregidos y fueron %', v_n;
  end if;
end $$;
