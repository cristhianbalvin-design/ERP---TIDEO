-- TIDEO ERP - Seeds RRHH para emp_001.
-- Ejecutar despues de 001_demo_tenants.sql.

-- Turnos de trabajo
insert into public.turnos (id, empresa_id, nombre, hora_entrada, hora_salida, tolerancia_minutos, cruza_medianoche, dias_laborables, minutos_refrigerio, horas_efectivas, estado)
values
  ('tur_001', 'emp_001', 'Turno Mañana',        '07:00', '15:00', 10, false, '["lun","mar","mie","jue","vie"]'::jsonb, 60, 7.0,  'activo'),
  ('tur_002', 'emp_001', 'Turno Tarde',          '15:00', '23:00', 10, false, '["lun","mar","mie","jue","vie"]'::jsonb, 60, 7.0,  'activo'),
  ('tur_003', 'emp_001', 'Turno Noche',          '23:00', '07:00', 10, true,  '["lun","mar","mie","jue","vie"]'::jsonb, 60, 7.0,  'activo'),
  ('tur_004', 'emp_001', 'Turno Campo 10h',      '07:00', '17:00', 15, false, '["lun","mar","mie","jue","vie","sab"]'::jsonb, 60, 9.0,  'activo'),
  ('tur_005', 'emp_001', 'Turno Administrativo', '08:00', '17:00', 10, false, '["lun","mar","mie","jue","vie"]'::jsonb, 60, 8.0,  'activo')
on conflict (id) do nothing;

-- Personal Operativo (técnicos de campo)
insert into public.personal_operativo (id, empresa_id, codigo, nombre, documento, cargo, especialidad, area, turno_id, telefono, sueldo_base, moneda, sistema_pensionario, costo_hora_real, costo_hora_extra, estado)
values
  ('pop_001', 'emp_001', 'TEC-001', 'Luis Mendoza Ramirez',   '72345678', 'Técnico Electricista',     'Electricidad Industrial', 'Operaciones', 'tur_001', '+51 987 100 001', 2800, 'PEN', 'AFP - Integra',   17.50, 26.25, 'disponible'),
  ('pop_002', 'emp_001', 'TEC-002', 'Carlos Reyes Vargas',    '73456789', 'Técnico Mecánico',         'Mecánica Industrial',    'Operaciones', 'tur_001', '+51 987 100 002', 2600, 'PEN', 'AFP - Prima',     16.25, 24.38, 'ocupado'),
  ('pop_003', 'emp_001', 'TEC-003', 'Ana Torres Huanca',      '74567890', 'Supervisora Técnica',      'Control de Calidad',     'Operaciones', 'tur_005', '+51 987 100 003', 3500, 'PEN', 'AFP - Integra',   21.88, 32.81, 'disponible'),
  ('pop_004', 'emp_001', 'TEC-004', 'Jorge Quispe Mamani',    '75678901', 'Técnico Instrumentista',   'Automatización',         'Operaciones', 'tur_004', '+51 987 100 004', 3000, 'PEN', 'ONP',             18.75, 28.13, 'vacaciones'),
  ('pop_005', 'emp_001', 'TEC-005', 'Pedro Condori Lima',     '76789012', 'Técnico Civil',            'Construcción',           'Operaciones', 'tur_001', '+51 987 100 005', 2500, 'PEN', 'AFP - Habitat',   15.63, 23.44, 'disponible'),
  ('pop_006', 'emp_001', 'TEC-006', 'Rosa Huanca Flores',     '77890123', 'Técnica Electrónica',      'Electrónica',            'Operaciones', 'tur_001', '+51 987 100 006', 2700, 'PEN', 'AFP - Prima',     16.88, 25.31, 'ocupado')
on conflict (id) do nothing;

-- Personal Administrativo
insert into public.personal_administrativo (id, empresa_id, codigo, nombre, documento, cargo, area, telefono, email, sueldo_base, moneda, sistema_pensionario, fecha_ingreso, vacaciones_pendientes, estado)
values
  ('pad_001', 'emp_001', 'ADM-001', 'Carla Meza Torres',      '74512345', 'Jefa Comercial',          'Comercial',     '+51 987 200 001', 'c.meza@tideo.pe',    4500, 'PEN', 'AFP - Integra', '2022-01-01', 18, 'activo'),
  ('pad_002', 'emp_001', 'ADM-002', 'Pedro Salas Quinones',   '76543210', 'Ejecutivo Comercial',     'Comercial',     '+51 987 200 002', 'p.salas@tideo.pe',   3200, 'PEN', 'AFP - Prima',   '2023-03-01', 25, 'activo'),
  ('pad_003', 'emp_001', 'ADM-003', 'Andrea Rios Gutierrez',  '73210987', 'Ejecutiva Comercial',     'Comercial',     '+51 987 200 003', 'a.rios@tideo.pe',    3400, 'PEN', 'AFP - Integra', '2021-06-15', 10, 'activo'),
  ('pad_004', 'emp_001', 'ADM-004', 'Roberto Quispe Paredes', '71234567', 'Jefe de Operaciones',     'Operaciones',   '+51 987 200 004', 'r.quispe@tideo.pe',  4800, 'PEN', 'AFP - Habitat', '2020-05-01', 22, 'activo'),
  ('pad_005', 'emp_001', 'ADM-005', 'Maria Flores Cano',      '72109876', 'Coordinadora RRHH',      'RRHH',          '+51 987 200 005', 'm.flores@tideo.pe',  3800, 'PEN', 'ONP',           '2021-11-01', 15, 'activo')
on conflict (id) do nothing;

-- Periodos de Nómina
insert into public.periodos_nomina (id, empresa_id, periodo, fecha_inicio, fecha_fin, total_trabajadores, masa_salarial_bruta, total_neto, total_cargas_empresa, moneda, estado)
values
  ('pnm_001', 'emp_001', '2026-03', '2026-03-01', '2026-03-31', 11, 35300, 28900, 8825, 'PEN', 'cerrado'),
  ('pnm_002', 'emp_001', '2026-04', '2026-04-01', '2026-04-30', 11, 35300, 28900, 8825, 'PEN', 'abierto')
on conflict (id, empresa_id) do nothing;
