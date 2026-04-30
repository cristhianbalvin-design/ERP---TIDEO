# Backlog Tecnico Inicial - TIDEO ERP

## Convencion

- `P0`: bloqueante para arquitectura o seguridad.
- `P1`: necesario para flujo principal.
- `P2`: mejora importante.
- `P3`: optimizacion o deuda no bloqueante.

## Epica 0 - Gobierno Del Proyecto

| ID | Prioridad | Tarea | Dependencia | Entregable | Criterio de aceptacion |
|----|-----------|-------|-------------|------------|-------------------------|
| GOV-001 | P0 | Mantener Documento Maestro como fuente de verdad | Ninguna | Documento maestro actualizado por sesion relevante | Cada cambio funcional importante queda reflejado en el documento |
| GOV-002 | P0 | Crear roadmap tecnico faseado | GOV-001 | `Documents/PlanDesarrolloTecnico.md` | El roadmap contiene fases, entregables, riesgos y criterios de salida |
| GOV-003 | P0 | Crear backlog tecnico inicial | GOV-002 | `Documents/BacklogTecnicoInicial.md` | Las tareas tienen prioridad, dependencia y criterio de aceptacion |
| GOV-004 | P1 | Crear matriz de dependencias entre modulos | GOV-003 | `Documents/MatrizDependencias.md` | Cada modulo indica modulos origen, destino y datos compartidos |

## Epica 1 - Base Frontend

| ID | Prioridad | Tarea | Dependencia | Entregable | Criterio de aceptacion |
|----|-----------|-------|-------------|------------|-------------------------|
| FE-001 | P0 | Crear `src/lib` para helpers transversales | GOV-003 | Carpeta y helpers base | Los helpers no dependen de React ni de componentes |
| FE-002 | P0 | Crear helper de moneda multimoneda | FE-001 | `src/lib/currency.js` | Formatea PEN, USD y moneda desconocida sin asumir soles |
| FE-003 | P0 | Crear helper de fechas | FE-001 | `src/lib/dates.js` | Calcula periodos, vencimientos y rangos sin logica duplicada |
| FE-004 | P0 | Crear helper de tenant | FE-001 | `src/lib/tenant.js` | Filtra por `empresa_id` de forma consistente |
| FE-005 | P1 | Crear helper de permisos | FE-001 | `src/lib/permissions.js` | Evalua permisos de pantalla y permisos especiales |
| FE-006 | P1 | Crear componentes UI compartidos | FE-001 | `src/components` | Tabs, badges y tablas respetan clases existentes |
| FE-007 | P1 | Crear convencion de modulos | FE-001 | `src/modules` | Los nuevos modulos tienen UI, servicio y reglas separadas |

## Epica 2 - Capa De Datos Mock-Compatible

| ID | Prioridad | Tarea | Dependencia | Entregable | Criterio de aceptacion |
|----|-----------|-------|-------------|------------|-------------------------|
| DATA-001 | P0 | Crear contrato de repositorio base | FE-001 | `src/services/createMockRepository.js` | Permite `list`, `getById`, `create`, `update`, `softDelete` |
| DATA-002 | P0 | Crear filtro tenant en servicios | FE-004 | Servicio base con `empresa_id` | Ninguna consulta de negocio devuelve datos de otra empresa |
| DATA-003 | P1 | Migrar financiamientos a servicio | DATA-001 | `src/services/financiamientosService.js` | El modulo no lee directamente desde `MOCK` para operaciones principales |
| DATA-004 | P1 | Migrar compras/gastos financieros a servicio | DATA-001 | `src/services/comprasGastosService.js` | ER puede leer gastos desde capa de servicio |
| DATA-005 | P1 | Migrar movimientos de tesoreria a servicio | DATA-001 | `src/services/tesoreriaService.js` | Pagos y egresos usan contrato comun |

## Epica 3 - Supabase Y Multitenant

| ID | Prioridad | Tarea | Dependencia | Entregable | Criterio de aceptacion |
|----|-----------|-------|-------------|------------|-------------------------|
| DB-001 | P0 | Crear schema SQL de plataforma | GOV-003 | `supabase/schemas/001_platform.sql` | Tablas sin `empresa_id` para plataforma global |
| DB-002 | P0 | Crear schema SQL de acceso | DB-001 | `supabase/schemas/002_access.sql` | Usuarios, roles, permisos y auditoria definidos |
| DB-003 | P0 | Crear schema SQL de negocio | DB-002 | `supabase/schemas/003_business.sql` | Tablas de negocio tienen `empresa_id` |
| DB-004 | P0 | Definir politicas RLS | DB-003 | `supabase/policies` | Un usuario solo accede a empresas asociadas |
| DB-005 | P1 | Crear seeds demo por tenant | DB-003 | `supabase/seeds` | Existen al menos dos empresas con datos aislados |

## Epica 4 - Auth Y Permisos

| ID | Prioridad | Tarea | Dependencia | Entregable | Criterio de aceptacion |
|----|-----------|-------|-------------|------------|-------------------------|
| AUTH-001 | P0 | Integrar Supabase Auth | DB-002 | Login funcional | Usuario inicia y cierra sesion |
| AUTH-002 | P0 | Resolver empresa activa | AUTH-001 | Selector tenant | Usuario multiempresa elige empresa al entrar |
| AUTH-003 | P0 | Reemplazar simulador por roles reales | AUTH-002 | Contexto de sesion real | El rol proviene de base de datos |
| AUTH-004 | P0 | Filtrar sidebar por permisos | AUTH-003 | Sidebar seguro | Pantallas sin permiso no aparecen |
| AUTH-005 | P1 | Auditar acceso superadmin | AUTH-003 | Registros en `auditoria` | Cada acceso a tenant por superadmin queda trazado |

## Epica 5 - CRM Y Comercial

| ID | Prioridad | Tarea | Dependencia | Entregable | Criterio de aceptacion |
|----|-----------|-------|-------------|------------|-------------------------|
| CRM-001 | P1 | Expandir formulario Lead | FE-001 | Lead con RUC, razon social e industria | Los campos se guardan y validan |
| CRM-002 | P1 | Implementar conversion Lead | CRM-001 | Cuenta + Contacto + Oportunidad | No duplica cuenta si RUC ya existe |
| CRM-003 | P1 | Expandir Cuenta | CRM-002 | Alta comercial y tab financiero | Campos financieros solo con `ver_finanzas` |
| COM-001 | P1 | Cotizaciones versionadas | CRM-003 | Historial de versiones | Cada cambio relevante genera version |
| COM-002 | P1 | OS Cliente conectada | COM-001 | OS como origen de OT y facturacion | La OS controla saldos ejecutado, valorizado y facturado |

## Epica 6 - Operaciones

| ID | Prioridad | Tarea | Dependencia | Entregable | Criterio de aceptacion |
|----|-----------|-------|-------------|------------|-------------------------|
| OPS-001 | P1 | OT vinculada a OS Cliente | COM-002 | Relacion OS -> OT | No se crea OT facturable sin OS |
| OPS-002 | P1 | Parte Diario completo | OPS-001 | Actividad, horas, materiales y evidencias | Parte impacta avance y costo |
| OPS-003 | P1 | Cierre tecnico | OPS-002 | Conformidad y estado cerrado | OT cerrada queda disponible para valorizacion |
| OPS-004 | P1 | Costos por OT | OPS-002 | Mano de obra, materiales y terceros | Margen se calcula desde transacciones |

## Epica 7 - Compras E Inventario

| ID | Prioridad | Tarea | Dependencia | Entregable | Criterio de aceptacion |
|----|-----------|-------|-------------|------------|-------------------------|
| PUR-001 | P0 | Corregir Maestros Base | GOV-003 | Maestros solo referencia | Personal y clientes no se administran desde Maestros |
| PUR-002 | P1 | SOLPE Interna | PUR-001 | Solicitud aprobable | SOLPE aprobada inicia flujo de compras |
| PUR-003 | P1 | Proveedores con homologacion | PUR-002 | Ficha proveedor completa | Solo homologados aparecen en OC/OS |
| PUR-004 | P1 | Cotizaciones de compra | PUR-003 | Comparativo proveedor | Se selecciona ganador con justificacion |
| PUR-005 | P1 | OC / OS Interna | PUR-004 | Orden emitida | Diferencia bienes vs servicios |
| PUR-006 | P1 | Recepciones | PUR-005 | Recepcion total, parcial u observada | Actualiza OC, inventario y CxP |
| INV-001 | P1 | Kardex real | PUR-006 | Movimientos inventario | Stock disponible y reservado se calculan correctamente |

## Epica 8 - RRHH Y Nomina

| ID | Prioridad | Tarea | Dependencia | Entregable | Criterio de aceptacion |
|----|-----------|-------|-------------|------------|-------------------------|
| HR-001 | P1 | Mover Personal a RRHH | GOV-003 | Sidebar y rutas corregidas | Personal no queda en Configuracion |
| HR-002 | P1 | Turnos y Horarios | HR-001 | Catalogo de turnos | Calcula horas efectivas |
| HR-003 | P1 | Control de Asistencia | HR-002 | Registro diario, semanal y mensual | Calcula tardanza, falta y horas extra |
| HR-004 | P1 | Nomina Basica | HR-003 | Calculo referencial Peru | Genera neto, cargas y costo real |
| HR-005 | P1 | Prestamos al Personal | HR-004 | Descuento en nomina | No se mezcla con financiamiento recibido |
| HR-006 | P1 | Actualizar costo hora real | HR-004 | Costo hora en ficha tecnico | OT usa costo actualizado despues de cierre |

## Epica 9 - Finanzas

| ID | Prioridad | Tarea | Dependencia | Entregable | Criterio de aceptacion |
|----|-----------|-------|-------------|------------|-------------------------|
| FIN-001 | P1 | CxC desde facturacion | COM-002 | Cuentas por cobrar reales | Factura genera CxC |
| FIN-002 | P1 | CxP desde compras | PUR-006 | Cuentas por pagar reales | Recepcion genera CxP |
| FIN-003 | P1 | Tesoreria vinculada | FIN-001 | Movimientos con vinculo | Ingresos y egresos apuntan a origen |
| FIN-004 | P0 | ER desde transacciones reales | FIN-003 | Estado de Resultados recalculado | No usa gastos financieros hardcodeados |
| FIN-005 | P0 | Financiamiento multimoneda | FIN-004 | Deuda por moneda | Indicadores y reporte no mezclan PEN y USD |
| FIN-006 | P0 | Abonos a capital recalculan amortizacion | FIN-005 | Tabla recalculada | Intereses futuros se calculan sobre nuevo saldo |
| FIN-007 | P1 | Presupuesto vs Real conectado | FIN-004 | Comparativo por centro de costo | Real proviene de transacciones |

## Epica 10 - Customer Success

| ID | Prioridad | Tarea | Dependencia | Entregable | Criterio de aceptacion |
|----|-----------|-------|-------------|------------|-------------------------|
| CS-001 | P2 | Onboarding desde cliente ganado | CRM-003 | Checklist onboarding | Se crea onboarding al ganar oportunidad |
| CS-002 | P2 | Health Score conectado | CS-001 | Score 5 dimensiones | Incluye senales financieras y soporte |
| CS-003 | P2 | Renovaciones | CS-002 | Alertas 90/60/30 | Cliente con deuda vencida muestra advertencia |
| CS-004 | P2 | NPS y fidelizacion | CS-002 | Encuestas y referidos | NPS alimenta Health Score |

## Epica 11 - IA

| ID | Prioridad | Tarea | Dependencia | Entregable | Criterio de aceptacion |
|----|-----------|-------|-------------|------------|-------------------------|
| AI-001 | P2 | Crear `ia_logs` | DB-003 | Tabla y servicio | Toda recomendacion queda registrada |
| AI-002 | P2 | IA Comercial auditada | AI-001 | Resumen y siguiente accion | Usuario decide accion tomada |
| AI-003 | P2 | IA Operativa auditada | AI-001 | Resumen OT y clasificacion tickets | No cambia estados sin usuario |
| AI-004 | P2 | IA Financiera auditada | AI-001 | Alertas y explicaciones | Las alertas no modifican contabilidad |

## Epica 12 - Campo Movil

| ID | Prioridad | Tarea | Dependencia | Entregable | Criterio de aceptacion |
|----|-----------|-------|-------------|------------|-------------------------|
| MOB-001 | P2 | PWA instalable | AUTH-004 | Manifest y service worker revisados | Se instala desde browser |
| MOB-002 | P2 | Vista tecnico | OPS-001 | OTs del dia y parte movil | Registra GPS y evidencias |
| MOB-003 | P2 | Vista comprador | PUR-002 | Captura comprobante | Queda pendiente de revision backoffice |
| MOB-004 | P2 | Offline basico | MOB-002 | Cola local controlada | Formularios criticos toleran perdida de conexion |

## Epica 13 - QA Y Produccion

| ID | Prioridad | Tarea | Dependencia | Entregable | Criterio de aceptacion |
|----|-----------|-------|-------------|------------|-------------------------|
| QA-001 | P1 | Tests de flujos criticos | FE-001 | Suite base | Cubre CRM, OT, compras, finanzas y auth |
| QA-002 | P0 | Tests de RLS | DB-004 | Validacion aislamiento | Un tenant no lee datos de otro |
| QA-003 | P1 | Seeds demo | DB-005 | Datos consistentes | Demo reproduce flujo completo |
| OPSPROD-001 | P1 | Deploy Vercel | AUTH-001 | Ambiente staging | Build y deploy reproducibles |
| OPSPROD-002 | P1 | Backups Supabase | DB-003 | Politica de respaldo | Restauracion documentada |
| OPSPROD-003 | P1 | Manual operativo | QA-001 | Manual tecnico y funcional | Equipo puede operar y soportar tenant demo |

## Primer Sprint Recomendado

Objetivo: empezar Fase 1 sin romper el prototipo.

Tareas:
- FE-001: crear `src/lib`.
- FE-002: helper multimoneda.
- FE-003: helper fechas.
- FE-004: helper tenant.
- DATA-001: repositorio mock-compatible.
- DATA-003: preparar financiamientos como primer modulo piloto.

Criterio del sprint:
- El modulo Financiamiento y Deuda puede usar helpers compartidos y queda como referencia para migrar otros modulos.

## Avance Sprint 1 - 28/04/2026

Completado:
- FE-001: creada base `src/lib`.
- FE-002: creado helper multimoneda `src/lib/currency.js`.
- FE-003: creado helper de fechas `src/lib/dates.js`.
- FE-004: creado helper tenant `src/lib/tenant.js`.
- FE-005: creado helper de permisos `src/lib/permissions.js`.
- DATA-001: creado repositorio mock-compatible `src/services/createMockRepository.js`.
- DATA-003 parcial: creado `src/services/financiamientosService.js` y conectado al modulo Financiamiento y Deuda para generacion, pagos, abonos, gasto financiero y egreso de tesoreria.
- FIN-004 parcial: creado `src/services/estadoResultadosService.js` para centralizar intereses de prestamos por moneda y estructura del ER.
- FIN-004 avance: `EstadoResultados` renderiza usando `buildEstadoResultados`.
- FIN-003 parcial: creado `src/services/tesoreriaService.js` y conectado a KPIs multimoneda de Tesoreria.
- DB-001 parcial: creado `supabase/schemas/001_platform.sql`.
- DB-002 parcial: creado `supabase/schemas/002_access.sql`.
- DB-003 parcial: creados `supabase/schemas/003_business_core.sql` y `supabase/schemas/004_finance.sql`.
- DB-004 inicial: creada politica base RLS por tenant en `supabase/policies/001_tenant_rls.sql`.
- DB-003 avance: creados `supabase/schemas/005_operations.sql`, `006_purchasing_inventory.sql` y `007_hr_cs_ai.sql`.
- DB-004 avance: creada politica RLS de dominios en `supabase/policies/002_domain_rls.sql`.
- DB-005 parcial: creado `supabase/seeds/001_demo_tenants.sql` con dos tenants demo, roles, permisos, CRM base y financiamientos multimoneda.
- Documentacion Supabase inicial: `supabase/README.md` y `supabase/CHECKLIST_CONEXION.md`.
- Script de aplicacion: creado `supabase/scripts/build_combined_sql.ps1` y generado `supabase/generated/tideo_erp_setup.sql`.
- Preparacion de conexion: creados `.env.example`, `src/lib/supabaseClient.js` y `src/services/createSupabaseRepository.js`.
- Validacion SQL: creado `supabase/scripts/validate_sql_static.ps1`; resultado OK con 50 tablas revisadas y 44 tablas multitenant.
- RLS acceso: creado `supabase/policies/000_access_rls.sql` para roles, usuarios_empresas y auditoria.
- RLS permisos: creado `supabase/policies/003_role_permissions.sql` con `usuario_puede`, `usuario_es_admin_empresa` y policies financieras por rol/accion.
- RLS dominios: creado `supabase/policies/004_domain_permissions.sql` para Operaciones, Compras, Inventario, RRHH, Customer Success e IA.
- Seeds permisos: roles admin demo reciben permisos de dominio para validar RLS sin bloquear el demo.
- Tests RLS manuales: creados `supabase/tests/README.md` y `supabase/tests/rls_smoke_tests.sql`.
- Seguridad SQL: eliminadas redefiniciones duplicadas de funciones `security definer`; validador ahora detecta funciones sin `set search_path = public`.
- Data mode: creado `src/lib/dataMode.js` y agregado `VITE_DATA_MODE=mock` en `.env.example`.
- Selector de datos: creado `createFinanciamientosDataSource` para alternar entre repositorios mock y Supabase en Financiamiento y Deuda.
- Build compatibility: `supabaseClient` usa import dinamico no empaquetado hasta instalar `@supabase/supabase-js`.

Validacion:
- `npm.cmd run build` ejecutado correctamente.

Siguiente corte:
- Terminar limpieza de `src/pages_fin_deuda.jsx`, eliminando funciones locales antiguas de amortizacion y recalculo.
- Eliminar bloque legado de calculo financiero dentro de `EstadoResultados`.
- Extender tabla de Tesoreria para mostrar movimientos transaccionales reales junto al match bancario.
- Revisar tipos, constraints e indices de los schemas SQL antes de aplicarlos en Supabase real.
- Revisar politicas RLS con permisos por rol antes de ejecutar en Supabase real.
- Validar SQL en un proyecto Supabase limpio antes de pedir llaves.
- Instalar `@supabase/supabase-js` cuando se active la conexion real.
- Probar los SQL en un proyecto Supabase limpio y ajustar errores reales de sintaxis/recursion RLS si aparecen.
- Reemplazar UUID demo por usuarios reales de `auth.users` cuando conectemos Supabase.
- Crear selector de repositorio por `VITE_DATA_MODE` para conectar primero Financiamiento y Deuda a Supabase.
- Convertir registro de pago de financiamiento en RPC/transaccion Supabase para actualizar financiamiento, amortizacion, pago, gasto y tesoreria atomicas.
