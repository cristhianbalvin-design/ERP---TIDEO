# Catálogo consolidado de pantallas ZAHORY

Fuente: `navigation.js`, `components/shell.jsx` (sidebar) y los tres archivos en `routes/`. El orden reproduce el sidebar. Las rutas se expresan como hash de la aplicación operativa.

| Zona | Grupo / subgrupo | Pantalla visible | Ruta hash | Render actual (archivo — componente) | Categoría |
|---|---|---|---|---|---|
| Inicio | — | Dashboard Gerencial | `#/dashboard` | `pages/pages1.jsx` — `DashboardPage` | C |
| Inicio | — | Mis OTs del día | `#/mis-ots-hoy` | `pages/MisOTsPage.jsx` — `MisOTsPage` | C |
| Inicio | — | Mapa de Campo | `#/mapa-campo` | `pages/TransportePages.jsx` — `MapaCampo` | C |
| Líneas de Negocio | Flota & Alquileres | Panel de Flota | `#/flota` | `pages/AlquileresPages.jsx` — `FlotaRentalPage` | A |
| Líneas de Negocio | Flota & Alquileres | Contratos Rental | `#/contratos-rental` | `pages/AlquileresPages.jsx` — `ContratosRentalPage` | A |
| Líneas de Negocio | Flota & Alquileres | Actas & Despachos | `#/checkout` | `pages/AlquileresPages.jsx` — `DespachosRentalPage` | A |
| Líneas de Negocio | Flota & Alquileres | Liquidación & DMR | `#/liquidacion` | `pages/AlquileresPages.jsx` — `LiquidacionRentalPage` | A |
| Líneas de Negocio | Flota & Alquileres | Pasaporte de Equipos | `#/pasaporte-equipos` | `pages/RepuestosVentaPages.jsx` — `PasaporteEquipos` | A |
| Líneas de Negocio | Flota & Alquileres | Gestión de Garantías | `#/gestion-garantias` | `pages/RepuestosVentaPages.jsx` — `GestionGarantias` | A |
| Líneas de Negocio | Flota & Alquileres | Certificaciones del Activo | `#/certificaciones-activo` | `pages/RepuestosVentaPages.jsx` — `CertificacionesActivo` | A |
| Líneas de Negocio | Flota & Alquileres | Monitoreo Equipos | `#/monitoreo-equipos` | `components/PlaceholderPage.jsx` — `PlaceholderPage` | C |
| Líneas de Negocio | Transporte Comercial | Monitor de Viajes | `#/transporte-viajes` | `pages/TransportePages.jsx` — `MonitorViajes` | A |
| Líneas de Negocio | Transporte Comercial | Hoja de Ruta | `#/transporte-ruta` | `pages/TransportePages.jsx` — `HojaDeRuta` | A |
| Líneas de Negocio | Transporte Comercial | Maestro de Rutas | `#/transporte-tarifas` | `pages/TransportePages.jsx` — `MaestroRutas` | A |
| Líneas de Negocio | Transporte Comercial | Tarifas Transporte | `#/transporte-tarifas-config` | `components/PlaceholderPage.jsx` — `PlaceholderPage` | C |
| Líneas de Negocio | Producción | Dashboard Producción | `#/dashboard-produccion` | `pages/ProduccionPages.jsx` — `DashboardProduccion` | C |
| Líneas de Negocio | Producción | Órdenes de Fab. (OF) | `#/maestranza-of` | `pages/ProduccionPages.jsx` — `BandejaOFs` | A |
| Líneas de Negocio | Producción | Planificación de OF | `#/of-planificacion` | `pages/ProduccionPages.jsx` — `PlanificacionOFPage` | A |
| Líneas de Negocio | Producción | Control de Producción | `#/maestranza-piso` | `pages/ProduccionPages.jsx` — `ControlProduccion` | A |
| Líneas de Negocio | Producción | Tiempos y MTM | `#/of-tiempos-mtm` | `pages/ProduccionPages.jsx` — `TiemposMTMPage` | A |
| Líneas de Negocio | Producción | OEE y Rendimiento | `#/of-oee` | `pages/ProduccionPages.jsx` — `OEEPage` | A |
| Líneas de Negocio | Producción | No Conformidades | `#/of-no-conformidades` | `pages/ProduccionPages.jsx` — `NoConformidadesPage` | A |
| Líneas de Negocio | Producción / Ingeniería y Diseño | Ingeniería y Diseño | `#/area-ingenieria` | `pages/ProduccionPages.jsx` — `AreaResumenPage` (`area-ingenieria`) | C |
| Líneas de Negocio | Producción / Ingeniería y Diseño | Planos y Especificaciones | `#/ing-planos` | `pages/ProduccionPages.jsx` — `AreaProcesoPage` (`ing-planos`) | A |
| Líneas de Negocio | Producción / Ingeniería y Diseño | Lista de Materiales (BOM) | `#/maestranza-bom` | `pages/ProduccionPages.jsx` — `AreaProcesoPage` (`ing-bom`) | A |
| Líneas de Negocio | Producción / Ingeniería y Diseño | Estimación de Tiempos | `#/ing-tiempos` | `pages/ProduccionPages.jsx` — `AreaProcesoPage` (`ing-tiempos`) | A |
| Líneas de Negocio | Producción / Maestranza | Maestranza | `#/area-maestranza` | `pages/ProduccionPages.jsx` — `AreaResumenPage` (`area-maestranza`) | C |
| Líneas de Negocio | Producción / Maestranza | Torneado | `#/mae-torneado` | `pages/ProduccionPages.jsx` — `AreaProcesoPage` (`mae-torneado`) | A |
| Líneas de Negocio | Producción / Maestranza | Fresado | `#/mae-fresado` | `pages/ProduccionPages.jsx` — `AreaProcesoPage` (`mae-fresado`) | A |
| Líneas de Negocio | Producción / Maestranza | Rectificado | `#/mae-rectificado` | `pages/ProduccionPages.jsx` — `AreaProcesoPage` (`mae-rectificado`) | A |
| Líneas de Negocio | Producción / Maestranza | Taladrado / Mandrinado | `#/mae-taladrado` | `pages/ProduccionPages.jsx` — `AreaProcesoPage` (`mae-taladrado`) | A |
| Líneas de Negocio | Producción / Maestranza | Cromado Industrial | `#/mae-cromado` | `pages/ProduccionPages.jsx` — `AreaProcesoPage` (`mae-cromado`) | A |
| Líneas de Negocio | Producción / Maestranza | Recuperación de Piezas | `#/mae-recuperacion` | `pages/ProduccionPages.jsx` — `AreaProcesoPage` (`mae-recuperacion`) | A |
| Líneas de Negocio | Producción / Soldadura | Soldadura | `#/area-soldadura` | `pages/ProduccionPages.jsx` — `AreaResumenPage` (`area-soldadura`) | C |
| Líneas de Negocio | Producción / Soldadura | MIG / TIG / SMAW | `#/sol-mig-tig` | `pages/ProduccionPages.jsx` — `AreaProcesoPage` (`sol-mig-tig`) | A |
| Líneas de Negocio | Producción / Soldadura | Recargue y Recuperación | `#/sol-recargue` | `pages/ProduccionPages.jsx` — `AreaProcesoPage` (`sol-recargue`) | A |
| Líneas de Negocio | Producción / Soldadura | Corte Térmico | `#/sol-corte` | `pages/ProduccionPages.jsx` — `AreaProcesoPage` (`sol-corte`) | A |
| Líneas de Negocio | Producción / Soldadura | Soldadura Estructural | `#/sol-estructural` | `pages/ProduccionPages.jsx` — `AreaProcesoPage` (`sol-estructural`) | A |
| Líneas de Negocio | Producción / Fabricación y Ensamble | Fabricación y Ensamble | `#/area-fabricacion` | `pages/ProduccionPages.jsx` — `AreaResumenPage` (`area-fabricacion`) | C |
| Líneas de Negocio | Producción / Fabricación y Ensamble | Fabricación de Piezas | `#/fab-piezas` | `pages/ProduccionPages.jsx` — `AreaProcesoPage` (`fab-piezas`) | A |
| Líneas de Negocio | Producción / Fabricación y Ensamble | Fabricación de Estructuras | `#/fab-estructuras` | `pages/ProduccionPages.jsx` — `AreaProcesoPage` (`fab-estructuras`) | A |
| Líneas de Negocio | Producción / Fabricación y Ensamble | Ensamble de Componentes | `#/fab-ensamble` | `pages/ProduccionPages.jsx` — `AreaProcesoPage` (`fab-ensamble`) | A |
| Líneas de Negocio | Producción / Fabricación y Ensamble | Pruebas y Control de Calidad | `#/fab-pruebas` | `pages/ProduccionPages.jsx` — `AreaProcesoPage` (`fab-pruebas`) | A |
| Líneas de Negocio | Producción / Calidad y Trazabilidad | Control de Calidad | `#/of-calidad` | `pages/ProduccionPages.jsx` — `CalidadPage` | A |
| Líneas de Negocio | Producción / Calidad y Trazabilidad | Trazabilidad de OF | `#/of-trazabilidad` | `pages/ProduccionPages.jsx` — `TrazabilidadOF` | A |
| Líneas de Negocio | Producción / Calidad y Trazabilidad | Informes y Certificados | `#/of-informes` | `components/PlaceholderPage.jsx` — `PlaceholderPage` | C |
| Líneas de Negocio | Venta de Repuestos | Catálogo CAT | `#/catalogo` | `pages/pages2_v2.jsx` — `CatalogoPage` | B2 |
| Líneas de Negocio | Venta de Repuestos | Cotizaciones Venta | `#/repuestos-cotizaciones` | `pages/RepuestosVentaPages.jsx` — `CotizacionesVenta` | B2 |
| Líneas de Negocio | Venta de Repuestos | Órdenes de Venta | `#/repuestos-ordenes` | `pages/RepuestosVentaPages.jsx` — `OrdenesVenta` | B2 |
| Líneas de Negocio | Venta de Repuestos | Guías & Despachos | `#/repuestos-despachos` | `components/AdministrativeAppLinkPage.jsx` — `AdministrativeAppLinkPage` (puente a Administrativo: `remision`); referencia mock intacta: `pages/RepuestosVentaPages.jsx` — `GuiasDespachos` | B1 |
| Taller & Operaciones | Órdenes de Trabajo | Bandeja Maestra | `#/ots` | `pages/pages2_v2.jsx` — `OTsListadoPage` | A |
| Taller & Operaciones | Órdenes de Trabajo | Nueva OT · DBS | `#/crear-ot` | `pages/CrearOTPage.jsx` — `CrearOTPage` | A |
| Taller & Operaciones | Órdenes de Trabajo | Partes Taller | `#/taller` | `pages/pages3.jsx` — `ParteTallerPage` | A |
| Taller & Operaciones | Órdenes de Trabajo | Reportes Mina | `#/partes-mina` | `pages/pages2_v2.jsx` — `HistorialMinaPage` | A |
| Taller & Operaciones | Órdenes de Trabajo | Cierre & Conformidad | `#/cierre-conformidad` | `components/AdministrativeAppLinkPage.jsx` — `AdministrativeAppLinkPage` (puente a Administrativo: `cierre`); referencia mock intacta: `pages/pages2_v2.jsx` — `CierreConformidad` | B1 |
| Taller & Operaciones | Órdenes de Trabajo | Scheduler · Despacho | `#/scheduler-despacho` | `pages/TransportePages.jsx` — `SchedulerDespacho` | A |
| Taller & Operaciones | HSE — Seguridad | Dashboard HSE | `#/hse-dashboard` | `pages/HSEPage.jsx` — `HSEDashboard` | C |
| Taller & Operaciones | HSE — Seguridad | Permisos de Trabajo | `#/permisos-trabajo` | `pages/HSEPage.jsx` — `PermisosTrabajoHSE` | A |
| Taller & Operaciones | HSE — Seguridad | Registro de Incidentes | `#/registro-incidentes` | `pages/HSEPage.jsx` — `RegistroIncidentes` | A |
| Taller & Operaciones | HSE — Seguridad | EPP & Certificaciones | `#/epp-certificaciones` | `pages/HSEPage.jsx` — `EPPCertificaciones` | A |
| Taller & Operaciones | HSE — Seguridad | Análisis de Riesgo (ATS) | `#/analisis-riesgo-ats` | `pages/HSEPage.jsx` — `AnalisisRiesgoATS` | A |
| Taller & Operaciones | HSE — Seguridad | Protocolo LOTO | `#/protocolo-loto` | `pages/HSEPage.jsx` — `ProtocoloLOTO` | A |
| Taller & Operaciones | Confiabilidad | Backlog Operativo | `#/backlog` | `components/AdministrativeAppLinkPage.jsx` — `AdministrativeAppLinkPage` (puente a Administrativo: `backlog`); referencia mock intacta: `pages/BacklogPage.jsx` — `BacklogPage` | B1 |
| Taller & Operaciones | Confiabilidad | Análisis SOS | `#/sos-telemetria` | `pages/ProduccionPages.jsx` — `AnalisisSOS` | A |
| Taller & Operaciones | Confiabilidad | KPIs de Confiabilidad | `#/confiabilidad` | `pages/ConfiabilidadPage.jsx` — `KPIsConfiabilidad` | A |
| Taller & Operaciones | Confiabilidad | Programación PM | `#/programacion-pm` | `pages/pages2_v2.jsx` — `ProgramacionPM` | A |
| Taller & Operaciones | Confiabilidad | Disponibilidad Mecánica | `#/disponibilidad-mecanica` | `pages/pages2_v2.jsx` — `DisponibilidadMecanica` | A |
| Supply Chain | Almacén & Repuestos | Inventario & Kardex | `#/catalogo` | `pages/pages2_v2.jsx` — `CatalogoPage` | B2 |
| Supply Chain | Almacén & Repuestos | Solicitudes SOLPE | `#/solicitudes` | `components/AdministrativeAppLinkPage.jsx` — `AdministrativeAppLinkPage` (puente a Administrativo: `solpe`); referencia mock intacta: `pages/pages2_v2.jsx` — `SolicitudesPage` | B1 |
| Supply Chain | Almacén & Repuestos | Reserva de Repuestos | `#/almacen-reservas` | `components/PlaceholderPage.jsx` — `PlaceholderPage` | B2 |
| Supply Chain | Almacén & Repuestos | Entradas & Salidas | `#/almacen-movimientos` | `components/AdministrativeAppLinkPage.jsx` — `AdministrativeAppLinkPage` (puente a Administrativo: `inventario`); referencia mock intacta: `components/PlaceholderPage.jsx` — `PlaceholderPage` | B1 |
| Supply Chain | Almacén & Repuestos | Stock Mínimos & Alertas | `#/almacen-alertas` | `components/AdministrativeAppLinkPage.jsx` — `AdministrativeAppLinkPage` (puente a Administrativo: `inventario`); referencia mock intacta: `components/PlaceholderPage.jsx` — `PlaceholderPage` | B1 |
| Supply Chain | Compras & Importación | Proveedores | `#/compras-proveedores` | `components/AdministrativeAppLinkPage.jsx` — `AdministrativeAppLinkPage` (puente a Administrativo: `proveedores`); referencia mock intacta: `components/PlaceholderPage.jsx` — `PlaceholderPage` | B1 |
| Supply Chain | Compras & Importación | Cotizaciones Compra | `#/compras-cotizaciones` | `components/AdministrativeAppLinkPage.jsx` — `AdministrativeAppLinkPage` (puente a Administrativo: `cot_compras`); referencia mock intacta: `components/PlaceholderPage.jsx` — `PlaceholderPage` | B1 |
| Supply Chain | Compras & Importación | Órdenes de Compra | `#/compras-oc` | `components/AdministrativeAppLinkPage.jsx` — `AdministrativeAppLinkPage` (puente a Administrativo: `ordenes_compra`); referencia mock intacta: `components/PlaceholderPage.jsx` — `PlaceholderPage` | B1 |
| Supply Chain | Compras & Importación | Importaciones & DUA | `#/compras-importaciones` | `components/PlaceholderPage.jsx` — `PlaceholderPage` | B2 |
| Supply Chain | Compras & Importación | Recepciones | `#/compras-recepciones` | `components/AdministrativeAppLinkPage.jsx` — `AdministrativeAppLinkPage` (puente a Administrativo: `recepciones`); referencia mock intacta: `components/PlaceholderPage.jsx` — `PlaceholderPage` | B1 |
| Administración | Finanzas & Facturación | Consolidado Facturación | `#/consolidado` | `pages/pages2_v2.jsx` — `ConsolidadoPage` | A |
| Administración | Finanzas & Facturación | Cuentas por Cobrar | `#/finanzas-cxc` | `components/AdministrativeAppLinkPage.jsx` — `AdministrativeAppLinkPage` (puente a Administrativo: `cxc`); referencia mock intacta: `components/PlaceholderPage.jsx` — `PlaceholderPage` | B1 |
| Administración | Finanzas & Facturación | Cuentas por Pagar | `#/finanzas-cxp` | `components/AdministrativeAppLinkPage.jsx` — `AdministrativeAppLinkPage` (puente a Administrativo: `cxp`); referencia mock intacta: `components/PlaceholderPage.jsx` — `PlaceholderPage` | B1 |
| Administración | Finanzas & Facturación | Tesorería | `#/finanzas-tesoreria` | `components/AdministrativeAppLinkPage.jsx` — `AdministrativeAppLinkPage` (puente a Administrativo: `tesoreria`); referencia mock intacta: `components/PlaceholderPage.jsx` — `PlaceholderPage` | B1 |
| Administración | Finanzas & Facturación | Costos & Rentabilidad | `#/ots-costos` | `pages/pages1.jsx` — `CostosPage` | B2 |
| Administración | Clientes & Activos | Clientes & Contratos | `#/clientes` | `pages/ClientesContratosPage.jsx` — `ClientesContratosPage` | B2 |
| Administración | Clientes & Activos | Equipos & Activos | `#/equipos` | `pages/EquiposPage.jsx` — `EquiposPage` | B2 |
| Administración | Clientes & Activos | Proyectos & Tarifas | `#/proyectos` | `pages/ProyectosTarifasPage.jsx` — `ProyectosTarifasPage` | B2 |
| Administración | Configuración | Usuarios & Roles | `#/usuarios` | `components/AdministrativeAppLinkPage.jsx` — `AdministrativeAppLinkPage` (puente a Administrativo: `usuarios`); referencia mock intacta: `pages/pages2_v2.jsx` — `UsuariosPage` | B1 |
| Administración | Configuración | Parámetros Globales | `#/configuracion` | `pages/ConfiguracionPage.jsx` — `ConfiguracionPage` | B2 |

## Resumen de categorías

| Categoría | Pantallas |
|---|---:|
| A | 50 |
| B1 | 14 |
| B2 | 11 |
| C | 12 |
| **Total** | **87** |
