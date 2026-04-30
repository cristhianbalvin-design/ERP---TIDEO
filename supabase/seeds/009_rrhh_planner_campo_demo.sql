-- TIDEO ERP - Demo RRHH Operativo + Planner + App de Campo
-- Ejecutar despues de 006_rrhh_demo.sql.
-- Enriquecer la data de prueba de emp_001 para validar planner, altas de personal y campo.

insert into public.turnos (id, empresa_id, nombre, hora_entrada, hora_salida, tolerancia_minutos, cruza_medianoche, dias_laborables, minutos_refrigerio, horas_efectivas, estado)
values
  ('tur_001', 'emp_001', 'Turno Manana', '07:00', '15:00', 10, false, '["lun","mar","mie","jue","vie"]'::jsonb, 60, 7.0, 'activo'),
  ('tur_004', 'emp_001', 'Turno Campo 10h', '07:00', '17:00', 15, false, '["lun","mar","mie","jue","vie","sab"]'::jsonb, 60, 9.0, 'activo'),
  ('tur_005', 'emp_001', 'Turno Administrativo', '08:00', '17:00', 10, false, '["lun","mar","mie","jue","vie"]'::jsonb, 60, 8.0, 'activo')
on conflict (id) do update set
  nombre = excluded.nombre,
  hora_entrada = excluded.hora_entrada,
  hora_salida = excluded.hora_salida,
  estado = 'activo',
  updated_at = now();

insert into public.personal_operativo (
  id, empresa_id, codigo, nombre, documento, cargo, especialidad, especialidad2,
  area, turno_id, telefono, email, sede, supervisor, fecha_ingreso,
  sueldo_base, moneda, sistema_pensionario, costo_hora_real, costo_hora_extra,
  estado, acceso_campo, perfil_campo, docs
)
values
  ('pop_001', 'emp_001', 'TEC-001', 'Luis Mendoza', '72345678', 'Tecnico Mecanico', 'Mecanica Industrial', null, 'Operaciones', 'tur_001', '+51 987 100 001', 'l.mendoza@demo.pe', 'Planta Norte', 'Ana Torres', '2023-01-10', 2800, 'PEN', 'AFP - Integra', 45, 68, 'disponible', true, 'Tecnico', '{"sctr":"vigente","medico":"vigente","epp":"ok","licencia":"vigente"}'::jsonb),
  ('pop_002', 'emp_001', 'TEC-002', 'Carlos Reyes', '73456789', 'Electricista Industrial', 'Alta Tension', null, 'Operaciones', 'tur_001', '+51 987 100 002', 'c.reyes@demo.pe', 'Planta Norte', 'Ana Torres', '2023-02-14', 3000, 'PEN', 'AFP - Prima', 50, 75, 'ocupado', true, 'Tecnico', '{"sctr":"por_vencer","medico":"vigente","epp":"ok","licencia":"vigente"}'::jsonb),
  ('pop_003', 'emp_001', 'TEC-003', 'Ana Torres', '74567890', 'Supervisora SSO', 'Seguridad OHSAS', null, 'Operaciones', 'tur_005', '+51 987 100 003', 'a.torres@demo.pe', 'Sede Sur', null, '2022-08-01', 4200, 'PEN', 'AFP - Integra', 75, 113, 'disponible', true, 'Supervisor', '{"sctr":"vigente","medico":"vigente","epp":"ok","licencia":"vigente"}'::jsonb),
  ('pop_004', 'emp_001', 'TEC-004', 'Jorge Quispe', '75678901', 'Ayudante Tecnico', 'General', null, 'Operaciones', 'tur_004', '+51 987 100 004', 'j.quispe@demo.pe', 'Planta Norte', 'Luis Mendoza', '2024-03-05', 2200, 'PEN', 'ONP', 25, 38, 'vacaciones', true, 'Tecnico', '{"sctr":"vencido","medico":"por_vencer","epp":"incompleto","licencia":"vigente"}'::jsonb),
  ('pop_005', 'emp_001', 'TEC-005', 'Pedro Condori', '76789012', 'Tecnico Electronico', 'Instrumentacion', null, 'Operaciones', 'tur_004', '+51 987 100 005', 'p.condori@demo.pe', 'Sede Sur', 'Ana Torres', '2023-11-20', 3300, 'PEN', 'AFP - Habitat', 55, 83, 'disponible', true, 'Tecnico', '{"sctr":"vigente","medico":"vigente","epp":"ok","licencia":"vigente"}'::jsonb),
  ('pop_006', 'emp_001', 'TEC-006', 'Rosa Huanca', '77890123', 'Tecnica de Instrumentacion', 'PLC / SCADA', null, 'Operaciones', 'tur_001', '+51 987 100 006', 'r.huanca@demo.pe', 'Planta Norte', 'Ana Torres', '2024-01-15', 3600, 'PEN', 'AFP - Prima', 65, 98, 'disponible', true, 'Tecnico', '{"sctr":"vigente","medico":"vigente","epp":"ok","licencia":"por_vencer"}'::jsonb)
on conflict (id) do update set
  codigo = excluded.codigo,
  nombre = excluded.nombre,
  documento = excluded.documento,
  cargo = excluded.cargo,
  especialidad = excluded.especialidad,
  especialidad2 = excluded.especialidad2,
  turno_id = excluded.turno_id,
  telefono = excluded.telefono,
  email = excluded.email,
  sede = excluded.sede,
  supervisor = excluded.supervisor,
  fecha_ingreso = excluded.fecha_ingreso,
  sueldo_base = excluded.sueldo_base,
  sistema_pensionario = excluded.sistema_pensionario,
  costo_hora_real = excluded.costo_hora_real,
  costo_hora_extra = excluded.costo_hora_extra,
  estado = excluded.estado,
  acceso_campo = true,
  perfil_campo = excluded.perfil_campo,
  docs = excluded.docs,
  updated_at = now();

insert into public.ordenes_trabajo (
  id, empresa_id, os_cliente_id, numero, cuenta_id, servicio, descripcion,
  direccion_ejecucion, fecha_programada, tecnico_responsable_id, estado,
  avance_pct, costo_estimado, costo_real, moneda
)
values
  ('ot_plan_001', 'emp_001', null, 'OT-26-0101', 'cta_001', 'Mantenimiento preventivo', 'Mantenimiento de faja transportadora', 'Planta Norte', '2026-04-27', 'pop_001', 'programada', 0, 1200, 0, 'PEN'),
  ('ot_plan_002', 'emp_001', null, 'OT-26-0102', 'cta_006', 'Inspeccion electrica', 'Revision tablero principal', 'Planta Norte', '2026-04-28', 'pop_002', 'ejecucion', 35, 900, 250, 'PEN'),
  ('ot_plan_003', 'emp_001', null, 'OT-26-0103', 'cta_004', 'Supervision SSOMA', 'Supervision de trabajos en altura', 'Sede Sur', '2026-04-30', 'pop_003', 'programada', 0, 700, 0, 'PEN'),
  ('ot_plan_004', 'emp_001', null, 'OT-26-0104', 'cta_003', 'Instrumentacion', 'Calibracion de sensores', 'Planta Norte', '2026-05-01', 'pop_006', 'programada', 0, 1100, 0, 'PEN'),
  ('ot_plan_005', 'emp_001', null, 'OT-26-0105', 'cta_006', 'Automatizacion', 'Diagnostico PLC linea 2', 'Sede Sur', '2026-05-02', 'pop_005', 'programada', 0, 1500, 0, 'PEN')
on conflict (id) do update set
  numero = excluded.numero,
  cuenta_id = excluded.cuenta_id,
  servicio = excluded.servicio,
  descripcion = excluded.descripcion,
  direccion_ejecucion = excluded.direccion_ejecucion,
  fecha_programada = excluded.fecha_programada,
  tecnico_responsable_id = excluded.tecnico_responsable_id,
  estado = excluded.estado,
  avance_pct = excluded.avance_pct,
  costo_estimado = excluded.costo_estimado,
  costo_real = excluded.costo_real,
  updated_at = now();
