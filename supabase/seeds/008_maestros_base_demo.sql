-- TIDEO ERP - Seeds Maestros Base demo para emp_001.
-- Ejecutar despues de 001_demo_tenants.sql.

-- Cargos
insert into public.cargos_empresa (id, empresa_id, codigo, nombre, tipo, detalle, estado)
values
  ('car_001', 'emp_001', 'CAR-001', 'Gerente General',                'Administrativo', 'Responsable legal y dirección',             'activo'),
  ('car_002', 'emp_001', 'CAR-002', 'Super Administrador',            'Administrativo', 'Administrador total del tenant',            'activo'),
  ('car_003', 'emp_001', 'CAR-003', 'Jefe Comercial',                 'Administrativo', 'Responsable de ventas y pipeline',          'activo'),
  ('car_004', 'emp_001', 'CAR-004', 'Ejecutivo Comercial',            'Administrativo', 'Gestión de cuentas y oportunidades',        'activo'),
  ('car_005', 'emp_001', 'CAR-005', 'Jefe de Operaciones',            'Administrativo', 'Responsable de ejecución operativa',        'activo'),
  ('car_006', 'emp_001', 'CAR-006', 'Jefe de Finanzas',               'Administrativo', 'CxC, CxP, tesorería y EEFF',                'activo'),
  ('car_007', 'emp_001', 'CAR-007', 'Analista Financiero',            'Administrativo', 'Soporte financiero y reportes',             'activo'),
  ('car_008', 'emp_001', 'CAR-008', 'Responsable Customer Success',   'Administrativo', 'Gestión de clientes y renovaciones',        'activo'),
  ('car_009', 'emp_001', 'CAR-009', 'Comprador',                      'Administrativo', 'Adquisiciones y proveedores',               'activo'),
  ('car_010', 'emp_001', 'CAR-010', 'Almacenero',                     'Administrativo', 'Control de inventario y despacho',          'activo'),
  ('car_011', 'emp_001', 'CAR-011', 'Técnico Mecánico',               'Operativo',      'Mantenimiento mecánico industrial',         'activo'),
  ('car_012', 'emp_001', 'CAR-012', 'Técnico Electrónico',            'Operativo',      'Sistemas eléctricos y electrónicos',        'activo'),
  ('car_013', 'emp_001', 'CAR-013', 'Técnico de Instrumentación',     'Operativo',      'Instrumentos de medición y control',        'activo'),
  ('car_015', 'emp_001', 'CAR-015', 'Electricista Industrial',        'Operativo',      'Instalaciones eléctricas de alta tensión',  'activo'),
  ('car_016', 'emp_001', 'CAR-016', 'Supervisora SSO',                'Operativo',      'Seguridad y salud ocupacional',             'activo'),
  ('car_018', 'emp_001', 'CAR-018', 'Ayudante Técnico',               'Operativo',      'Apoyo en trabajos de campo',                'activo'),
  ('car_019', 'emp_001', 'CAR-019', 'Soldador Certificado',           'Operativo',      'Soldadura estructural e industrial',        'activo'),
  ('car_021', 'emp_001', 'CAR-021', 'Operario de Mantenimiento',      'Operativo',      'Mantenimiento general en campo',            'activo'),
  ('car_022', 'emp_001', 'CAR-022', 'Supervisor de Operaciones',      'Ambos',          'Supervisión de equipos mixtos',             'activo')
on conflict (id) do nothing;

-- Especialidades Tecnicas
insert into public.especialidades_tecnicas (id, empresa_id, codigo, nombre, area, requiere_cert, estado)
values
  ('esp_001', 'emp_001', 'ESP-001', 'Electricista industrial',           'Eléctrica',       true,  'activo'),
  ('esp_002', 'emp_001', 'ESP-002', 'Mecánico de fajas transportadoras', 'Mecánica',        false, 'activo'),
  ('esp_003', 'emp_001', 'ESP-003', 'Técnico en instrumentación',        'Instrumentación', true,  'activo'),
  ('esp_004', 'emp_001', 'ESP-004', 'Soldador homologado',               'Mecánica',        true,  'activo'),
  ('esp_005', 'emp_001', 'ESP-005', 'Técnico CCTV y seguridad',          'Sistemas',        false, 'activo'),
  ('esp_006', 'emp_001', 'ESP-006', 'Técnico en climatización',          'Mecánica',        false, 'activo'),
  ('esp_007', 'emp_001', 'ESP-007', 'Supervisor HSE',                    'Seguridad',       true,  'activo'),
  ('esp_008', 'emp_001', 'ESP-008', 'Técnico polivalente',               'General',         false, 'activo')
on conflict (id) do nothing;

-- Tipos de Servicio Interno
insert into public.tipos_servicio_interno (id, empresa_id, codigo, nombre, clasificacion, facturable, estado)
values
  ('tsi_001', 'emp_001', 'TSI-001', 'Mantenimiento preventivo', 'Preventivo', true,  'activo'),
  ('tsi_002', 'emp_001', 'TSI-002', 'Mantenimiento correctivo', 'Correctivo', true,  'activo'),
  ('tsi_003', 'emp_001', 'TSI-003', 'Proyecto de instalación',  'Proyecto',   true,  'activo'),
  ('tsi_004', 'emp_001', 'TSI-004', 'Atención de emergencia',   'Emergencia', true,  'activo'),
  ('tsi_005', 'emp_001', 'TSI-005', 'Servicio en garantía',     'Garantía',   false, 'activo'),
  ('tsi_006', 'emp_001', 'TSI-006', 'Trabajo interno',          'Interno',    false, 'activo')
on conflict (id) do nothing;

-- Sedes
insert into public.sedes (id, empresa_id, codigo, nombre, direccion, gps, estado)
values
  ('sed_001', 'emp_001', 'SED-001', 'Sede Central San Isidro', 'Av. Javier Prado Este 456, San Isidro, Lima', '-12.0934,-77.0256', 'activo'),
  ('sed_002', 'emp_001', 'SED-002', 'Planta Lurin', 'Km 35 Antigua Panamericana Sur, Lurin', '-12.2831,-76.8833', 'activo')
on conflict (id) do nothing;
