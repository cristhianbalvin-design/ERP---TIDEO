# Cobertura de Aria por pantalla

Generado por `node scripts/manual/catalogo.mjs generar` a partir de `catalogo/pantallas.json`, las fichas de `docs/manual-pantallas/` y las herramientas `asistente_*` de la Edge Function. No editar a mano.

- **Ficha**: la pantalla tiene ficha propia en el manual (modo consultor).
- **Procesos**: aparece en una ficha de proceso de punta a punta.
- **Datos**: Aria puede consultar sus datos con una herramienta que exige el permiso de la pantalla.
- **Registro**: Aria puede registrar datos de esa pantalla (borrador + Confirmar).
- Las pantallas en estado `placeholder` o `legado` no cuentan para los porcentajes.

## Resumen

| App | Pantallas | Con ficha | Con datos | Con registro | Sin cobertura |
|---|---:|---:|---:|---:|---:|
| Administración | 77 | 4 (5 %) | 21 (27 %) | 1 | 54 |
| Operaciones | 121 | 1 (1 %) | 26 (21 %) | 0 | 94 |
| Versión Móvil | 9 | 0 (0 %) | 0 (0 %) | 0 | 9 |
| **Total** | 207 | 5 (2 %) | 47 (23 %) | 1 | 157 |

Herramientas sin permiso de pantalla detectable (no se asignan a ninguna pantalla): `asistente_resumen_financiero`.

## Administración

| Módulo | Pantalla | Estado | Ficha | Procesos | Datos | Registro |
|---|---|---|---|---|---|---|
| Administración | Activos Fijos (`activos_fijos`) | activa | — | — | — | — |
| Administración | Caja Chica (`caja`) | activa | caja | proceso_caja_chica | 4 | preparar_egreso_caja_chica |
| Administración | Cuentas por Cobrar (`cxc`) | activa | — | — | 4 | — |
| Administración | Cuentas por Pagar (`cxp`) | activa | — | proceso_solpe_pago | 4 | — |
| Administración | Facturación (`facturacion`) | activa | — | — | 4 | — |
| Administración | Financiamiento y Deuda (`financiamiento`) | activa | financiamiento | — | — | — |
| Administración | IA Financiera (`ia_financiera`) | legado | — | — | — | — |
| Administración | Presupuesto vs Real (`presupuestos`) | activa | — | — | — | — |
| Administración | Estado Resultados (`resultados`) | activa | — | — | — | — |
| Administración | Tesoreria / Match (`tesoreria`) | activa | tesoreria | proceso_solpe_pago | 3 | — |
| Administración | Valorizaciones (`valorizacion`) | activa | — | — | — | — |
| Administración | Ventas (`ventas`) | activa | — | — | — | — |
| Comercial | Agenda Comercial (`agenda_comercial`) | activa | — | — | — | — |
| Comercial | Variables de Costeo (`costeo_variables`) | activa | — | — | — | — |
| Comercial | Cotizaciones (`cotizaciones`) | activa | — | — | 3 | — |
| Comercial | Cuentas y Contactos (`cuentas`) | activa | — | — | 3 | — |
| Comercial | Equipos de Clientes (`equipos_clientes`) | activa | — | — | 4 | — |
| Comercial | Hoja de Costeo (`hoja_costeo`) | activa | — | — | — | — |
| Comercial | Hoja de Costeo — asistente de costeo (`hoja_costeo_wizard`) | activa | — | — | — | — |
| Comercial | IA Comercial (`ia_comercial`) | legado | — | — | — | — |
| Comercial | OS Cliente (`os_cliente`) | activa | — | — | 4 | — |
| Comercial | Panel de Producción (`panel_produccion`) | activa | — | — | 4 | — |
| Comercial | Pipeline (`pipeline`) | activa | — | — | 3 | — |
| Comercial | Recetas de actividad (`recetas_actividad`) | activa | — | — | — | — |
| Compras | Compras (vista anterior) (`compras`) | legado | — | — | — | — |
| Compras | Compras / Gastos (`compras_gastos`) | activa | compras_gastos | — | 4 | — |
| Compras | Cotizaciones (`cot_compras`) | activa | — | — | 2 | — |
| Compras | Ordenes de Compra (`ordenes_compra`) | activa | — | proceso_solpe_pago | 7 | — |
| Compras | Ordenes de Servicio (`ordenes_servicio`) | activa | — | — | — | — |
| Compras | Proveedores (`proveedores`) | activa | — | — | 3 | — |
| Compras | Recepciones (`recepciones`) | activa | — | proceso_solpe_pago | 3 | — |
| Compras | Bandeja de Sourcing (`sourcing_bandeja`) | activa | — | proceso_solpe_pago | 7 | — |
| Configuración | Maestros Base (`maestros`) | activa | — | — | — | — |
| Configuración | Notificaciones (`notificaciones_config`) | activa | — | — | — | — |
| Configuración | Organigrama (`organigrama`) | activa | — | — | — | — |
| Configuración | Parametros Generales (`parametros`) | activa | — | — | — | — |
| Configuración | Roles y Permisos (`roles`) | activa | — | — | — | — |
| Configuración | Salud Implementacion (`salud_implementacion_tenant`) | activa | — | — | — | — |
| Configuración | Catalogo Servicios (`servicios`) | activa | — | — | — | — |
| Configuración | Tarifarios (`tarifarios`) | activa | — | — | — | — |
| Configuración | Usuarios (`usuarios`) | activa | — | — | — | — |
| CRM & Marketing | Actividades (`actividades`) | activa | — | — | — | — |
| CRM & Marketing | Leads y Scoring (`leads`) | activa | — | — | 3 | — |
| CRM & Marketing | Marketing Automation (`marketing`) | activa | — | — | — | — |
| Customer Success | BI Customer Success (`bi_cs`) | activa | — | — | — | — |
| Customer Success | Fidelizacion y NPS (`cs_fidelizacion`) | activa | — | — | — | — |
| Customer Success | Health Score (`cs_health`) | activa | — | — | — | — |
| Customer Success | Onboarding (`cs_onboarding`) | activa | — | — | — | — |
| Customer Success | Planes de Exito (`cs_planes`) | activa | — | — | — | — |
| Customer Success | Renovaciones (`cs_renovaciones`) | activa | — | — | — | — |
| Dashboards | Dashboards (`dashboard`) | activa | — | — | — | — |
| Inicio | Inicio (pendientes de hoy) (`inicio`) | activa | — | como_usar_aria | — | — |
| Integraciones | API Keys (`api_keys`) | activa | — | — | — | — |
| Logística | Almacenes (`inventario`) | activa | — | — | 8 | — |
| Logística | Transporte y Guias (`remision`) | activa | — | — | 5 | — |
| Logística | SOLPE Interna (`solpe`) | activa | — | proceso_solpe_pago | 3 | — |
| Operaciones | Backlog (`backlog`) | activa | — | — | — | — |
| Operaciones | Cierre y Calidad (`cierre`) | activa | — | — | — | — |
| Operaciones | IA Operativa (`ia_operativa`) | legado | — | — | — | — |
| Operaciones | Ordenes de Trabajo (`ot`) | activa | — | — | — | — |
| Operaciones | Partes Diarios (`partes`) | activa | — | — | — | — |
| Operaciones | Planner y Recursos (`planner`) | activa | — | — | — | — |
| Operaciones | Soporte y Tickets (`tickets`) | activa | — | — | — | — |
| Plataforma | Metricas SaaS (`metricas_saas`) | activa | — | — | — | — |
| Plataforma | Planes y Licencias (`planes`) | activa | — | — | — | — |
| Plataforma | Salud de implementación (plataforma) (`salud_implementacion`) | activa | — | — | — | — |
| Plataforma | Empresas / Tenants (`tenants`) | activa | — | — | — | — |
| RRHH | Control de Asistencia (`asistencia`) | activa | — | — | — | — |
| RRHH | Comisiones (`comisiones`) | activa | — | — | — | — |
| RRHH | Control de Horas (`control_horas`) | activa | — | — | — | — |
| RRHH | Evaluación de Desempeño (`evaluaciones_desempeno`) | activa | — | — | — | — |
| RRHH | Liquidación por Cese (`liquidaciones_cese`) | activa | — | — | — | — |
| RRHH | Mi portal (`mi_portal`) | activa | — | — | — | — |
| RRHH | Nomina (`nomina`) | activa | — | — | — | — |
| RRHH | Prestamos al Personal (`prestamos_personal`) | activa | — | — | — | — |
| RRHH | Reclutamiento (`reclutamiento`) | activa | — | — | — | — |
| RRHH | Personal Administrativo (`rrhh_admin`) | activa | — | — | — | — |
| RRHH | Personal Operativo (`rrhh_operativo`) | activa | — | — | — | — |
| RRHH | Solicitudes (`solicitudes_rrhh`) | activa | — | — | — | — |
| RRHH | Tareo Administrativo (`tareo_admin`) | activa | — | — | — | — |
| RRHH | Turnos y Horarios (`turnos`) | activa | — | — | — | — |

## Operaciones

| Módulo | Pantalla | Estado | Ficha | Procesos | Datos | Registro |
|---|---|---|---|---|---|---|
| Almacén & Repuestos | Stock mínimos & reposición (`almacen-alertas`) | activa | — | — | 8 | — |
| Almacén & Repuestos | Configuración del WMS (`almacen-config`) | activa | — | — | 8 | — |
| Almacén & Repuestos | Conteos cíclicos (`almacen-conteos`) | activa | — | — | 8 | — |
| Almacén & Repuestos | Custodia de terceros (`almacen-custodia`) | activa | — | — | 8 | — |
| Almacén & Repuestos | Despachos (`almacen-despachos`) | activa | — | — | 8 | — |
| Almacén & Repuestos | Devoluciones (`almacen-devoluciones`) | activa | — | — | 8 | — |
| Almacén & Repuestos | Etiquetas (`almacen-etiquetas`) | activa | — | — | 8 | — |
| Almacén & Repuestos | Gemelo digital (`almacen-gemelo`) | activa | — | — | 8 | — |
| Almacén & Repuestos | Préstamo de herramientas (`almacen-herramientas`) | activa | — | — | 8 | — |
| Almacén & Repuestos | Inventario & Kardex (`almacen-inventario`) | activa | — | — | 8 | — |
| Almacén & Repuestos | Minas y proyectos (`almacen-minas`) | activa | — | — | 8 | — |
| Almacén & Repuestos | Valorizado y ABC (`almacen-reportes`) | activa | — | — | 8 | — |
| Almacén & Repuestos | Reserva de Repuestos (`almacen-reservas`) | activa | — | — | 8 | — |
| Almacén & Repuestos | Ubicaciones (`almacen-ubicaciones`) | activa | — | — | 8 | — |
| Almacén & Repuestos | Vencimientos y lotes (`almacen-vencimientos`) | activa | — | — | 8 | — |
| Almacén & Repuestos | Solicitudes SOLPE (`solicitudes`) | puente | — | — | 3 | — |
| Clientes & Activos | Clientes & Contratos (`clientes`) | activa | — | — | 3 | — |
| Clientes & Activos | Equipos & Activos (`equipos`) | activa | — | — | — | — |
| Clientes & Activos | Proyectos & Tarifas (`proyectos`) | activa | — | — | — | — |
| Compras & Importación | Cotizaciones Compra (`compras-cotizaciones`) | puente | — | — | 2 | — |
| Compras & Importación | Importaciones & DUA (`compras-importaciones`) | placeholder | — | — | — | — |
| Compras & Importación | Órdenes de Compra (`compras-oc`) | puente | — | — | 7 | — |
| Compras & Importación | Proveedores (`compras-proveedores`) | puente | — | — | 3 | — |
| Compras & Importación | Recepciones (`compras-recepciones`) | activa | — | — | 3 | — |
| Confiabilidad | Backlog Operativo (`backlog`) | puente | — | — | — | — |
| Confiabilidad | KPIs de Confiabilidad (`confiabilidad`) | activa | — | — | — | — |
| Confiabilidad | Disponibilidad Mecánica (`disponibilidad-mecanica`) | activa | — | — | — | — |
| Confiabilidad | Programación PM (`programacion-pm`) | activa | — | — | — | — |
| Confiabilidad | Análisis SOS (`sos-telemetria`) | activa | — | — | — | — |
| Configuración | Parámetros Globales (`configuracion`) | activa | — | — | — | — |
| Configuración | Usuarios & Roles (`usuarios`) | puente | — | — | — | — |
| Finanzas & Facturación | Consolidado Facturación (`consolidado`) | activa | — | — | 4 | — |
| Finanzas & Facturación | Cuentas por Cobrar (`finanzas-cxc`) | puente | — | — | 4 | — |
| Finanzas & Facturación | Cuentas por Pagar (`finanzas-cxp`) | puente | — | — | 4 | — |
| Finanzas & Facturación | Tesorería (`finanzas-tesoreria`) | puente | — | — | 3 | — |
| Finanzas & Facturación | Costos & Rentabilidad (`ots-costos`) | activa | — | — | — | — |
| Flota & Alquileres | Certificaciones del Activo (`certificaciones-activo`) | activa | — | — | — | — |
| Flota & Alquileres | Actas & Despachos (`checkout`) | activa | — | — | — | — |
| Flota & Alquileres | Contratos Rental (`contratos-rental`) | activa | — | — | — | — |
| Flota & Alquileres | Dashboard de Flota y Alquileres (`dashboard-rental`) | activa | — | — | — | — |
| Flota & Alquileres | Panel de Flota (`flota`) | activa | — | — | — | — |
| Flota & Alquileres | Gestión de Garantías (`gestion-garantias`) | activa | — | — | — | — |
| Flota & Alquileres | Liquidación & DMR (`liquidacion`) | activa | — | — | — | — |
| Flota & Alquileres | Monitoreo Equipos (`monitoreo-equipos`) | placeholder | — | — | — | — |
| Flota & Alquileres | Pasaporte de Equipos (`pasaporte-equipos`) | activa | — | — | — | — |
| HSE — SEGURIDAD | Análisis de Riesgo (ATS) (`analisis-riesgo-ats`) | activa | — | — | — | — |
| HSE — SEGURIDAD | EPP & Certificaciones (`epp-certificaciones`) | activa | — | — | — | — |
| HSE — SEGURIDAD | Dashboard HSE (`hse-dashboard`) | maqueta | — | — | — | — |
| HSE — SEGURIDAD | Permisos de Trabajo (`permisos-trabajo`) | activa | — | — | — | — |
| HSE — SEGURIDAD | Protocolo LOTO (`protocolo-loto`) | activa | — | — | — | — |
| HSE — SEGURIDAD | Registro de Incidentes (`registro-incidentes`) | activa | — | — | — | — |
| Inicio | Dashboard Gerencial (`dashboard`) | maqueta | — | — | — | — |
| Inicio | Mapa de Campo (`mapa-campo`) | maqueta | — | — | — | — |
| Inicio | Mis OTs del día (`mis-ots-hoy`) | maqueta | — | — | — | — |
| Operaciones | Documentos (`docs`) | activa | — | — | — | — |
| Operaciones | Indicadores de confiabilidad (`indicadores-confiabilidad`) | placeholder | — | — | — | — |
| Inicio | Inicio operativo (Aria) (`inicio`) | activa | inicio_operaciones | — | — | — |
| Operaciones | Proveedores (operaciones) (`proveedores`) | placeholder | — | — | — | — |
| Órdenes de Trabajo | Cierre & Conformidad (`cierre-conformidad`) | activa | — | — | — | — |
| Órdenes de Trabajo | Nueva OT (`crear-ot`) | activa | — | — | — | — |
| Órdenes de Trabajo | Diagnóstico Técnico (`diagnostico-tecnico`) | activa | — | — | — | — |
| Órdenes de Trabajo | Nuevo reporte de mina (`nuevo-reporte`) | activa | — | — | — | — |
| Órdenes de Trabajo | Detalle de OT (`ot-detalle`) | activa | — | — | — | — |
| Órdenes de Trabajo | Bandeja de OTs (`ots`) | activa | — | — | — | — |
| Órdenes de Trabajo | Reportes Mina (`partes-mina`) | activa | — | — | — | — |
| Órdenes de Trabajo | Gestión de partes de taller (`partes-taller`) | activa | — | — | — | — |
| Órdenes de Trabajo | Recepción de Activos (`recepcion-activos`) | activa | — | — | — | — |
| Órdenes de Trabajo | Planner (`scheduler-despacho`) | activa | — | — | — | — |
| Órdenes de Trabajo | Partes Taller (`taller`) | activa | — | — | — | — |
| Producción | Fabricación y Ensamble (`area-fabricacion`) | maqueta | — | — | — | — |
| Producción | Ingeniería y Diseño (`area-ingenieria`) | maqueta | — | — | — | — |
| Producción | Maestranza (`area-maestranza`) | maqueta | — | — | — | — |
| Producción | Soldadura (`area-soldadura`) | maqueta | — | — | — | — |
| Producción | Dashboard Producción (`dashboard-produccion`) | maqueta | — | — | — | — |
| Producción | Ensamble de Componentes (`fab-ensamble`) | activa | — | — | — | — |
| Producción | Fabricación de Estructuras (`fab-estructuras`) | activa | — | — | — | — |
| Producción | Fabricación de Piezas (`fab-piezas`) | activa | — | — | — | — |
| Producción | Pruebas y Control de Calidad (`fab-pruebas`) | activa | — | — | — | — |
| Producción | Planos y Especificaciones (`ing-planos`) | activa | — | — | — | — |
| Producción | Estimación de Tiempos (`ing-tiempos`) | activa | — | — | — | — |
| Producción | Cromado Industrial (`mae-cromado`) | activa | — | — | — | — |
| Producción | Fresado (`mae-fresado`) | activa | — | — | — | — |
| Producción | Rectificado (`mae-rectificado`) | activa | — | — | — | — |
| Producción | Recuperación de Piezas (`mae-recuperacion`) | activa | — | — | — | — |
| Producción | Taladrado / Mandrinado (`mae-taladrado`) | activa | — | — | — | — |
| Producción | Torneado (`mae-torneado`) | activa | — | — | — | — |
| Producción | Lista de Materiales (BOM) (`maestranza-bom`) | activa | — | — | — | — |
| Producción | Órdenes de Fab. (OF) (`maestranza-of`) | activa | — | — | — | — |
| Producción | Control de Producción (`maestranza-piso`) | activa | — | — | — | — |
| Producción | Control de Calidad (`of-calidad`) | activa | — | — | — | — |
| Producción | Informes y Certificados (`of-informes`) | placeholder | — | — | — | — |
| Producción | No Conformidades (`of-no-conformidades`) | activa | — | — | — | — |
| Producción | OEE y Rendimiento (`of-oee`) | activa | — | — | — | — |
| Producción | Planificación de OF (`of-planificacion`) | activa | — | — | — | — |
| Producción | Tiempos y MTM (`of-tiempos-mtm`) | activa | — | — | — | — |
| Producción | Trazabilidad de OF (`of-trazabilidad`) | activa | — | — | — | — |
| Producción | Nueva OF (`produccion-crear-of`) | activa | — | — | — | — |
| Producción | Detalle de OF (`produccion-detalle-of`) | activa | — | — | — | — |
| Producción | Garantías de producción (`produccion-garantias`) | activa | — | — | — | — |
| Producción | Ingeniería y BOM (`produccion-ingenieria`) | activa | — | — | — | — |
| Producción | Pasaporte de componente (`produccion-pasaporte`) | activa | — | — | — | — |
| Producción | Tiempos estándar (`produccion-tiempos`) | activa | — | — | — | — |
| Producción | Corte Térmico (`sol-corte`) | activa | — | — | — | — |
| Producción | Soldadura Estructural (`sol-estructural`) | activa | — | — | — | — |
| Producción | MIG / TIG / SMAW (`sol-mig-tig`) | activa | — | — | — | — |
| Producción | Recargue y Recuperación (`sol-recargue`) | activa | — | — | — | — |
| Transporte Comercial | Dashboard de Transporte (`dashboard-transporte`) | activa | — | — | — | — |
| Transporte Comercial | Nueva orden de viaje (`transporte-crear-ov`) | activa | — | — | — | — |
| Transporte Comercial | Flota (`transporte-flota`) | activa | — | — | — | — |
| Transporte Comercial | Liquidación de transporte (`transporte-liquidacion`) | activa | — | — | — | — |
| Transporte Comercial | Lugares (`transporte-lugares`) | activa | — | — | — | — |
| Transporte Comercial | Hoja de Ruta (`transporte-ruta`) | activa | — | — | — | — |
| Transporte Comercial | Maestro de Rutas (`transporte-tarifas`) | activa | — | — | — | — |
| Transporte Comercial | Tarifas Transporte (`transporte-tarifas-config`) | maqueta | — | — | — | — |
| Transporte Comercial | Detalle de viaje (`transporte-viaje`) | activa | — | — | — | — |
| Transporte Comercial | Monitor de Viajes (`transporte-viajes`) | activa | — | — | — | — |
| Venta de Repuestos | Catálogo de venta (`catalogo`) | activa | — | — | — | — |
| Venta de Repuestos | Catálogo de precios (`catalogo-precios`) | activa | — | — | — | — |
| Venta de Repuestos | Dashboard de Repuestos (`dashboard-repuestos`) | activa | — | — | — | — |
| Venta de Repuestos | Despachos de repuestos (`despachos-repuestos`) | activa | — | — | — | — |
| Venta de Repuestos | Pedidos de venta (`pedidos-venta`) | activa | — | — | — | — |
| Venta de Repuestos | Cotizaciones Venta (`repuestos-cotizaciones`) | activa | — | — | — | — |
| Venta de Repuestos | Nuevo pedido de repuestos (`repuestos-crear-pedido`) | activa | — | — | — | — |
| Venta de Repuestos | Guías & Despachos (`repuestos-despachos`) | puente | — | — | 5 | — |
| Venta de Repuestos | Detalle de pedido de repuestos (`repuestos-detalle-pedido`) | activa | — | — | — | — |
| Venta de Repuestos | Órdenes de Venta (`repuestos-ordenes`) | activa | — | — | — | — |

## Versión Móvil

| Módulo | Pantalla | Estado | Ficha | Procesos | Datos | Registro |
|---|---|---|---|---|---|---|
| Versión Móvil | Móvil — Tareo (`administrativo`) | activa | — | — | — | — |
| Versión Móvil | Móvil — Asistencia (`asistencia`) | activa | — | — | — | — |
| Versión Móvil | Móvil — Compras (`compras`) | activa | — | — | — | — |
| Versión Móvil | Móvil — Gerencia (`gerencia`) | activa | — | — | — | — |
| Versión Móvil | Móvil — Logística (`logistica`) | activa | — | — | — | — |
| Versión Móvil | Móvil — Mi portal (`mi_espacio`) | activa | — | — | — | — |
| Versión Móvil | Móvil — Supervisor (`supervisor`) | activa | — | — | — | — |
| Versión Móvil | Móvil — Técnico (`tecnico`) | activa | — | — | — | — |
| Versión Móvil | Móvil — Vendedor (`vendedor`) | activa | — | — | — | — |
