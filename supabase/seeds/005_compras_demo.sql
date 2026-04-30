-- TIDEO ERP - Seeds Compras y Proveedores para emp_001.
-- Ejecutar despues de 001_demo_tenants.sql.

-- Proveedores
insert into public.proveedores (id, empresa_id, razon_social, ruc, tipo, estado, rubro, telefono, email, condicion_pago, calificacion_promedio)
values
  ('prv_001', 'emp_001', 'Ferreteria Industrial SAC',       '20512345678', 'empresa', 'homologado',    'Materiales',  '+51 987 111 222', 'ventas@ferind.pe',       '30 dias', 4.4),
  ('prv_002', 'emp_001', 'Electroandes EIRL',               '20609876543', 'empresa', 'homologado',    'Materiales',  '+51 987 333 444', 'info@electroandes.pe',   'Contado', 4.8),
  ('prv_003', 'emp_001', 'Transporte Rapido SAC',           '20511112222', 'empresa', 'en_evaluacion', 'Transporte',  '+51 987 444 555', 'ops@transrapido.pe',     '15 dias', 3.9),
  ('prv_004', 'emp_001', 'Mantenimientos Externos EIRL',   '20498765432', 'empresa', 'potencial',      'Servicios',   '+51 987 666 777', 'contacto@mantex.pe',     'Contado', null),
  ('prv_005', 'emp_001', 'Logistica Norte EIRL',            '20412356789', 'empresa', 'observado',     'Transporte',  '+51 987 888 999', 'l.norte@logisticanorte.pe','30 dias', 2.5)
on conflict (id) do nothing;

-- SOLPE
insert into public.solpe_interna (id, empresa_id, codigo, descripcion, tipo, prioridad, estado, fecha_requerida)
values
  ('slp_001', 'emp_001', 'SLP-2025-001', 'Materiales electricos para mantenimiento fajas - cable, terminales, canaletas', 'bien',     'alta',  'aprobada', '2025-04-28'),
  ('slp_002', 'emp_001', 'SLP-2025-002', 'Transporte de materiales a planta Toquepala',                                   'servicio', 'media', 'aprobada', '2025-04-30'),
  ('slp_003', 'emp_001', 'SLP-2025-003', 'EPP para personal de campo (cascos, lentes, guantes)',                          'bien',     'alta',  'borrador',  '2025-05-05')
on conflict (id) do nothing;

-- Procesos de Compra
insert into public.procesos_compra (id, empresa_id, codigo, solpe_id, descripcion, tipo, fecha_limite, proveedores_consultados, proveedor_ganador, monto_referencial, monto_seleccionado, estado)
values
  ('pc_001', 'emp_001', 'COT-COMP-001', 'slp_001', 'Materiales electricos para mantenimiento fajas', 'bien',     '2025-04-28', '["prv_001","prv_002"]'::jsonb, 'prv_001', 4500, 4150, 'comparativo_listo'),
  ('pc_002', 'emp_001', 'COT-COMP-002', 'slp_002', 'Transporte de materiales a planta Toquepala',   'servicio', '2025-04-30', '["prv_003"]'::jsonb,           null,      900,  null, 'esperando_respuesta')
on conflict (id) do nothing;

-- Órdenes de Compra
insert into public.ordenes_compra (id, empresa_id, codigo, proceso_compra_id, proveedor_id, descripcion, items, subtotal, igv, total, moneda, condicion_pago, fecha_emision, fecha_entrega_esperada, estado, porcentaje_recibido)
values
  ('oc_001', 'emp_001', 'OC-2025-0089', 'pc_001', 'prv_001',
   'Materiales electricos - cable 2.5mm, terminales, canaletas',
   '[{"descripcion":"Cable NHX-80 2.5mm","cantidad":100,"unidad":"m","precio_unitario":2.80,"subtotal":280},{"descripcion":"Terminales de compresion","cantidad":50,"unidad":"Und","precio_unitario":1.20,"subtotal":60},{"descripcion":"Canaleta ranurada 40x25","cantidad":20,"unidad":"m","precio_unitario":8.50,"subtotal":170},{"descripcion":"Breaker 3x32A Schneider","cantidad":2,"unidad":"Und","precio_unitario":185,"subtotal":370}]'::jsonb,
   880, 158.40, 1038.40, 'PEN', '30 dias', '2025-04-23', '2025-04-25', 'recibida_total', 100),
  ('oc_002', 'emp_001', 'OC-2025-0090', null, 'prv_001',
   'EPP para personal - cascos, lentes, guantes',
   '[{"descripcion":"Casco MSA blanco","cantidad":5,"unidad":"Und","precio_unitario":45,"subtotal":225},{"descripcion":"Lentes de seguridad","cantidad":10,"unidad":"Und","precio_unitario":12,"subtotal":120},{"descripcion":"Guantes nitrilo talla L","cantidad":20,"unidad":"Par","precio_unitario":8.50,"subtotal":170}]'::jsonb,
   515, 92.70, 607.70, 'PEN', '30 dias', '2025-04-24', '2025-04-28', 'confirmada', 0),
  ('oc_003', 'emp_001', 'OC-2025-0086', null, 'prv_002',
   'Tablero electrico 12 polos con caja',
   '[{"descripcion":"Tablero electrico 12 polos","cantidad":1,"unidad":"Und","precio_unitario":380,"subtotal":380},{"descripcion":"Caja metalica 400x300x150","cantidad":1,"unidad":"Und","precio_unitario":120,"subtotal":120}]'::jsonb,
   500, 90, 590, 'PEN', 'Contado', '2025-04-18', '2025-04-21', 'cerrada', 100)
on conflict (id) do nothing;

-- Órdenes de Servicio Interna (OSI)
insert into public.ordenes_servicio_interna (id, empresa_id, codigo, proceso_compra_id, proveedor_id, descripcion, entregables, total, moneda, condicion_pago, fecha_emision, fecha_inicio, fecha_fin, estado)
values
  ('os_001', 'emp_001', 'OS-2025-0012', 'pc_002', 'prv_003',
   'Transporte de materiales y personal tecnico a planta Toquepala',
   '["Guia de remision","Registro de llegada firmado por supervisor de planta"]'::jsonb,
   800, 'PEN', '15 dias', '2025-04-20', '2025-04-22', '2025-04-22', 'cerrada')
on conflict (id) do nothing;

-- Recepciones
insert into public.recepciones (id, empresa_id, orden_compra_id, tipo, fecha, items_recibidos, estado)
values
  ('rec_001', 'emp_001', 'oc_001', 'total', '2025-04-25',
   '[{"descripcion":"Cable NHX-80 2.5mm","pedido":100,"recibido":100,"unidad":"m","conforme":true},{"descripcion":"Terminales de compresion","pedido":50,"recibido":50,"unidad":"Und","conforme":true},{"descripcion":"Canaleta ranurada 40x25","pedido":20,"recibido":20,"unidad":"m","conforme":true},{"descripcion":"Breaker 3x32A Schneider","pedido":2,"recibido":2,"unidad":"Und","conforme":true}]'::jsonb,
   'confirmada')
on conflict (id) do nothing;
