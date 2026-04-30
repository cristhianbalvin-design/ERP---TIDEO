-- Semillas de datos para Operaciones (Tenant emp_001)

insert into public.backlog (id, empresa_id, cuenta_id, descripcion, prioridad, estado, centro_costo)
values
  ('req_001', 'emp_001', 'cta_005', 'Mantenimiento preventivo de aire acondicionado (Piso 4)', 'alta', 'pendiente', 'CC-MANT-01'),
  ('req_002', 'emp_001', 'cta_005', 'Reparación de luminarias (Recepción)', 'media', 'convertido', 'CC-MANT-02')
on conflict do nothing;

insert into public.ordenes_trabajo (id, empresa_id, os_cliente_id, backlog_id, numero, cuenta_id, servicio, descripcion, estado, avance_pct, costo_estimado, costo_real)
values
  ('ot_001', 'emp_001', 'osc_001', 'req_002', 'OT-26-0001', 'cta_005', 'Mantenimiento Correctivo', 'Reparación de luminarias (Recepción) e instalación de nuevos focos LED', 'ejecucion', 50, 1500, 450),
  ('ot_002', 'emp_001', 'osc_001', null, 'OT-26-0002', 'cta_005', 'Mantenimiento Preventivo', 'Limpieza general de ductos y filtros', 'programada', 0, 800, 0)
on conflict do nothing;

insert into public.partes_diarios (id, empresa_id, orden_trabajo_id, tecnico_id, fecha, horas_normales, actividad, avance_pct, materiales, estado)
values
  ('part_001', 'emp_001', 'ot_001', null, '2026-04-18', 4, 'Desmontaje de luminarias antiguas e inspección de cableado', 20, '[]'::jsonb, 'aprobado'),
  ('part_002', 'emp_001', 'ot_001', null, '2026-04-19', 6, 'Instalación de 10 focos LED y pruebas de encendido', 30, '[{"sku": "MAT-001", "nombre": "Foco LED 18W", "cantidad": 10}]'::jsonb, 'en_revision')
on conflict do nothing;
