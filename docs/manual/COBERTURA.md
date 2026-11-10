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
| Administración | 77 | 11 (14 %) | 21 (27 %) | 1 | 54 |
| Operaciones | 120 | 8 (7 %) | 26 (22 %) | 0 | 88 |
| Versión Móvil | 9 | 0 (0 %) | 0 (0 %) | 0 | 9 |
| **Total** | 206 | 19 (9 %) | 47 (23 %) | 1 | 151 |

Herramientas sin permiso de pantalla detectable (no se asignan a ninguna pantalla): `asistente_resumen_financiero`.

## Administración

| Módulo | Pantalla | Estado | Ficha | Procesos | Datos | Registro |
|---|---|---|---|---|---|---|
| Administración | Activos Fijos (`activos_fijos`) | activa | — | — | — | — |
| Administración | Caja Chica (`caja`) | activa | caja | proceso_caja_chica | 4 | preparar_egreso_caja_chica |
| Administración | Cuentas por Cobrar (`cxc`) | activa | cxc | — | 4 | — |
| Administración | Cuentas por Pagar (`cxp`) | activa | cxp | proceso_solpe_pago | 4 | — |
| Administración | Facturación (`facturacion`) | activa | facturacion | — | 4 | — |
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
| Compras | Ordenes de Compra (`ordenes_compra`) | activa | ordenes_compra | proceso_solpe_pago | 7 | — |
| Compras | Ordenes de Servicio (`ordenes_servicio`) | activa | — | — | — | — |
| Compras | Proveedores (`proveedores`) | activa | proveedores | — | 3 | — |
| Compras | Recepciones (`recepciones`) | activa | recepciones | proceso_solpe_pago | 3 | — |
| Compras | Bandeja de Sourcing (`sourcing_bandeja`) | activa | — | proceso_solpe_pago | 7 | — |
| Configuración | Maestros Base (`maestros`) | activa | — | — | — | — |
| Configuración | Notificaciones (`notificaciones_config`) | activa | — | — | — | — |
| Configuración | Organigrama (`organigrama`) | activa | — | — | — | — |
| Configuración | Parametros Generales (`parametros`) | activa | — | — | — | — |
| Configuración | Roles y Permisos (`roles`) | activa | — | — | — | — |
| Configuración | Salud Implementacion (`salud_implementacion_tenant`) | activa | — | — | — | — |
| Configuración | Catalogo Servicios (`servicios`) | activa | — | — | — | — |
| Configuración | Tarifarios (`tarifarios`) | maqueta | — | — | — | — |
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
| Logística | SOLPE Interna (`solpe`) | activa | solpe | proceso_solpe_pago | 3 | — |
| Operaciones | Backlog (`backlog`) | activa | — | — | — | — |
| Operaciones | Cierre y Calidad (`cierre`) | activa | — | — | — | — |
| Operaciones | IA Operativa (`ia_operativa`) | legado | — | — | — | — |
| Operaciones | Ordenes de Trabajo (`ot`) | activa | — | — | — | — |
| Operaciones | Partes Diarios (`partes`) | activa | — | — | — | — |
| Operaciones | Planner y Recursos (`planner`) | activa | — | — | — | — |
| Operaciones | Soporte y Tickets (`tickets`) | activa | — | — | — | — |
| Plataforma | Metricas SaaS (`metricas_saas`) | maqueta | — | — | — | — |
| Plataforma | Planes y Licencias (`planes`) | maqueta | — | — | — | — |
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
| Almacén & Repuestos | Despachos (`almacen-despachos`) | activa | despachos_almacen | — | 8 | — |
| Almacén & Repuestos | Devoluciones (`almacen-devoluciones`) | activa | — | — | 8 | — |
| Almacén & Repuestos | Etiquetas (`almacen-etiquetas`) | activa | — | — | 8 | — |
| Almacén & Repuestos | Gemelo digital (`almacen-gemelo`) | activa | — | — | 8 | — |
| Almacén & Repuestos | Préstamo de herramientas (`almacen-herramientas`) | activa | — | — | 8 | — |
| Almacén & Repuestos | Inventario & Kardex (`almacen-inventario`) | activa | — | — | 8 | — |
| Almacén & Repuestos | Minas y proyectos (`almacen-minas`) | activa | — | — | 8 | — |
| Almacén & Repuestos | Valorizado y ABC (`almacen-reportes`) | activa | — | — | 8 | — |
| Almacén & Repuestos | Reserva de Repuestos (`almacen-reservas`) | activa | reserva_repuestos | — | 8 | — |
| Almacén & Repuestos | Ubicaciones (`almacen-ubicaciones`) | activa | — | — | 8 | — |
| Almacén & Repuestos | Vencimientos y lotes (`almacen-vencimientos`) | activa | — | — | 8 | — |
| Almacén & Repuestos | Solicitudes SOLPE (`solicitudes`) | puente | — | — | 3 | — |
| Clientes & Activos | Clientes & Contratos (`clientes`) | maqueta | — | — | 3 | — |
| Clientes & Activos | Equipos & Activos (`equipos`) | maqueta | — | — | — | — |
| Clientes & Activos | Proyectos & Tarifas (`proyectos`) | activa | — | — | — | — |
| Compras & Importación | Cotizaciones Compra (`compras-cotizaciones`) | puente | — | — | 2 | — |
| Compras & Importación | Importaciones & DUA (`compras-importaciones`) | placeholder | — | — | — | — |
| Compras & Importación | Órdenes de Compra (`compras-oc`) | puente | — | — | 7 | — |
| Compras & Importación | Proveedores (`compras-proveedores`) | puente | — | — | 3 | — |
| Compras & Importación | Recepciones (`compras-recepciones`) | activa | — | — | 3 | — |
| Confiabilidad | Backlog Operativo (`backlog`) | puente | — | — | — | — |
| Confiabilidad | KPIs de Confiabilidad (`confiabilidad`) | maqueta | — | — | — | — |
| Confiabilidad | Disponibilidad Mecánica (`disponibilidad-mecanica`) | maqueta | — | — | — | — |
| Confiabilidad | Programación PM (`programacion-pm`) | maqueta | — | — | — | — |
| Confiabilidad | Análisis SOS (`sos-telemetria`) | maqueta | — | — | — | — |
| Configuración | Parámetros Globales (`configuracion`) | maqueta | — | — | — | — |
| Configuración | Usuarios & Roles (`usuarios`) | puente | — | — | — | — |
| Finanzas & Facturación | Consolidado Facturación (`consolidado`) | maqueta | — | — | 4 | — |
| Finanzas & Facturación | Cuentas por Cobrar (`finanzas-cxc`) | puente | — | — | 4 | — |
| Finanzas & Facturación | Cuentas por Pagar (`finanzas-cxp`) | puente | — | — | 4 | — |
| Finanzas & Facturación | Tesorería (`finanzas-tesoreria`) | puente | — | — | 3 | — |
| Finanzas & Facturación | Costos & Rentabilidad (`ots-costos`) | maqueta | — | — | — | — |
| Flota & Alquileres | Certificaciones del Activo (`certificaciones-activo`) | activa | — | — | — | — |
| Flota & Alquileres | Actas & Despachos (`checkout`) | activa | — | — | — | — |
| Flota & Alquileres | Contratos Rental (`contratos-rental`) | activa | — | — | — | — |
| Flota & Alquileres | Dashboard de Flota y Alquileres (`dashboard-rental`) | maqueta | — | — | — | — |
| Flota & Alquileres | Panel de Flota (`flota`) | activa | — | — | — | — |
| Flota & Alquileres | Gestión de Garantías (`gestion-garantias`) | activa | — | — | — | — |
| Flota & Alquileres | Liquidación & DMR (`liquidacion`) | activa | — | — | — | — |
| Flota & Alquileres | Monitoreo Equipos (`monitoreo-equipos`) | placeholder | — | — | — | — |
| Flota & Alquileres | Pasaporte de Equipos (`pasaporte-equipos`) | activa | — | — | — | — |
| HSE — SEGURIDAD | Análisis de Riesgo (ATS) (`analisis-riesgo-ats`) | maqueta | — | — | — | — |
| HSE — SEGURIDAD | EPP & Certificaciones (`epp-certificaciones`) | maqueta | — | — | — | — |
| HSE — SEGURIDAD | Dashboard HSE (`hse-dashboard`) | maqueta | — | — | — | — |
| HSE — SEGURIDAD | Permisos de Trabajo (`permisos-trabajo`) | maqueta | — | — | — | — |
| HSE — SEGURIDAD | Protocolo LOTO (`protocolo-loto`) | maqueta | — | — | — | — |
| HSE — SEGURIDAD | Registro de Incidentes (`registro-incidentes`) | maqueta | — | — | — | — |
| Inicio | Dashboard Gerencial (`dashboard`) | activa | — | — | — | — |
| Inicio | Mapa de Campo (`mapa-campo`) | maqueta | — | — | — | — |
| Inicio | Mis OTs del día (`mis-ots-hoy`) | activa | mis_ots_dia | — | — | — |
| Operaciones | Documentos (`docs`) | maqueta | — | — | — | — |
| Operaciones | Indicadores de confiabilidad (`indicadores-confiabilidad`) | placeholder | — | — | — | — |
| Inicio | Inicio operativo (Aria) (`inicio`) | activa | inicio_operaciones | — | — | — |
| Operaciones | Proveedores (operaciones) (`proveedores`) | placeholder | — | — | — | — |
| Órdenes de Trabajo | Cierre & Conformidad (`cierre-conformidad`) | activa | — | — | — | — |
| Órdenes de Trabajo | Nueva OT (`crear-ot`) | activa | nueva_ot | — | — | — |
| Órdenes de Trabajo | Diagnóstico Técnico (`diagnostico-tecnico`) | activa | — | — | — | — |
| Órdenes de Trabajo | Nuevo reporte de mina (`nuevo-reporte`) | activa | — | — | — | — |
| Órdenes de Trabajo | Detalle de OT (`ot-detalle`) | maqueta | — | — | — | — |
| Órdenes de Trabajo | Bandeja de OTs (`ots`) | activa | bandeja_ots | — | — | — |
| Órdenes de Trabajo | Reportes Mina (`partes-mina`) | activa | — | — | — | — |
| Órdenes de Trabajo | Gestión de partes de taller (`partes-taller`) | activa | — | — | — | — |
| Órdenes de Trabajo | Recepción de Activos (`recepcion-activos`) | activa | — | — | — | — |
| Órdenes de Trabajo | Planner (`scheduler-despacho`) | activa | — | — | — | — |
| Órdenes de Trabajo | Partes Taller (`taller`) | activa | partes_taller | — | — | — |
| Producción | Fabricación y Ensamble (`area-fabricacion`) | maqueta | — | — | — | — |
| Producción | Ingeniería y Diseño (`area-ingenieria`) | maqueta | — | — | — | — |
| Producción | Maestranza (`area-maestranza`) | maqueta | — | — | — | — |
| Producción | Soldadura (`area-soldadura`) | maqueta | — | — | — | — |
| Producción | Dashboard Producción (`dashboard-produccion`) | maqueta | — | — | — | — |
| Producción | Ensamble de Componentes (`fab-ensamble`) | maqueta | — | — | — | — |
| Producción | Fabricación de Estructuras (`fab-estructuras`) | maqueta | — | — | — | — |
| Producción | Fabricación de Piezas (`fab-piezas`) | maqueta | — | — | — | — |
| Producción | Pruebas y Control de Calidad (`fab-pruebas`) | maqueta | — | — | — | — |
| Producción | Planos y Especificaciones (`ing-planos`) | maqueta | — | — | — | — |
| Producción | Estimación de Tiempos (`ing-tiempos`) | maqueta | — | — | — | — |
| Producción | Cromado Industrial (`mae-cromado`) | maqueta | — | — | — | — |
| Producción | Fresado (`mae-fresado`) | maqueta | — | — | — | — |
| Producción | Rectificado (`mae-rectificado`) | maqueta | — | — | — | — |
| Producción | Recuperación de Piezas (`mae-recuperacion`) | maqueta | — | — | — | — |
| Producción | Taladrado / Mandrinado (`mae-taladrado`) | maqueta | — | — | — | — |
| Producción | Torneado (`mae-torneado`) | maqueta | — | — | — | — |
| Producción | Lista de Materiales (BOM) (`maestranza-bom`) | maqueta | — | — | — | — |
| Producción | Órdenes de Fab. (OF) (`maestranza-of`) | activa | — | — | — | — |
| Producción | Control de Producción (`maestranza-piso`) | maqueta | — | — | — | — |
| Producción | Control de Calidad (`of-calidad`) | maqueta | — | — | — | — |
| Producción | Informes y Certificados (`of-informes`) | placeholder | — | — | — | — |
| Producción | No Conformidades (`of-no-conformidades`) | maqueta | — | — | — | — |
| Producción | OEE y Rendimiento (`of-oee`) | maqueta | — | — | — | — |
| Producción | Planificación de OF (`of-planificacion`) | maqueta | — | — | — | — |
| Producción | Tiempos y MTM (`of-tiempos-mtm`) | maqueta | — | — | — | — |
| Producción | Trazabilidad de OF (`of-trazabilidad`) | placeholder | — | — | — | — |
| Producción | Nueva OF (`produccion-crear-of`) | activa | — | — | — | — |
| Producción | Detalle de OF (`produccion-detalle-of`) | activa | — | — | — | — |
| Producción | Garantías de producción (`produccion-garantias`) | maqueta | — | — | — | — |
| Producción | Ingeniería y BOM (`produccion-ingenieria`) | maqueta | — | — | — | — |
| Producción | Pasaporte de componente (`produccion-pasaporte`) | maqueta | — | — | — | — |
| Producción | Tiempos estándar (`produccion-tiempos`) | maqueta | — | — | — | — |
| Producción | Corte Térmico (`sol-corte`) | maqueta | — | — | — | — |
| Producción | Soldadura Estructural (`sol-estructural`) | maqueta | — | — | — | — |
| Producción | MIG / TIG / SMAW (`sol-mig-tig`) | maqueta | — | — | — | — |
| Producción | Recargue y Recuperación (`sol-recargue`) | maqueta | — | — | — | — |
| Transporte Comercial | Dashboard de Transporte (`dashboard-transporte`) | maqueta | — | — | — | — |
| Transporte Comercial | Nueva orden de viaje (`transporte-crear-ov`) | activa | — | — | — | — |
| Transporte Comercial | Flota (`transporte-flota`) | activa | — | — | — | — |
| Transporte Comercial | Liquidación de transporte (`transporte-liquidacion`) | maqueta | — | — | — | — |
| Transporte Comercial | Lugares (`transporte-lugares`) | activa | — | — | — | — |
| Transporte Comercial | Hoja de Ruta (`transporte-ruta`) | activa | — | — | — | — |
| Transporte Comercial | Maestro de Rutas (`transporte-tarifas`) | activa | — | — | — | — |
| Transporte Comercial | Tarifas Transporte (`transporte-tarifas-config`) | activa | — | — | — | — |
| Transporte Comercial | Detalle de viaje (`transporte-viaje`) | activa | — | — | — | — |
| Transporte Comercial | Monitor de Viajes (`transporte-viajes`) | activa | monitor_viajes | — | — | — |
| Venta de Repuestos | Catálogo de venta (`catalogo`) | activa | — | — | — | — |
| Venta de Repuestos | Catálogo de precios (`catalogo-precios`) | maqueta | — | — | — | — |
| Venta de Repuestos | Dashboard de Repuestos (`dashboard-repuestos`) | maqueta | — | — | — | — |
| Venta de Repuestos | Despachos de repuestos (`despachos-repuestos`) | maqueta | — | — | — | — |
| Venta de Repuestos | Pedidos de venta (`pedidos-venta`) | maqueta | — | — | — | — |
| Venta de Repuestos | Cotizaciones Venta (`repuestos-cotizaciones`) | maqueta | — | — | — | — |
| Venta de Repuestos | Nuevo pedido de repuestos (`repuestos-crear-pedido`) | maqueta | — | — | — | — |
| Venta de Repuestos | Guías & Despachos (`repuestos-despachos`) | puente | — | — | 5 | — |
| Venta de Repuestos | Detalle de pedido de repuestos (`repuestos-detalle-pedido`) | maqueta | — | — | — | — |
| Venta de Repuestos | Órdenes de Venta (`repuestos-ordenes`) | maqueta | — | — | — | — |

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
