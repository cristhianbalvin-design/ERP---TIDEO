-- Corrige compras_gastos.estado_pago para registros cuya CxP ya fue pagada.
-- Problema: cuando se registraba un pago en cxp, compras_gastos no se actualizaba.
update public.compras_gastos cg
set estado_pago = 'pagado'
from public.cxp c
where c.gasto_id = cg.id
  and c.estado = 'pagada'
  and cg.estado_pago = 'pendiente';
