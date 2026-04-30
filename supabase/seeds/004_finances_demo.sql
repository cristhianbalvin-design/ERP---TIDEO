-- TIDEO ERP - Seeds Finanzas demo para emp_001.
-- Ejecutar despues de 003_ops_demo.sql.

-- 1. Valorizaciones
insert into public.valorizaciones (id, empresa_id, os_cliente_id, numero, fecha, periodo, subtotal, igv, total, moneda, estado)
values
  ('val_001', 'emp_001', 'osc_001', 'VAL-0089', '2026-04-18', 'Abril 2026', 80508.47, 14491.53, 95000.00, 'PEN', 'facturada'),
  ('val_002', 'emp_001', 'osc_002', 'VAL-0087', '2026-04-16', 'Abril 2026', 18983.05,  3416.95, 22400.00, 'PEN', 'facturada')
on conflict (id) do update set estado = excluded.estado;

-- 2. Facturas
insert into public.facturas (id, empresa_id, cuenta_id, valorizacion_id, numero, fecha_emision, subtotal, igv, total, moneda, estado)
values
  ('fac_001', 'emp_001', 'cta_001', 'val_001', 'F001-0512', '2026-04-20', 80508.47, 14491.53, 95000.00, 'PEN', 'emitida'),
  ('fac_002', 'emp_001', 'cta_001', 'val_002', 'F001-0510', '2026-04-18', 18983.05,  3416.95, 22400.00, 'PEN', 'pagada')
on conflict (id) do update set estado = excluded.estado;

-- 3. CxC
insert into public.cxc (id, empresa_id, cuenta_id, factura_id, fecha_emision, fecha_vencimiento, monto_total, monto_pagado, saldo, moneda, estado)
values
  ('cxc_001', 'emp_001', 'cta_001', 'fac_001', '2026-04-20', '2026-05-20', 95000.00,      0.00, 95000.00, 'PEN', 'por_cobrar'),
  ('cxc_002', 'emp_001', 'cta_001', 'fac_002', '2026-04-18', '2026-05-18', 22400.00,  22400.00,      0.00, 'PEN', 'cobrada')
on conflict (id) do update set estado = excluded.estado;

-- 4. CxP (Usando proveedores existentes de compras demo o creando uno genérico)
insert into public.cxp (id, empresa_id, proveedor_id, factura_numero, fecha_emision, fecha_vencimiento, monto_total, monto_pagado, saldo, moneda, estado)
values
  ('cxp_001', 'emp_001', 'prv_001', 'F001-2341', '2026-04-22', '2026-05-07',  450.00,   0.00,  450.00, 'PEN', 'por_pagar'),
  ('cxp_002', 'emp_001', 'prv_002', 'F002-1122', '2026-04-20', '2026-04-24', 1250.00, 1250.00,    0.00, 'PEN', 'pagada')
on conflict (id) do update set estado = excluded.estado;

-- 5. Movimientos Banco
insert into public.movimientos_banco (id, empresa_id, fecha, descripcion, tipo, monto, moneda, vinculado_tipo, vinculado_id, conciliado)
values
  ('mb_001', 'emp_001', '2026-04-20', 'Pago Factura F001-0510', 'credito', 22400.00, 'PEN', 'cxc', 'cxc_002', true),
  ('mb_002', 'emp_001', '2026-04-21', 'Abono cliente Minera Andes', 'credito', 15000.00, 'PEN', null, null, false),
  ('mb_003', 'emp_001', '2026-04-23', 'Pago proveedor Electroandes', 'debito', 1250.00, 'PEN', 'cxp', 'cxp_002', true)
on conflict (id) do update set conciliado = excluded.conciliado;
