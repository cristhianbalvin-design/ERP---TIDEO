# Plan de Desarrollo Tecnico - TIDEO ERP

## Proposito

Este plan convierte el Documento Maestro en una ruta tecnica ejecutable para llevar el ERP desde prototipo React con datos mock hacia una plataforma SaaS multitenant operable. El orden prioriza cimientos tecnicos, aislamiento de datos, flujos transaccionales y cierre financiero antes de IA, campo movil y produccion.

## Principios De Ejecucion

- Multitenant primero: toda entidad de negocio debe tener `empresa_id`.
- Modulos transaccionales como fuente de verdad; Maestros Base solo referencia.
- Separacion estricta entre UI, logica de negocio y acceso a datos.
- Sin `localStorage` ni `sessionStorage` para datos de negocio.
- Capital de financiamiento reduce pasivo; solo intereses afectan el Estado de Resultados.
- Moneda se conserva por transaccion; los reportes no deben mezclar monedas sin conversion explicita.
- Permisos aplican en UI y backend; ocultar una pantalla no reemplaza RLS.
- Auditoria por defecto en operaciones criticas: crear, editar, anular, aprobar, pagar, cerrar.

## Fase 0 - Gobierno Del Backlog

Objetivo: transformar el Documento Maestro en backlog tecnico y funcional accionable.

Entregables:
- Documento maestro validado como fuente viva.
- Inventario de modulos con estado real: mock, funcional, pendiente o refactor.
- Matriz de dependencias entre modulos.
- Backlog priorizado por epicas.
- Definicion de criterios de salida por fase.

Criterio de salida:
- Existe una lista clara de fases, epicas y tareas tecnicas.
- Cada modulo pendiente tiene dependencia, alcance y criterio de prueba.

## Fase 1 - Base Tecnica Del Frontend

Objetivo: ordenar la aplicacion para que pueda seguir creciendo sin duplicar logica.

Entregables:
- Crear estructura base:
  - `src/lib`
  - `src/services`
  - `src/hooks`
  - `src/modules`
  - `src/schemas`
- Extraer helpers comunes:
  - moneda
  - fecha
  - estados
  - permisos
  - tenant activo
- Crear capa de repositorios mock-compatible.
- Normalizar componentes compartidos: tablas, tabs, badges, modales y paneles laterales.
- Mantener convenciones CSS existentes: `.tabs`, `.tab`, `.card-head`.

Criterio de salida:
- Un modulo puede leer datos por servicio y no directamente desde `MOCK`.
- El cambio futuro hacia Supabase no obliga a reescribir las pantallas.

## Fase 2 - Modelo De Datos Multitenant

Objetivo: disenar y preparar el modelo real de Supabase.

Entregables:
- Schema SQL inicial para tablas de plataforma:
  - `empresas`
  - `planes`
  - `monedas`
  - `usuarios_empresas`
  - `roles`
  - `permisos_roles`
  - `auditoria`
- Schema SQL para dominios de negocio:
  - CRM
  - Comercial
  - Operaciones
  - RRHH
  - Compras
  - Inventario
  - Finanzas
  - Customer Success
  - IA
- Convenciones de columnas:
  - `id`
  - `empresa_id`
  - `created_at`
  - `updated_at`
  - `created_by`
  - `updated_by`
  - `estado`
- Politicas RLS por `empresa_id`.

Criterio de salida:
- Cada tabla de negocio esta aislada por tenant.
- Las tablas de plataforma quedan separadas de las tablas transaccionales.

## Fase 3 - Auth, Roles Y Permisos

Objetivo: reemplazar el simulador por control de acceso real.

Entregables:
- Supabase Auth.
- Login y sesion.
- Selector de empresa si el usuario pertenece a mas de una.
- Sidebar filtrado por permisos reales.
- Permisos especiales:
  - `ver_finanzas`
  - `ver_costos`
  - `aprobar_descuentos`
  - `acceso_campo`
  - `superadmin_tideo`
- Log de acceso superadmin a tenants.

Criterio de salida:
- Sin permiso de lectura, el usuario no ve ni consulta el modulo.
- La seguridad existe en UI y RLS.

## Fase 4 - CRM Y Comercial

Objetivo: consolidar el origen comercial del ERP.

Orden:
1. Leads y Scoring.
2. Cuentas y Contactos.
3. Pipeline y Oportunidades.
4. Actividades Comerciales.
5. Cotizaciones.
6. OS Cliente.

Entregables:
- Lead con RUC, razon social, industria, fuente y responsable.
- Conversion Lead -> Cuenta + Contacto + Oportunidad.
- Cuenta con tab comercial y tab condiciones financieras.
- Cotizacion versionada con aprobacion de descuentos.
- OS Cliente como puente hacia Operaciones, Valorizaciones y Facturacion.

Criterio de salida:
- Un prospecto puede convertirse en cliente sin duplicidad.
- Una OS Cliente puede iniciar ejecucion operativa y facturacion posterior.

## Fase 5 - Operaciones

Objetivo: cerrar el ciclo de ejecucion del servicio.

Orden:
1. Planner y Recursos.
2. Backlog.
3. Ordenes de Trabajo.
4. Partes Diarios.
5. Cierre Tecnico y Calidad.
6. Costos por OT.

Entregables:
- OT vinculada a OS Cliente.
- Parte diario con actividades, avance, materiales, horas y evidencias.
- Cierre tecnico con conformidad.
- Costeo por OT desde mano de obra, materiales, servicios terceros y logistica.
- Margen por OT, cliente y servicio.

Criterio de salida:
- La OT tiene trazabilidad desde venta hasta cierre tecnico.
- El margen se calcula desde datos transaccionales.

## Fase 6 - Compras, Proveedores E Inventario

Objetivo: conectar la necesidad operativa con compras, recepcion, stock y CxP.

Orden:
1. Corregir Maestros Base.
2. SOLPE Interna.
3. Proveedores.
4. Cotizaciones de Compra.
5. Ordenes de Compra.
6. Ordenes de Servicio Interna.
7. Recepciones.
8. Inventario y Kardex.
9. CxP automatica.

Entregables:
- Proveedor con ciclo de vida y homologacion.
- Solo proveedores homologados disponibles en OC/OS.
- Recepcion actualiza OC, inventario, CxP y evaluacion proveedor.
- Kardex por almacen, lote o serie cuando aplique.

Criterio de salida:
- Una SOLPE aprobada puede terminar en OC/OS, recepcion, stock y cuenta por pagar.

## Fase 7 - RRHH Y Nomina

Objetivo: separar gestion laboral, asistencia, nomina, prestamos al personal y costo operativo.

Orden:
1. Mover Personal Operativo y Administrativo a RRHH.
2. Turnos y Horarios.
3. Control de Asistencia.
4. Nomina Basica.
5. Prestamos al Personal.
6. Costo hora real hacia OT.

Entregables:
- Turnos asignados por trabajador.
- Asistencia con tardanzas, faltas y horas extra.
- Nomina con bruto, descuentos, IR referencial, cargas y neto.
- Prestamos al personal descontados en nomina.
- Cierre de nomina genera egresos y actualiza costo hora real.

Criterio de salida:
- Nomina y costo OT son mediciones separadas, pero conectadas por costo hora real.

## Fase 8 - Finanzas

Objetivo: convertir finanzas en el cierre de verdad del ERP.

Orden:
1. Ventas.
2. Cuentas por Cobrar.
3. Facturacion.
4. Cuentas por Pagar.
5. Tesoreria y Match Bancario.
6. Estado de Resultados.
7. Presupuesto vs Real.
8. Financiamiento y Deuda.

Entregables:
- CxC desde facturas.
- CxP desde compras y recepciones.
- Tesoreria con movimientos vinculados.
- ER calculado desde ventas, costos, gastos, nomina e intereses reales.
- Financiamiento con amortizacion, pagos, abonos a capital y multimoneda.
- Reporte de deuda por moneda, tipo de acreedor y proyeccion 12 meses.

Criterio de salida:
- El Estado de Resultados no depende de datos hardcodeados.
- Capital, interes y caja se registran en lugares contables correctos.
- Monedas no se mezclan sin tipo de cambio definido.

## Fase 9 - Customer Success

Objetivo: gestionar retencion y crecimiento postventa.

Orden:
1. Onboarding.
2. Planes de Exito.
3. Health Score.
4. Renovaciones.
5. Fidelizacion y NPS.
6. BI Customer Success.

Entregables:
- Onboarding desde cliente ganado.
- Health Score con uso, soporte, NPS, finanzas y relacion.
- Renovaciones con alertas 90/60/30 dias.
- Bloqueo o advertencia de upsell si hay deuda vencida.

Criterio de salida:
- Customer Success puede operar con senales comerciales, financieras y operativas.

## Fase 10 - IA Auditada

Objetivo: incorporar asistencia inteligente sin delegar aprobaciones.

Entregables:
- Tabla `ia_logs`.
- IA Comercial, Operativa y Financiera conectadas a entidades reales.
- Registro de recomendacion, accion tomada y usuario.
- Extraccion de comprobantes desde campo como pendiente de revision.

Criterio de salida:
- La IA recomienda, resume o clasifica, pero no aprueba.
- Toda interaccion queda auditada.

## Fase 11 - Campo Movil PWA

Objetivo: permitir ejecucion operativa desde celular.

Entregables:
- PWA instalable.
- Vista tecnico.
- Vista comprador.
- Vista vendedor.
- Vista supervisor.
- GPS al iniciar parte.
- Captura de evidencias.
- Offline basico para formularios criticos.

Criterio de salida:
- Un tecnico puede ejecutar una OT en campo.
- Un gasto capturado en campo queda pendiente de revision backoffice.

## Fase 12 - QA, Deploy Y Operacion

Objetivo: preparar la plataforma para uso real.

Entregables:
- Tests de flujos criticos.
- Validacion RLS.
- Seeds por tenant demo.
- Backups Supabase.
- Deploy Vercel.
- Monitoreo de errores.
- Manual tecnico y funcional.
- Checklist de seguridad.

Criterio de salida:
- Existe ambiente demo estable.
- Existe ambiente productivo aislado.
- Primer tenant puede operar punta a punta.

## Hitos De Producto

### Hito 1 - Prototipo Ordenado
Incluye Fases 0 y 1. El producto sigue usando mocks, pero con estructura preparada para migracion.

### Hito 2 - SaaS Base
Incluye Fases 2 y 3. Ya existe autenticacion, tenants, roles y RLS. El setup combinado fue regenerado con schemas, policies, Auth frontend y seeds demo actuales.

### Hito 3 - Flujo Comercial Operativo
Incluye Fases 4 y 5. Desde lead hasta OT cerrada.

### Hito 4 - Backoffice Completo
Incluye Fases 6, 7 y 8. Compras, RRHH y Finanzas conectadas.

### Hito 5 - Retencion, IA Y Campo
Incluye Fases 9, 10 y 11.

### Hito 6 - Produccion
Incluye Fase 12.

## Riesgos Principales

- Seguir agregando pantallas sin capa de servicios aumenta deuda tecnica.
- Mezclar monedas en reportes financieros genera indicadores incorrectos.
- Implementar permisos solo en UI deja brechas de seguridad.
- No definir fuente de verdad por entidad crea duplicidad entre maestros y modulos.
- No separar capital e interes distorsiona el Estado de Resultados.
- Crecer con `Context` como unico store puede volver costosas las mutaciones transaccionales.

## Siguiente Paso Tecnico

Probar una instalacion limpia de `supabase/generated/tideo_erp_setup.sql` y luego iniciar Fase 4: conectar CRM/Comercial a Supabase real, empezando por cuentas, leads, oportunidades, cotizaciones y OS clientes. Ver estado actualizado en `Documents/EstadoImplementacion.md`.
