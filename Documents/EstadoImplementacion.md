# Estado de Implementacion - TIDEO ERP

Fecha de corte: 2026-04-29

## Resumen Ejecutivo

El proyecto ya paso de prototipo mock puro a una base SaaS inicial con Supabase, Auth, RLS, seeds demo y el primer modulo financiero conectado en lectura real. El setup combinado fue regenerado con los schemas y seeds actuales, y el principal trabajo pendiente es extender la capa Supabase al resto de modulos.

## Estado Por Fase

| Fase | Estado | Evidencia | Pendiente principal |
|---|---|---|---|
| 0 - Gobierno del backlog | Parcial | `PlanDesarrolloTecnico.md`, `BacklogTecnicoInicial.md`, `MatrizDependencias.md` | Mantener matriz viva con estado por modulo |
| 1 - Base tecnica frontend | Parcial avanzado | `src/lib`, `src/services`, repositorios mock/Supabase | Normalizar componentes compartidos y reducir lectura directa de `MOCK` |
| 2 - Modelo multitenant | Avanzado | `supabase/schemas`, `policies`, `migrations`, `seeds`, setup combinado actualizado | Probar instalacion limpia y RLS con dos tenants |
| 3 - Auth, roles y permisos | Avanzado | `AuthGate.jsx`, Supabase Auth, membresias reales y rol real en UI | Filtrar todos los accesos por permisos reales y agregar pruebas |
| 4 - CRM y Comercial | Parcial avanzado | Servicio CRM Supabase, hojas de costeo, cotizaciones, OS Cliente y auditoria basica conectadas | Agregar versionado/aprobacion avanzada |
| 5 - Operaciones | Parcial inicial | OT puede crearse desde OS Cliente; partes, cierres, valorizaciones y auditoria basica persisten | Completar costos reales |
| 6 - Compras e Inventario | Parcial avanzado | Proveedores, OC/OS, recepciones, CxP, inventario, kardex y evaluaciones post-OC/OS conectadas | Completar UI avanzada de homologacion y comparativo |
| 7 - RRHH y Nomina | Pendiente de conexion real | Migracion RLS y seeds RRHH existen | Conectar asistencia, nomina y prestamos personal |
| 8 - Finanzas | Parcial avanzado | Financiamiento y Deuda lee Supabase; valorizaciones generan facturas y CxC | Persistir pagos/abonos con RPC transaccional y conectar CxP/tesoreria completa |
| 9 - Customer Success | Pendiente de conexion real | Tablas y RLS existen | Conectar onboarding, health, renovaciones, NPS |
| 10 - IA auditada | Pendiente | Tabla `ia_logs` existe | Conectar IA a entidades reales y auditoria |
| 11 - Campo movil PWA | Pendiente | Vista movil mock existe | Offline, evidencias, GPS y sincronizacion real |
| 12 - QA, deploy y operacion | Pendiente | Build OK local | Tests, deploy, backups, monitoreo, seguridad |

## Hecho

- Proyecto compila correctamente con `npm.cmd run build`.
- `.env.local` configurado para Supabase y protegido por `.gitignore`.
- `@supabase/supabase-js` instalado.
- `AuthGate.jsx` implementa login/signup.
- `context.jsx` escucha sesion Supabase y carga datos financieros protegidos por RLS.
- Usuario real vinculado a `emp_001`.
- Financiamiento y Deuda muestra datos reales por moneda desde Supabase.
- Setup combinado regenerado con maestros base, Auth frontend y seeds `001`, `002`, `003`, `004`, `005`, `006`, `008`.
- Validacion estatica SQL OK: 61 tablas revisadas, 55 multitenant.
- CRM/Comercial carga cuentas, leads, contactos, oportunidades, cotizaciones y OS clientes desde Supabase sin conservar fallback mock cuando la tabla viene vacia.
- Cotizaciones nuevas preservan sus partidas como `items` compatibles con Supabase.
- Cuentas ahora persisten los campos usados por la UI: telefono, email, direccion, tamano, responsable comercial, health/saldo CxC y datos relacionados.
- Nueva migracion incremental: `supabase/migrations/012_crm_account_fields.sql`.
- Leads y oportunidades ahora persisten campos del flujo comercial: cargo, urgencia, responsable, motivo de descarte, contacto asociado, servicio de interes, forecast, fuente, notas y competidor.
- Nueva migracion incremental: `supabase/migrations/013_crm_flow_fields.sql`.
- La creacion manual de OS Cliente desde el formulario rapido ahora usa `crearOSClienteManual` y persiste en `public.os_clientes`.
- Nueva migracion incremental: `supabase/migrations/014_commercial_documents_existing_db.sql` para bases existentes que no tienen `cotizaciones` y `os_clientes`.
- Los errores de persistencia CRM en Supabase ahora generan notificacion visible en la app.
- OS Cliente ya inicia ejecucion creando una OT vinculada, actualiza `ots_asociadas` y descuenta `saldo_por_ejecutar`.
- El tab `Resumen y OTs` de OS Cliente lista las OTs asociadas en vez de mostrar una seccion en construccion.
- Partes Diarios ya permite registrar un parte real desde la UI; al enviarlo marca la OT como `ejecucion` si estaba en borrador/programada.
- Al recargar desde Supabase, partes diarios recuperan tecnico, actividades, avance, horas y materiales.
- Cierre Tecnico ya registra acta minima en `cierres_tecnicos` con resultado, fecha, observaciones y conformidad del cliente.
- Valorizaciones ya se generan desde OTs cerradas por OS Cliente, actualizan saldo por valorizar y marcan las OTs como `valorizada`.
- Hoja de Costeo queda integrada al schema base, RLS y setup combinado; sus totales recalculados se persisten en Supabase.
- Las cotizaciones generadas desde Hoja de Costeo conservan `hoja_costeo_id` para trazabilidad.
- Facturacion ya emite factura desde valorizaciones aprobadas, genera CxC y actualiza saldos de OS Cliente.
- CxC ya permite registrar cobros parciales o totales y genera movimiento de tesoreria vinculado.
- Match bancario ya propone candidatos CxC/CxP por tipo de movimiento, concilia el banco y registra cobro/pago asociado.
- Recepciones de OC/OS ya generan CxP compatible con Supabase, cierran la orden origen y actualizan inventario local para OC.
- CxP ya tiene panel de pago con monto, fecha, cuenta bancaria y referencia, generando egreso de tesoreria.
- Recepciones de OC ya persisten entradas en materiales, stock y kardex, y el inventario carga desde Supabase.
- Recepciones de OC/OS ya generan evaluacion post compra/servicio del proveedor y actualizan su score acumulado.
- Auditoria basica ya registra acciones criticas en CRM, Comercial, Operaciones, Compras y Finanzas sin bloquear la operacion principal.

## Pendientes Criticos

1. Probar `supabase/generated/tideo_erp_setup.sql` en un proyecto Supabase limpio.
2. Validar RLS con dos usuarios reales: uno en `emp_001` y otro en `emp_002`.
3. Ejecutar `supabase/migrations/012_crm_account_fields.sql` en el proyecto Supabase existente.
4. Ejecutar `supabase/migrations/013_crm_flow_fields.sql` en el proyecto Supabase existente.
5. Ejecutar `supabase/migrations/014_commercial_documents_existing_db.sql` si la base existente no persiste cotizaciones u OS Cliente.
6. Probar creacion real de lead, conversion a oportunidad, hoja de costeo, cotizacion, OS cliente, OT y parte diario desde la UI.
7. Implementar auditoria real para altas/ediciones comerciales.
8. Filtrar sidebar y rutas por permisos reales de `permisos_roles` en todos los modulos.
9. Conectar modulos restantes a repositorios Supabase.
10. Implementar pagos/abonos de financiamiento como RPC transaccional cuando se retome pagos.
11. Crear pruebas automaticas de RLS y flujos criticos.

## Riesgos Actuales

- Muchas pantallas aun leen `MOCK` directamente.
- `Context` concentra demasiado estado y puede volverse dificil de mantener al persistir mutaciones reales.
- El SQL combinado debe probarse en una base limpia antes de considerarse instalador definitivo.
- Algunas pantallas pueden seguir usando permisos visuales o datos mock aunque el acceso real ya existe.
- Pagos financieros no deben persistirse parcialmente hasta tener RPC transaccional.

## Siguiente Accion Recomendada

Continuar Fase 5 con Operaciones:

1. Probar desde la UI el flujo Lead -> Oportunidad -> Cotizacion -> OS Cliente -> OT contra Supabase.
2. Completar costeo real por OT.
3. Validar que RLS y UI bloqueen los mismos datos por tenant.
4. Ampliar auditoria con filtros de consulta y visor para administradores.
