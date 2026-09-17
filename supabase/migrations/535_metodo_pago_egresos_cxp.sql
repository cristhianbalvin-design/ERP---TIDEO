-- TIDEO ERP - Persistir el método elegido para egresos y pagos de CxP.
-- El catálogo y las validaciones viven en el frontend; estos campos son
-- informativos y no modifican la lógica de movimientos_tesoreria.

alter table public.compras_gastos
  add column if not exists metodo_pago text;

alter table public.cxp_pagos
  add column if not exists metodo_pago text;
