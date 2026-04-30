-- TIDEO ERP - Seeds CRM demo para emp_001.
-- Ejecutar despues de 001_demo_tenants.sql.
-- Proporciona datos ricos para validar el modulo CRM en modo Supabase.

-- Cuentas
insert into public.cuentas (id, empresa_id, nombre_comercial, razon_social, ruc, tipo, industria, condicion_pago, limite_credito, moneda, riesgo_financiero, estado)
values
  ('cta_001', 'emp_001', 'Minera Andes',          'Minera Andes SAC',                   '20451234987', 'estrategico', 'Mineria',        '30 dias', 120000, 'PEN', 'medio', 'activo'),
  ('cta_002', 'emp_001', 'Planta Industrial Norte','Planta Industrial Norte SRL',         '20678912345', 'clave',       'Industrial',     '15 dias',  60000, 'PEN', 'bajo',  'activo'),
  ('cta_003', 'emp_001', 'Logistica Altiplano',    'Logistica Altiplano SAC',            '20512398761', 'recurrente',  'Logistica',      '30 dias',  45000, 'PEN', 'alto',  'activo'),
  ('cta_004', 'emp_001', 'Textil Andina',          'Textil Andina SA',                   '20309876543', 'recurrente',  'Textil',         '30 dias',  30000, 'PEN', 'bajo',  'activo'),
  ('cta_005', 'emp_001', 'Facilities Lima',        'Facilities Lima SA',                 '20500011122', 'estrategico', 'Facility Mgmt',  '45 dias',  80000, 'PEN', 'medio', 'activo'),
  ('cta_006', 'emp_001', 'Distribuidora Sur',      'Distribuidora Sur EIRL',             '20412356789', 'prospecto',   'Distribucion',   '15 dias',  15000, 'PEN', 'bajo',  'activo')
on conflict (id) do update set
  nombre_comercial  = excluded.nombre_comercial,
  tipo              = excluded.tipo,
  industria         = excluded.industria,
  condicion_pago    = excluded.condicion_pago,
  limite_credito    = excluded.limite_credito,
  riesgo_financiero = excluded.riesgo_financiero,
  estado            = excluded.estado;

-- Contactos
insert into public.contactos (id, empresa_id, cuenta_id, nombre, cargo, telefono, email, es_principal, estado)
values
  ('con_001', 'emp_001', 'cta_001', 'Jorge Mamani',    'Jefe de Mantenimiento', '+51 987 001 001', 'j.mamani@mineraandes.pe',    true,  'activo'),
  ('con_002', 'emp_001', 'cta_001', 'Patricia Flores', 'Gerente de Compras',    '+51 987 001 002', 'p.flores@mineraandes.pe',    false, 'activo'),
  ('con_003', 'emp_001', 'cta_002', 'Carlos Quispe',   'Director de Planta',    '+51 987 002 001', 'c.quispe@plantanorte.pe',    true,  'activo'),
  ('con_004', 'emp_001', 'cta_003', 'Lucia Vargas',    'Jefa de Operaciones',   '+51 987 003 001', 'l.vargas@altiplano.pe',      true,  'activo'),
  ('con_005', 'emp_001', 'cta_004', 'Rosa Mamani',     'Gerente de Operaciones','+51 976 543 210', 'r.mamani@textil-andina.pe',  true,  'activo'),
  ('con_006', 'emp_001', 'cta_005', 'Ana Torres',      'Administradora',        '+51 987 005 001', 'a.torres@facilitieslima.pe', true,  'activo')
on conflict (id) do update set
  nombre    = excluded.nombre,
  cargo     = excluded.cargo,
  telefono  = excluded.telefono,
  email     = excluded.email,
  es_principal = excluded.es_principal;

-- Leads
insert into public.leads (id, empresa_id, nombre_contacto, empresa_nombre, razon_social, ruc, industria, telefono, email, fuente, necesidad, presupuesto_estimado, moneda, estado, convertido)
values
  ('lead_001', 'emp_001', 'Carlos Huanca',    'Minera San Cristobal SAC',    'Minera San Cristobal SAC',    '20600123456', 'Mineria',        '+51 987 654 321', 'c.huanca@sancristobal.pe',  'Referido',       'Mantenimiento de fajas transportadoras, 3 unidades con desgaste critico', 85000, 'PEN', 'calificado',  false),
  ('lead_002', 'emp_001', 'Rosa Mamani',      'Textil Andina SA',            'Textil Andina SA',            '20309876543', 'Textil',         '+51 976 543 210', 'r.mamani@textil-andina.pe', 'Formulario web', 'Servicio de limpieza industrial y mantenimiento preventivo mensual',    24000, 'PEN', 'nuevo',       false),
  ('lead_003', 'emp_001', 'Jorge Quispe',     'Distribuidora Sur EIRL',      'Distribuidora Sur EIRL',      '20412356789', 'Distribucion',   '+51 965 432 109', 'j.quispe@distrisur.pe',     'Evento / Feria', 'Mantenimiento electrico preventivo de almacenes',                      8000, 'PEN', 'en_contacto', false),
  ('lead_004', 'emp_001', 'Patricia Condori', 'Agroindustrial Valle Verde',  'Agroindustrial Valle Verde SAC','20600999001','Agroindustria',  '+51 954 321 098', 'p.condori@valleverde.pe',   'Referido',       'Instalacion de sistema de riego automatizado y mantenimiento',         45000, 'PEN', 'nuevo',       false),
  ('lead_005', 'emp_001', 'Manuel Chavez',    'Constructora Rimac SA',       'Constructora Rimac SA',       '20500567890', 'Construccion',   '+51 943 210 987', 'm.chavez@constructora-rimac.pe','LinkedIn',    'Outsourcing de personal tecnico para proyecto 8 meses',               120000,'PEN', 'descartado',  false)
on conflict (id) do update set
  nombre_contacto     = excluded.nombre_contacto,
  empresa_nombre      = excluded.empresa_nombre,
  necesidad           = excluded.necesidad,
  presupuesto_estimado= excluded.presupuesto_estimado,
  estado              = excluded.estado;

-- Oportunidades
insert into public.oportunidades (id, empresa_id, cuenta_id, lead_id, nombre, etapa, probabilidad, monto_estimado, moneda, fecha_cierre_estimada, estado)
values
  ('opp_001', 'emp_001', 'cta_001', null,     'Contrato mantenimiento anual Minera Andes',    'negociacion',  70, 280000, 'PEN', '2026-06-30', 'abierta'),
  ('opp_002', 'emp_001', 'cta_002', null,     'Overhaul de linea de produccion',              'propuesta',    50, 145000, 'PEN', '2026-07-15', 'abierta'),
  ('opp_003', 'emp_001', 'cta_003', null,     'Servicio preventivo flota logistica',          'calificacion', 30,  72000, 'PEN', '2026-08-01', 'abierta'),
  ('opp_004', 'emp_001', 'cta_004', 'lead_002','Limpieza industrial Textil Andina',           'propuesta',    60,  24000, 'PEN', '2026-05-31', 'abierta'),
  ('opp_005', 'emp_001', 'cta_005', null,     'Gestion integral de instalaciones',            'ganada',      100, 195000, 'PEN', '2026-04-15', 'ganada'),
  ('opp_006', 'emp_001', 'cta_001', null,     'Instalacion sistema monitoreo predictivo',     'calificacion', 25,  58000, 'PEN', '2026-09-01', 'abierta')
on conflict (id) do update set
  etapa        = excluded.etapa,
  probabilidad = excluded.probabilidad,
  monto_estimado = excluded.monto_estimado,
  estado       = excluded.estado;

-- Agenda Comercial
insert into public.agenda_comercial (id, empresa_id, titulo, tipo, cuenta_id, lead_id, oportunidad_id, vendedor, registrado_por, fecha, hora, duracion_minutos, estado, notas)
values
  ('evt_001', 'emp_001', 'Visita de inspeccion inicial', 'visita', 'cta_003', null, 'opp_003', 'Carla Meza', 'Carla Meza', '2026-04-29', '10:00', 60, 'programado', 'Confirmar medidas para propuesta'),
  ('evt_002', 'emp_001', 'Reunion de seguimiento', 'reunion', 'cta_001', null, 'opp_001', 'Carla Meza', 'Carla Meza', '2026-04-30', '15:00', 45, 'programado', 'Revision de contrato anual'),
  ('evt_003', 'emp_001', 'Llamada prospecto', 'llamada', null, 'lead_002', null, 'Pedro Salas', 'Pedro Salas', '2026-04-29', '09:30', 15, 'realizado', 'No contesto, reprogramar'),
  ('evt_004', 'emp_001', 'Demo del servicio', 'demo', 'cta_004', null, 'opp_004', 'Pedro Salas', 'Pedro Salas', '2026-05-02', '11:00', 60, 'programado', 'Llevar equipos de muestra')
on conflict (id) do update set
  titulo = excluded.titulo,
  tipo = excluded.tipo,
  vendedor = excluded.vendedor,
  registrado_por = excluded.registrado_por,
  fecha = excluded.fecha,
  hora = excluded.hora,
  estado = excluded.estado;

-- Actividades Comerciales
insert into public.actividades_comerciales (
  id, empresa_id, tipo, vinculo_tipo, vinculo_id, cuenta_id, contacto_id,
  oportunidad_id, lead_id, responsable, fecha, hora, descripcion, resultado,
  proxima_accion, proxima_accion_fecha, estado
)
values
  ('act_001', 'emp_001', 'reunion', 'oportunidad', 'opp_001', 'cta_001', 'con_001', 'opp_001', null, 'Carla Meza', '2026-04-20', '10:00', 'Reunion de renovacion contrato anual.', 'Cliente pide incluir dos sedes adicionales.', 'Preparar propuesta ajustada', '2026-04-25', 'completada'),
  ('act_002', 'emp_001', 'llamada', 'oportunidad', 'opp_004', 'cta_004', 'con_005', 'opp_004', null, 'Pedro Salas', '2026-04-25', '15:30', 'Llamada de seguimiento a propuesta.', 'Pendiente revision con operaciones.', 'Enviar alcance actualizado', '2026-04-30', 'pendiente'),
  ('act_003', 'emp_001', 'tarea', 'lead', 'lead_002', null, null, null, 'lead_002', 'Pedro Salas', '2026-04-29', '09:00', 'Primer contacto con prospecto Textil Andina.', null, null, null, 'pendiente')
on conflict (id) do update set
  tipo = excluded.tipo,
  responsable = excluded.responsable,
  fecha = excluded.fecha,
  hora = excluded.hora,
  descripcion = excluded.descripcion,
  resultado = excluded.resultado,
  estado = excluded.estado;

-- Cotizaciones
insert into public.cotizaciones (id, empresa_id, oportunidad_id, cuenta_id, numero, version, estado, fecha, items, subtotal, descuento_global_pct, descuento_global, base_imponible, igv_pct, igv, total, moneda, condicion_pago)
values
  ('cot_001', 'emp_001', 'opp_005', 'cta_005', 'COT-2026-0001', 1, 'aprobada', '2026-04-10', '[{"desc": "Gestión integral de instalaciones", "monto": 195000}]'::jsonb, 195000, 0, 0, 195000, 18, 35100, 230100, 'PEN', '45 dias'),
  ('cot_002', 'emp_001', 'opp_004', 'cta_004', 'COT-2026-0002', 1, 'enviada', '2026-04-25', '[{"desc": "Limpieza industrial", "monto": 24000}]'::jsonb, 24000, 5, 1200, 22800, 18, 4104, 26904, 'PEN', '30 dias')
on conflict (id) do update set
  estado = excluded.estado,
  total = excluded.total;

-- OS Clientes
insert into public.os_clientes (id, empresa_id, cuenta_id, cotizacion_id, oportunidad_id, numero, numero_doc_cliente, monto_aprobado, moneda, condicion_pago, fecha_emision, fecha_inicio, fecha_fin, sla, estado, saldo_por_ejecutar, saldo_por_valorizar, saldo_por_facturar, anticipo_recibido, monto_facturado, monto_cobrado, ots_asociadas)
values
  ('osc_001', 'emp_001', 'cta_005', 'cot_001', 'opp_005', 'OSC-2026-0001', 'OC-998877', 230100, 'PEN', '45 dias', '2026-04-15', '2026-05-01', '2026-12-31', 'estricto', 'en_ejecucion', 230100, 230100, 230100, 0, 0, 0, '[]'::jsonb)
on conflict (id) do update set
  estado = excluded.estado,
  saldo_por_ejecutar = excluded.saldo_por_ejecutar;
