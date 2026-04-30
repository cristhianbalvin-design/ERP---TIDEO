-- TIDEO ERP - Seeds demo multitenant.
-- Estos datos sirven para validar aislamiento por empresa y flujos base.

insert into public.planes (id, nombre, descripcion, usuarios_incluidos, modulos, precio_mensual, moneda)
values
  ('plan_growth', 'Growth', 'Plan demo para empresas de servicios en crecimiento', 25, '["crm","operaciones","compras","finanzas","rrhh","cs"]', 899.00, 'PEN'),
  ('plan_enterprise', 'Enterprise', 'Plan demo avanzado multitenant', 100, '["todos"]', 2499.00, 'PEN')
on conflict (id) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  usuarios_incluidos = excluded.usuarios_incluidos,
  modulos = excluded.modulos,
  precio_mensual = excluded.precio_mensual,
  moneda = excluded.moneda;

insert into public.empresas (id, razon_social, nombre_comercial, ruc, pais, moneda_base, plan_id, estado)
values
  ('emp_001', 'Servicios Industriales Norte SAC', 'Servicios Industriales Norte SAC', '20100023491', 'PE', 'PEN', 'plan_growth', 'activa'),
  ('emp_002', 'Facilities Lima SA', 'Facilities Lima', '20500011122', 'PE', 'PEN', 'plan_growth', 'activa')
on conflict (id) do update set
  razon_social = excluded.razon_social,
  nombre_comercial = excluded.nombre_comercial,
  ruc = excluded.ruc,
  plan_id = excluded.plan_id,
  estado = excluded.estado;

insert into public.roles (id, empresa_id, nombre, descripcion, es_admin_empresa)
values
  ('rol_emp001_admin', 'emp_001', 'Administrador', 'Administrador del tenant demo emp_001', true),
  ('rol_emp001_finanzas', 'emp_001', 'Finanzas', 'Rol demo con acceso financiero', false),
  ('rol_emp002_admin', 'emp_002', 'Administrador', 'Administrador del tenant demo emp_002', true)
on conflict (id) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  es_admin_empresa = excluded.es_admin_empresa;

-- Reemplazar estos UUID por usuarios reales de auth.users al conectar Supabase Auth.
insert into public.usuarios_empresas (user_id, empresa_id, rol_id, acceso_campo, perfil_campo, estado)
values
  ('00000000-0000-0000-0000-000000000001', 'emp_001', 'rol_emp001_admin', true, 'gerencia', 'activo'),
  ('00000000-0000-0000-0000-000000000002', 'emp_001', 'rol_emp001_finanzas', false, null, 'activo'),
  ('00000000-0000-0000-0000-000000000003', 'emp_002', 'rol_emp002_admin', true, 'gerencia', 'activo')
on conflict (user_id, empresa_id) do update set
  rol_id = excluded.rol_id,
  acceso_campo = excluded.acceso_campo,
  perfil_campo = excluded.perfil_campo,
  estado = excluded.estado;

insert into public.permisos_roles (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular, puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas)
values
  ('rol_emp001_admin', 'dashboard', true, true, true, true, true, true, true, true),
  ('rol_emp001_admin', 'financiamiento', true, true, true, true, true, true, true, true),
  ('rol_emp001_admin', 'estado_resultados', true, true, true, false, false, true, true, true),
  ('rol_emp001_admin', 'tesoreria', true, true, true, false, true, true, true, true),
  ('rol_emp001_admin', 'crm', true, true, true, true, true, true, false, false),
  ('rol_emp001_finanzas', 'financiamiento', true, true, true, false, false, true, true, true),
  ('rol_emp001_finanzas', 'estado_resultados', true, false, false, false, false, true, true, true),
  ('rol_emp001_finanzas', 'tesoreria', true, true, true, false, false, true, true, true),
  ('rol_emp002_admin', 'dashboard', true, true, true, true, true, true, true, true),
  ('rol_emp002_admin', 'financiamiento', true, true, true, true, true, true, true, true)
on conflict (rol_id, pantalla) do update set
  puede_ver = excluded.puede_ver,
  puede_crear = excluded.puede_crear,
  puede_editar = excluded.puede_editar,
  puede_anular = excluded.puede_anular,
  puede_aprobar = excluded.puede_aprobar,
  puede_exportar = excluded.puede_exportar,
  puede_ver_costos = excluded.puede_ver_costos,
  puede_ver_finanzas = excluded.puede_ver_finanzas;

insert into public.permisos_roles (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular, puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas)
select rol_id, pantalla, true, true, true, true, true, true, true, true
from (
  values
    ('rol_emp001_admin'), ('rol_emp002_admin')
) as roles(rol_id)
cross join (
  values
    ('actividades'), ('agenda_comercial'), ('hoja_costeo'), ('cotizaciones'), ('os_cliente'), ('backlog'), ('ots'), ('partes'), ('cierres_calidad'), ('tickets'),
    ('proveedores'), ('solpe'), ('cotizaciones_compra'), ('ordenes_compra'), ('ordenes_servicio'), ('recepciones'), ('inventario'),
    ('personal_operativo'), ('personal_administrativo'), ('turnos'), ('asistencia'), ('nomina'), ('prestamos_personal'),
    ('onboarding'), ('planes_exito'), ('health_score'), ('renovaciones'), ('nps'),
    ('ia_comercial'), ('ia_operativa'), ('ia_financiera')
) as pantallas(pantalla)
on conflict (rol_id, pantalla) do update set
  puede_ver = excluded.puede_ver,
  puede_crear = excluded.puede_crear,
  puede_editar = excluded.puede_editar,
  puede_anular = excluded.puede_anular,
  puede_aprobar = excluded.puede_aprobar,
  puede_exportar = excluded.puede_exportar,
  puede_ver_costos = excluded.puede_ver_costos,
  puede_ver_finanzas = excluded.puede_ver_finanzas;

insert into public.cuentas (id, empresa_id, nombre_comercial, razon_social, ruc, tipo, industria, responsable_id, condicion_pago, limite_credito, moneda, riesgo_financiero, estado)
values
  ('cta_001', 'emp_001', 'Minera Andes', 'Minera Andes SAC', '20451234987', 'cliente', 'Mineria', '00000000-0000-0000-0000-000000000001', '30 dias', 120000.00, 'PEN', 'medio', 'activo'),
  ('cta_002', 'emp_001', 'Planta Industrial Norte', 'Planta Industrial Norte SRL', '20678912345', 'cliente', 'Industrial', '00000000-0000-0000-0000-000000000001', '15 dias', 60000.00, 'PEN', 'bajo', 'activo'),
  ('cta_101', 'emp_002', 'Retail Lima', 'Retail Lima SAC', '20555111222', 'cliente', 'Retail', '00000000-0000-0000-0000-000000000003', '30 dias', 50000.00, 'PEN', 'bajo', 'activo')
on conflict (id) do update set
  nombre_comercial = excluded.nombre_comercial,
  razon_social = excluded.razon_social,
  estado = excluded.estado;

insert into public.leads (id, empresa_id, nombre_contacto, empresa_nombre, razon_social, ruc, industria, fuente, responsable_id, necesidad, presupuesto_estimado, moneda, estado)
values
  ('lead_001', 'emp_001', 'Carlos Rojas', 'Agro Norte', 'Agro Norte SAC', '20600123456', 'Agroindustria', 'Referido', '00000000-0000-0000-0000-000000000001', 'Mantenimiento preventivo de planta', 38000.00, 'PEN', 'nuevo'),
  ('lead_101', 'emp_002', 'Ana Torres', 'Clinica Lima', 'Clinica Lima SA', '20500999888', 'Salud', 'Web', '00000000-0000-0000-0000-000000000003', 'Facility management', 25000.00, 'PEN', 'nuevo')
on conflict (id) do update set estado = excluded.estado;

insert into public.financiamientos (
  id, empresa_id, codigo, tipo, entidad, tipo_entidad, contacto_nombre,
  monto_original, moneda, tasa_anual, tipo_tasa, plazo_meses, meses_gracia,
  dia_pago, tipo_cuota, cuota_mensual, fecha_desembolso, fecha_primer_pago,
  fecha_ultimo_pago, saldo_pendiente, cuotas_pagadas, intereses_pagados_total,
  proposito, centro_costo, cuenta_bancaria_destino, estado
)
values
  ('fin_001', 'emp_001', 'FIN-001', 'bancario', 'BCP - Banco de Credito del Peru', 'banco', 'Maria Gutierrez', 50000.00, 'PEN', 12.00, 'TEA', 24, 0, 5, 'frances', 2354.17, '2026-03-01', '2026-04-05', '2028-03-05', 31250.00, 8, 3240.00, 'Compra de equipos para operaciones de campo', 'CC-OPS', 'BCP Cta. cte.', 'vigente'),
  ('fin_002', 'emp_001', 'FIN-002', 'tercero', 'Luis Ramirez', 'persona_natural', 'Luis Ramirez', 10000.00, 'USD', 10.00, 'TEA', 24, 0, 5, 'bullet', 83.33, '2026-04-01', '2026-05-05', '2028-04-05', 5000.00, 1, 83.33, 'Capital de trabajo en dolares', 'CC-ADM', 'BCP Cta. cte.', 'vigente'),
  ('fin_101', 'emp_002', 'FIN-001', 'bancario', 'Interbank Empresas', 'banco', 'Ejecutivo Interbank', 30000.00, 'PEN', 11.00, 'TEA', 18, 0, 10, 'frances', 1835.00, '2026-02-10', '2026-03-10', '2027-08-10', 22000.00, 2, 520.00, 'Equipamiento operativo', 'CC-OPS', 'Interbank Cta.', 'vigente')
on conflict (id) do update set
  saldo_pendiente = excluded.saldo_pendiente,
  intereses_pagados_total = excluded.intereses_pagados_total,
  estado = excluded.estado;

insert into public.tabla_amortizacion (empresa_id, financiamiento_id, numero, fecha, capital, interes, total, saldo, estado, fecha_pago_real)
values
  ('emp_001', 'fin_001', 1, '2026-04-05', 1854.17, 500.00, 2354.17, 48145.83, 'pagada', '2026-04-05'),
  ('emp_001', 'fin_001', 2, '2026-05-05', 1872.71, 481.46, 2354.17, 46273.12, 'pendiente', null),
  ('emp_001', 'fin_002', 1, '2026-05-05', 0.00, 83.33, 83.33, 10000.00, 'pagada', '2026-04-28'),
  ('emp_001', 'fin_002', 2, '2026-06-05', 0.00, 41.67, 41.67, 5000.00, 'pendiente', null),
  ('emp_002', 'fin_101', 1, '2026-03-10', 1560.00, 275.00, 1835.00, 28440.00, 'pagada', '2026-03-10'),
  ('emp_002', 'fin_101', 2, '2026-04-10', 1574.30, 260.70, 1835.00, 26865.70, 'pagada', '2026-04-10'),
  ('emp_002', 'fin_101', 3, '2026-05-10', 1588.73, 246.27, 1835.00, 25276.97, 'pendiente', null)
on conflict (financiamiento_id, numero) do update set
  capital = excluded.capital,
  interes = excluded.interes,
  total = excluded.total,
  saldo = excluded.saldo,
  estado = excluded.estado,
  fecha_pago_real = excluded.fecha_pago_real;

insert into public.pagos_financiamiento (id, empresa_id, financiamiento_id, fecha_pago, tipo, cuota_numero, capital, interes, total, saldo_despues, moneda, cuenta_bancaria, referencia, registrado_por)
values
  ('pag_fin_001_1', 'emp_001', 'fin_001', '2026-04-05', 'cuota', 1, 1854.17, 500.00, 2354.17, 48145.83, 'PEN', 'BCP Cta. cte.', 'TRX-001', '00000000-0000-0000-0000-000000000002'),
  ('pag_fin_002_1', 'emp_001', 'fin_002', '2026-04-28', 'cuota', 1, 0.00, 83.33, 83.33, 10000.00, 'USD', 'BCP Cta. cte.', 'TRX-USD-001', '00000000-0000-0000-0000-000000000002'),
  ('pag_fin_002_abono', 'emp_001', 'fin_002', '2026-04-28', 'capital_parcial', null, 5000.00, 0.00, 5000.00, 5000.00, 'USD', 'BCP Cta. cte.', 'ABO-USD-001', '00000000-0000-0000-0000-000000000002')
on conflict (id) do nothing;

insert into public.compras_gastos (id, empresa_id, tipo, descripcion, categoria, subcategoria, monto, moneda, fecha, financiamiento_id, cuota_numero, estado)
values
  ('gasto_int_fin_001_1', 'emp_001', 'gasto', 'Intereses BCP - Cuota 1/24', 'Gastos financieros', 'Intereses de prestamos', 500.00, 'PEN', '2026-04-05', 'fin_001', 1, 'registrado'),
  ('gasto_int_fin_002_1', 'emp_001', 'gasto', 'Intereses Luis Ramirez - Cuota 1/24', 'Gastos financieros', 'Intereses de prestamos', 83.33, 'USD', '2026-04-28', 'fin_002', 1, 'registrado')
on conflict (id) do update set monto = excluded.monto, moneda = excluded.moneda;

insert into public.movimientos_tesoreria (id, empresa_id, tipo, descripcion, monto, moneda, fecha, cuenta_bancaria, referencia, vinculo_tipo, vinculo_id, estado)
values
  ('egr_fin_001_1', 'emp_001', 'egreso', 'Cuota 1 BCP - Banco de Credito del Peru', 2354.17, 'PEN', '2026-04-05', 'BCP Cta. cte.', 'TRX-001', 'financiamiento', 'fin_001', 'registrado'),
  ('egr_fin_002_1', 'emp_001', 'egreso', 'Cuota 1 Luis Ramirez', 83.33, 'USD', '2026-04-28', 'BCP Cta. cte.', 'TRX-USD-001', 'financiamiento', 'fin_002', 'registrado'),
  ('egr_fin_002_abono', 'emp_001', 'egreso', 'Abono a capital Luis Ramirez', 5000.00, 'USD', '2026-04-28', 'BCP Cta. cte.', 'ABO-USD-001', 'financiamiento', 'fin_002', 'registrado')
on conflict (id) do update set monto = excluded.monto, moneda = excluded.moneda;
