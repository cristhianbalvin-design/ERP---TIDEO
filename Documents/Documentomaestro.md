# ERP Modular Estándar para Empresas de Servicios con CRM Potenciado
## Documento Maestro Consolidado — TIDEO Tech & Strategy
### Arquitectura Multitenant SaaS · Última actualización: 10/08/2026

---

## 1. Datos de la empresa proponente

**Empresa:** TIDEO Tech & Strategy
**Especialidad:** Transformación digital, automatización de procesos, analítica, inteligencia artificial aplicada y desarrollo de plataformas empresariales a medida.
**Enfoque:** Primero se diseña el proceso comercial, operativo y financiero; luego se implementa la tecnología que lo soporta.
**Contacto:** cristhianbalvin@gmail.com | **Web:** cristhianbalvin.com
**Stack:** React 18 + Vite 5 · Supabase · Vercel · Context API · agentes de IA.
**Modelo comercial:** SaaS multitenant — usuarios ilimitados según plan contratado por empresa.

---

## 2. Propósito del documento

Este documento es el **único maestro de referencia** del ERP. Consolida arquitectura, módulos, flujos, reglas de negocio, modelo de datos multitenant, estado de desarrollo, indicadores, roles y fases de implementación. Se actualiza en cada sesión de desarrollo relevante.

El ERP opera como plataforma **SaaS multitenant**: una sola instalación sirve a múltiples empresas clientes con datos completamente aislados. TIDEO administra la plataforma global; cada empresa administra su propio entorno.

---

## 3. Estado de desarrollo — 10/08/2026

### 3.1 Resumen de progreso

| Área | Estado |
|------|--------|
| Módulos implementados (construidos) | ~75 ítems activos de sidebar/ruta |
| Módulos en prompt pendiente de implementar | 0 |
| Stack técnico | React 18 + Vite 5 · Context API · CSS custom properties · Supabase |
| Arquitectura | Multitenant SaaS funcional con selector de empresa y simulador de roles |
| Migraciones SQL registradas en el repositorio | 384 archivos SQL locales, hasta `383_reinicio_jornada_por_trabajadores.sql` |
| Migración local más reciente | `383_reinicio_jornada_por_trabajadores.sql`: reinicio de roster minero con impactos, salud de implementación por tenant.
| Migraciones creadas pendientes de confirmar contra Supabase real | Verificar aplicación remota. Nuevas posteriores al corte anterior (364-383):
- Salud de Implementación: configuración, anotaciones y respuestas multitenant.
- Reinicio de Roster Minero y Jornadas de Trabajadores con previsualización de impactos.
- Refactorización de lógicas de responsabilidades TIDEO/Cliente.
| Bugs/ajustes corregidos en sesiones 20–24/06/2026 | **Hardening y fix de persistencia:** Corrección de supervisor huérfano; **Maestros:** Migración de tipos de contrato a base de datos con interfaz UI; **Turnos:** Detalle de días laborables, selector autoservicio y autorizaciones HE; **Seguridad:** RLS para postulaciones anónimas y self-read de email. |

### 3.2 Inventario completo de módulos

#### Business Intelligence
| Módulo | Estado |
|--------|--------|
| Dashboard General | ✅ Implementado |
| BI Comercial | ✅ Implementado |
| BI Operativo | ✅ Implementado |
| BI Financiero | ✅ Implementado |
| BI Customer Success | ✅ Implementado |

#### CRM y Comercial
| Módulo | Estado | Notas |
|--------|--------|-------|
| Cuentas y Contactos | ✔ Implementado | Formulario comercial rápido, tab Condiciones Financieras visible con ver_finanzas, badge advertencia orientación de flujo leads. |
| Leads y Scoring | ✅ Implementado | Formulario con Razón Social, RUC, Industria, campaña, responsable y validación RUC; conversión propaga datos a cuenta/oportunidad. |
| Pipeline y Oportunidades | ✔ Implementado | Timeline: movimientos entre etapas registrados en `opp_historial_etapas` (migr. 079 aplicada en Supabase) |
| Agenda Comercial | ✅ Implementado | Planificación de visitas y demos |
| Actividades Comerciales | ✅ Implementado | |
| Hoja de Costeo | ✅ Implementado | Documento interno entre Oportunidad y Cotización. Secciones: MO, materiales, servicios terceros, logística. Flujo: borrador → en revisión → aprobada → genera cotización pre-rellenada |
| Cotizaciones | ✅ Implementado | |
| OS Cliente | ✅ Implementado | |
| Marketing Automation — Campañas | ✔ Implementado | CRUD completo: crear/editar/pausar/reactivar campañas. Métricas: leads atribuidos, tasa conversión, ingreso atribuido, CPL, ROI. Ficha de campaña con leads detallados. `campana_id` viaja en leads → oportunidades. |

#### Operaciones
| Módulo | Estado |
|--------|--------|
| Planner y Recursos (+ Agenda CS) | ✅ Implementado |
| Backlog | ✅ Implementado |
| Órdenes de Trabajo (OT) | ✅ Implementado |
| Partes Diarios | ✅ Implementado |
| Cierre Técnico y Calidad | ✅ Implementado |
| Soporte y Tickets | ✅ Implementado |

#### RRHH
| Módulo | Estado | Notas |
|--------|--------|-------|
| Mi portal | ✔ Implementado | `pages_mi_portal.jsx`. Autoservicio del colaborador: ficha propia, documentos, solicitudes, boletas/acuses, constancias y amonestaciones con acuse. |
| Reclutamiento | ✔ Implementado | `pages_reclutamiento.jsx` + ruta pública `PostulacionPublica`. Vacantes, candidatos, candidaturas, historial por etapa e invitación/postulación pública. |
| Personal Operativo | ✔ Implementado | En sección RRHH. Incluye ficha laboral, tarifa hora, documentos reales, datos de nómina/honorarios, carga masiva vía Excel, gestión de adendas y sincronización de área/contrato primigenio. |
| Personal Administrativo | ✔ Implementado | En sección RRHH. Incluye ficha laboral, tarifa hora, documentos reales, reportes, comisiones, datos de honorarios, carga masiva vía Excel, gestión de adendas y sincronización de área/contrato primigenio. |
| Control de Asistencia | ✔ Implementado | Tabs diaria, semanal, mensual, resumen, autorizaciones HE, biométrico, SAR/geocercas. **Vigencia Efectiva:** validación estricta de estado contractual que bloquea registros si el contrato no está en periodo activo. Tardanzas, HE, GPS móvil. Ahora con hook directo a solicitudes de RRHH para reflejar permisos con goce de forma automática.
| Turnos y Horarios | ✔ Implementado | Módulo standalone `pages_turnos.jsx`. CRUD completo: crear/editar/eliminar con side-panel. Campos: nombre, entrada/salida, tolerancia, cruza medianoche, días laborables (o variables), refrigerio. Preview de horas efectivas en tiempo real. |
| Nómina Básica | ✔ Implementado | AFP 3 componentes (tabla multitenant completa), IR 5ta con UIT dinámica, horas extra 25%/35%, CTS computable, bonif. extraordinaria. Régimen MYPE. Régimen minero 14×7/20×10/28×14. Pago quincenal configurable. PLAME. Cierre → egresos en finanzas. **Fase 1 (10/06):** motor corregido. **Fase 2 (10/06):** historial de asignaciones de jornada con vigencia (`personal_asignaciones_jornada`). **Fase 3 (11/06):** `afp_parametros` con comisiones por flujo/mixta. **Ola 2 (12/06):** contratos, cese por falta grave, datos bancarios, autorización HE, compensación y descuentos extraordinarios. **Contratos avanzados (16/06):** flujos de adendas y versionado de contratos. **Contrato Primigenio y Periodos (19/06):** reglas de predecesor/sucesor, candados en ceses y caducidad de documentos. |
| Comisiones | ✔ Implementado | Liquidación, aprobaciones (acuerdos especiales, +48h sin respuesta), retenciones IR de 4ta categoría según suspensión y tipo de cambio, generación de RHE y CxP asociada. |
| Solicitudes de RRHH | ✔ Implementado | Flujo multietapa: enviada → aprobada_jefe → confirmada_rrhh → activa. Tipos: vacaciones, permisos, licencias, compensación horas y papeletas. Saldo automático. Ahora integra `aplicar_asistencia` que impacta directamente el Control de Asistencia para permisos con goce y licencias.
| Tareo Administrativo | ✔ Implementado | Registro de horas de personal administrativo contra OT o CECO libre, backoffice y PWA, integrado a Control de Horas. |
| Control de Horas | ✔ Implementado | Consolidado operativo/administrativo por período: partes, tareos, OTs, tarifa hora, productividad y costos de mano de obra. |
| Evaluación de Desempeño | ✔ Implementado | 360° básico (autoevaluación + jefe), competencias + objetivos, score ponderado configurable, solo informativo. |
| Liquidación por Cese | ✔ Implementado | Todos los tipos de cese (renuncia, despido, mutuo acuerdo, vencimiento contrato, fallecimiento y falta grave documentada). Motor de cálculo: vacaciones truncas, CTS proporcional, gratificación proporcional + bonif. 9%, indemnización según régimen (general/MYPE/microempresa). Genera CxP automática al confirmar (fix de ID type uuid aplicado). Colaborador queda marcado como cesado con bloqueo de trigger. |
| Préstamos al Personal | ✔ Implementado | En sección RRHH. Incluye schema completo, cuotas, saldo, descuento en nómina e historial de pagos. |
| Amonestaciones | ✔ Implementado | Integrado como tab en fichas RRHH y Mi portal. Registro/anulación, notificación y acuse del colaborador. |
| Roster Minero | ✔ Implementado | Snapshots de roster por período/ciclo, cálculo minero y cierre. **Gestión avanzada:** Tabla `roster_minero_ajustes` para revisiones, snapshots dirigidos y UM. **Reinicio Controlado:** Lógica de previsualización (`previsualizar_reinicio_roster_minero`) para calcular impactos antes de efectuar reinicios de roster o jornadas completas de trabajadores.

#### Logística
| Módulo | Estado |
|--------|--------|
| Almacenes / Inventario (+ Kardex) | ✅ Implementado |
| SOLPE Interna | ✅ Implementado |
| Transporte y Guías | ✅ Implementado |

#### Compras
| Módulo | Estado | Notas |
|--------|--------|--------|
| Proveedores (completo + homologación + evaluación) | ✔ Implementado | Ciclo de vida + ficha completa. Campos extendidos: código, razón comercial, tipo, categoría, ubicación, contacto principal, condiciones de pago y retención. |
| Cotizaciones de Compra | ✔ Implementado | Wizard 3 pasos. Cuadro comparativo. Selección proveedor ganador |
| Órdenes de Compra | ✔ Implementado | Para bienes. Timeline de seguimiento por estados, lead time, origen SOLPE, condición de pago y alertas. |
| Órdenes de Servicio Interna | ✔ Implementado | Para servicios tercerizados. Conformidad como cierre y condición de pago. |
| Recepciones | ✔ Implementado | Verificación ítem por ítem, matching 3 vías, precio histórico proveedor. Genera CxP + evaluación proveedor |
| Compras en Campo / Gastos | ✔ Implementado | Registro manual de egresos/comprobantes con extracción IA. Validación obligatoria de Centro de Costo (CECO). |
| Devoluciones a Proveedor | ✔ Implementado | Servicio conectado en `comprasService.js`: crear, enviar, aceptar, nota de crédito y anular devoluciones con líneas. |

#### Administración y Finanzas
| Módulo | Estado | Notas |
|--------|--------|-------|
| Ventas | ✔ Implementado | Pre-facturación con seguimiento. Estados: borrador/confirmada/facturada/anulada. Puente → Facturación con pre-relleno. No alimenta el ER. |
| Caja Chica y Anticipos | ✅ Implementado | |
| Activos Fijos | ✔ Implementado | Maestro de activos y promoción desde Compras/Gastos capitalizables; RLS y trazabilidad `compras_gasto_id`. |
| Préstamos al Personal | Retirado de esta sección | Módulo operativo en RRHH. Se conserva aquí solo como referencia histórica de la reorganización. |
| Financiamiento y Deuda | ✔ Implementado | `pages_fin_deuda.jsx`. Tabla de amortización automática. Intereses → ER. Reporte de deuda 12 meses. |
| Cuentas por Cobrar | ✅ Implementado | |
| Cuentas por Pagar | ✅ Implementado | |
| Facturación | ✅ Implementado | |
| Tesorería / Match Bancario | ✅ Implementado | |
| Estado de Resultados | ✅ Implementado | |
| Valorizaciones | ✔ Implementado | Persistencia nativa del detalle de valorizaciones (items, ot_ids, historial, modelo_calculo, notas, fecha_aprobacion, motivo_anulacion). |
| Presupuesto vs Real | ✔ Implementado | Control presupuestal mensual y anual por CECO/CEBE, cadena de 4 aprobadores secuenciales, cálculo real automático (MO desde OTs y gastos desde compras) y drill-down interactivo. |

#### Customer Success
| Módulo | Estado |
|--------|--------|
| Onboarding | ✅ Implementado |
| Planes de Éxito | ✅ Implementado |
| Health Score | ✅ Implementado |
| Renovaciones | ✅ Implementado |
| Fidelización y NPS | ✅ Implementado |
| BI Customer Success | ✅ Implementado |

#### Inteligencia Artificial
| Módulo | Estado |
|--------|--------|
| IA Comercial + Historial auditado | ✅ Implementado |
| IA Operativa + Historial auditado | ✅ Implementado |
| IA Financiera + Historial auditado | ✅ Implementado |

#### Configuración
| Módulo | Estado | Notas |
|--------|--------|-------|
| Usuarios | ✅ Implementado | |
| Organigrama | ✔ Implementado | Arquitectura avanzada basada en Posiciones, Unidades Organizacionales, Jerarquía Matricial (líder principal y reporting line), origen de asignación, y sincronización continua (cargo <-> posición). |
| Roles y Permisos | ✅ Implementado | |
| Maestros Base | ✔ Implementado | Catálogos de referencia alineados: áreas, cargos, especialidades, tipos de servicio, almacenes, sedes, industrias, CECO/CEBE, materiales jerárquicos, monedas/impuestos/unidades. |
| Catálogo de Servicios | ✔ Implementado | Formulario ampliado con campos comerciales/técnicos, moneda, costo, precio, margen, facturable, entregables y notas internas. |
| Tarifarios | ✅ Implementado | |
| Parámetros Generales | ✅ Implementado | Tabla `afp_parametros` multitenant completa (prima, flujo, mixta). |
| Salud de Implementación | ✅ Implementado | Dashboard interactivo de configuración y anotaciones compartidas TIDEO/Cliente. Control RLS estricto para "solo interno". |

#### Integraciones
| Módulo | Estado | Notas |
|--------|--------|-------|
| API Keys | ✔ Implementado | CRUD completo. Generación `tdk_` + SHA-256 hash. Permisos por módulo:acción. Visualización one-time de la key. Edge Function `api-prospectos` consume la key para insertar leads vía webhook. |

#### Plataforma SaaS (Superadmin TIDEO)
| Módulo | Estado |
|--------|--------|
| Empresas / Tenants | ✔ Implementado |
| Planes y Licencias | ✔ Implementado |
| Métricas SaaS | ✔ Implementado |

### 3.3 Prompts pendientes de ejecutar

| Prompt | Descripción | Estado |
|--------|-------------|--------|
| `prompt_fix_maestros_rrhh.md` | Corrección arquitectura Maestros Base (eliminar Personal, agregar Especialidades/Tipos de servicio/Almacenes) | ✔ Completado y Aplicado |
| `prompt_fix_clientes_arquitectura.md` | Clientes solo lectura en Maestros Base, formulario nueva cuenta expandido, tab condiciones financieras | ✔ Completado y Aplicado |
| `prompt_fix_lead_cuenta_flujo.md` | Formulario lead con RUC/Razón social, convertir lead, flujo completo CRM | ✔ Completado y Aplicado |

### 3.4 Estructura de archivos fuente

| Archivo | Responsabilidad | Tamaño aprox. |
|---------|----------------|---------------|
| `src/App.jsx` | Router principal, lazy imports, switch de rutas, rutas públicas de aceptación/conformidad/postulación | 23.1 KB |
| `src/AuthGate.jsx` | Login, recuperación/actualización de contraseña y control de sesión Supabase Auth | 23.7 KB |
| `src/main.jsx` | Entrada React/Vite | 0.6 KB |
| `src/data.js` | Datasets mock, permisos, catálogos base, tickets, campañas, reclutamiento, biometría, WhatsApp y demás MOCK export | 157.4 KB |
| `src/context.jsx` | Estado global, carga Supabase, acciones de mutación, CRM sync, RRHH, finanzas, materiales, documentos, portal, reclutamiento, biometría, WhatsApp, geofencing y parámetros generales | 422.5 KB |
| `src/shell.jsx` | Layout, sidebar colapsable, header, selector de empresa, dark mode, badges de sidebar y simulador de roles | 32.5 KB |
| `src/styles.css` | Sistema visual global, sidebar, tablas, tabs, paneles laterales, vistas responsive y estados | 92.5 KB |
| `src/pages_core.jsx` | Dashboard, Cuentas, Leads, Pipeline, OS Cliente, Campañas, BI Comercial, BI Operativo y Agenda Comercial | 443.9 KB |
| `src/pages_ops.jsx` | OT, Partes, Planner, Tickets, RRHH Operativo, Asistencia, Nómina, Tareo Administrativo, Control de Horas, Compras, guías, biométrico, SAR/geocercas y Cuentas 360° | 1231.6 KB |
| `src/pages_admin.jsx` | Usuarios, Roles, Maestros, Parámetros, RRHH Administrativo, Comisiones, Organigrama, WhatsApp y Plataforma SaaS | 618.0 KB |
| `src/pages_turnos.jsx` | Turnos y Horarios (CRUD completo, standalone) | 11.9 KB |
| `src/pages_api_keys.jsx` | API Keys — generación, permisos, revocación, one-time display | 15.3 KB |
| `src/pages_fin.jsx` | CxC, CxP, Ventas persistentes, Facturación, Tesorería, ER, Presupuesto vs Real, Caja Chica, Préstamos y Activos Fijos | 515.5 KB |
| `src/pages_bi_fin.jsx` | BI Financiero (incluye tab de Presupuestos y filtros CECO/CEBE) | 61.7 KB |
| `src/pages_extra.jsx` | Cotizaciones, PDFs, aprobación manual, Valorizaciones, Inventario y Hoja de Costeo | 253.2 KB |
| `src/pages_fin_deuda.jsx` | Financiamiento y Deuda (standalone) | 27.2 KB |
| `src/pages_mobile.jsx` | Vistas de campo móvil/PWA: técnico, logística, vendedor, supervisor, gerencia, administrativo, empleado, solicitudes y geofencing/offline queue | 222.4 KB |
| `src/pages_mi_portal.jsx` | Portal de autoservicio del colaborador: ficha, documentos, solicitudes, boletas, constancias, firmas y amonestaciones | 31.4 KB |
| `src/pages_reclutamiento.jsx` | Reclutamiento interno y ruta pública de postulación por token | 21.5 KB |
| `src/pages_evaluaciones.jsx` | Evaluación de Desempeño 360°: plantillas, autoevaluación, jefe, resultados, wizard y amonestaciones activas | 59.2 KB |
| `src/pages_liquidaciones.jsx` | Liquidación por Cese: wizard, cálculo, confirmación, anulación y detalle | 45.9 KB |
| `src/pages_aceptar.jsx` | Páginas públicas de aceptación de cotización y conformidad de OT por token | 24.2 KB |
| `src/pages_pdf.jsx` | Componentes PDF para Hoja de Costeo, Cotización, Guía de Remisión y Papeleta de Movimiento | 49.1 KB |
| `src/pages_ia.jsx` | IA Comercial, Operativa, Financiera + Historial auditado | 53.5 KB |
| `src/pages_cs.jsx` | Customer Success completo | 45.8 KB |
| `src/pages_rrhh.jsx` | Archivo residual sin lógica activa | 0.1 KB |
| `src/icons.jsx` | Iconografía SVG y helpers `money`/`moneyD` | 10 KB |
| `src/lib/dataMode.js` | VITE_DATA_MODE switch (supabase/mock) | 0.6 KB |
| `src/lib/currency.js` | Helpers de formateo de moneda | 2.2 KB |
| `src/lib/dates.js` | Helpers de fechas, rangos, meses y vencimientos | 1.9 KB |
| `src/lib/formValidators.js` | Sanitización y validación de teléfono/RUC | 0.7 KB |
| `src/lib/hierarchy.js` | ROLE_CATEGORIES, HIERARCHY_LEVELS, asignables, managers y visibilidad jerárquica | 5.7 KB |
| `src/lib/permissions.js` | Helpers de visibilidad por permisos de rol | 0.9 KB |
| `src/lib/supabaseClient.js` | Cliente Supabase lazy y detección de configuración | 0.8 KB |
| `src/lib/tenant.js` | Helpers de empresa activa y scoping por tenant | 0.7 KB |
| `src/lib/textoComercial.js` | Variables comerciales y renderizado de textos parametrizados | 4.7 KB |
| `src/services/crmService.js` | loadCrmFromSupabase, normalización, inserts/updates CRM, OS, cotizaciones, hojas de costeo, agenda, notificaciones y acuerdos | 29.8 KB |
| `src/services/rrhhService.js` | Personal, turnos, asistencia, ciclos mineros, nómina, préstamos, documentos, datos bancarios y pagos | 54.7 KB |
| `src/services/comprasService.js` | Proveedores, procesos, OC, OS, recepciones, inventario, spend analysis, devoluciones, stock y kardex | 24.7 KB |
| `src/services/financiamientosService.js` | Financiamientos, amortización, pagos | 10 KB |
| `src/services/maestrosService.js` | Catálogos, industrias, monedas/impuestos/unidades, CECO/CEBE y servicios | 17.4 KB |
| `src/services/materialService.js` | CRUD e importación masiva de grupos, familias, subfamilias y materiales | 17.1 KB |
| `src/services/plannerService.js` | Planner, cuadrillas, asignaciones, conflictos y rangos | 7.7 KB |
| `src/services/finanzasService.js` | CxC, CxP, facturas, ventas, caja chica, cobros, comisiones, RHE, pagos y bancos | 37.8 KB |
| `src/services/operacionesService.js` | OTs, partes, tareas OT, avances, cierres técnicos, costo OT, conformidad e inventario consumido | 30.4 KB |
| `src/services/ticketsService.js` | CRUD Soporte y Tickets, SLA, QC, hilo de resolución, reapertura y evidencias | 6.5 KB |
| `src/services/solicitudesRrhhService.js` | CRUD solicitudes RRHH, aprobaciones, saldo vacaciones, historial, papeletas y config ausencias | 15.5 KB |
| `src/services/storageService.js` | Acceso centralizado a Supabase Storage y tabla `adjuntos` | 8.5 KB |
| `src/services/personalDocumentosService.js` | Documentos de personal: upload, versionado, validación, vencimiento y signed URLs | 7.1 KB |
| `src/services/tareosAdminService.js` | Tareo administrativo: carga, OTs del día, CECOs, creación, edición y envío | 5.6 KB |
| `src/services/tipoCambioService.js` | Tipo de cambio diario, caché en Supabase y conversión PEN/USD/EUR | 3.1 KB |
| `src/services/nominaService.js` | Períodos, detalle de nómina, AFP y configuración de nómina | 7.9 KB |
| `src/services/evaluacionesDesempenoService.js` | Evaluaciones 360°: plantillas, respuestas, scores y persistencia | 9.8 KB |
| `src/services/liquidacionesCeseService.js` | Motor de liquidación por cese, CRUD, confirmación, bloqueo/reactivación y anulación | 20.7 KB |
| `src/services/estadoResultadosService.js` | Cálculo ER multi-moneda, devengos, agrupación por categoría y filtros | 25.7 KB |
| `src/services/rolesService.js` | Roles, permisos por pantalla | 4.5 KB |
| `src/services/campanasService.js` | CRUD campañas, métricas de atribución | 2.2 KB |
| `src/services/usuariosService.js` | Usuarios, membresías, perfiles | 2.4 KB |
| `src/services/apiKeysService.js` | Generación tdk_ key, hash SHA-256, CRUD api_keys | 2 KB |
| `src/services/activosService.js` | Activos fijos: CRUD, bajas e importación masiva | 6.6 KB |
| `src/services/amonestacionesService.js` | Amonestaciones: carga, registro, anulación, activas y notificación | 10.1 KB |
| `src/services/autoservicioEmpleadoService.js` | Mi portal: resolución de ficha del empleado, datos propios, acuses y vista local | 11.8 KB |
| `src/services/biometricoService.js` | Perfiles de importación biométrica, parsing, previsualización, creación/anulación de lotes | 9.4 KB |
| `src/services/geofencingService.js` | Geocercas, consentimientos, validación local, cola offline y sincronización de marcas móviles | 7.9 KB |
| `src/services/guiasService.js` | Guías de remisión, transportistas, vehículos, conductores y validación SUNAT | 19.5 KB |
| `src/services/inventarioService.js` | Movimientos WMS, reservas, conteos físicos, analítica, kardex, reorden y consumo OT | 38.8 KB |
| `src/services/portalFase2Service.js` | Portal empleado fase 2: datos, constancias, boletas, OTP y firmas | 5.4 KB |
| `src/services/reclutamientoService.js` | Vacantes, candidatos, candidaturas, historial e invitación/postulación pública | 8.7 KB |
| `src/services/rosterMineroService.js` | Cálculo, snapshots y cierre de roster minero por período | 13.8 KB |
| `src/services/tiposDocumentoService.js` | Tipos de documento y requisitos por cargo | 3.7 KB |
| `src/services/ventasService.js` | Catálogo de venta, órdenes de venta, reservas y despacho | 11.4 KB |
| `src/services/whatsappService.js` | Plantillas, matriz de destinatarios, cola/log y estado de proveedor WhatsApp | 5.4 KB |
| `src/services/tesoreriaService.js` | Movimientos de tesorería, match bancario y saldos de cuentas bancarias | 7.1 KB |
| `src/services/plataformaService.js` | Empresas/tenants, métricas SaaS | 1.7 KB |
| `src/services/auditoriaService.js` | Inserción de eventos en `auditoria` | 0.3 KB |
| `src/services/createMockRepository.js` | Repositorio genérico para modo mock/local | 1.6 KB |
| `src/services/createSupabaseRepository.js` | Repositorio genérico para tablas Supabase por tenant | 1.4 KB |
| `src/components/FileUpload.jsx` | Componente reutilizable de carga, listado y eliminación de adjuntos | 9.8 KB |
| `src/components/BarcodeScanner.jsx` | Escáner de códigos de barras para flujos móviles/logísticos | 6.9 KB |
| `src/components/NuevoEgreso.jsx` | Wizard de egreso/compras-gastos con OCR, CECO, Storage y capitalización de activos | 67.6 KB |
| `src/components/SmartTextField.jsx` | Campo de texto con inserción de variables comerciales | 6.1 KB |

### 3.5 Convenciones técnicas críticas

**CSS — clases correctas:**
```jsx
// CORRECTO
<div className="tabs"><div className={'tab '+(activo?'active':'')}>Label</div></div>
<div className="card-head"><h3>Título</h3></div>

// INCORRECTO — estas clases NO existen en styles.css
<div className="tab-bar"><button className="tab-btn">...</button></div>
<div className="card-header"><span className="card-title">...</span></div>
```

**JSX:** Variables derivadas (`reduce`, `filter`, `map`) se declaran antes del `return`, nunca como IIFEs dentro del JSX.

**Mock data:** `export const MOCK = { ...datasets }` en `data.js`. Consumo vía context (`useApp()`) o importación directa.

**Moneda:** `money(n)` y `moneyD(n)` desde `icons.jsx`. Local en `pages_bi_fin.jsx`: `const S = n => 'S/ ' + n.toLocaleString('es-PE')`.

**Servicios especializados:** los módulos grandes delegan persistencia y reglas de negocio en servicios pequeños dentro de `src/services/`. `context.jsx` coordina estado global y acciones, pero las consultas Supabase específicas viven en servicios como `finanzasService.js`, `materialService.js`, `personalDocumentosService.js`, `tipoCambioService.js`, `nominaService.js`, `evaluacionesDesempenoService.js` y `liquidacionesCeseService.js`.

**Parámetros editables:** series documentarias, plantillas SLA y diccionario comercial se tratan como catálogos configurables por tenant. Se cargan desde `series_documentarias`, `sla_plantillas` y `diccionario_comercial`, con defaults locales cuando Supabase no está configurado.

**Documentos y Storage:** los adjuntos transversales usan `storageService.js` y `FileUpload.jsx`. Excepciones justificadas: evidencias de tickets usan `ticketsService.subirImagenEvidencia` porque se guardan directamente en `ticket_comentarios.imagen_url`; documentos de personal usan `personalDocumentosService.js` y RPCs propias para versionado.

**Costo hora de colaboradores:** el costo de MO para OT, partes, tareos y Control de Horas debe usar `tarifa_hora` cuando exista. Los campos legacy `costo_hora_real`, `costo` y `costo_hora` quedan como fallback de compatibilidad.

### 3.6 Deuda técnica conocida

| Ítem | Prioridad |
|------|-----------|
| `BarsChart` / `DonutChart` sin uso en `pages_core.jsx` (líneas 219-278) | Baja |
| OTs inline en BIOperativo — deben migrar a `MOCK.ots` | Media |
| Costo hora legacy (`costo`, `costo_hora_real`, `costo_hora`) todavía aparece como fallback; el campo vigente es `tarifa_hora` calculado desde `monto_mensual / horas_base_mes` | Media |
| Compras en Campo: el comprobante físico ya tiene infraestructura de Storage disponible, pero debe verificarse módulo por módulo que el flujo mobile/backoffice guarde URL y trazabilidad completas | Alta |
| Numeración de migraciones locales tiene duplicados (`093`, `105`, `119`, `133`, `144`, `146`, `158`, `168`, `194`, `206`, `219`, `234`); preservar historial y verificar aplicación real en Supabase antes de asumir cobertura productiva | Media |

### 3.7 GAPS de Auditoría (Resultados de Revisión Continua)

#### [A] TÉCNICO — Implementado en código pero NO documentado
- **Migraciones 364 a 383**: Se implementó el módulo completo "Salud Implementación" y el "Reinicio de Roster Minero", no reflejados previamente.
- **Nuevas Tablas**: `tideo_salud_configuracion`, `tideo_salud_anotaciones`, `tideo_salud_comentarios`.
- **Servicios/RPCs**: `get_salud_implementacion_conteos`, funciones de previsualización de reinicio de roster y jornadas.
- **UI**: `pages_salud_tenant.jsx` para la vista de progreso del cliente, integrada en `shell.jsx`.

#### [B] TÉCNICO — Documentado pero NO implementado o desactualizado
- **Sección 3.1**: El documento indicaba la migración 363 como la más reciente; el código real ya va por la 383.
- **Inventario (3.2)**: "Salud de Implementación" ahora es un módulo oficial en Configuración.

#### [C] LÓGICA DE NEGOCIO — Regla/validación en código que el documento no refleja
- **Salud de Implementación**: Existen anotaciones "solo interno" para TIDEO, protegidas por RLS. El acceso requiere ser Superadmin o ser explícitamente "Admin Empresa" del tenant respectivo.
- **Reinicio Roster Minero**: Se exige una evaluación de impactos (previsualización de registros a eliminar) antes de reiniciar un roster o la jornada de los trabajadores para evitar pérdida de datos consolidados.

#### [D] LÓGICA DE NEGOCIO — Regla documentada que el código contradice o ignora
- La plataforma solo asume métricas genéricas SaaS en Plataforma, pero el código delega el control cualitativo a la nueva sección de "Salud de Implementación" parametrizada por tabla base de cada módulo.

#### [E] FLUJOS — Flujo real difiere del flujo documentado
- **Onboarding/Implementación**: TIDEO (superadmin) y el Cliente interactúan a través de hilos de comentarios sobre el estado de carga de las tablas maestras y transaccionales, creando un nuevo flujo asíncrono de implementación.
- **Ciclo RRHH (Roster)**: El flujo operativo incluye ahora la etapa explícita de "Reinicio / Recálculo con previsualización" de la jornada en caso de errores de configuración inicial del Roster.

#### [F] FLUJOS — Flujo documentado que el código nunca implementó
- N/A.

## 4. Arquitectura Multitenant

### 4.1 Modelo de tenancy

Multitenant con aislamiento por `empresa_id` (row-level isolation). Toda consulta lleva filtro implícito `WHERE empresa_id = :empresa_activa`. RLS (Row Level Security en Supabase) aplica en la capa de base de datos.

```
TIDEO (Superadmin)
  ├── Empresa A → datos, usuarios, roles, config propios
  ├── Empresa B → datos, usuarios, roles, config propios
  └── Empresa C → datos, usuarios, roles, config propios
```

### 4.2 Niveles de acceso

| Nivel | Quién | Alcance |
|-------|-------|---------|
| Superadmin TIDEO | Equipo TIDEO | Todas las empresas, config global, métricas, soporte |
| Admin Empresa | Dueño / Gerente | Todo su entorno: usuarios, roles, módulos, datos |
| Usuario Empresa | Colaboradores | Solo lo que su rol permita |
| Usuario Campo | Técnicos, vendedores, compradores en campo | Vistas móviles según perfil |

### 4.3 Reglas de tenancy

- Archivos en rutas aisladas: `/{empresa_id}/modulo/archivo`.
- Suspensión conserva datos, bloquea acceso. Cancelación retiene datos 90 días.
- Superadmin TIDEO: cada acceso a un tenant queda en log de auditoría. 2FA obligatorio.
- Selector de empresa en login si el usuario pertenece a más de una.

### 4.4 Arquitectura Multisociedad

La plataforma implementa un nivel adicional de aislamiento denominado **Multisociedad**, diseñado para grupos empresariales que operan bajo un mismo tenant (`empresa_id`) pero con múltiples razones sociales distintas.

- **Invariante de sociedad obligatoria:** Todas las tablas transaccionales tienen la columna `sociedad_id` (uuid). La restricción de obligatoriedad (no ser `NULL`) solo aplica cuando el tenant tiene habilitada la arquitectura multisociedad, existiendo además excepciones legítimas para registros históricos creados antes de su instalación.
- **Frontera RLS:** El aislamiento se garantiza a nivel de base de datos usando Row Level Security y la función `usuario_alcance_sociedades()`. Si el usuario tiene acceso global (NULL), ve todo el tenant; si tiene asignaciones específicas, solo ve los registros de sus sociedades.
- **Cobertura RLS (Lectura y Escritura):** Cubre toda la cadena comercial (Cuentas, Leads, Cotizaciones, OS, OT, Valorizaciones, Facturas), inventarios, finanzas, nómina y RRHH (amonestaciones, constancias, solicitudes). *Excepciones conocidas:* (1) tablas de registro histórico puro (ej. logs) o catalogadas que son transversales al tenant, y (2) dos tablas del esquema que tienen RLS habilitado sin ninguna política definida (hallazgo pendiente de evaluación).
- **Identidad emisora y Propagación:** Las entidades heredan irrompiblemente la sociedad. Ejemplo: `Hoja Costeo -> OS -> OT -> Valorización -> Factura`. Es imposible modificar la sociedad una vez instanciada la cadena.
- **Validación estricta de cruce:** El sistema previene el cruce de datos (ej. un empleado de Sociedad A no puede registrar horas en un Centro de Costo de Sociedad B, y un CECO no puede agruparse bajo un CEBE de distinta sociedad).

---

## 5. Arquitectura de entidades — reglas de diseño

### 5.1 Regla general

**Los módulos transaccionales son la fuente de verdad. Maestros Base es de referencia.**

| Tipo de dato | Fuente de verdad | Maestros Base |
|-------------|-----------------|---------------|
| Clientes / Cuentas | Cuentas y Contactos (CRM) | Solo lectura + link |
| Proveedores | Compras → Proveedores | Solo lectura + link |
| Personal operativo | RRHH → Personal Operativo | No aplica |
| Personal administrativo | RRHH → Personal Administrativo | No aplica |
| Cargos | Maestros Base ✔ | Catálogo de referencia |
| Especialidades técnicas | Maestros Base ✔ | Catálogo de referencia |
| Materiales e insumos | Maestros Base ✔ | Catálogo de referencia |
| Almacenes y depósitos | Maestros Base ✔ | Catálogo de referencia |
| Tipos de servicio interno | Maestros Base ✔ | Catálogo de referencia |
| Monedas, impuestos, unidades | Maestros Base ✔ | Catálogo de referencia |

### 5.2 Flujo del cliente — regla de origen

**El flujo normal de prospección siempre empieza en Lead, nunca en Cuenta:**

```
Primer contacto con prospecto
          ↓
       LEAD
  (nombre, empresa, RUC si se sabe,
   teléfono, necesidad, fuente)
          ↓
     Calificar
          ↓
     CONVERTIR ──────────────────────────────┐
          ↓                ↓                 ↓
      CUENTA           CONTACTO         OPORTUNIDAD
   (Prospecto)       (vinculado)       (para trabajar)
          ↓
   Finanzas completa condiciones
   en tab "Condiciones comerciales"
   (condición de pago, límite crédito,
    riesgo financiero, datos fiscales)
```

**Crear Cuenta directamente** solo cuando el cliente ya te contactó para comprar (salta la etapa de prospección).

### 5.3 Formulario de Lead — campos requeridos

| Campo | Obligatorio | Notas |
|-------|-------------|-------|
| Nombre del contacto | ✔ | |
| Nombre de empresa | ✔ | Nombre comercial |
| Razón social | — | Si se conoce |
| RUC / NIT | — | Si se tiene. Validar 11 dígitos si se ingresa |
| Industria | — | |
| Teléfono | — | |
| Email | — | |
| Fuente | ✔ | Canal de marketing (Referido, LinkedIn, Formulario web, Evento/Feria, etc.) |
| Campaña de origen | — | `campana_id` FK a campanas. Selector muestra solo campañas Activas. Nulo = orgánico/referido. |
| Responsable comercial | ✔ | |
| Necesidad declarada | ✔ | |
| Presupuesto estimado | — | |
| Registrado desde | — | backoffice / campo / api |

### 5.4 Formulario de cuenta — dos momentos

**Momento 1 — Alta comercial** (lo que sabe el vendedor al crear):
Nombre comercial*, Razón social, RUC, País*, Tipo*, Industria*, Tamaño, Fuente, Responsable comercial*, Dirección, Teléfono, Email, Notas.

**Momento 2 — Condiciones financieras** (tab en la ficha, solo con permiso `ver_finanzas`):
Condición de pago, límite de crédito, moneda, requiere OC, riesgo financiero, clasificación interna, cuenta bancaria del cliente, datos fiscales completos.

### 5.5 Flujo del proveedor

El proveedor no tiene etapa de prospección. Nace directamente en **Compras → Proveedores** con ciclo de vida propio:

```
Potencial → En evaluación → Homologado → (Observado / Bloqueado) → Inactivo
```

Solo proveedores **Homologados** pueden recibir OC. Los **Observados** aparecen con advertencia. Los **Bloqueados** no aparecen en selectores.

### 5.6 Separación de préstamos

| Tipo | Naturaleza | Módulo | Sección sidebar | Impacto ER |
|------|-----------|--------|----------------|-----------|
| Préstamos al personal | Activo (nos deben) | RRHH → Préstamos al Personal | RRHH | No (recuperación de activo) |
| Financiamiento recibido | Pasivo (debemos) | Admin → Financiamiento y Deuda | ADMINISTRACIÓN | Sí (intereses = gasto financiero) |

**Regla contable:** al pagar una cuota de financiamiento, el **capital** reduce el pasivo (no es gasto), el **interés** se registra como gasto financiero en el ER, y el egreso total aparece en Tesorería.

### 5.7 Separación nómina vs costos de OT

Dos mediciones independientes del mismo trabajador:

| Medición | Pregunta que responde | Fuente | Período |
|---------|----------------------|--------|---------|
| Nómina | ¿Cuánto le pago este mes? | Control de asistencia | Mensual |
| Costo OT | ¿Cuánto costó esa OT? | Partes diarios, tareos y tarifa hora | Por OT |

El costo operativo vigente se imputa con `tarifa_hora` del colaborador. Esa tarifa se calcula desde `monto_mensual / horas_base_mes` y se usa en OTs, partes, tareos administrativos y Control de Horas. Nómina sigue midiendo cuánto se paga al trabajador; no reemplaza automáticamente el costo operativo por OT.

---


### 5.8 Organigrama basado en Posiciones

El organigrama ya no es una simple representación de usuarios y roles, sino una **arquitectura de Posiciones**:
- **Posición**: Es la silla, no la persona. Una posición pertenece a una Unidad Organizacional (ahora con `categoria`), requiere un Cargo (que cuenta con `modo_gestion` 'individual' o 'compartido'), y tiene un líder principal (jerarquía lineal).
- **Relaciones Matriciales**: Una posición puede reportar indirectamente a otras posiciones.
- **Sincronización Continua**: Al asignar un usuario a una posición, su "cargo" en RRHH se mantiene sincronizado automáticamente.
- **Niveles Jerárquicos**: Se integra una estructura profunda (`niveles_jerarquicos`) para determinar autorizaciones.

### 5.9 Vigencia Efectiva y Retro Wall

Dos conceptos críticos protegen la inmutabilidad de la información operativa:
- **Vigencia Efectiva**: Un trabajador solo "existe" operativamente durante los periodos en que su contrato está activo. El Control de Asistencia incluye bloqueos estrictos: no permite registrar ingresos si la vigencia no lo ampara.
- **Retro Wall**: Funciona como un candado histórico extendido. Los registros de nómina, partes diarios, documentos críticos, **condiciones laborales**, y **asignaciones de jornada** quedan inmutables en periodos cerrados, protegiendo las declaraciones legales de modificaciones accidentales (introducido en migraciones 347 y 348).

## 6. Estructura del sidebar — arquitectura final

```
BUSINESS INTELLIGENCE
  Dashboard General
  BI Comercial
  BI Operativo
  BI Financiero

PLATAFORMA
  Empresas / Tenants
  Planes y Licencias
  Métricas SaaS

INTEGRACIONES
  API Keys

CRM & MARKETING
  Cuentas y Contactos
  Leads y Scoring
  Marketing Automation — Campañas
  Pipeline
  Actividades

COMERCIAL
  Agenda Comercial
  Hoja de Costeo
  Cotizaciones
  OS Cliente

OPERACIONES
  Planner y Recursos
  Backlog
  Órdenes de Trabajo
  Partes Diarios
  Cierre y Calidad
  Soporte y Tickets

RRHH
  Mi portal
  Reclutamiento
  Personal Operativo
  Personal Administrativo
  Control de Asistencia
  Turnos y Horarios
  Nómina
  Comisiones
  Solicitudes de RRHH
  Préstamos al Personal
  Tareo Administrativo
  Control de Horas
  Evaluación de Desempeño
  Liquidación por Cese

LOGÍSTICA
  Almacenes
  SOLPE Interna
  Transporte y Guías

COMPRAS
  Proveedores
  Cotizaciones (compra)
  Órdenes de Compra
  Órdenes de Servicio
  Recepciones
  Compras / Gastos

ADMINISTRACIÓN
  Ventas
  Caja Chica y Anticipos
  Activos Fijos
  Financiamiento y Deuda
  Cuentas por Cobrar
  Cuentas por Pagar
  Facturación
  Tesorería / Match
  Estado de Resultados
  Valorizaciones
  Presupuesto vs Real

CUSTOMER SUCCESS
  Onboarding
  Planes de Éxito
  Health Score
  Renovaciones
  Fidelización y NPS
  BI Customer Success

INTELIGENCIA ARTIFICIAL
  IA Comercial
  IA Operativa
  IA Financiera

CAMPO MÓVIL
  Vistas de Campo

CONFIGURACIÓN
  Usuarios
  Organigrama
  Roles y Permisos
  Maestros Base
  Parámetros Generales
  Catálogo de Servicios
  Tarifarios
  Salud Implementacion

PLATAFORMA (solo Superadmin TIDEO)
  Empresas / Tenants
  Planes y Licencias
  Métricas SaaS
```

---

## 7. Visión general y flujos

### 7.1 Flujo comercial completo

```
Lead → [Convertir] → Cuenta (Prospecto) + Contacto + Oportunidad
         ↓
    Hoja de Costeo [OPCIONAL — recomendado]
    (estimación interna: MO + materiales + servicios terceros + logística)
    (calcula precio sugerido al cliente aplicando margen objetivo)
    (flujo: borrador → en revisión → aprobada → genera cotización pre-rellenada)
         ↓
    Cotización (pre-rellenada desde HC o creada manualmente)
    (versionada, con aprobación de descuentos)
         ↓
    OS Cliente (control de saldos: ejecutado / valorizado / facturado)
         ↓
    OT → Parte Diario → Cierre Técnico → Remisión/Conformidad
    (OT muestra costo estimado de HC vs costo real de ejecución)
         ↓
    Valorización → Factura → CxC → Cobranza → Match Bancario
         ↓
    Customer Success → Renovación / Upsell
```

### 7.2 Flujo de compras completo

```
SOLPE Interna (desde OT o área interna)
         ↓
    Compras recibe SOLPE aprobada
         ↓
    Selecciona proveedores homologados
         ↓
    Solicita cotización → Registra respuestas
         ↓
    Cuadro comparativo → Selecciona ganador
         ↓
    OC (bienes) o OS Interna (servicios)
         ↓
    Proveedor entrega / ejecuta
         ↓
    Recepción (bienes) o Conformidad (servicios)
         ↓
    Ingreso a inventario (bienes) + CxP generada + Evaluación proveedor
```

### 7.3 Flujo de RRHH y nómina

```
Configurar turnos y horarios
         ↓
    Asignar turno a cada trabajador
         ↓
    Registrar asistencia diaria (validación de Vigencia Efectiva bloquea ingresos si el contrato no ampara la fecha)
    [AUTO] Solicitudes de RRHH aprobadas (vacaciones, licencias con goce) impactan directamente la asistencia y cubren los huecos
    [RPC] Las marcaciones individuales móviles o de kiosko se procesan centralizadamente vía RPC para consolidar el día y resolver turnos.
         ↓
    Al cierre del período:
    Calcular nómina:
      Remuneración bruta = sueldo base - faltas - tardanzas + horas extra
      Descuentos trabajador = AFP/ONP + préstamo + anticipo
      Retención IR 5ta (si aplica)
      Neto a pagar al trabajador
    Cargas empresa = ESSALUD + CTS + gratificación + vacaciones (mensualizadas)
    Costo hora real = (bruto + cargas) ÷ horas laborables
         ↓
    Cerrar período:
      → Egreso planilla en Administración → Gastos
      → Egreso cargas sociales en Administración → Gastos
      → Actualizar costo hora en ficha del técnico
      → Boletas de pago disponibles
```

### 7.4 Flujo de financiamiento

```
Registrar préstamo recibido (banco / tercero / leasing)
  → Monto, tasa, plazo, día de pago, tipo de cuota
  → Tabla de amortización generada automáticamente
         ↓
    Cada cuota:
      Capital → reduce saldo del préstamo (no es gasto)
      Interés → gasto financiero en Estado de Resultados
      Total → egreso en Tesorería vinculado al préstamo
         ↓
    Reporte de deuda: saldo total, cuotas del mes,
    proyección 12 meses, distribución por tipo de acreedor
```

### 7.5 Flujo de campo (PWA)

**Técnico:** OTs del día con dirección → Iniciar OT (GPS automático) → Parte diario en 4 pasos → Fotos → Avance → Reportar restricción.
**Asistencia:** Marcación GPS (entrada/salida/refrigerio) delegada al 100% al RPC `registrar_marcacion_asistencia`. Si no hay internet, la marcación se encola en `syncGeoQueue` y se envía automáticamente al restablecerse la conexión, respetando reglas de precedencia.

**Comprador:** Foto de factura → IA extrae datos → Confirmar → Vincular a OT → Queda "pendiente revisión backoffice".

**Vendedor:** Agenda y próximos eventos → Ficha cliente → Click-to-call → Actividad post-reunión → Crear lead desde tarjeta.

**Supervisor:** Aprobar partes con un tap → Estado de OTs en tiempo real.

**Gerencia:** KPIs del día → Aprobar cotizaciones y descuentos → Ficha de cliente.


### 7.6 Flujo de Implementación de Tenants

```
Creación de Tenant (Superadmin TIDEO)
         ↓
    Configuración Base (Salud Implementación)
    (TIDEO mapea pantallas críticas y tablas maestras asociadas)
         ↓
    Cliente / TIDEO llenan datos en tablas (Usuarios, Cargos, CC, etc.)
         ↓
    Conteo Automático (RPC get_salud_implementacion_conteos)
    (El sistema detecta cuántos registros tiene cada tabla)
         ↓
    Anotaciones e Hilos de Comentarios
    (TIDEO y el Cliente dialogan sobre el estado de cada bloque)
    (TIDEO puede dejar notas "solo_interno" protegidas por RLS)
         ↓
    Paso a Producción (Tenant 100% configurado)
```

---

## 8. Detalle funcional de módulos

---

### 8.1 Plataforma — Gestión de Empresas / Tenants

Registro operativo de empresa: razón social, nombre comercial, RUC/NIT, país, moneda base, zona horaria y estado. La creación de tenant la realiza **Superadmin TIDEO** desde Plataforma. Se enlaza con el módulo de **Salud de Implementación**, que permite a TIDEO y al admin de la empresa auditar visualmente el progreso de configuración de maestros y transacciones (cuántos registros se han cargado vs esperados), con hilos de comentarios bidireccionales y anotaciones privadas.

---

### 8.2 Plataforma — Planes y Licencias

Definición de planes con módulos incluidos y límites. Módulo no incluido → no aparece en sidebar. Alertas de uso. Upgrade/downgrade con registro.

---

### 8.3 Plataforma — Métricas SaaS

Tenants activos, MRR, ARR, uso por tenant, tenants en riesgo, distribución por plan, tasa de retención y churn de la plataforma.

---

### 8.4 Constructor de Roles

Crear roles con nombre libre. Clonar. Matriz de permisos por pantalla: Ver | Crear | Editar | Anular | Aprobar | Exportar | Ver costos | Ver precios | Ver finanzas. Permisos especiales: `aprobar_descuentos`, `aprobar_compras_hasta`, `ver_salario_personal`, `anular_documentos`, `acceso_campo`, `perfil_campo`. Vista previa de cómo ve la app ese rol. Sin permiso "Ver" → pantalla no aparece en sidebar.

---

### 8.5 Maestros Base

**Catálogos de referencia correctos (con formulario de alta):**
- Clientes y contactos → **solo lectura**, fuente de verdad en Cuentas y Contactos
- Proveedores → **solo lectura**, fuente de verdad en Compras → Proveedores
- Sedes y ubicaciones GPS
- Cargos de la empresa
- Especialidades técnicas (con área y si requiere certificación)
- Materiales e insumos organizados jerárquicamente por Grupos, Familias y Subfamilias con código auto-generado
- Almacenes y depósitos (con tipo: Central / Sede / Móvil / Tránsito)
- Tipos de servicio interno (con clasificación y si es facturable)
- Monedas, impuestos y unidades

**Campos especiales en maestros:**

| Tabla | Campo | Propósito |
|-------|-------|-----------|
| Personal | `numero_celular` | Click-to-call desde campo |
| Personal | `perfil_campo` | técnico / compras / vendedor / supervisor / gerencia |
| Personal | `acceso_app_campo` | Habilita PWA |
| Materiales | `codigo_barras` | Escaneo en campo |
| Materiales | `grupo_id` | FK a `material_grupos` (Grupo del material) |
| Materiales | `familia_id` | FK a `material_familias` (Familia del material) |
| Materiales | `subfamilia_id` | FK a `material_subfamilias` (Subfamilia del material) |
| Materiales | `nro_parte` | Código o número de parte dado por el fabricante |
| Materiales | `unidades_contenidas` | Factor de conversión o unidades contenidas por empaque |
| Materiales | `almacen_id` | Almacén asignado predeterminado |
| Materiales | `ubicacion` | Ubicación física detallada en almacén (estante, pasillo) |
| Materiales | `precio_unitario` | Precio unitario base de compra/inventario |
| OT | `ubicacion_gps` | GPS al iniciar parte |
| OT | `direccion_ejecucion` | Dirección del trabajo |
| Compras/Gastos | `origen_registro` | campo / backoffice |
| Compras/Gastos | `datos_extraidos_ia` | JSON extracción IA |
| Leads | `registrado_desde` | campo / web / formulario |
| Cuentas | `agente_retencion_sunat` | Marca cliente agente de retención SUNAT |
| Cuentas | `tasa_retencion_sunat` | Tasa de retención aplicable, por defecto 3% |

---

### 8.6 CRM — Cuentas y Contactos

Fuente de verdad del cliente. Clasificación, industria, segmento, responsable comercial y CS. Contactos con rol. Relación muchos-a-muchos. Vista 360° con tabs: Resumen, Oportunidades, Cotizaciones, OS Cliente, OTs, Facturas, Cobranza, Actividades, Contactos, **Customer Success 360°** (health score + dimensiones + onboarding + renovación + NPS), **Condiciones comerciales** (solo con `ver_finanzas`: condición de pago, límite crédito, riesgo, datos fiscales). Indicador "Condiciones pendientes" si faltan datos financieros.

**Mejoras de Cuentas y Contactos:**
- **Alta comercial en dos momentos:** Momento 1 (Alta comercial rápida) y Momento 2 (Condiciones financieras y fiscales) están completamente desarrollados.
- **Ficha 360° del Cliente:** Integración del panel CS 360° y panel financiero restringido por RLS y permisos.
- **Retención SUNAT:** Las condiciones comerciales permiten marcar al cliente como agente de retención SUNAT y definir tasa de retención. Esta configuración viaja al flujo de Facturación/CxC.
- **En proceso:** Optimización en la usabilidad del filtrado rápido y asignación de gestor comercial/CS.

---

### 8.7 CRM — Leads

Kanban por estado: Nuevo → En contacto → Calificado → Convertido → Descartado. Card con badge de fuente, urgencia, días sin actividad y badge "Campo" si `registrado_desde = campo`. Botón "Convertir" → modal que muestra datos que viajan y crea Cuenta + Contacto + Oportunidad en una operación. Nota: *"¿En prospección? Crea un Lead — la cuenta se genera al convertirlo."*

---

### 8.8 CRM — Pipeline y Oportunidades

Kanban: Prospección → Calificación → Propuesta → Negociación → Ganada → Perdida. Panel lateral con timeline de actividades. Motivo de pérdida obligatorio. Forecast ponderado. Conversión a cotización y OS Cliente.

**Reglas de Automatización de Etapas:**
- **Cotización enviada:** Mueve automáticamente la oportunidad a la etapa de **Propuesta**.
- **Creación de nueva versión (v2 o superior):** Mueve automáticamente la oportunidad a la etapa de **Negociación**.
- **Aprobación de cotización (digital o manual):** Mueve automáticamente la oportunidad a la etapa de **Ganada** con probabilidad 100%.

---

### 8.8b Hoja de Costeo

Documento interno entre la Oportunidad y la Cotización. No es un paso obligatorio, pero es el mecanismo formal para calcular si un trabajo es rentable antes de comprometerse con el cliente.

**Quién la crea:** el vendedor experimentado, el área técnica, o ambos en colaboración. El campo "Responsable del costeo" registra quién estimó sin bloquear el flujo.

**Estructura de costos:**

| Sección | Qué incluye |
|---------|-------------|
| Mano de obra | Técnicos, supervisores, días de trabajo, costo día/persona |
| Materiales | Insumos, repuestos, equipos consumibles |
| Servicios de terceros | Subcontratos, grúas, laboratorios, especialistas externos |
| Logística y viáticos | Transporte, alojamiento, viáticos, fletes |

**Cálculo automático:**
- `costo_total` = suma de las 4 secciones
- `precio_sugerido_sin_igv` = `costo_total / (1 - margen_objetivo_pct / 100)`
- `precio_sugerido_total` = `precio_sugerido_sin_igv × 1.18`
- El resumen muestra el margen real calculado contra el margen objetivo

**Estados:** Borrador → En revisión → Aprobada

**Al aprobar:** genera automáticamente una Cotización en estado Borrador con los ítems pre-rellenados (precios calculados con el margen objetivo aplicado por ítem). El vendedor puede ajustar antes de enviar al cliente.

**Trazabilidad:** la Cotización generada guarda `hoja_costeo_id`. En la OT asociada, el campo `costoEst` toma el `costo_total` de la HC para el comparativo estimado vs real al cierre.

**Permisos requeridos:** `ver_costos` para ver montos. Aprobación puede requerir `aprobar` según configuración del rol.

---

### 8.9 Cotizaciones

Desde oportunidad. Catálogo + tarifarios con auto-relleno. Cálculo en tiempo real. Versionado con historial. Aprobación de descuentos con alerta si supera límite del rol. PDF. Conversión a OS Cliente. Estados: Borrador → Enviada → En negociación → Aprobada → Rechazada → Vencida → Convertida.

---

### 8.10 OS Cliente

Vinculada a cotización. Panel de saldos: total aprobado / ejecutado / valorizado / facturado / pendiente. Asociación a múltiples OTs. Tabs: OTs, Valorizaciones, Facturas, Historial. Breadcrumb de flujo en pantallas de detalle.

---

### 8.11 OT — Orden de Trabajo

Tipos: cliente, interna, tercerizada, garantía, correctiva, preventiva, emergencia, proyecto. Facturable / no facturable. Asociación a OS Cliente, proyecto, centro de costo. `direccion_ejecucion` y `ubicacion_gps`. Tareas, materiales, servicios terceros, gastos, evidencias, conformidad. Cierre técnico y económico. Costo real y margen. PDF. Estados con badges de color.

**Participantes administrativos (opcional):** el formulario de creación y la ficha de edición incluyen una sección "Participantes administrativos" separada visualmente del personal operativo/técnico. Permite seleccionar uno o más colaboradores de `personal_administrativo` que participarán en la OT, registrando snapshot de nombre y horas estimadas de participación. Se persiste en el campo JSONB `participantes_admin` de `ordenes_trabajo` (array de `{personal_id, personal_nombre, horas_estimadas}`). Su gestión no toca el Planner.

**Detalle real manual:** el tab de costos puede persistir `real_detalle` en `ordenes_trabajo` para desglosar costos reales ingresados manualmente por mano de obra, materiales, terceros y logística. Complementa el costo calculado desde partes aprobados.

---

### 8.12 Partes Diarios

Por OT: técnico, fecha, actividades, horas, avance, materiales, evidencias. Aprobación del supervisor. Badge "Campo" si registrado desde móvil con GPS.

**Lista de colaboradores en el parte:** incluye (1) personal operativo asignado en el Planner a la OT y (2) participantes administrativos registrados en `participantes_admin` de la OT. Ambos grupos aparecen diferenciados en el selector mediante `<optgroup>` con etiquetas "Operativo" y "Administrativo". Los campos del parte son idénticos para ambos tipos: horas trabajadas y actividades. El costo se calcula con `calcCostoHora` (que ya busca en ambas listas) y se acumula en `costoMO` y `costoReal` de la OT al aprobar el parte.
*   **Persistencia completa**: Almacena de manera nativa en la base de datos (Supabase) las líneas de logística (`logistica_lineas` en JSONB), líneas de terceros (`terceros_lineas` en JSONB) y el nombre del técnico (`tecnico_nombre`), previniendo la pérdida de datos al recargar la página.
*   **Políticas RLS flexibilizadas**: Permite la actualización (`UPDATE`) de partes diarios si el usuario tiene el permiso de `partes:crear` O `partes:editar`, facilitando que los operarios editen sus borradores de partes sin requerir obligatoriamente el permiso administrativo de edición general.

---

### 8.13 Planner y Recursos

Calendario visual. Vista por técnico, cuadrilla, sede. Validación de disponibilidad. Alertas de conflicto. Reprogramación con motivo. **Tab Agenda CS:** renovaciones pendientes, onboardings en progreso, planes con alertas, NPS pendientes.

---

### 8.13b RRHH — Mi portal / Autoservicio empleado

Portal del colaborador (`pages_mi_portal.jsx`) accesible por el rol Empleado y perfiles con `mi_portal`. Resuelve la ficha del usuario autenticado contra personal operativo/administrativo y muestra datos personales/laborales, documentos, solicitudes, préstamos, amonestaciones activas y estado documentario.

**Fase 2:** `portalFase2Service.js` soporta solicitudes de actualización de datos, constancias de trabajo, boletas electrónicas, acuses de boleta, visualizaciones, OTP de firma y registro append-only de firma de contratos. El portal consume datos permitidos según configuración de empresa y deja resolución final a RRHH.

**Amonestaciones:** el colaborador puede visualizar y acusar recibo de amonestaciones; RRHH registra/anula desde fichas de personal.

---

### 8.13c RRHH — Reclutamiento

Módulo `pages_reclutamiento.jsx` con vacantes, candidatos, candidaturas y tablero por etapas. Permite crear vacantes, registrar candidatos, mover candidaturas con historial, descartar con motivo e invitar a postulación pública.

**Ruta pública:** `PostulacionPublica` permite postular vía token, registrar datos del candidato y crear candidatura. El servicio `reclutamientoService.js` centraliza vacantes, candidaturas, historial y validaciones.

**Integración con cese:** las candidaturas pueden mostrar alerta de historial cuando existe marca de no recontratar por cese/falta grave.

---

### 8.14 RRHH — Personal Operativo

Ficha completa: cargo, especialidad, turno asignado, centro de costo, modalidad de pago y tarifa hora. 3 tabs: Personal (tabla con avatar y datos), Disponibilidad (grilla semanal), Documentos y reportes operativos. Sección "Datos de nómina" visible solo con `ver_finanzas`: sueldo base, AFP/ONP, hijos, régimen, jornada, comisión AFP, suspensión de retenciones, RUC de colaborador y datos para honorarios cuando aplique. Formulario alta: + Nuevo técnico con todos los campos.

**Documentos reales:** SCTR, examen médico, EPP, licencia, carnet minero, certificados, DNI, contrato y otros documentos se gestionan en tabla `personal_documentos`, con versión activa, estado de validación, fecha de vencimiento y archivo privado en Storage. El JSON legacy de documentos ya no es la fuente principal.

**Reporte de habilitaciones:** la pestaña Documentos arma columnas dinámicas desde los tipos activos con `es_habilitante = true`, consume el motor `calcular_habilitaciones_personal` y distingue `vigente`, `por_vencer`, `vencido`, `falta`, `en_revision`, `rechazado` e `incompleto`. Los KPIs "Faltan por cargar", "Por vencer", "Vencidos / rechazados" y "En revisión" filtran el listado. Las celdas no aplicables muestran guion; las celdas con documento abren el previsualizador y las faltantes abren la ficha en Documentos con subida preseleccionada.

**Previsualizador básico:** los documentos activos se muestran en modal inline para PDF e imágenes, con metadatos de tipo, emisión, vencimiento/días, versión, subida, revisión, rechazo y notas. Las acciones Descargar, Validar, Rechazar con motivo y Reemplazar se muestran según contexto y permisos RRHH.

**Tarifa hora vigente:** `tarifa_hora` se calcula a partir de `monto_mensual / horas_base_mes`; `costo_hora_real`, `costo` y `costo_hora` se mantienen como fallback legacy.

---

### 8.15 RRHH — Personal Administrativo

2 tabs principales: Personal (ficha completa: contrato, vacaciones, licencias, permisos, tarifa hora, RUC de colaborador y retención IR cuando aplica) y Reportes (headcount por área, contratos por vencer, ranking vacaciones, solicitudes pendientes). Formulario alta: + Nuevo colaborador.

**Documentos reales:** usa el mismo sistema `personal_documentos` que Personal Operativo, con tipos administrativos (DNI, contrato, SCTR, médico, otros), versionado, validación por RRHH y alertas de vencimiento.

---

### 8.16 RRHH — Turnos y Horarios

Catálogo de turnos de la empresa. Campos por turno: nombre, hora entrada, hora salida, tolerancia de tardanza (minutos), cruza medianoche (toggle), días laborables o variables, minutos de refrigerio. Cálculo automático de horas efectivas. Los turnos se asignan en la ficha de cada trabajador.

**Turnos base sugeridos:** Mañana (8-17), Tarde (14-23), Noche (22-6), Campo (6-18, variable), Administrativo (9-18).

---

### 8.17 RRHH — Control de Asistencia

Registro manual: seleccionar trabajador, fecha, hora de entrada, hora de salida. El sistema calcula automáticamente tardanza (comparando contra turno + tolerancia) y horas extra (exceso sobre hora de salida).

**Estados automáticos:** Completo (verde), Tardanza (naranja), Horas extra (cyan), Falta (rojo), Falta justificada (rojo con borde). Justificación: checkbox simple sin flujo de aprobación.

**Tabs:** Vista diaria (tabla del día), Vista semanal (grilla), Vista mensual (resumen por trabajador con totales), Resumen por trabajador (detalle + impacto referencial en nómina + exportar Excel), Autorizaciones HE, Biométrico y SAR/Geocercas.

**Registro masivo:** modal con todos los trabajadores del día en una sola grilla.

**Régimen minero:** además del registro diario general, el módulo soporta ciclos mineros 14×7, 20×10 y 28×14 mediante `asistencia_ciclos_mineros`. Al crear o actualizar un ciclo se generan registros diarios vinculados por `ciclo_minero_id`, con `regimen_jornada`, días de trabajo/descanso, incidencias y horas extra del ciclo.

**Biométrico:** permite configurar perfiles de importación agnósticos (`asistencia_biometrico_perfiles`), previsualizar archivos, importar lotes (`asistencia_biometrico_lotes`) y anular un lote vía RPC `anular_lote_biometrico`, revirtiendo los registros asociados sin borrado destructivo.

**Geocercas y SAR:** la asistencia móvil puede requerir consentimiento de ubicación, registrar precisión GPS, validar geocerca en modo flexible/estricto y evaluar alertas SAR/no llegada. Tab SAR/Geocercas administra configuración, geocercas y asignaciones.

---

### 8.17b RRHH — Solicitudes de RRHH

**Tipos de solicitud:** vacaciones, permiso_con_goce, permiso_sin_goce, licencia_medica, licencia_maternidad, licencia_paternidad, compensacion_horas y papeletas de movimiento.

**Estados del flujo:** `borrador` → `enviada` → `aprobada_jefe` → `confirmada_rrhh` → `activa`. Ramas de rechazo: `rechazada_jefe`, `rechazada_rrhh`. Terminación: `anulada`.

**Flujo completo:**
1. Colaborador crea solicitud (desktop o mobile) → estado `enviada`.
2. Jefe directo aprueba o rechaza (con comentario obligatorio en rechazo) → `aprobada_jefe` / `rechazada_jefe`.
3. RRHH confirma → `confirmada_rrhh`. Al confirmar se calcula automáticamente el impacto en nómina.
4. Estado `activa` aplicable al iniciar el período de ausencia.

**Impacto en nómina al confirmar:**
- Vacaciones / permiso_con_goce → `sin_descuento`, días_a_descontar = 0.
- Permiso_sin_goce → `descuento_total`, días_a_descontar = días hábiles.
- Licencia_médica → `descuento_parcial`, días_a_descontar = max(0, días hábiles − días que cubre empresa según config).
- Maternidad / paternidad / compensación → `sin_impacto`, días_a_descontar = 0.

**Reglas de negocio críticas:**
- Vacaciones: bloquear envío si días hábiles solicitados superan saldo disponible del colaborador.
- Documento obligatorio (URL): licencia_médica, maternidad y paternidad no pasan a `confirmada_rrhh` sin documento adjunto.
- Rechazo siempre con comentario obligatorio.
- Solapamiento: alerta si existe otra solicitud aprobada del mismo colaborador en el rango (no bloquea).
- Alerta de equipo: advertencia si % de equipo ausente el mismo rango supera `pct_max_equipo_ausente` de config.
- Sin borrado: solo `anulada` con motivo obligatorio.

**Conexión con Asistencia:** al confirmar se registra automáticamente `falta_justificada` en `registros_asistencia` con referencia a `solicitud_rrhh_id` para todos los días del rango.
**Conexión con Nómina:** `dias_a_descontar` es consumido por el cierre de nómina para descontar días de permiso_sin_goce.

**4 tabs desktop:** Mis solicitudes (con saldo vacaciones), Pendientes de aprobar (con alertas de solapamiento), Todas las solicitudes (filtros: tipo, estado, colaborador), Calendario de ausencias (grilla mensual por colaborador).

**Side-panel de nueva solicitud:** botones grandes por tipo, fechas con días hábiles en tiempo real, saldo vacaciones visible, campo de documento según tipo.

**Vista mobile:** formulario 3 pasos (tipo → fechas → motivo/documento → confirmación), acciones de aprobación para supervisores.

**Migración:** `146_solicitudes_rrhh.sql` — tablas `solicitudes_rrhh`, `solicitudes_rrhh_historial`, `rrhh_config_ausencias`. Función `calcular_dias_habiles`. RPC `crear_solicitud_rrhh` (security definer). Trigger historial append-only. Columna `solicitud_rrhh_id` en `registros_asistencia`.

---

### 8.17c RRHH — Control de Horas

Módulo de consolidación mensual de horas y costos de personal. Cruza partes diarios, tareos administrativos, OTs y fichas de personal para mostrar productividad, horas OT, horas libres, tarifa hora, costo de mano de obra y alertas de subregistro.

**Alcance:** muestra personal operativo y administrativo en vistas separadas. Usa `tarifa_hora` como fuente vigente del costo horario y conserva fallback a campos legacy si la tarifa todavía no existe.

**Uso esperado:** RRHH, Operaciones y Finanzas revisan desviaciones entre horas registradas, horas esperadas, costo por colaborador y costo aplicado a OT. Este módulo no reemplaza Nómina; sirve para control operativo y costeo.

---

### 8.18 RRHH — Nómina Básica

**Módulo para Perú — configurable por país en versiones futuras.**

**⚠️ Disclaimer permanente en todas las pantallas:** *"Los cálculos son referenciales. Valida con tu contador antes de procesar pagos."*

#### Pantallas

- **Configuración de Nómina** (sección nueva en Parámetros Generales): régimen laboral de empresa (General / Pequeña empresa MYPE / Microempresa MYPE), frecuencia de pago (mensual / quincenal), días de corte y pago, porcentaje de 1ra quincena, valores fiscales vigentes (UIT, RMV, RAM tope AFP, prima seguro AFP). Tabla comparativa de beneficios por régimen. Modal de confirmación al cambiar régimen.
- **Ficha del trabajador** (operativo y administrativo): sección nueva "Régimen de Jornada y Sistema Previsional" — régimen de jornada (General / Minero 14×7 / 20×10 / 28×14), horas diarias pactadas, fecha inicio ciclo, bonificación por altitud. Sistema previsional: AFP (con selector AFP, tipo comisión flujo/mixta, % comisión) o ONP.
- **Vista de períodos**: cards por período con fechas corte/pago, estado semántico, badge quincena con %. KPIs rápidos: período activo, próxima fecha de corte, próxima fecha de pago. Auto-generación del período del mes actual si no existe.
- **Tab Detalle por trabajador**: badge de régimen del trabajador, columna días computables (visible solo si hay mineros), panel lateral con desglose completo (ingresos, descuentos 3 líneas AFP, cargas empresa con provisiones).
- **Tab Reporte PLAME**: visible solo para períodos cerrados. Preview tabla PLAME con datos del período. Botón Descargar Excel (nombre `PLAME_{empresa}_{periodo}.xlsx`). Vista de todos los trabajadores. Nota de última generación.

#### Flujo de cálculo — Fase 1 (motores corregidos 10/06/2026)

**Enrutamiento por régimen**
- **General:** sueldo base mensual íntegro (nunca proporcionalizado por días de jornada). `valorDia = sueldo ÷ 30`. `valorHora = sueldo ÷ 30 ÷ horasEfectivas`. Descuento falta = `valorDia × faltas`. Domingos y feriados no cuentan como falta.
- **Ciclo acumulativo (minero 14×7, 20×10, 28×14):** días computables del mes = días de trabajo dentro del ciclo calculados desde `fecha_inicio_ciclo`. Para ciclos predefinidos, `t` y `d` se infieren del `regimen_jornada` si no están almacenados en el registro del trabajador. `sueldoProporcional = sueldo × (diasComputables ÷ 30)`. `valorDia = sueldo ÷ 30` (divisor 30 canónico, consistente con Liquidación por Cese). `valorHora = sueldo ÷ 30 ÷ horasEfectivas` (mismo divisor, no diasComputables).

**1. Base computable unificada**
`baseComputable = sueldoProporcional + asignacionFamiliar + bonifAltitud`

Esta base se usa uniformemente para gratificación, CTS y vacaciones. La `bonifAltitud` es remunerativa (confirmar con contador).

**2. Remuneración bruta**
= sueldoProporcional − descuento faltas − descuento tardanzas + horas extra + asignación familiar + bonificación por altitud.

**3. Horas extra**
- Primeras 2h por día (minutos ≤ 120): valorHora × 1.25.
- Desde la 3ra hora por día: valorHora × 1.35.
- Ambos tramos mostrados por separado en detalle y boleta.

**4. AFP — tres componentes independientes**
- Aporte obligatorio: 10% sobre remuneración asegurable.
- Comisión por flujo: % de ficha sobre asegurable. Solo si tipo = flujo. Si tipo = mixta: S/ 0 (se descuenta del fondo).
- Prima de seguro: % configurado en empresa_config sobre min(asegurable, RAM). Siempre distinto de cero.
- ONP: 13% (un solo componente).

**5. IR 5ta categoría**
Proyección anual con UIT vigente de empresa_config. Escala progresiva acumulativa: hasta 5 UIT → 8%, de 5 a 20 UIT → 14%, de 20 a 35 UIT → 17%, de 35 a 45 UIT → 20%, > 45 UIT → 30%. Deducción: 7 UIT. En pago quincenal: IR completo del mes retenido en la 2da quincena únicamente.

**6. Neto a pagar**
= bruto − (aporte AFP + comisión AFP flujo + prima seguro [o ONP]) − IR 5ta − préstamo − anticipo − judicial.

**7. Cargas empresa por régimen**
| Concepto | Microempresa | Otros regímenes |
|---|---|---|
| ESSALUD | 9% bruto | 9% bruto |
| CTS mensualizada | S/ 0 | `(baseComputable + gratificacion) ÷ 12` (÷24 pequeña empresa) |
| Gratificación mensualizada | S/ 0 | `baseComputable ÷ 6` (÷12 pequeña empresa) |
| Bonif. extraordinaria (9% gratif.) | S/ 0 | gratificación × 9% |
| Vacaciones | `baseComputable ÷ 12 × (15÷30)` | `baseComputable ÷ 12 × (30÷30)` |

**8. Pago quincenal**
- 1ra quincena: % configurado del sueldo mensual. AFP y ONP proporcionales. Sin IR 5ta. Sin provisiones de CTS/gratif/vacaciones.
- 2da quincena: complemento + variables del mes. IR 5ta completo del mes. Todas las provisiones.

#### Fase 2 — Asignaciones de jornada con vigencia (10/06/2026)

Cada trabajador puede tener un historial de asignaciones de jornada en la tabla `personal_asignaciones_jornada`. El motor `calcularNominaConTramos` detecta si existen asignaciones en el período y actúa:
- **Sin historial:** delega a `calcularNominaTrabajador` (sin regresión).
- **Un solo tramo:** adapta el trabajador desde la asignación y ejecuta el motor Fase 1.
- **Múltiples tramos:** segmenta el mes, calcula cada tramo con el motor Fase 1, suma remuneraciones; beneficios (CTS, gratificación, vacaciones) se calculan sobre la base computable mensual total, no por tramo.
- **Gap o solapamiento en historia:** bloquea explícitamente (no silencia), retorna error visible en desglose de nómina.

**Tipo de tramo `suspension_perfecta`:** el trabajador no percibe remuneración en ese período, pero la relación laboral continúa y la antigüedad no se interrumpe. Diferente de standby remunerado (tramo `normal` con régimen `general`).

**Regla `fecha_ingreso`:** nunca se modifica al crear o cerrar una asignación. El RPC `crear_asignacion_jornada` cierra la vigente (`fecha_fin = p_fecha_inicio - 1`) y crea la nueva. Las asignaciones nunca se eliminan.

**Tab Jornada en ficha personal operativo:** muestra asignación vigente, historial ordenado por fecha descendente, formulario para registrar nueva asignación.

**Reglas críticas**
- Cambiar régimen de empresa no recalcula períodos cerrados.
- Las gratificaciones de julio y diciembre no están afectas a AFP ni ONP.
- La prima de seguro AFP nunca es cero.
- El reporte PLAME solo se genera para períodos cerrados.
- La `fecha_ingreso` del trabajador no se modifica al crear asignaciones.
- El historial de asignaciones no tiene huecos ni solapamientos; el motor bloquea si los detecta.

**Cierre de período** → registra 2 egresos en Compras y Gastos: planilla (neto) + cargas sociales. Comisiones modo planilla del período se marcan como pagadas. Tab PLAME queda habilitado.

---

### 8.18b RRHH — Liquidación y Aprobación de Comisiones

Módulo central para la liquidación, aprobación de acuerdos especiales y pago de comisiones comerciales.

**1. Origen y Atribución Automática:**
*   Las comisiones se generan en tiempo real al registrarse un cobro de CxC en el módulo de Administración.
*   Si la oportunidad asociada a la venta posee un acuerdo de comisión especial, se calcula en base a ese porcentaje (`acuerdo_pct`) y su bonificación. De lo contrario, se usa el porcentaje base del vendedor en su ficha de personal.
*   Si el vendedor no existe en `personal_administrativo` o no tiene comisiones activas en su ficha, se lanza una alerta/toast en tiempo real en la pantalla.

**2. Gestión de Acuerdos Especiales:**
*   **Aprobación de Acuerdos:** Los gerentes y administradores pueden aprobar o rechazar acuerdos comerciales de comisiones especiales desde la pestaña *Acuerdos pendientes*.
*   **Alerta +48h:** Se incluye un indicador de urgencia de color rojo para aquellos acuerdos de comisiones especiales que lleven más de 48 horas sin respuesta.

**3. Liquidación y Canales de Pago:**
*   **Planilla:** Si la modalidad de comisión es Planilla, al cerrar el período de comisiones se integran en la remuneración bruta del trabajador para su cálculo mensual.
*   **Honorarios (Recibos por Honorarios):** Si la modalidad es Honorarios, se genera una orden de RHE agrupando sus comisiones aprobadas. Al confirmarse el recibo en el módulo de Comisiones, se crea automáticamente una Cuenta por Pagar (CxP) de tipo `personal` en el módulo financiero. El recibo puede conservar `numero_rhe`, `moneda_cxp`, `motivo_retencion` y archivos RHE/constancia mediante Storage privado.

**4. Reglas de Retención del Impuesto a la Renta de 4ta Categoría (RHE - Perú):**
*   **Agente de Retención:** Se evalúa si la empresa es agente de retención (`agente_retencion = true` en `empresa_config`).
*   **Monto Umbral:** Si el monto bruto convertido a soles (PEN) usando el tipo de cambio referencial (para transacciones en USD) supera S/ 1,500.
*   **Exención por Suspensión:** Se verifica si el colaborador tiene una constancia de suspensión de retenciones activa para el período actual (`suspension_retenciones = true` y fecha `vencimiento_suspension >= hoy`).
*   **Retención:** Si aplica, se deduce el porcentaje configurado (8% por defecto) y se registra el sustento de retención/exoneración en el campo `motivo_retencion`.

**5. Formulario y Ficha de Colaborador (RRHH > Personal Administrativo):**
*   El formulario de edición del colaborador se adapta dinámicamente según su modalidad de contrato:
    *   **Contrato de Planilla:** Muestra campos de turnos, AFP/ONP, sueldo base y beneficios sociales de ley.
    *   **Contrato de Honorarios:** Oculta turnos asignados, AFP/ONP y beneficios laborales. Cambia la etiqueta de sueldo a *"Honorario pactado"* y las fechas del contrato pasan a llamarse *"Inicio del encargo"* y *"Fin del encargo"*. Requiere obligatoriamente un RUC válido de 11 dígitos.
*   Sección **Configuración de Comisiones**: Contiene toggle para activar comisiones, porcentaje base de comisión, modalidad de pago, RUC de comisiones (vendedor), retención de IR de comisiones, suspensión de retenciones y fecha de vencimiento. Los campos de RUC y retención IR se muestran/ocultan dinámicamente en tiempo real según la modalidad de pago seleccionada.

**Bugs de CxC y Comisiones corregidos (10 bugs):**
1. **Tolerancia a Supabase real:** Remoción de fallbacks en RHE y CxP con inserciones reales directas a BD Supabase.
2. **Normalización de moneda:** Conversión PEN / USD estandarizada para evitar inconsistencias en agrupaciones.
3. **Cálculo de retención de IR de 4ta:** Cálculo dinámico con tipo de cambio para el umbral de S/ 1,500.
4. **Propagación de RUC:** Carga automática del RUC del vendedor para la generación del RHE.
5. **Registro de justificación:** Guardado correcto del sustento de retención en el campo `motivo_retencion` en BD.
6. **Generación automática de CxP:** Creación de CxP tipo `personal` vinculada al ID del recibo.
7. **Importación de CxC:** Carga limpia de saldos sin duplicaciones de registros.
8. **Filtrado por moneda en RHE:** Agrupación selectiva de comisiones aprobadas según la moneda de origen.
9. **Validación de RUC en ficha:** Exigencia obligatoria de RUC de 11 dígitos y bloqueo de comisiones si no hay modalidad de pago.
10. **Comisiones en planilla:** Egreso integrado en la nómina bruta para comisiones bajo modalidad Planilla.

---

### 8.18c RRHH — Evaluación de Desempeño

Módulo informativo de evaluación 360° básica para colaboradores administrativos y operativos. No alimenta automáticamente nómina, comisiones ni otros módulos; RRHH y gerencia usan los resultados como insumo manual.

**Configuración:** Parámetros Generales incluye "Configuración de Evaluaciones de Desempeño" con ponderación autoevaluación/jefe, ponderación competencias/objetivos, escala mínima/máxima y labels por puntaje. Las ponderaciones se validan en tiempo real y deben sumar 100 por bloque.

**Plantillas:** RRHH/admin crea plantillas por empresa con nombre, descripción, período, fechas del proceso, pesos configurables, competencias y objetivos. Las competencias son cualitativas con escala numérica; los objetivos son cuantitativos con unidad, meta esperada y resultado real. Al activar una plantilla se generan evaluaciones para los colaboradores seleccionados y se toma snapshot del jefe directo (`jefe_user_id`), con advertencia si falta jefe asignado.

**Flujo del colaborador:** el colaborador ve sus autoevaluaciones pendientes con badge en sidebar. Completa competencias con escala visual y comentarios opcionales, registra resultados reales de objetivos y ve el porcentaje de cumplimiento en tiempo real. Al enviar, la autoevaluación queda bloqueada y pasa a `autoevaluacion_completa`.

**Flujo del jefe:** el jefe ve solo evaluaciones de subordinados directos. Puede consultar la autoevaluación como referencia en un panel lateral de solo lectura, completa su propia evaluación, comenta objetivos y registra un comentario final obligatorio. Al enviar, se calculan scores y la evaluación pasa a `completada`.

**Cálculo:** competencias = promedio simple normalizado a 0-100. Objetivos = promedio de cumplimiento con tope 100%. Score por evaluador = competencias × peso competencias + objetivos × peso objetivos. Score final = autoevaluación × peso autoevaluación + jefe × peso jefe. Clasificación automática: Sobresaliente (90-100), Destacado (75-89), Satisfactorio (60-74), Por mejorar (45-59), Insatisfactorio (<45).

**Resultados:** RRHH/admin accede al consolidado con KPIs, filtros, distribución de scores, exportación Excel y panel lateral con detalle completo por colaborador. El colaborador solo ve sus resultados cuando RRHH/admin cierra explícitamente la plantilla.

**Reglas críticas:** una autoevaluación enviada no se edita; el colaborador no ve la evaluación del jefe antes del cierre; una plantilla cerrada no permite nuevas evaluaciones ni edición; RRHH puede reasignar jefe evaluador si el jefe cambia; si no hay jefe asignado, la autoevaluación puede completarse pero la evaluación del jefe queda bloqueada.

---

### 8.19 RRHH — Préstamos al Personal

Préstamos que la empresa otorga a sus trabajadores. Naturaleza: activo (nos deben). Se descuenta en nómina. Tabla con trabajador, tipo de trabajador, monto, cuotas, cuota mensual, cuotas pagadas, saldo, estado, fecha de otorgamiento y toggle "Descontar automáticamente en nómina". No confundir con financiamiento recibido.

**Historial de pagos:** `prestamo_pagos` registra pagos manuales o por nómina, con fecha, monto, concepto y período asociado cuando aplica.

---

### 8.18d RRHH — Liquidación por Cese

Módulo exclusivo de RRHH/Admin para liquidar a colaboradores en cualquiera de los tipos de cese habilitados por D.Leg. 728 y normas complementarias.

**Tipos de cese:** Renuncia voluntaria · Despido arbitrario · Mutuo acuerdo · Vencimiento de contrato · Fallecimiento (con campos de beneficiario obligatorios) · Falta grave documentada.

**Wizard de 3 pasos:**
1. Datos del cese: selección de colaborador activo, tipo de cese, fecha de cese (no puede ser anterior a fecha de ingreso). Para fallecimiento: nombre y DNI del beneficiario.
2. Revisión del cálculo: motor de cálculo automático con parámetros ajustables (asignación familiar, última gratificación mensual, días de vacaciones gozados, fecha del último depósito CTS). Cada concepto muestra la fórmula utilizada en texto legible.
3. Confirmación: resumen, observaciones obligatorias, checkbox de confirmación con asesoría legal/contable.

**Motor de cálculo — conceptos:**
- **Remuneración pendiente:** sueldo ÷ 30 × días trabajados en el mes del cese. Aplica siempre.
- **Vacaciones truncas:** días acumulados en el año laboral − días gozados, multiplicados por remuneración diaria. 30 días/año para régimen general/pequeña empresa; 15 para microempresa. Aplica siempre.
- **CTS proporcional:** remuneración computable × (días desde último depósito ÷ 360). No aplica para microempresa.
- **Gratificación proporcional:** remuneración computable × (meses completos en semestre ÷ 6) + bonificación extraordinaria 9%. No aplica para microempresa. Para renuncia voluntaria, requiere al menos 1 mes completo en el semestre.
- **Indemnización:** solo para despido arbitrario. Régimen general: 1.5 rem./año (tope 12 rem.). Pequeña empresa: 20 rem.diarias/año (tope 120). Microempresa: 10 rem.diarias/año (tope 90).
- Remuneración computable = sueldo base + asignación familiar + 1/6 de última gratificación semestral.

**Al confirmar:**
1. Estado de la liquidación → `confirmada`.
2. Colaborador marcado como `cesado` (estado_laboral) en su ficha — desaparece de selectores activos en toda la app.
3. CxP generada automáticamente en estado `pendiente`, con vencimiento a ~10 días calendario desde el cese.
4. Toast con link directo a la CxP.

**Anulación:** disponible en cualquier estado. Si la liquidación estaba confirmada: revierte el colaborador a activo y anula la CxP asociada con nota automática de motivo.

**Disclaimer permanente:** "Los montos son referenciales. Valida con tu asesor legal o contador antes de procesar el pago."

---

### 8.20 SOLPE Interna

Origen de toda necesidad de compra. Desde OT o parte diario. Clasificación, urgencia, centro de costo. Flujo visual: Borrador → Solicitada → Aprobada → Atendida. Al aprobarse, Compras la recibe y genera el proceso de cotización.

**Validación y Selección:**
- El campo de **Centro de Costo (CECO)** es **obligatorio** en el formulario de creación de SOLPE.
- Cuenta con un selector funcional que carga dinámicamente los CECOs activos de la empresa.
- `solpe_interna` soporta `items` estructurados, `solicitante_user_id`, `ot_id` y generación automática por stock de seguridad/punto de reorden.

---

### 8.21 Inventario y Almacenes

Stock disponible, reservado y mínimo por almacén. Entradas, salidas, consumos por OT, transferencias, ajustes, devoluciones. Kardex en panel lateral. Alertas de stock crítico. Lote/serie/vencimiento. Inventario físico. Código de barras (campo móvil F2).

**WMS conteo y analítica (11/06/2026):** El módulo de Almacenes incorpora tabs `Stock`, `Conteo físico` y `Analítica`. Conteo físico inicia desde el stock teórico, permite avance parcial, respeta lote/serie, cierra como solo lectura y genera ajustes automáticos `ajuste_conteo` con referencia al conteo. Analítica calcula ABC sobre salidas del período, rotación estimada por artículo/almacén y stock muerto con umbral configurable de días sin actividad.

**Reorden y trazabilidad (11–12/06/2026):** materiales incorporan `stock_seguridad`, `punto_reorden` y `stock_maximo`; el backend puede generar SOLPEs automáticas de reorden. Las OTs pueden registrar trazabilidad de lotes/series consumidos y la PWA ya incluye `BarcodeScanner` para lectura de códigos.

---

### 8.22 Compras — Proveedores

Ciclo de vida: Potencial → En evaluación → Homologado → Observado/Bloqueado → Inactivo. Solo homologados aparecen en selectores de OC. Ficha con 6 tabs: Resumen, Condiciones financieras (visible con `ver_finanzas`: condición de pago, banco, CCI, retención), Documentos (SCTR/póliza/certificaciones con semáforo de vencimiento), Evaluaciones (homologación + post-OC con score acumulado), Historial OC, Contactos.

**Evaluación de homologación:** capacidad técnica, documentación, solidez financiera, referencias, precio competitivo. Score ponderado → aprobado o rechazado.

**Evaluación post-OC:** cumplió plazo, calidad, precio, comunicación → actualiza score acumulado del proveedor.

**Ficha completa (migración 236):** proveedores agregan código, nombre/razón comercial, tipo, categoría, ubicación, contacto principal, condiciones de pago, moneda y flags de retención/homologación para búsqueda y segmentación.

---

### 8.23 Compras — Cotizaciones

Wizard 3 pasos: 1) Origen (SOLPE o libre) + descripción + tipo (bien/servicio) + fecha límite. 2) Selección de proveedores homologados a consultar. 3) Confirmar y crear proceso.

Detalle con tabs: Respuestas de proveedores (card por proveedor con estado), Comparativo (tabla lado a lado con ★ al mejor precio + recomendación automática), Resultado (proveedor ganador + justificación + link a OC/OS).

---

### 8.24 Compras — Órdenes de Compra

Para bienes. Vinculada a SOLPE y proceso de cotización. Ítems con cantidad, precio unitario, subtotal. IGV, total. Plazo de entrega, condición de pago, lead time real/estimado y origen SOLPE. Seguimiento por timeline. Estados: Emitida → Confirmada → En tránsito → Recibida parcial → Cerrada.

---

### 8.25 Compras — Órdenes de Servicio Interna

Para servicios tercerizados. Mismo patrón que OC pero con alcance, entregables y criterios de conformidad. Cierre = conformidad aprobada (no recepción física). Estados: Emitida → Confirmada → En ejecución → Pendiente conformidad → Cerrada.

---

### 8.26 Compras — Recepciones

Confirmar que lo pedido llegó y en qué condición. Verificación ítem por ítem (pedido vs recibido). Tipo: total, parcial u observada. Al confirmar: actualiza OC, ingresa bienes a inventario (si es compra), genera CxP, crea evaluación post-servicio en ficha del proveedor.

**Matching 3 vías y precio histórico:** recepciones cruzan OC/recepción/CxP y alimentan `vista_precio_historico_proveedor` para análisis de variación de precios por proveedor/material.

### 8.26b Compras en Campo y Registro de Gastos

Registro estructurado de egresos menores y adquisiciones directas fuera del flujo ordinario de Órdenes de Compra.
*   **Origen:** Puede ser registrado desde campo vía PWA móvil con OCR de comprobante o cargado manualmente desde el backoffice (Administración / Finanzas). El flujo puede generar una CxP cuando el gasto queda pendiente de pago.
*   **Validación obligatoria de CECO:** El campo de **Centro de Costo (CECO)** es **estrictamente obligatorio** para guardar cualquier gasto. Si no se selecciona un CECO activo, el sistema bloquea el registro con una alerta visual de error.
*   **Trazabilidad:** `compras_gastos` puede guardar `estado_pago`, `referencia_pago`, `cxp_id`, `periodo_nomina_id`, `personal_id` y `ot_vinc_id`. También soporta marcación de activo fijo (`es_activo_fijo`, `activo_tipo`, `vida_util_anos`, `numero_serie`, `activo_estado`).
*   **Capitalización de activos fijos:** Cuando el tipo de gasto pertenece a una categoría ER con `es_capitalizacion = true` (ej. "Inversiones / Activos"), el wizard solicita tipo de activo, número de serie/placa y vida útil, marca el registro con `es_activo_fijo = true` y lo excluye del ER. El egreso aparece en el tab "Desde Compras/Gastos" de Activos Fijos y puede promoverse al Maestro de Activos con un clic, pre-llenando todos los campos y vinculando ambos registros via `activos.compras_gasto_id`.
*   **Impacto Financiero:** Los registros en `compras_gastos` con `es_activo_fijo = false` se integran al Estado de Resultados y BI Financiero. Los registros con `es_activo_fijo = true` quedan excluidos del ER como gasto; su impacto financiero periódico vendrá de la depreciación mensual (motor de depreciación — implementación futura).

---

### 8.26c Compras — Devoluciones a Proveedor

Flujo de devolución vinculado a proveedor/OC/recepción. Permite registrar líneas a devolver, enviar devolución, aceptar por proveedor, registrar nota de crédito y anular con motivo. El servicio activo es `devolucionesService` dentro de `comprasService.js`; tablas base `devoluciones_proveedor` y `devoluciones_proveedor_lineas`.

---

### 8.27 Costos por OT

Costo estimado vs real. Mano de obra (desde parte diario/tareo × `tarifa_hora` del colaborador), materiales (desde inventario), servicios terceros, logística, gastos y `real_detalle` manual cuando aplica. Margen bruto y porcentual. Visible solo con `ver_costos`.

---

### 8.28 Valorización

Agrupar OTs en ejecución o cerradas por cliente/período. Aplicar tarifas, descuentos, penalidades, impuestos. Flujo de aprobación. Control de OTs valorizadas y pendientes. PDF.

**Detalle de Valorizaciones y Persistencia:** La tabla `valorizaciones` incluye persistencia nativa del JSON de partidas (`items`), las OTs vinculadas (`ot_ids`), y el historial de acciones y aprobaciones (`historial`). También almacena el modelo de cálculo utilizado, notas explicativas, fecha de aprobación final y motivo de anulación en caso de cancelación.

**Cierre operativo por valorización final:** Las OTs en estado `ejecucion` pueden valorizarse por avance sin cerrarse. Al aprobar una valorización, el sistema suma el monto acumulado de las valorizaciones aprobadas que contienen cada OT incluida. Si ese acumulado alcanza o supera el monto total de la OS Cliente, la OT pasa automáticamente a `pendiente_cierre`. La aprobación no se bloquea ni condiciona; el cambio solo informa al área técnica que debe formalizar el cierre.

---

### 8.28b Ventas

Módulo de pre-facturación con seguimiento. Permite registrar una venta acordada con el cliente antes de emitir el comprobante. **No alimenta el Estado de Resultados** — el ingreso lo registra únicamente la factura emitida desde este módulo.

**Estados:** `borrador` → `confirmada` → `facturada` / `anulada`. Las transiciones `facturada` y `anulada` son irreversibles (solo lectura en el dropdown). Badges: borrador (gris), confirmada (azul), facturada (verde), anulada (rojo).

**Condición de pago:** `contado` o `crédito`. Si es crédito, se registran `dias_credito` y `fecha_vencimiento_pago` como referencia informativa al momento de facturar. No se genera CxC desde Ventas.

**Flujo:** desde estado `confirmada`, el botón "Emitir Comprobante" navega a Facturación con los datos pre-rellenos (cliente, concepto, monto, moneda, condición de pago). Al confirmar la factura, la venta pasa automáticamente a `facturada` y queda vinculada via `factura_id`.

**Campos en tabla `ventas`:** `condicion_pago` (contado/credito), `dias_credito`, `fecha_vencimiento_pago`, `factura_id` (FK uuid a `facturas`), `cxc_id` (FK a `cxc`).

**Servicios:** `finanzasService.registrarVenta()` inserta sin generar CxC ni factura. `finanzasService.confirmarVenta(ventaId, facturaId, cxcId)` cierra el ciclo marcando la venta como `facturada` y vinculando los IDs.

---

### 8.29 Facturación

Desde valorización aprobada o OS Cliente. Datos fiscales, impuestos, vencimiento. Notas de crédito/débito. Exportación para facturación electrónica externa. La factura puede guardar `archivo_pdf_url` y `archivo_zip_url` para conservar el PDF y ZIP asociados.

**Retención SUNAT por cliente:** si la cuenta está marcada como agente de retención SUNAT (`agente_retencion_sunat = true`), al emitir se guarda snapshot de `aplica_retencion`, `monto_retencion` y `monto_neto_cobrable`. La CxC conserva `monto_retencion` para cobranza y conciliación. La retención no es gasto; reduce el monto neto cobrado y queda como crédito fiscal/tributario a conciliar.

**Boleta de Venta:** tipo de documento disponible junto a Factura en el selector de Comprobante Directo. Serie B (ej. `B001-0001`). RUC del cliente opcional (puede emitirse a consumidor final). IGV incluido en el precio — el formulario muestra solo "Total — IGV incluido", sin desglose de subtotal. Alimenta el ER igual que la Factura via `loadFacturas` (usando el campo `subtotal` = precio neto sin IGV calculado internamente).

**Origen desde Ventas:** cuando se accede desde el botón "Emitir Comprobante" del módulo Ventas, el formulario llega pre-relleno con cliente, concepto, monto y moneda. Se muestra un banner identificando la venta de origen con opción de descartar el vínculo. Al confirmar la emisión, `finanzasService.confirmarVenta()` cierra el ciclo automáticamente en la venta de origen.

---

### 8.29b Cuentas por Pagar

Gestión de obligaciones por pagar a proveedores, colaboradores, RHE externos, viáticos, devoluciones por nota de crédito, nómina y otros conceptos manuales. Permite registrar pagos parciales vía `cxp_pagos`, clasificar para Estado de Resultados con `categoria_er` y `centro_costo_id`, y vincular la CxP con `compras_gastos` para devengo.

**RHE externo:** el usuario registra RUC, nombre del emisor, monto bruto, retención IR, número de RHE y archivo. La CxP queda por el monto neto y conserva `monto_bruto`, `retencion_ir`, `ruc_emisor`, `nombre_emisor`, `archivo_factura_url` y, cuando aplica, `archivo_constancia_url`.

**Viáticos y reembolsos:** CxP de tipo `personal`, vinculada a colaborador y opcionalmente a OT (`ot_vinc_id`).

**Regla ER:** una CxP que representa gasto puede devengarse como fila en `compras_gastos`; si ya tiene `gasto_id`, `recepcion_id`, `no_devengar_er` o fue anulada, no se duplica en ER.

---

### 8.30 Tesorería y Match Bancario

Bancos y cuentas. Ingresos vinculados a CxC/anticipo. Egresos vinculados a CxP/gasto/préstamo/cuota de financiamiento. Match bancario: conciliar movimiento bancario con CxC (créditos) o CxP/gasto (débitos). Flujo de caja proyectado vs real.

---

### 8.30b Caja Chica y Anticipos

Caja chica usa tabla persistente `caja_chica` y registra fecha, concepto, monto, moneda, responsable, CECO, categoría, número de comprobante, URL de comprobante y vínculo opcional a `compras_gastos`.

**Anticipos OC:** `oc_anticipos` registra anticipos a proveedores vinculados a órdenes de compra, con monto, moneda, referencia, notas y movimiento relacionado. Sirven para trazabilidad financiera previa a la recepción o facturación del proveedor.

---

### 8.31 Estado de Resultados

```
INGRESOS
  Ventas de servicios
COSTO DE VENTAS
  Mano de obra | Materiales | Servicios terceros
UTILIDAD BRUTA → margen %
GASTOS OPERATIVOS
  Administrativos | Comerciales | Logísticos
  Planilla período (desde nómina cerrada)
  Cargas sociales (desde nómina cerrada)
  Devengos CxP clasificados por categoría ER
RESULTADO OPERATIVO
GASTOS FINANCIEROS
  Intereses de préstamos (desde cuotas de financiamiento pagadas)
RESULTADO NETO → margen %
```

Filtros: período, cliente, proyecto, centro de costo (CECO) y centro de beneficio (CEBE) completamente funcionales mediante MultiSelect. Drill-down por categoría. Comparativo período anterior. El ER integra **únicamente facturas y boletas** como fuente de ingresos (tabla `facturas`, tipos `factura` y `boleta`, excluyendo `nota_credito` y `nota_debito`), más costos OT, cierres técnicos, `compras_gastos`, CxP devengables, nómina cerrada y pagos de financiamiento. Las ventas directas ya no alimentan el ER — el ingreso lo registra únicamente la factura o boleta emitida.

---

### 8.32 Financiamiento y Deuda

**Naturaleza: pasivo de la empresa** (nos prestaron, debemos devolver).

Tipos: bancario, tercero (persona natural/empresa), leasing, línea de crédito revolvente.

**Tabla de amortización generada automáticamente** al crear: cuota por cuota con capital, interés, total y saldo. Sistema francés (cuota fija), alemán (cuota decreciente) o bullet.

**Al pagar cuota:** capital → reduce saldo del préstamo. Interés → gasto financiero en ER. Total → egreso en Tesorería.

**Reporte de deuda:** saldo total vigente, cuotas del mes (capital + interés), proyección 12 meses por mes, distribución por tipo de acreedor, detalle por préstamo con barra de avance.

**Alertas:** cuota próxima a vencer (7 días) en Dashboard y notificaciones.

---

### 8.33 Presupuesto vs Real

Módulo completo de control presupuestal que permite contrastar los gastos proyectados contra los egresos reales de la operación en períodos mensuales (`YYYY-MM`) o anuales (`YYYY`), opcionalmente filtrando por Centro de Costo (CECO) y Centro de Beneficio (CEBE).

**Filtros en BI Financiero y Presupuestos:**
- Los filtros por **CECO** y **CEBE** son funcionales en la vista de **BI Financiero** y en el módulo **Presupuesto vs Real** (recalculando los costos reales y variaciones en tiempo real).

**1. Presupuestos y Partidas:**
*   Creación e ingreso de presupuestos con su respectivo título y período.
*   Gestión de partidas agrupadas por categoría (Materiales, Mano de obra, Servicios de Terceros, Logística, Gastos, etc.) con sus montos estimados en soles (PEN) y su descripción.

**2. Cadena de Aprobación Secuencial:**
*   Aprobación de presupuestos mediante una cadena de firmas secuencial de hasta 4 niveles de aprobadores seleccionables de la lista de usuarios.
*   El estado del presupuesto cambia de `borrador` → `en_aprobacion` → `aprobado` (cuando firman todos) o `rechazado` (si algún firmante rechaza, capturando obligatoriamente su comentario).

**3. Cálculo Automático del Real Ejecutado:**
*   **Mano de Obra:** Se obtiene del costo real acumulado de las Órdenes de Trabajo (OT) que se cerraron o facturaron dentro del período presupuestado (coincidiendo con el CECO de la partida).
*   **Otras Categorías:** Se obtiene automáticamente a partir del total de compras y egresos registrados en `compras_gastos` en el período de análisis que tengan asignada la misma categoría y CECO.

**4. Variaciones y Semáforos de Alerta:**
*   El sistema calcula en tiempo real la variación neta absoluta y el porcentaje de ejecución presupuestal.
*   Las partidas se marcan visualmente con semáforos de estado: `OK` (ejecución menor a 80%), `En límite` (80%-100%, barra naranja) o `Excedido` (mayor a 100%, barra roja), desplegando una alerta general en la parte superior si existen partidas excedidas.

**5. Desglose y Drill-down de Comprobantes:**
*   Al hacer clic en cualquier partida presupuestal en el panel, se despliega un listado detallado (con fecha, descripción, proveedor o técnico, documento de origen y monto) con todas las transacciones individuales (gastos o OTs) que conforman el costo real total de esa partida para una auditoría transparente.

---

### 8.34 Customer Success — módulos completos

**Onboarding:** activación al ganar oportunidad. Checklist configurable, reunión de arranque, hitos con alertas, satisfacción inicial.

**Planes de Éxito:** objetivos del cliente, periodicidad de revisión, seguimiento de adopción, alertas de riesgo temprano.

**Health Score:** 5 dimensiones ponderadas: uso de plataforma, soporte, NPS, finanzas, relación CS. Semáforo: saludable >70 / observación 50-70 / riesgo 30-50 / crítico <30. Alerta automática al caer bajo umbral.

**Renovaciones:** alertas 90/60/30 días antes. Oportunidad en pipeline automática. Regla: cliente con deuda vencida se evalúa antes de upsell.

**Fidelización y NPS:** encuestas automáticas post-servicio, promotores/neutros/detractores, referidos vinculados al cliente fuente, casos de éxito con autorización.

---

### 8.35 Integraciones — API Keys

Gestión de claves de integración para que sistemas externos (formularios web, CRMs, herramientas de marketing) envíen leads automáticamente al ERP.

**Generación:** `tdk_` + 64 hex chars (32 bytes random), hasheado con SHA-256 en el cliente antes de almacenar. La clave raw se muestra una única vez en un modal overlay al crear — nunca se guarda en texto plano en la base de datos.

**Permisos:** array de strings `modulo:accion` (ej: `leads:write`, `contactos:read`). Cada key tiene scope propio.

**Tabla `api_keys`:** id, empresa_id, key_hash (único), descripcion, permisos text[], activo, creado_por, creado_en, ultimo_uso_en.

**Edge Function `api-prospectos`:** recibe `POST` con `X-Api-Key` header → llama RPC `validar_api_key(key_plain, permiso)` → si válida retorna `empresa_id` → inserta lead con `registrado_desde = 'api'` → responde `{ success: true, lead_id }`.

**RLS:** SELECT/INSERT/UPDATE restringidos a `usuario_tiene_empresa(empresa_id)`. No permite revocar si no eres admin del tenant.

---

### 8.8c CRM — Marketing Automation — Campañas

Módulo central de atribución de marketing. Responde: ¿qué canal generó más leads? ¿cuánto costó cada lead? ¿qué ROI tuvo cada campaña?

**Flujo de atribución:**
```
Marketing crea campaña → estado Activa
        ↓
Tres caminos de entrada del lead:
  1. Webhook (api-prospectos) → campana_id asignado automáticamente
  2. Vendedor en formulario → selector "Campaña de origen" (solo Activas)
  3. Lead ya existente → asignar desde ficha del lead
        ↓
Conversión del lead → campana_id viaja a la Oportunidad
        ↓
Oportunidad ganada → ingreso atribuido a la campaña
        ↓
BI Comercial → tab "Por campaña" con métricas completas
```

**Estados de campaña:** Borrador → Activa → Pausada → Finalizada

**Tabla `campanas`:** id, empresa_id, nombre, tipo, canal, fecha_inicio, fecha_fin, presupuesto, moneda, estado, descripcion.

**Columnas añadidas:** `campana_id` en `leads` y `oportunidades` (nullable, FK con `ON DELETE SET NULL`).

**Métricas calculadas por campaña:**
| Métrica | Cálculo |
|---------|---------|
| Leads generados | leads WHERE campana_id = camp.id |
| Tasa de conversión | leads convertidos / leads totales |
| Ops ganadas | oportunidades WHERE campana_id = camp.id AND estado = 'ganada' |
| Ingreso atribuido | suma monto_estimado de ops ganadas |
| Costo por lead (CPL) | presupuesto / leads generados |
| Costo por venta | presupuesto / ops ganadas |
| ROI | (ingreso atribuido − presupuesto) / presupuesto × 100 |

**UI:** KPIs globales + tabla de campañas + panel lateral de crear/editar + ficha de campaña con lista de leads. Tab "Rendimiento por campaña" con cards individuales. BI Comercial añade tab "Por campaña" con barras comparativas y tabla de atribución.

---

### 8.35 IA — Módulos completos con historial auditado

**IA Comercial:** resumen de cliente/oportunidad, siguiente mejor acción, redacción asistida, clasificación de leads, predicción de cierre, recomendación de servicios.

**IA Operativa:** resumen de OT, borrador desde descripción libre, clasificación de tickets, detección de demoras, alertas de SLA. **Campo (F1):** extracción de datos de facturas con foto.

**IA Financiera:** desviaciones de costo, alerta de margen bajo, priorización de cobranza, explicación de variaciones.

**Historial auditado en cada módulo:** Fecha | Acción (badge) | Entidad | Recomendación (90 chars) | Acción tomada | Usuario.

**Regla:** La IA asiste, no aprueba. Toda acción de IA queda en `ia_logs`.

---

### 8.37 Soporte y Tickets

Kanban de cuatro columnas: **Abiertos → En Proceso → QC → Resueltos**. Creación con título, descripción, prioridad (crítica/alta/media/baja), tipo, canal de entrada, cliente y responsable. SLA calculado en base con semáforo ok/riesgo/vencido. Numeración correlativa por tenant (`TK-XXXX`). Adjuntos mediante `FileUpload` y tabla `adjuntos`. Panel de detalle editable en estado `abierto`.

**Sub-estados de QC:** cuando un ticket llega a la columna QC, el campo `qc_estado` expresa `en_revision` (sin badge), `observado` (badge naranja) o `aprobado` (badge verde). El botón "Mover a Resueltos" solo se habilita si `qc_estado = 'aprobado'`. Los tres sub-estados se controlan desde el panel de detalle del ticket.

**Hilo de resolución (append-only):** tabla `ticket_comentarios` registra cada entrada con `tipo ∈ {observacion, evidencia, aprobacion, reapertura}`, contenido, URLs de evidencia opcionales, snapshot del autor y timestamp. Se muestra como línea de tiempo vertical con ícono y color por tipo. Cualquier usuario con acceso al ticket puede agregar entradas; nadie puede editar ni borrar entradas pasadas.

**Reapertura formal:** botón "Reabrir ticket" visible solo en tickets `resueltos`. Exige motivo de reapertura obligatorio, registra una entrada `reapertura` en el hilo y devuelve el ticket a QC con `qc_estado = en_revision`. `fecha_resolucion` se limpia. `veces_reabierto` se incrementa y se muestra como indicador en la ficha. Vista Lista disponible sin cambios en esta iteración.

---

### 8.36 Vistas de Campo Móviles — PWA

Instalable desde el browser. Rutas mobile-first. Acceso a cámara. Sincronización offline básica. Solo con `acceso_campo = true`.

**Técnico:** OTs del día → GPS/geocerca al marcar asistencia o iniciar trabajo → checklist SSOMA → parte en 4 pasos (actividad / materiales / avance / fotos) → escaneo de código de barras → reportar restricción.

**Comprador:** foto → IA extrae (proveedor, número, fecha, monto, IGV) → confirmar → vincular a OT → queda "pendiente revisión backoffice".

**Vendedor:** ficha cliente con click-to-call → actividad post-reunión → lead desde tarjeta.

**Supervisor:** aprobar partes → mapa de OTs con semáforo SLA.

**Gerencia:** KPIs del día → aprobar cotizaciones.

**Empleado / Administrativo:** Mi portal y "Mi registro del día" → OTs asignadas (desde `participantes_admin`) con badge de horas ya registradas o botón "Registrar" → formulario 1-paso por OT (horas + descripción) → sección "Otras actividades" con líneas libres por CECO → botón "Enviar registro del día" (cambia estado a `enviado`; advierte si hay OTs sin registrar pero no bloquea). Solicitudes RRHH, constancias, boletas, firma/acuses y documentos propios incluidos en su menú de perfil.

**F2 pendiente:** confirmación de traslado y aprobación SOLPE móvil. La subida estructurada de comprobantes desde móvil debe alinearse con `FileUpload`/`adjuntos`; SSOMA y escaneo de código de barras ya están implementados.

### 8.38 Centros de Costo y de Beneficio

Módulo fundamental para la arquitectura de control presupuestal y Estado de Resultados consolidado.

**Centros de Costo (CECO):**
- **Propósito:** Agrupar y medir gastos/costos operativos. Responde a la pregunta "¿Dónde se gasta el dinero?".
- **Ejes de clasificación:**
  - `naturaleza_economica`: Puede ser `directo` (costos imputables a OTs/proyectos) o `indirecto` (gastos administrativos o generales).
  - `tipo` y `tipo_original`: Se soporta `linea_servicio`, `proyecto`, `producto`, `general`, etc. El `tipo_original` se captura en la creación y se mantiene inmutable por trigger (`aa_centros_costo_proteger_tipo_original`) como auditoría, aunque el `tipo` operativo varíe.

**Centros de Beneficio (CEBE):**
- **Propósito:** Agrupar ingresos y medir rentabilidad. Responde a la pregunta "¿Qué unidad de negocio genera los ingresos?".
- **Tratamiento de centros estructurales:** Existen tipos operativos (`cliente`, `proyecto`) y el tipo `estructural`. Un CEBE `estructural` no puede tener metas de ingresos (`meta_ingresos = 0` o NULL) ni estar vinculado a un cargo financiero, asumiendo su rol puramente organizativo (`validar_reglas_tipo_centro_beneficio`). El campo `es_facturable` se deriva automáticamente (`true` si es facturable, `false` si es estructural/temporal).

**Dimensión Societaria y Relación CECO-CEBE:**
- **Unicidad:** La clave lógica de ambos catálogos no es por tenant, sino por sociedad (`empresa_id, codigo, sociedad_id`).
- **Coherencia Societaria:** La asignación de un CECO a un CEBE padre es opcional, pero si se realiza, el trigger `aa_centros_costo_validar_cebe_sociedad` impone una barrera infranqueable: el CECO y el CEBE deben pertenecer obligatoriamente a la misma sociedad. No existen relaciones trans-sociedad.
- **Participación en ER:** Los CECOs acumulan gastos contra el presupuesto, mientras que los CEBEs agrupan ingresos; el Estado de Resultados consolidado se arma cruzando gastos societarios contra los CEBEs relacionados.

**Eliminación y Vigencia:**
- Los centros no pueden eliminarse ciegamente si tienen transacciones (OTs, SOLPEs, compras). La eliminación segura invoca a la función `contar_referencias_centro()` para rechazar el borrado en caso de integridad referencial.

---

## 9. Modelo de datos multitenant

### 9.1 Tablas de plataforma (sin empresa_id)
```
empresas, planes, monedas, paises, zonas_horarias, versiones_plataforma
```

### 9.2 Tablas de acceso y permisos
```
usuarios, usuarios_empresas (rol_id, acceso_campo, perfil_campo, jefe_user_id),
roles (categoria, nivel_jerarquico, es_superadmin, es_admin_empresa),
permisos_roles (9 acciones por pantalla), permisos_especiales,
usuarios_asignaciones (empresa_id, user_id, rol_id, categoria, nivel_jerarquico,
  jefe_user_id, alcance_tipo, alcance_id, principal, activo, fecha_inicio, fecha_fin),
superadmin_accesos (log append-only cross-tenant), auditoria
```

**Funciones RLS clave:**
- `usuario_tiene_empresa(empresa_id)` — membresía activa en el tenant (o bypass superadmin plataforma)
- `usuario_puede(empresa_id, pantalla, accion)` — permiso funcional granular
- `usuario_es_admin_empresa(empresa_id)` — es_admin_empresa del rol del usuario
- `usuario_es_superadmin_plataforma()` — usuario en tenant con `es_plataforma = true`
- `usuario_alcance_jerarquico(empresa_id)` → `'tenant' | 'equipo' | 'propio'` según nivel jerárquico
- `usuario_puede_ver_usuario(empresa_id, target_user_id)` — visibilidad jerárquica recursiva por jefe funcional
- `usuario_puede_ver_registro(empresa_id, owner_user_id, categoria, alcance_tipo, alcance_id)` — visibilidad de registros combinando jerarquía + alcance funcional

### 9.3 Tablas de negocio (todas con empresa_id)

**CRM:** cuentas (+agente_retencion_sunat, tasa_retencion_sunat), contactos, relacion_cuenta_contacto, leads (+campana_id), oportunidades (+campana_id), campanas, etapas_pipeline, actividades_comerciales, health_score_cliente, lead_historial_estados (append-only, cargada en boot desde Supabase), opp_historial_etapas (id, empresa_id, opp_id, cuenta_id, etapa_desde, etapa_hasta, usuario, creado_en - aplicada en Supabase).

**Integraciones:** api_keys (empresa_id, key_hash, descripcion, permisos text[], activo, creado_por, ultimo_uso_en).

**Comercial:** hojas_costeo (con secciones jsonb: mano_obra, materiales, servicios_terceros, logistica + totales calculados + margen_objetivo_pct + responsable_costeo + cotizacion_id), cotizaciones (+ hoja_costeo_id para trazabilidad), historial_versiones_cotizacion, os_clientes, condiciones_comerciales, series_documentarias, diccionario_comercial.

**Operaciones:** backlog, ordenes_trabajo (+ubicacion_gps, direccion_ejecucion, +participantes_admin jsonb — array de participantes administrativos con personal_id, personal_nombre, horas_estimadas, +real_detalle jsonb para desglose manual de costos reales, +avance_supervisor_pct/+avance_supervisor_nota/+avance_supervisor_en/+avance_supervisor_por para avance global declarado), partes_diarios (+logistica_lineas, terceros_lineas, tecnico_nombre, +tarea_id, +avance_tarea_reportado, +avance_tarea_validado), ot_tareas (tareas estructuradas por OT con responsable operativo/administrativo, estado, horas estimadas/reales, avance_pct y cierre explicito), ot_avance_historial (trazabilidad de cambios de avance global por supervisor), tickets (id uuid, empresa_id, numero TK por tenant, titulo, descripcion, tipo, canal_entrada, estado, prioridad, cuenta_id/cuenta_nombre, responsable_id/responsable_nombre, fecha_limite_sla, sla_estado calculado, fecha_resolucion, **qc_estado** ∈ {en_revision, observado, aprobado} nullable, **veces_reabierto** integer default 0, **reabierto_en** timestamptz nullable, creado_por, creado_en, actualizado_en), ticket_comentarios (id uuid, empresa_id, **ticket_id** FK→tickets, **tipo** ∈ {observacion, evidencia, aprobacion, reapertura}, **contenido** text, **imagen_url** text nullable — URL pública en bucket `ticket-evidencias`, **usuario_id** uuid nullable, **usuario_nombre** text, creado_en — append-only: INSERT permitido, UPDATE/DELETE prohibidos por RLS), sla_plantillas, evidencias, conformidad_cliente, remisiones, valorizaciones.

**Inventario y compras:** almacenes, stock, movimientos_inventario, kardex, inventario_conteos (empresa_id, código, tipo total/cíclico, almacén/zona, estado `abierto`/`en_proceso`/`cerrado`, items JSONB con stock teórico, físico, diferencia, lote/serie/vencimiento, ajustes_generados), solpe_interna (+items jsonb, solicitante_user_id, ot_id), proveedores (+codigo, nombre_comercial, tipo, categoria, ubicacion, contacto principal, condicion_pago, moneda, retencion/homologacion), documentos_proveedor, evaluaciones_proveedor, contactos_proveedor, procesos_compra, ordenes_compra (+lead_time_dias, fecha_entrega_comprometida, condicion_pago, solpe_id/origen), ordenes_servicio_interna (+condicion_pago), recepciones (+matching_3vias), vista_precio_historico_proveedor, devoluciones_proveedor, devoluciones_proveedor_lineas, conformidad_proveedor, traslados_logisticos. Materiales incluyen `stock_seguridad`, `punto_reorden`, `stock_maximo` y generación automática de SOLPE de reorden.

**Transporte y guías (migración 211):** `correlativos_documentos` (serie+número por empresa+tipo_documento), `transportistas` (+ruc, razon_social, nro_mtc), `vehiculos_transporte` (+placa, tipo, nro_certificado_habilitacion), `conductores_transporte` (+dni, brevete, categoria_brevete, vigencia_brevete), `catalogo_venta` (bienes comercializables, precio_lista PEN/USD, vinculado a materiales), `ordenes_venta` (+moneda, condicion_pago, subtotal/igv/total, estados: pendiente→confirmada→parcialmente_despachada→despachada→facturada→anulada — **estado se actualiza automáticamente al confirmar entrega de guía vinculada**), `ordenes_venta_lineas` (+precio_unitario_usd, descuento_pct, precio_neto, **cantidad_despachada** — se incrementa al confirmar entrega y se revierte al anular guía), `guias_remision` (correlativo serie/numero/numero_completo SUNAT T001-XXXXXXXX; tipo_origen ∈ {traslado_interno,despacho_venta,despacho_servicio}; motivo_traslado código SUNAT; modalidad ∈ {remitente,transportista}; campos SUNAT obligatorios: partida/llegada dirección+ubigeo, destinatario_ruc_dni+razon_social, peso_bruto_total+unidad_peso, transportista_ruc+razon_social+nro_mtc, vehiculo_placa+cert_habilitacion, conductor_nombre+dni+brevete; `kardex_salida_ids` jsonb para reversión WMS; OSE_FUTURE: xml_hash, cdr_url, qr_data anotados en comentario; estados: borrador→emitida→en_transito→entregada→anulada; no-borrado), `guias_remision_lineas` (+peso_unitario, peso_total, precio_unitario referencial, moneda).

**RRHH:** personal_operativo (+turno_id, sueldo_base, sistema_pensionario, afp_nombre, tiene_hijos, regimen_laboral, cuota_prestamo_mes, descuento_judicial, **regimen_jornada** ∈ {general,minero_14x7,minero_20x10,minero_28x14}, **horas_diarias_pactadas**, **fecha_inicio_ciclo**, **bonif_altitud**, **tipo_comision_afp** ∈ {flujo,mixta}, **pct_comision_afp_flujo**, ruc_colaborador, retencion_ir, suspension_retenciones, vencimiento_suspension, metodo_pago ∈ {mensual,por_horas}, monto_mensual, horas_base_mes, tarifa_hora), personal_administrativo (+turno_id, remuneracion, sistema_pensionario, afp_nombre, tiene_hijos, regimen_laboral, cuota_prestamo_mes, descuento_judicial, suspension_retenciones, vencimiento_suspension, ruc_colaborador, retencion_ir, **regimen_jornada**, **horas_diarias_pactadas**, **fecha_inicio_ciclo**, **bonif_altitud**, **tipo_comision_afp**, **pct_comision_afp_flujo**, metodo_pago, monto_mensual, horas_base_mes, tarifa_hora), empresa_config (+**regimen_laboral_empresa** ∈ {general,pequena_empresa,microempresa}, **frecuencia_pago** ∈ {mensual,quincenal}, **dia_corte_mensual**, **dia_pago_mensual**, **dia_corte_q1**, **dia_pago_q1**, **dia_corte_q2**, **dia_pago_q2**, **pct_quincena_1**, **uit_vigente**, **rmv_vigente**, **ram_tope_afp**, **pct_prima_seguro**, **eval_peso_autoevaluacion**, **eval_peso_jefe**, **eval_peso_competencias**, **eval_peso_objetivos**, **eval_escala_min**, **eval_escala_max**, **eval_escala_labels**, condicion_pago_defecto), turnos, registros_asistencia (+solicitud_rrhh_id, regimen_jornada, ciclo_minero_id), asistencia_ciclos_mineros (id, empresa_id, personal_id, personal_nombre, personal_tipo, regimen_jornada, fecha_inicio_ciclo, fecha_fin_ciclo, dias_ciclo_trabajo, dias_ciclo_descanso, estado_ciclo, incidencias jsonb, horas_extra_ciclo), personal_documentos (id, empresa_id, personal_id, personal_tipo, tipo_doc, nombre_archivo, archivo_url, bucket, fecha_emision, fecha_vencimiento, version, activo, estado_validacion, motivo_rechazo, notas, subido_por, subido_desde, revisado_por, revisado_en, creado_en), tareos_admin (id, empresa_id, personal_id FK→personal_administrativo, personal_nombre, fecha, horas decimal, descripcion, tipo ∈ {ot,libre}, ot_id nullable FK→ordenes_trabajo, ceco_id nullable FK→centros_costo, ceco_nombre, estado ∈ {borrador,enviado}, origen ∈ {mobile,backoffice}, creado_por, creado_en, actualizado_en), **periodos_nomina** (id, empresa_id, anio, mes, quincena nullable ∈ {1,2}, periodo text, fecha_corte, fecha_pago, estado ∈ {abierto,en_proceso,cerrado,anulado}, total_trabajadores, masa_salarial_bruta, total_neto, total_cargas_empresa, cerrado_por, cerrado_en; índice único empresa+anio+mes+quincena), **nomina_detalle** (id, empresa_id, periodo_id FK, trabajador_id, trabajador_tipo, regimen_jornada_snap, regimen_empresa_snap, dias_laborables, dias_laborados, dias_computables, horas_extra_tramo1_min, horas_extra_tramo2_min, sueldo_base, remuneracion_bruta, asignacion_familiar, add_horas_extra, bonif_altitud, otros_ingresos, desc_faltas, desc_tardanzas, aporte_afp, comision_afp_flujo, prima_seguro_afp, desc_onp, retencion_ir, desc_prestamo, desc_anticipo, desc_judicial, total_descuentos, neto, essalud, cts_mensualizado, tiene_cts, gratificacion_mensualizada, bonif_extraordinaria, tiene_gratificacion, vacaciones_mensualizadas, total_cargas, costo_real_empresa, es_quincena, quincena, pct_quincena_aplicado), prestamos_personal (trabajador_id, trabajador_tipo, empleado, monto, cuotas, cuota_mensual, cuotas_pagadas, saldo, descontar_nomina, estado, fecha_otorgamiento, notas), prestamo_pagos (id, empresa_id, prestamo_id, fecha, monto, concepto, periodo_id, created_by, created_at), recibos_honorarios (id, empresa_id, vendedor_id, vendedor_nombre, vendedor_ruc, periodo, comisiones_ids, monto_bruto, retencion_ir, monto_neto, estado, creado_en, moneda, personal_id, motivo_retencion, numero_rhe, moneda_cxp), solicitudes_rrhh (id, empresa_id, personal_id, personal_nombre, personal_tipo, aprobador_id, aprobador_nombre, tipo, fecha_inicio, fecha_fin, dias_habiles, motivo, documento_url, requiere_documento, estado, comentario_jefe, comentario_rrhh, motivo_anulacion, fecha_aprobacion_jefe, fecha_confirmacion, confirmado_por, impacto_nomina, dias_a_descontar, registrado_desde, creado_por, creado_en, actualizado_en), solicitudes_rrhh_historial (id, solicitud_id, empresa_id, estado_desde, estado_hasta, comentario, usuario, creado_en), rrhh_config_ausencias (empresa_id, dias_vacaciones_anio, max_dias_permiso_goce, dias_licencia_empresa, pct_max_equipo_ausente), desempeno_plantillas (empresa_id, nombre, descripcion, periodo, estado, pesos auto/jefe y competencias/objetivos, fechas, creado_por), desempeno_competencias (empresa_id, plantilla_id, nombre, descripcion, escala_min, escala_max, orden), desempeno_objetivos (empresa_id, plantilla_id, nombre, descripcion, unidad_medida, meta_numerica, orden), desempeno_evaluaciones (empresa_id, plantilla_id, evaluado snapshot, jefe snapshot, estado, score_autoevaluacion, score_jefe, score_final, comentario_final_jefe), desempeno_respuestas_competencias (empresa_id, evaluacion_id, competencia_id, tipo_evaluador, puntaje, comentario, respondido_por), desempeno_respuestas_objetivos (empresa_id, evaluacion_id, objetivo_id, tipo_evaluador, resultado_real, porcentaje_cumplimiento, comentario, respondido_por). **personal_asignaciones_jornada** (id text PK, empresa_id, personal_id, personal_tipo ∈ {operativo,administrativo}, tipo_tramo ∈ {normal,suspension_perfecta}, fecha_inicio date, fecha_fin date nullable — null = vigente, regimen_jornada ∈ {general,ciclo_acumulativo} nullable — null para suspension_perfecta, dias_ciclo_trabajo integer, dias_ciclo_descanso integer, fecha_inicio_ciclo date, turno_id FK→turnos, motivo, created_at; RLS por `usuario_tiene_empresa(empresa_id)`; RPC `crear_asignacion_jornada` cierra la vigente anterior y crea la nueva en una transacción; migración 206). **Campos agregados en personal_operativo y personal_administrativo (migr. 152/223):** fecha_ingreso date, estado_laboral ∈ {activo,cesado} default activo, fecha_cese date nullable, tipo_cese ∈ {renuncia_voluntaria,despido_arbitrario,mutuo_acuerdo,vencimiento_contrato,fallecimiento,falta_grave} nullable. **liquidaciones_cese** (id uuid, empresa_id, personal_id text, personal_nombre, personal_tipo ∈ {operativo,administrativo}, tipo_cese, fecha_cese date, fecha_ingreso date, anios/meses/dias_servicio, remuneracion_computable, monto_total, estado ∈ {borrador,calculada,confirmada,anulada}, observaciones, motivo_anulacion, beneficiario_nombre, beneficiario_dni, cxp_id uuid FK→cxp, parametros_calculo jsonb, creado/confirmado/anulado_por, *_en timestamps; índice único (empresa_id, personal_id) where estado <> 'anulada'). **liquidaciones_cese_conceptos** (id uuid, empresa_id, liquidacion_id FK, concepto ∈ {remuneracion_pendiente,vacaciones_truncas,cts_proporcional,gratificacion_proporcional,indemnizacion,otros}, descripcion, descripcion_calculo text —fórmula legible—, monto, aplica boolean, motivo_no_aplica, es_descuento boolean, orden).

**RRHH olas 2–5:** `personal_operativo` y `personal_administrativo` agregan datos bancarios, bloqueo por cese, contrato/duración, fecha fin contrato, flags de no recontratar/falta grave, `codigo_biometrico`, `celular_whatsapp`, `whatsapp_opt_in`, campos de ubicación móvil y geofence. Nuevas tablas: `autorizaciones_horas_extra`, `horas_extra_compensacion`, `descuentos_extraordinarios`, `amonestaciones_personal`, `validaciones_honorarios_periodo`, `roster_minero_snapshots`, `asistencia_biometrico_perfiles`, `asistencia_biometrico_lotes`, `rrhh_geocercas`, `rrhh_geocerca_asignaciones`, `rrhh_ubicacion_consentimientos`. Funciones/RPCs relevantes: `anular_lote_biometrico`, `geo_distancia_m`, `validar_geofence_asistencia`, `aplicar_geofence_registro`, `evaluar_sar_no_llegada`.

**Reclutamiento y portal empleado:** `rrhh_vacantes`, `rrhh_candidatos`, `rrhh_candidaturas`, `rrhh_candidatura_historial`, `portal_datos_solicitudes`, `portal_constancias_trabajo`, `portal_boletas_electronicas`, `portal_boleta_acuses`, `portal_boleta_visualizaciones`, `portal_firma_otp_intentos`, `portal_contrato_firma_registros`. Funciones: `mover_candidatura_rrhh`, `resolver_mi_personal_rrhh`, `es_mi_personal_rrhh`, `portal_campo_datos_permitido`, `portal_prevent_append_only_changes`.

**Notificaciones in-app y WhatsApp:** `notificaciones_sistema` (empresa_id, user_id, texto legacy, leida, created_at, tipo, titulo, mensaje, referencia_tipo, referencia_id, referencia_payload, prioridad, creada_en). Para alertas documentarias usa `tipo` `doc_por_vencer`/`doc_vencido`, `referencia_tipo = personal_documento`, prioridad media/alta e idempotencia por usuario+tipo+referencia en ventana diaria. WhatsApp usa `whatsapp_plantillas`, `whatsapp_matriz_destinatarios` y `whatsapp_envios`; el trigger `trg_whatsapp_enqueue_notificacion` encola envíos desde notificaciones según configuración de empresa (`whatsapp_habilitado`, proveedor, opt-in y reintentos).

**Financiamiento:** financiamientos, tabla_amortizacion, pagos_financiamiento.

**Finanzas:** costos_ot, ventas (id, empresa_id, numero, anio, correlativo, fecha, cuenta_id, cliente_nombre_snapshot, concepto, monto_total, moneda, estado, **condicion_pago** ∈ {contado,credito} default contado, **dias_credito** integer nullable, **fecha_vencimiento** date nullable, **cxc_id** uuid nullable FK→cxc, **origen_factura_id** uuid nullable FK→facturas, creado_por, creado_en, actualizado_en), comprasGastos (+origen_registro, centro_costo_id, estado_pago, referencia_pago, cxp_id, periodo_nomina_id, personal_id, ot_vinc_id, es_activo_fijo, activo_tipo, vida_util_anos, **numero_serie** text, activo_estado), activos (+**compras_gasto_id** text FK→compras_gastos), caja_chica (id, empresa_id, fecha, concepto, monto, moneda, responsable_id/nombre, ceco_id, categoria, num_comprobante, comprobante_url, estado, origen_registro, gasto_id), oc_anticipos, anticipos, facturas (+concepto, condicion_pago, archivo_url, subtotal, igv, archivo_pdf_url, archivo_zip_url, aplica_retencion, monto_retencion, monto_neto_cobrable), cxc (+concepto, moneda, monto_retencion), cobranzas, cxp (id, empresa_id, proveedor_id, factura_numero, factura_imagen_url, fecha_emision, fecha_vencimiento, monto_total, monto_pagado, saldo, moneda, estado, created_at, updated_at, tipo_beneficiario, personal_id, recibo_honorarios_id, concepto, gasto_id, recepcion_id, origen, tipo_comprobante, archivo_factura_url, archivo_constancia_url, ruc_emisor, nombre_emisor, monto_bruto, retencion_ir, motivo_cxp, ot_vinc_id, nc_id, tipo_cambio, moneda_original, monto_original, categoria_er, centro_costo_id), cxp_pagos, pagos, flujo_caja.

**Presupuestos y Pagos:**
- `cxp_pagos` (id, empresa_id, cxp_id, fecha_pago, monto, cuenta_bancaria, referencia, registrado_por, creado_en)
- `presupuestos` (id, empresa_id, nombre, periodo, centro_costo_id, cebe_id, estado, creado_por, creado_en, actualizado_en)
- `presupuesto_partidas` (id, empresa_id, presupuesto_id, categoria, descripcion, monto_presupuestado, moneda, orden)
- `presupuesto_aprobaciones` (id, empresa_id, presupuesto_id, orden, aprobador_id, nombre_aprobador, estado, fecha_accion, comentario)

**Customer Success:** onboardings, planes_exito, health_scores, churn_planes, renovaciones, nps_encuestas, referidos, casos_exito.

**IA:** ia_logs.

**Maestros:** servicios, familias_servicios, tarifarios, materiales (+codigo_barras, grupo_id, familia_id, subfamilia_id, nro_parte, unidades_contenidas, almacen_id, ubicacion, observacion, precio_unitario), material_grupos, material_familias, material_subfamilias, especialidades_tecnicas, tipos_servicio_interno, tipos_contrato, almacenes/almacenes_depositos (según módulo), centros_costo (+sociedad_id, naturaleza_economica, tipo_original, inmutabilidad garantizada por trigger), centros_beneficio (+sociedad_id, tipo ∈ {estructural, etc.}, cargo_financiero_dbs, es_facturable), sedes, industrias, proyectos, monedas_impuestos_unidades, empresa_config (+agente_retencion).

### 9.4 Infraestructura de Storage

**Buckets activos:**

| Bucket | Propósito | Visibilidad | Límite |
|--------|-----------|-------------|--------|
| `empresa-assets` | Logo y firma corporativa por tenant | Público | Sin límite configurado |
| `logos-cuentas` | Logos de cuentas/clientes | Público | 2 MB |
| `cotizaciones-sustento` | Sustentos de aprobación de cotizaciones | Público | 10 MB |
| `conformidades-ot` | Conformidades y evidencias de OT | Público | 10 MB |
| `documentos-privados` | Documentos sensibles internos: personal, nómina, contratos, recibos | Privado, vía signed URL | 20 MB |
| `documentos-generales` | Adjuntos operativos: tickets, gastos, recepciones, documentos de proveedor | Público | 20 MB |
| `ticket-evidencias` | Imágenes de evidencia adjuntas al hilo de resolución de tickets | Público | 10 MB |

**Ruta de `ticket-evidencias`:** `{empresa_id}/{ticket_id}/{timestamp}_{nombre_archivo}`. El upload lo ejecuta directamente `ticketsService.subirImagenEvidencia`, no pasa por `storageService.js` ya que la URL resultante se guarda en `ticket_comentarios.imagen_url` y no en la tabla `adjuntos`.

**Tabla central:** `adjuntos` registra `id`, `empresa_id`, `entidad_tipo`, `entidad_id`, `categoria`, `nombre_original`, `bucket`, `storage_path`, `url`, `mime_type`, `tamano_bytes`, `descripcion`, `subido_por`, `subido_en`, `actualizado_en`. RLS usa `usuario_tiene_empresa(empresa_id)`.

**Ruta estándar:** `{empresa_id}/{entidad_tipo}/{entidad_id}/{uuid}`. El nombre legible del archivo se guarda en `adjuntos.nombre_original`, no en la ruta.

**Regla de acceso:** todo acceso nuevo a Supabase Storage pasa por `src/services/storageService.js`; los módulos no llaman `supabase.storage` directamente.

**Mapeo inicial de entidad_tipo:** `tickets`, `documentos_proveedor`, `compras_gastos`, `recepciones`, `movimientos_tesoreria`, `pagos_financiamiento` y `tabla_amortizacion` usan `documentos-generales`; `personal_administrativo`, `personal_operativo`, `recibos_honorarios`, `periodos_nomina`, `detalle_nomina` y `cxp` usan `documentos-privados`; `cuentas`, `empresa_config`, `cotizaciones`, `cierres_tecnicos`, `partes_diarios` y `ordenes_trabajo` conservan sus buckets especializados existentes.

**Modo mock:** `storageService.js` simula subidas exitosas con datos coherentes, no llama Supabase, y las lecturas devuelven arrays vacíos.

---

## 10. Reglas transversales

### 10.1 Tenancy
Todo `empresa_id` implícito. RLS en base de datos. Sin acceso cruzado entre tenants. Superadmin con log de auditoría.

**Signed URLs privadas:** para `documentos-privados`, las URLs firmadas se emiten por 600 segundos. El previsualizador de documentos de personal genera una URL fresca al abrir, renueva a los 8 minutos si sigue activo y el botón Descargar vuelve a solicitar URL fresca en el momento del clic. Las URLs vencidas deben fallar por diseño.

### 10.1b WMS Inventario
Los conteos físicos cerrados son inmutables: una corrección requiere crear un nuevo conteo y nunca editar el cerrado. Los ajustes generados por cierre llevan motivo `ajuste_conteo` y referencia al conteo origen. El análisis ABC se calcula sobre salidas valorizadas del período seleccionado, no sobre stock actual; rotación usa salidas del período contra stock promedio estimado; stock muerto usa el patrón `dias_sin_actividad` con umbral configurable.

### 10.2 Roles y permisos
Sin permiso "Ver" → pantalla no aparece en sidebar. Permisos de costos/precios/finanzas independientes. Sin `acceso_campo` → no accede a PWA. Rol Admin no eliminable si es el único activo.

**Pantalla `tareo_admin`** (módulo RRHH): acciones `ver`, `crear`, `editar`. Ver habilita la vista desktop de consulta/reporte. Crear permite a supervisores/RRHH corregir tareos via backoffice. Asignar a roles de RRHH y supervisores según política de cada tenant.

**Jerarquia transversal:** cada rol tiene `categoria` (admin, comercial, operaciones, finanzas, RRHH, compras, logistica, customer_success u otro) y `nivel_jerarquico` (direccion, jefatura, supervisor, asesor, operativo o soporte). Cada usuario puede tener `jefe_user_id` como jefe directo dentro del tenant. Direccion/admin ve todo el tenant; jefatura y supervisores ven su equipo recursivo; asesores/operativos ven solo sus propios movimientos. Esta regla aplica a toda la plataforma, no solo al area comercial.

**Modelo World Class de asignaciones (migración 070):** el cargo laboral no define permisos. El usuario pertenece al tenant en `usuarios_empresas`; el rol define permisos; y `usuarios_asignaciones` define donde aplica ese rol. La asignacion principal se crea automaticamente desde el rol principal (trigger `trg_usuarios_empresas_sync_asignacion_principal`) para mantener simple la experiencia. Las asignaciones adicionales son opcionales y permiten estructuras matriciales: una persona puede operar en Comercial y Proyectos, o Finanzas y Operaciones, con jefe funcional y alcance por tenant, area, equipo, sede, proyecto o centro de costo.

**Alcances válidos en `usuarios_asignaciones.alcance_tipo`:** `tenant` (todo el tenant), `area`, `equipo`, `sede`, `proyecto`, `centro_costo`, `custom`.

**Regla de visibilidad por `usuario_alcance_jerarquico`:** la función devuelve `'tenant'` si el usuario tiene rol dirección/admin; `'equipo'` si tiene jefatura/supervisor; `'propio'` en cualquier otro caso. Toda RLS que dependa de jerarquía debe llamar a esta función en lugar de comparar `nivel_jerarquico` directamente, para que la sincronización con `usuarios_asignaciones` sea la fuente de verdad.

**Sincronización bidireccional:** `usuarios_empresas` sigue siendo la membresía oficial. El trigger `trg_usuarios_empresas_sync_asignacion_principal` crea/actualiza/desactiva la asignación principal en `usuarios_asignaciones` cuando cambia el rol o el estado del usuario en `usuarios_empresas`. El backfill de la migración 070 copia todos los usuarios activos existentes.

### 10.3 CRM y comercial
*   **Reglas de Automatización de Etapas del Pipeline:**
    *   **Propuesta:** Se cambia automáticamente al enviar al menos una cotización al cliente.
    *   **Negociación:** Se cambia automáticamente al generar una nueva versión (v2 o superior) de una cotización ya existente.
    *   **Ganada:** Se cambia automáticamente al aprobarse la cotización (ya sea de forma digital o manual), lo que activa la opción de crear la OS Cliente correspondiente.
    *   **Perdida:** Es la única transición netamente manual y requiere obligatoriamente que el usuario ingrese un motivo de pérdida detallado.
*   Lead requiere fuente y responsable. OT facturable requiere OS Cliente. Descuento sobre límite requiere aprobación. No duplicar facturación por el mismo alcance.
*   Cliente agente de retención SUNAT: la cuenta guarda `agente_retencion_sunat` y `tasa_retencion_sunat`; al facturar, la retención se copia a factura y CxC como snapshot. La retención reduce el neto cobrable, pero no se clasifica como gasto.

### 10.4 Compras
Solo proveedores homologados en selectores de OC. Bloqueados no aparecen. Toda recepción actualiza: OC + inventario (si bien) + CxP + evaluación proveedor.

Las CxP que representan gasto pueden devengarse en `compras_gastos` para alimentar ER. El sistema evita duplicar devengos cuando la CxP ya tiene `gasto_id`, `recepcion_id`, `no_devengar_er` o está anulada.

### 10.5 RRHH y nómina
Nómina ≠ costo de OT. Son dos mediciones independientes. Solo los **intereses** de financiamiento son gasto financiero en ER. El capital reduce el pasivo. Préstamos al personal ≠ financiamiento recibido.

**Cese de colaboradores:** Al confirmar una liquidación por cese, el campo `estado_laboral` del colaborador (en `personal_operativo` o `personal_administrativo`) cambia a `cesado` y se registran `fecha_cese` y `tipo_cese` en su ficha. El colaborador desaparece de todos los selectores de personal activo del sistema (Planner, Partes Diarios, Nómina, Solicitudes RRHH, etc.). La CxP generada queda en estado `pendiente` para que Finanzas la gestione. Anular una liquidación confirmada revierte el estado del colaborador a `activo` y anula la CxP con nota de motivo.

**Comisiones y RHE (Impuestos):** Las comisiones liquidadas por RHE se gravan con retención de IR de 4ta categoría (8% por defecto) si la empresa es agente de retención (`agente_retencion = true`), el recibo supera el umbral de S/ 1,500 en PEN (calculado con `tipo_cambio_referencial` en cobros en USD) y el colaborador no tiene suspensión de retenciones activa. Toda liquidación de RHE confirmada genera automáticamente una CxP de tipo `personal` para el colaborador.

**Tarifa hora:** Para costeo operativo, el campo vigente es `tarifa_hora` calculado por trigger desde `monto_mensual / horas_base_mes`. Los campos `costo_hora_real`, `costo` y `costo_hora` solo son fallback legacy.

**Documentos de personal:** Los documentos no se eliminan. Al subir una nueva versión, la versión anterior queda `activo = false`. RRHH valida o rechaza el documento; el vencimiento se calcula por fecha y alimenta alertas.

**Notificaciones documentarias:** El proceso diario `generar_notificaciones_documentarias(empresa_id opcional)` lee exclusivamente `calcular_habilitaciones_personal`, filtra `por_vencer` y `vencido`, notifica a todos los administradores/RRHH del tenant y al colaborador si tiene `auth_user_id` activo, registra auditoria en `notificaciones_documentarias_log` y evita duplicados si ya existe una notificacion no leida del mismo tipo/referencia en las ultimas 20 horas. Si `pg_cron` esta disponible, el job `notificaciones-documentarias-diarias` queda programado a las 07:00 PE.

**Asistencia minera:** Los ciclos mineros generan registros diarios vinculados por `ciclo_minero_id`. Estos registros conviven con asistencia general y sirven para cálculo operativo/nómina.

**Asignaciones de jornada con vigencia (migr. 206):** La jornada de un trabajador puede cambiar a lo largo del tiempo. El historial se persiste en `personal_asignaciones_jornada`; la asignación vigente tiene `fecha_fin IS NULL`. Al registrar una nueva asignación, el RPC cierra la vigente automáticamente (`fecha_fin = p_fecha_inicio - 1`). El motor de nómina `calcularNominaConTramos` segmenta el mes si detecta varias asignaciones en el período: cada tramo calcula su remuneración proporcionalmente, pero los beneficios de ley (CTS, gratificación, vacaciones) se calculan sobre la base computable mensual total. `fecha_ingreso` del trabajador nunca se modifica al crear asignaciones. `suspension_perfecta` = sin pago, relación laboral activa; standby remunerado = tramo normal con régimen general.

**Biométrico y geofencing:** Lotes biométricos nunca se borran: se anulan vía RPC y se revierten sus marcas asociadas. Geofencing puede operar en modo flexible (registra y etiqueta fuera de perímetro) o estricto (rechaza marca fuera de perímetro). Si la empresa requiere consentimiento, la PWA debe registrarlo antes de capturar ubicación.

**WhatsApp RRHH:** Alertas WhatsApp se generan desde `notificaciones_sistema`; credenciales y proveedor se configuran por tenant, nunca hardcodeadas en frontend. El opt-in del colaborador controla envíos externos cuando la matriz de destinatarios lo exige.

**Activos para PDF:** Para la emisión de PDFs de cotizaciones, facturas, valorizaciones y boletas, la empresa puede cargar su `logo_url` y `firma_url` en `empresa_config`. Estos archivos se almacenan de manera pública en el bucket `empresa-assets` para garantizar su renderización correcta en los generadores de PDF del servidor y del cliente.

### 10.6 Campo
`origen_registro = campo` en todo registro de campo. GPS/geofencing automático al marcar asistencia o iniciar parte. La cola offline de geolocalización se sincroniza al recuperar conectividad y conserva resultado local de geocerca. Gasto de campo queda "pendiente revisión backoffice". Datos IA en `datos_extraidos_ia` para auditoría.

### 10.7 Auditoría
No eliminar → anular con motivo y usuario. Modificaciones críticas registran valor anterior, nuevo, fecha, IP. IA logs registran todas las acciones por recomendación de IA.

### 10.8 Transporte y Guías de Remisión

**No-borrado:** guías de remisión y OVs se anulan con motivo obligatorio, nunca se eliminan. Anulación de guía revierte movimientos WMS (`kardex_salida_ids` → `anularMovimiento` por cada id).\
**Correlativo SUNAT:** por `(empresa_id, tipo_documento, serie)` — nunca global. Formato T001-00000001. Lectura-antes-de-upsert atómico (tabla `correlativos_documentos`).\
**Validación bloquea emisión:** `emitirGuia()` valida todos los campos obligatorios SUNAT; lanza error descriptivo si falta alguno — no hay fallback silencioso.\
**Integración WMS:** `confirmarEntrega` llama `registrarMovimiento(tipo:'salida', motivo:'despacho_guia')` con CPP. `confirmarOrdenVenta` llama `reservarStock` por línea. `anularOrdenVenta` llama `liberarReserva`.\
**Sincronización OV↔Guía:** `confirmarEntrega()` actualiza `cantidad_despachada` en cada línea de OV vinculada (match por `material_id`) y recalcula estado OV: todas completas → `despachada`; alguna parcial → `parcialmente_despachada`; ninguna → `confirmada`. `anularGuia()` revierte la misma cantidad (solo si la guía estaba en estado `entregada`). Traslados internos y despachos de servicio no tocan ninguna OV.\
**Recepción de OC — sin SKU temporal:** ninguna recepción de OC genera código `CMP-{timestamp}`. En modo Supabase, `registrarEntradaDesdeRecepcion` busca el material en el catálogo por `codigo`; si no existe, lo crea limpio con `descripcion` y `unidad` reales. `codigo` y `material_id` del item de OC se propagan a través de `itemsRecibidos` en `context.jsx`. En modo mock, el SKU usa `item.codigo` si está disponible.\
**Stock en tránsito:** guías en estado `en_transito` implican stock físico en tránsito; se puede hacer visible como categoría separada filtrando `guias_remision.estado = 'en_transito'` por almacén origen.\
**OSE/firma electrónica:** campos `xml_hash`, `cdr_url`, `cdr_estado`, `qr_data` reservados en comentario `OSE_FUTURE` en la migración y en el PDF. No implementados hasta integración con proveedor OSE.\
**Monedas paralelas:** `guias_remision_lineas.precio_unitario` referencial en PEN; OVs tienen `subtotal_usd`/`total_usd` paralelos para trazabilidad bimoneda.

### 10.9 Capitalización de activos fijos
**Regla fundamental:** la compra de un activo fijo **no es un gasto del Estado de Resultados**. Es una capitalización: el dinero sale de Tesorería (CxP normal), pero el valor no aparece como gasto del período. Lo que sí aparece mensualmente es la **depreciación**, calculada desde el maestro de Activos Fijos.

**Mecanismo:**
- Las categorías ER con `es_capitalizacion = true` (ej. "Inversiones / Activos") marcan los egresos que no fluyen al ER como gasto.
- El wizard de Compras/Gastos detecta el flag y solicita: tipo de activo, número de serie/placa, vida útil en años.
- El egreso se guarda en `compras_gastos` con `es_activo_fijo = true`; el Estado de Resultados lo excluye vía `!g.es_activo_fijo`.
- El egreso aparece en el tab "Desde Compras/Gastos" de Activos Fijos y puede promoveres al Maestro con trazabilidad (`activos.compras_gasto_id`).
- La CxP y el pago por Tesorería funcionan igual que cualquier otro egreso — el dinero sale normalmente.
- **Motor de depreciación (pendiente):** al cerrar cada período, registrará la depreciación de cada activo como gasto real bajo la categoría configurable.

---

## 11. Indicadores clave

**CRM:** leads por fuente (campo vs web), conversión por etapa, ciclo de venta, motivos de pérdida.

**Comercial:** pipeline, forecast ponderado, tasa de cierre, ventas por vendedor/servicio.

**Operativo:** OTs por estado, SLA, productividad técnica, partes campo vs backoffice.

**Compras:** SOLPEs pendientes, lead time de proveedores, score de proveedores, stock crítico.

**RRHH:** asistencia promedio %, tardanzas por técnico, horas extra por período, costo hora real vs estimado.

**Financiero:** margen por OT/cliente/servicio, facturación, CxC/CxP vencidas, flujo de caja, ER mensual, deuda total vigente, cuotas del mes.

**Customer Success:** health score promedio, churn, retención, NPS, renovaciones próximas.

**Plataforma TIDEO:** MRR, ARR, tenants activos, churn de plataforma, distribución por plan.

---

## 12. Sistema de diseño

```css
--color-navy: #1A2B4A;     /* dominante, sidebar, headers */
--color-slate: #607D8B;    /* secundario, bordes, texto muted */
--color-white: #FFFFFF;    /* fondos modo claro */
--color-green: #4CAF50;    /* acciones primarias, estados OK */
--color-orange: #FF9800;   /* alertas, pendientes */
--color-purple: #9C27B0;   /* Customer Success */
--color-cyan: #00BCD4;     /* KPIs, gráficas, mes actual en BI */
--dark-bg: #0D1B2E;        /* fondo oscuro */
--dark-surface: #162038;   /* tarjetas en modo oscuro */
--dark-border: #243554;    /* bordes en modo oscuro */
--dark-text: #E8EDF5;      /* texto en modo oscuro */
```

**Tipografía:** Sora (headings) + DM Sans (body). No usar Inter, Roboto ni System UI.

**Componentes clave:** Dark mode toggle (sun/moon). Simulador de roles en header. Selector de empresa activa. Breadcrumb de flujo en pantallas de detalle. Badges semánticos por estado. Badge "📱 Campo". Badge "🤖 Extraído por IA". Badge "⚠️ Condiciones pendientes". Badge "⚠️ Condiciones financieras pendientes".

---

## 13. Exclusiones

- Integración con facturación electrónica externa por país (se cotiza aparte).
- Integración con sistema contable externo (se cotiza aparte).
- Integración bancaria automática (se cotiza aparte).
- Exportación PDT SUNAT, integración AFP/ESSALUD en línea (nómina avanzada, se cotiza aparte).
- App móvil nativa iOS/Android — campo se resuelve con PWA.
- Balance general completo (requiere contabilidad de partida doble — versión futura).
- Cálculo de utilidades (participación en utilidades) y liquidaciones de cese con múltiples contratos simultáneos o regímenes especiales no estándar (versión futura). El módulo de Liquidación por Cese estándar (D.Leg. 728) está implementado.
- Hardware, tablets, impresoras.
- Migración histórica masiva no definida.
- Asesoría tributaria, contable o laboral.
- ERP personalizado para rubros específicos (producto separado de TIDEO).

---
| 24/06/2026 | **Auditoría técnica Documento Maestro vs repositorio (Corte 24/06):** Revisión del repositorio posterior a múltiples sesiones de consolidación. Actualización del corte a 277 migraciones locales hasta 277_maestro_tipos_contrato.sql. Se identificaron nuevas implementaciones: Maestro de tipos de contrato migrado a base de datos y UI (Configuración > Maestros Base), mejoras en módulo de Turnos (autorizaciones HE, detalle de días, selector autoservicio), y correcciones de seguridad RLS (postulaciones anónimas, self-read emails). Se actualizaron los GAPS, el resumen de progreso y el historial de sesiones. |
| 19/06/2026 | **Auditoría técnica Documento Maestro vs repositorio (Corte 19/06):** Revisión del repositorio posterior a múltiples sesiones de consolidación. Actualización del corte a 270 migraciones locales hasta `268_fix_liquidaciones_cxp_id_type.sql`. Se identificaron nuevas implementaciones en código no documentadas previamente: Motor de Predecesor/Sucesor para contratos, Contrato Primigenio, Periodos y caducidad de documentos, Consolidación y candados de formatos de tipos de documento, y bloqueos de cese/portal. Se actualizaron los GAPS, el resumen de progreso y el historial de sesiones. |
| 16/06/2026 | **Auditoría técnica Documento Maestro vs repositorio (Corte 16/06):** Revisión del repositorio posterior a múltiples sesiones. Actualización del corte a 253 migraciones locales hasta `248_versioning_contrato_periodos.sql`. Se identificaron nuevas implementaciones en código no documentadas: Carga Masiva de Personal (Operativo y Administrativo) por Excel, soporte de Motor de Adendas en fichas RRHH (`advAdendaManual`), lógicas base de tránsitos OC/GRNI, y **corrección en persistencia de visualización** de documentos subidos pendientes de validación (`personalDocumentosService.js`). Se actualizaron los GAPS, el resumen de progreso y la sección de RRHH del inventario de módulos. |
| 14/06/2026 | **Auditoría técnica Documento Maestro vs repositorio:** revisión cruzada de `src/pages_*.jsx`, `src/context.jsx`, `src/services/*.js` y `supabase/migrations`. Se actualiza el corte a 242 migraciones locales hasta `237_ola5b_geo_sar.sql`, 74 ítems activos de sidebar/ruta, estructura real de archivos, GAPS categorizados y modelo de datos. Se corrigen inconsistencias: `Leads` ya tiene razón social/RUC/industria; SSOMA y `BarcodeScanner` ya existen en PWA; sidebar documental omitía `mi_portal`, `reclutamiento`, `compras_gastos`, `activos_fijos` y `organigrama`. |
| 14/06/2026 | **RRHH Olas 2–5 documentadas:** migraciones `222`–`234_ola5a` y `237` registran datos bancarios/bloqueo por cese, falta grave, contratos y vencimientos, horas extra/compensación/descuentos, amonestaciones, papeletas, asistencia honorarios, régimen/roster minero, reclutamiento/autoservicio, portal empleado Fase 2, biométrico, WhatsApp, geocercas y SAR. Archivos afectados: `pages_ops.jsx`, `pages_admin.jsx`, `pages_mobile.jsx`, `pages_mi_portal.jsx`, `pages_reclutamiento.jsx`, `context.jsx`, `rrhhService.js`, `reclutamientoService.js`, `portalFase2Service.js`, `biometricoService.js`, `geofencingService.js`, `whatsappService.js`, `amonestacionesService.js`, `rosterMineroService.js`. |
| 14/06/2026 | **Compras/Inventario posteriores al corte 214 documentados:** migraciones `215`–`221`, `232`, `234_oc`, `235` y `236` incorporan lead time OC, vista de precio histórico proveedor, matching 3 vías, stock seguridad/SOLPE automática, RLS activos, trazabilidad de lotes OT, devoluciones proveedor, items SOLPE, origen SOLPE en OC, condición de pago OC/OSI y ficha completa de proveedores. Servicios afectados: `comprasService.js`, `inventarioService.js`, `materialService.js`, `ventasService.js`, `guiasService.js`; UI principal: `pages_ops.jsx`, `pages_admin.jsx`, `pages_extra.jsx`. |
| 11/06/2026 | **WMS Continuación 2 — Conteo físico UI + Analítica:** (1) **`src/pages_extra.jsx` Inventario:** tabs `Stock`, `Conteo físico` y `Analítica`; conteo inicia desde stock teórico, permite cantidades físicas SKU por SKU, lote/serie, progreso, guardado parcial, cierre solo cuando todo está contado, historial y resumen de diferencias. (2) **`src/services/inventarioService.js`:** funciones `listarConteos`, `guardarAvanceConteo`, `getAnaliticaInventario`; `cerrarConteo` valida inmutabilidad, calcula diferencias y genera ajustes `ajuste_conteo` con `referencia_tipo='conteo_fisico'` y `referencia_id` del conteo. (3) **`context.jsx`:** acciones dual mock/Supabase para conteos y analítica. (4) **Migración `214_inventario_conteos_rls_inmutabilidad.sql`:** RLS por tenant/permisos de inventario y trigger que impide modificar conteos ya cerrados. (5) **Analítica:** ABC por valor acumulado de salidas del período, gráfico Pareto, rotación por salidas/stock promedio estimado y stock muerto con `dias_sin_actividad` configurable. **Pendiente:** integración completa del escaneo dentro del flujo de conteo móvil. |
| 11/06/2026 | **Fix CMP-{timestamp} + Sincronización OV↔Guía:** (1) **Eliminado `RecepcionesLegacy`** (`pages_ops.jsx` líneas 6008–6036): componente muerto que nunca se exportó ni se llamó, pero generaba `CMP-{timestamp}` en `setInventario`. (2) **`context.jsx` línea 7157:** el mapeo de `itemsRecibidos` ahora incluye `codigo: item.codigo || null` y `material_id: item.material_id || null`; esto hace que en modo Supabase `registrarEntradaDesdeRecepcion` resuelva el material por código de catálogo (sin crear huérfanos), y en modo mock `item.codigo` se use como SKU en vez de `CMP-{timestamp}`. (3) **`guiasService.js`:** nueva función privada `sincronizarDespachoOV(ovId, lineas, operacion)` que actualiza `cantidad_despachada` por línea OV (match por `material_id`) y recalcula estado OV (`despachada` / `parcialmente_despachada` / `confirmada`). `confirmarEntrega()` la llama con `'sumar'` tras registrar los movimientos WMS. `anularGuia()` la llama con `'restar'` solo cuando la guía estaba en estado `entregada`. Traslados sin OV vinculada no llaman `sincronizarDespachoOV`. |
| 11/06/2026 | **Capitalización de activos fijos en Compras/Gastos (migración 212):** (1) **Migración `212_capitalizacion_activos.sql`:** columna `es_capitalizacion boolean DEFAULT false` en `er_categorias`; columna `numero_serie text` en `compras_gastos`; columna `compras_gasto_id text FK→compras_gastos` en `activos`; seed de categoría "Inversiones / Activos" con `es_capitalizacion = true` por tenant; seed de tipo de gasto "Activo Fijo" por tenant; función `crear_categorias_base` actualizada para incluir la nueva categoría en altas de nuevos tenants. (2) **`NuevoEgreso.jsx`:** al cargar tipos de gasto, se resuelve `es_capitalizacion` cruzando con `er_categorias`; si el tipo seleccionado es capitalización, el paso 2 muestra aviso banner naranja + campos adicionales obligatorios (tipo activo, número de serie/placa, vida útil en años); validación bloquea si falta vida útil; el egreso se guarda con `es_activo_fijo = true`, `activo_tipo`, `numero_serie`, `vida_util_anos`, `activo_estado = 'activo'`; el ER lo ignora vía `!g.es_activo_fijo` existente. `TiposGastoAdmin` muestra badge "Capitalización" en la tabla y aviso en el form de edición cuando la categoría tiene `es_capitalizacion = true`. (3) **`pages_admin.jsx` `ErCategoriasAdmin`:** campo `es_capitalizacion` en form (checkbox con descripción); badge "Capitalización" naranja en la tabla; persiste al crear y editar. (4) **`pages_fin.jsx` `ActivosFijos`:** función `abrirNuevoDesdeCompras(gasto)` que cambia al tab maestro y abre el panel "Nuevo activo" pre-llenado con datos del egreso (nombre, tipo, valor, moneda, vida útil, placa/serie, CECO, `compras_gasto_id` para trazabilidad); botón "Promover al Maestro" en el panel de detalle del tab "Desde Compras/Gastos"; banner de trazabilidad en el form de nuevo activo cuando viene de compras. (5) **`activosService.js`:** `compras_gasto_id` agregado a `ACTIVO_FIELDS`. |
| 11/06/2026 | **Módulo Transporte y Guías de Remisión — Completo (migración 211):** (1) **Migración `211_transporte_guias.sql`:** 9 tablas nuevas — `correlativos_documentos`, `transportistas`, `vehiculos_transporte`, `conductores_transporte`, `catalogo_venta`, `ordenes_venta`, `ordenes_venta_lineas`, `guias_remision`, `guias_remision_lineas`; RLS por tenant; índices de rendimiento; campos OSE_FUTURE anotados. (2) **`src/services/guiasService.js`:** correlativo SUNAT por serie/empresa (T001-XXXXXXXX), `validarGuiaParaEmitir` bloquea emisión sin campos obligatorios SUNAT (Res. 000020-2023), `confirmarEntrega` llama WMS `registrarMovimiento(tipo:'salida')` y guarda `kardex_salida_ids`, `anularGuia` revierte via `anularMovimiento` por cada kardex ID. CRUD transportistas/vehículos/conductores. (3) **`src/services/ventasService.js`:** cálculo IGV 18%, correlativo OV por empresa, `confirmarOrdenVenta` → `reservarStock`, `anularOrdenVenta` → `liberarReserva`, catálogo de venta vinculado a materiales. (4) **`src/data.js`:** mocks SUNAT-completos: 3 guías (traslado_interno, despacho_venta entregada, despacho_servicio), 2 transportistas con vehículos/conductores, 2 OVs, 5 productos catálogo. (5) **`src/context.jsx`:** estado + carga dual mock/Supabase + 20 acciones para guías, OVs, transportistas y catálogo. (6) **UI `pages_ops.jsx`:** componente `Remision` reemplazado — KPIs (guías hoy / en tránsito / entregadas mes / OVs pendientes), 3 tabs (Guías / OVs / Transportistas), wizard 2 pasos para nueva guía (selección tipo → form SUNAT + autocompletado desde maestro), modales detalle con transiciones de estado, modal Nueva OV con catálogo + totales en tiempo real, gestión de transportistas con sub-tabs vehículos/conductores, modal de anulación con motivo obligatorio. (7) **`src/pages_pdf.jsx`:** `GuiaRemisionPDF` con todos los campos obligatorios SUNAT marcados `*SUNAT*`, sección OSE_FUTURE reservada para QR de firma electrónica. **Pendiente:** integración OSE/firma electrónica (campo reservado), GPS tracking, liquidación de fletes. |
| 11/06/2026 | **Fase 1C RRHH habilitaciones:** reporte con columnas dinámicas desde tipos habilitantes, semáforo por celda desde calcular_habilitaciones_personal, KPIs filtrables, previsualizador inline PDF/imagen con metadatos y acciones RRHH, y signed URLs de documentos-privados a 600s con renovación automática. |
| 02/06/2026 | **Tarifa hora por colaborador (migración 170):** `personal_operativo` y `personal_administrativo` agregan `metodo_pago`, `monto_mensual`, `horas_base_mes` y `tarifa_hora`. Trigger `calcular_tarifa_hora_colaborador` calcula tarifa desde monto mensual y horas base. OT, partes, tareos y Control de Horas usan `tarifa_hora` con fallback legacy. |
| 02/06/2026 | **CxP, RHE, devengo y clasificación ER (migraciones 166, 168 y 169):** `cxp` incorpora campos de RHE externo, origen, motivo, tipo de cambio, moneda original, OT vinculada, categoría ER y CECO. `compras_gastos` guarda trazabilidad hacia CxP, período de nómina, personal y OT. Se habilita devengo CxP→ER evitando duplicidades. |
| 02/06/2026 | **Ventas y archivos financieros (migraciones 161, 163, 164, 165, 167 y 168):** tabla `ventas` persistente con correlativo por tenant; `facturas` guarda `archivo_pdf_url` y `archivo_zip_url`; buckets `documentos-generales` y `documentos-privados` reforzados; `ticket_comentarios.imagen_url` garantizado; `recibos_honorarios` agrega `motivo_retencion`, `numero_rhe`, `moneda_cxp` y `personal_id`; vista `tickets_con_sla` refrescada para incluir columnas QC. |
| 31/05/2026 | **Préstamos al Personal y sincronización financiera (migraciones 158 y 160):** `prestamos_personal` se completa con trabajador, cuotas, saldo, descuento nómina, estado y fecha de otorgamiento; nueva tabla `prestamo_pagos`. `valorizaciones`, `facturas` y `cxc` reciben columnas operativas faltantes (`tipo`, `notas`, `modelo_calculo`, `items`, `historial`, `concepto`, `condicion_pago`, `archivo_url`, `subtotal`, `igv`, `moneda`) para evitar rechazos silenciosos desde frontend. |
| 30/05/2026 | **Costos OT, asistencia minera, egresos y documentos de personal (migraciones 153–159):** `ordenes_trabajo.real_detalle` para costos reales manuales; RUC/retención en personal administrativo y operativo; tabla `asistencia_ciclos_mineros` + `registros_asistencia.ciclo_minero_id`; cierre de egresos con campos CxP/compras_gastos/caja_chica; anticipos OC y activos fijos; tabla `personal_documentos` con versionado, validación y Storage privado. |
| 02/06/2026 | **Condición de pago por defecto para CxC (migración duplicada 144):** `empresa_config.condicion_pago_defecto` permite fallback configurable para calcular vencimientos de CxC cuando el cliente/factura no trae condición explícita. |
| 30/05/2026 | **Liquidación por Cese — módulo completo (migración 152):** módulo exclusivo RRHH/Admin para todos los tipos de cese (D.Leg. 728). (1) **Migración `152_liquidaciones_cese.sql`:** campos `fecha_ingreso`, `estado_laboral`, `fecha_cese`, `tipo_cese` añadidos a `personal_operativo` y `personal_administrativo`; tablas `liquidaciones_cese` y `liquidaciones_cese_conceptos` con RLS por `liquidaciones_puede_gestionar`; índice único parcial para máximo una liquidación activa por persona. (2) **`liquidacionesCeseService.js`:** función pura `calcularConceptos(params)` con motor completo (remuneración pendiente, vacaciones truncas, CTS proporcional, gratificación proporcional + bonif. 9%, indemnización por régimen general/MYPE/microempresa); CRUD: `cargarLiquidaciones`, `crearLiquidacion`, `confirmarLiquidacion` (crea CxP + marca cesado), `anularLiquidacion` (revierte colaborador + anula CxP). (3) **`pages_liquidaciones.jsx`:** KPIs (liquidaciones año, monto, pendientes), tabla con filtros, wizard 3 pasos (datos cese → revisión cálculo con parámetros ajustables → confirmación con checkbox), ficha detalle con trazabilidad y acciones según estado. Disclaimer permanente. (4) **Context/router/sidebar/data.js:** estado `liquidacionesCese` y `liquidacionesConceptos`, acciones `crearLiquidacionCtx`, `confirmarLiquidacionCtx`, `anularLiquidacionCtx`, ruta `liquidaciones_cese`, entrada sidebar bajo Evaluación de Desempeño. (5) **Reglas transversales:** al confirmar, colaborador desaparece de selectores activos en toda la app; anular revierte. |
| 30/05/2026 | **Valorizaciones — pase automático a Pendiente cierre:** al aprobar una valorización, el sistema calcula el acumulado aprobado por OT contra el monto total de la OS Cliente. Si una OT incluida sigue en `ejecucion` y alcanzó 100%, pasa automáticamente a `pendiente_cierre` sin bloquear la aprobación ni el flujo posterior hacia factura/CxC. La notificación informa cuántas OTs fueron movidas. |
| 30/05/2026 | **Evaluación de Desempeño — módulo completo (migración 151):** 360° básico informativo con autoevaluación + evaluación de jefe, competencias cualitativas, objetivos cuantitativos, score ponderado configurable y resultados visibles al colaborador solo tras cierre de plantilla. (1) **Migración `151_evaluaciones_desempeno.sql`:** columnas de configuración en `empresa_config`; tablas `desempeno_plantillas`, `desempeno_competencias`, `desempeno_objetivos`, `desempeno_evaluaciones`, `desempeno_respuestas_competencias` y `desempeno_respuestas_objetivos`; RLS por tenant, evaluado, jefe directo y RRHH/admin; permisos funcionales `evaluaciones_desempeno`. (2) **Servicio/contexto:** CRUD de plantillas, generación de evaluaciones, guardado de autoevaluación, guardado de evaluación de jefe, reasignación de jefe y cálculo de scores/clasificación. (3) **UI:** pantalla RRHH con tabs Plantillas, Evaluaciones en curso y Resultados; wizard de creación; flujos de colaborador y jefe; resultados individuales y consolidados con exportación Excel. (4) **Parámetros Generales:** nueva configuración de ponderaciones, escala y labels con validación en tiempo real. (5) **Sidebar/router/documentación:** ruta `evaluaciones_desempeno`, badge de pendientes y documento maestro actualizado. |
| 28/05/2026 | **Hardening Nómina Perú (migración 150):** correcciones de cálculo + régimen MYPE + régimen minero 14×7/20×10/28×14 + períodos quincenales + reporte PLAME. (1) **Migración `150_nomina_hardening.sql`:** 13 columnas nuevas en `empresa_config` (regimen_laboral_empresa, frecuencia_pago, días corte/pago mensual y por quincena, pct_quincena_1, uit_vigente, rmv_vigente, ram_tope_afp, pct_prima_seguro); 6 columnas nuevas en `personal_operativo` y `personal_administrativo` (regimen_jornada, horas_diarias_pactadas, fecha_inicio_ciclo, bonif_altitud, tipo_comision_afp, pct_comision_afp_flujo); tabla `periodos_nomina` creada con índice único empresa+anio+mes+quincena; tabla `nomina_detalle` con los tres componentes AFP por separado, tramos de horas extra, días computables, flags CTS/gratificación, bonificación extraordinaria. (2) **`nominaService.js`** (nuevo): CRUD periodos_nomina, guardar/leer nomina_detalle, leer/escribir config nómina en empresa_config. (3) **Motor de cálculo corregido:** AFP split en tres componentes (aporte 10%, comisión flujo %, prima seguro sobre tope RAM); IR 5ta con UIT dinámica de empresa_config y proyección anual real; horas extra split 25% primeras 2h/día + 35% desde 3ra h/día; CTS sobre remuneración computable (básico + AF + 1/6 gratif); bonificación extraordinaria 9% sobre gratificación. (4) **Régimen MYPE:** microempresa → CTS = 0, gratificación = 0, bonif. extraordinaria = 0, vacaciones 15 días; pequeña empresa → CTS y gratificación sí. (5) **Régimen minero:** días computables calculados desde `fecha_inicio_ciclo` según ciclo 14+7/20+10/28+14; remuneración proporcional; valor hora sobre horas pactadas; bonificación por altitud proporcional. (6) **Pago quincenal:** 1ra quincena = % configurado del sueldo (sin IR, sin provisiones); 2da quincena = resto + IR completo del mes + provisiones. (7) **`pages_admin.jsx`:** tab "Nómina" nuevo en Parámetros Generales con 3 bloques (régimen laboral con tabla comparativa y modal de confirmación, frecuencia de pago con preview, valores fiscales); formulario RRHHAdmin ampliado con sección "Régimen de Jornada y Sistema Previsional". (8) **`pages_ops.jsx`:** formulario RRHH_Operativo ampliado igual; componente Nomina rediseñado con tab Períodos (cards con estado semántico, auto-generación), tab Resumen (badge régimen y días computables), tab Detalle expandido (desglose AFP 3 líneas, cargas por régimen), tab PLAME (preview tabla + descarga Excel, solo para cerrados). (9) **Documento maestro:** 8.18 reescrito, 9.3 actualizado, exclusión "régimen MYPE diferenciado" eliminada de sección 13. |
| 28/05/2026 | **Soporte y Tickets — QC con sub-estados, hilo de resolución y reapertura formal (migración 149):** tres capacidades nuevas sin alterar el Kanban de cuatro columnas. (1) **Migración `149_tickets_qc_hilo.sql`:** columnas `qc_estado` (nullable, check en_revision/observado/aprobado), `veces_reabierto` (integer default 0) y `reabierto_en` (timestamptz) añadidas a `tickets`. Trigger `set_ticket_defaults` actualizado para inicializar `qc_estado = en_revision` al entrar a QC y limpiarlo al salir. Nueva tabla `ticket_comentarios` append-only con campo `imagen_url text` nullable (no array) y RLS: SELECT e INSERT permitidos, UPDATE/DELETE prohibidos; índice por `(ticket_id, creado_en asc)`. (2) **`ticketsService.js`:** funciones nuevas `subirImagenEvidencia` (sube imagen al bucket público `ticket-evidencias`, ruta `{empresa_id}/{ticket_id}/{timestamp}_{archivo}`, retorna URL pública), `cargarComentariosTicket`, `agregarComentarioTicket` (con campo `imagen_url`), `actualizarQcEstado` y `reabrirTicket`. (3) **UI en `pages_ops.jsx`:** badge naranja OBSERVADO / verde APROBADO en tarjeta Kanban cuando `estado = qc`. Botón "Mover a Resueltos" deshabilitado si `qc_estado ≠ aprobado`. Panel de detalle incluye controles de sub-estado QC, hilo de resolución como línea de tiempo vertical (íconos y colores por tipo) con formulario append-only: tipo, texto y file picker real para imagen (PNG/JPG/WEBP, preview antes de enviar, upload primero→insert después). Las imágenes guardadas se muestran como miniaturas clicables en las entradas del hilo. Botón "Reabrir ticket" en tickets resueltos exige motivo obligatorio vía modal. (4) **Bucket nuevo:** `ticket-evidencias` público, 10 MB, ruta `{empresa_id}/{ticket_id}/{ts}_{archivo}`. |
| 28/05/2026 | **Tareo Administrativo — módulo completo (migración 148):** brecha completa cerrada entre personal administrativo, OTs y registro diario de horas. (1) **Migración 148:** tabla `tareos_admin` con campos `personal_id`, `fecha`, `horas`, `descripcion`, `tipo` ∈ {ot,libre}, `ot_id` nullable, `ceco_id` nullable, `estado` ∈ {borrador,enviado}, `origen` ∈ {mobile,backoffice}; RLS por tenant; trigger `actualizado_en`. Constraint `perfil_campo` ampliado con valor `administrativo`. (2) **`src/services/tareosAdminService.js`:** CRUD completo con switch supabase/mock. Funciones: `cargarTareos`, `cargarOTsAdminDelDia`, `cargarCecosActivos`, `crearTareo`, `actualizarTareo`, `enviarTareosDia`, `corregirTareo`. (3) **`TareoAdmin` desktop** en `pages_ops.jsx`: dos tabs "Por día" y "Por período", filtros por fecha/colaborador, tabla filtrable, resumen de horas OT vs libre; visible solo con permiso `tareo_admin:ver`. (4) **PWA `AdministrativoView`** en `pages_mobile.jsx`: "Mi registro del día" — OTs asignadas (desde `participantes_admin`) con estado badge/botón, formulario 1-paso por OT, sección de actividades libres por CECO, envío del registro del día con advertencia si quedan OTs sin registrar. (5) **Integración Parte Diario:** al registrar un parte donde el colaborador es del `personalAdmin`, se crea automáticamente un `tareos_admin` de tipo `ot` con `origen: backoffice`. (6) **Constructor de Roles:** pantalla `tareo_admin` agregada a `pantallasPermisos` en `data.js`. (7) **Sidebar:** ítem "Tareo Administrativo" en sección RRHH de `shell.jsx`. (8) **Routing:** `App.jsx` con lazy import y case `tareo_admin`. (9) **`context.jsx`:** `normalizarCampoModulos` incluye `administrativo` → `['administrativo', 'solicitudes']`. (10) **Selector perfil_campo:** opción `Administrativo` con descripción agregada en Constructor de Roles. |
| 28/05/2026 | **Participantes administrativos en OT y Parte Diario (migración 147):** brecha cerrada: personal administrativo puede participar en una OT y registrar horas en el Parte Diario sin pasar por el Planner. Columna `participantes_admin jsonb` agregada a `ordenes_trabajo` mediante `ALTER TABLE … ADD COLUMN IF NOT EXISTS`. El formulario de creación y la ficha de edición de OT incluyen una sección opcional "Participantes administrativos" con selector de colaborador activo + horas estimadas. En el Parte Diario, el selector de colaborador muestra operativos (del Planner) y admins (de `participantes_admin`) diferenciados con `<optgroup>`. El costo de admins se acumula en `costoMO`/`costoReal` igual que el de operativos. Sin cambios en Planner, `calcCostoHora`, flujo de aprobación ni estructura de `partes_diarios`. |
| 28/05/2026 | **Módulo Solicitudes de RRHH (migración 146):** flujo multietapa enviada → aprobada_jefe → confirmada_rrhh con historial append-only automático. Tres tablas nuevas: `solicitudes_rrhh`, `solicitudes_rrhh_historial`, `rrhh_config_ausencias`. Función `calcular_dias_habiles`. RPC `crear_solicitud_rrhh` (security definer). Trigger historial + trigger `actualizado_en`. Columna `solicitud_rrhh_id` en `registros_asistencia`. Servicio `solicitudesRrhhService.js` con operaciones CRUD, aprobaciones, cálculo de impacto nómina y saldo de vacaciones. Componente `SolicitudesRrhh` con 4 tabs (mis solicitudes, pendientes, todas, calendario de ausencias), side-panels de nueva solicitud e historial, side-panel de acción con validaciones. Vista mobile `SolicitudesMovilView` con formulario de 4 pasos y acciones de aprobación para supervisores. Sidebar entrada en sección RRHH entre Comisiones y Préstamos. |
| 28/05/2026 | **Panel de detalle de Tickets editable:** el side-panel de un ticket en estado `abierto` ahora tiene modo edición inline. Botón "Editar" habilita formulario con campos título, descripción, prioridad, tipo, canal de entrada, cliente y responsable. Botón "Guardar cambios" llama `ticketsService.actualizarTicket` y actualiza estado local optimista. Botón "Cancelar" revierte al valor original. Tickets en estado cerrado o resuelto muestran badge "Solo lectura". Los botones de transición de estado se reorganizaron en una tarjeta "Flujo" separada. Corrección en `ticketsService.cleanTicketPayload`: `creado_por` solo se incluye en el payload si el campo estaba explícitamente presente, evitando sobrescribir el valor en Supabase al editar. |
| 28/05/2026 | **Storage transversal:** migración `145_storage_transversal.sql` crea tabla `adjuntos` con RLS por tenant y dos buckets nuevos (`documentos-privados` privado con signed URLs y `documentos-generales` público, ambos 20 MB). Nuevo `src/services/storageService.js` como único acceso a Storage, componente reusable `src/components/FileUpload.jsx` y primera integración real en Tickets: adjuntos en nuevo ticket y panel de detalle sin agregar columnas a `tickets`. |
| 28/05/2026 | **Limpieza de tablas fantasma y brecha de comprobantes:** migración `144_limpieza_tablas_fantasma.sql` elimina `tickets_soporte` (residuo de migración 065, nunca usada por frontend) y `os_cliente` (tabla huérfana sin migraciones locales; la tabla activa es `os_clientes`). Documento maestro corregido: `imagen_comprobante` se remueve de `compras_gastos` porque nunca existió en Supabase y se registra deuda técnica para persistir número e imagen del comprobante cuando se implemente Storage. |
| 28/05/2026 | **Soporte y Tickets conectado a Supabase:** migracion `143_tickets.sql` agrega tabla `tickets` con RLS por `usuario_tiene_empresa(empresa_id)`, trigger de numeracion `TK-XXXX` por tenant, calculo de fecha limite SLA y vista `tickets_con_sla` con `sla_estado` calculado en base. Nuevo `src/services/ticketsService.js` para cargar, crear, actualizar estado, editar y eliminar. Los 7 tickets demo salen de datos inline y pasan a `MOCK.tickets` en `src/data.js`. El componente `Tickets` queda desacoplado, carga modo mock/Supabase, muestra estado de carga, crea tickets desde formulario y mueve tarjetas con actualizacion optimista. |
| 28/05/2026 | **Integración de Materiales, Presupuestos, Persistencia de Partes y Retenciones (Fase 4 - Hardening):**<br>- **Migraciones 137 a 142 integradas y aplicadas**: se consolida la retención IR en la configuración empresarial y personal (`agente_retencion` en `empresa_config`, `suspension_retenciones` y `vencimiento_suspension` en `personal_administrativo`).<br>- **Maestro de Materiales Jerárquico (Migración 139)**: estructuración de materiales mediante Grupos, Familias y Subfamilias, con generador automático de código de 10 dígitos y nuevos campos en ficha de materiales (`grupo_id`, `familia_id`, `subfamilia_id`, `nro_parte`, `unidades_contenidas`, `almacen_id`, `ubicacion`, `precio_unitario`).<br>- **Planner y Asignaciones Flexibles (Migración 140)**: remoción de restricciones FK para permitir asignación de personal administrativo a cuadrillas en el Planner.<br>- **Persistencia de Partes Diarios (Migración 141 y 142)**: persistencia nativa de líneas de logística (`logistica_lineas`), de terceros (`terceros_lineas`) y nombre del técnico en base de datos. Modificación de políticas RLS para habilitar la edición de partes a usuarios con permisos de creación. |
| 22/05/2026 | **Alineación, Hardening de Comisiones e Integraciones (Fase 3):**<br>- **Migraciones 135 y 136 aplicadas y verificadas en Supabase:** campos `moneda` y `personal_id` en `recibos_honorarios`, campos `tipo_beneficiario`, `personal_id`, `recibo_honorarios_id` y `concepto` en `cxp`.<br>- **Flujo completo de comisiones verificado punta a punta en Supabase real:** cobro CxC → comisión automática → aprobación → RHE → CxP tipo personal → pago Tesorería.<br>- **10 bugs corregidos en módulos CxC y Comisiones.**<br>- **Pipeline automático por eventos implementado y verificado:** Propuesta al enviar cotización, Negociación al versionar, Ganada al aprobar.<br>- **Embudo BI Comercial completo desde Leads hasta Ganada con Perdida como dato lateral.**<br>- **Ficha colaborador dinámica planilla vs honorarios:** campos condicionales en tiempo real, caso mixto contrato Planilla + comisión Honorarios funcionando.<br>- **CxP extendida con filtro Colaboradores, creación manual e historial de pagos parciales via cxp_pagos.**<br>- **Mejoras Cuentas y Contactos:** formulario completo, cuenta bancaria del cliente, CS 360° con datos reales, filtros en galería.<br>- **CECO obligatorio en SOLPE y Compras/Gastos.**<br>- **Filtros CECO/CEBE en Estado de Resultados y BI Financiero.**<br>- **Badge Campo en Partes Diarios.**<br>- **Conformidad digital habilitada en Cierre Técnico.** |
| 22/05/2026 | **Módulos de Presupuestos, Comisiones y Activos PDF:** Integración completa del módulo Presupuesto vs Real (tablas `presupuestos`, `presupuesto_partidas`, `presupuesto_aprobaciones`) con flujo secuencial de 4 aprobadores, cálculo del Real (OTs + Gastos) y drill-down interactivo. Implementación del módulo de Comisiones con aprobación de acuerdos comerciales especiales (+48h alert), generación de RHE y CxP tipo personal (colaborador). Reglas dinámicas de retención de IR (umbral S/1,500, agente de retención, suspensión de retenciones). Campos para logo y firma corporativa en `empresa_config` con bucket público `empresa-assets`. Persistencia de detalle de valorizaciones (items, ot_ids, historial). |
| 15/05/2026 | **Persistencia de Timeline — Leads y Oportunidades (migraciones 077-079):** `lead_historial_estados` existía en Supabase (migr. 077) pero no se cargaba al iniciar — corregido en `loadCrmFromSupabase` de `crmService.js`. `opp_historial_etapas` creada como tabla append-only (migr. 079 **aplicada y verificada**). `actualizarEtapaOportunidad` en `context.jsx` registra el movimiento optimísticamente y persiste en Supabase en paralelo. El timeline del Pipeline y de Cuentas 360° ahora muestran cambios de etapa persistidos. |
| 12/05/2026 | **Conexión módulo Turnos y Horarios:** `pages_turnos.jsx` existía como módulo standalone completo pero nunca era importado — App.jsx seguía usando la versión de `pages_ops.jsx`. Corregido: App.jsx ahora importa `TurnosHorarios` desde `pages_turnos.jsx`; removido de la exportación de `pages_ops.jsx`. También corregido bug de import default vs named (`import { rrhhService }` en lugar de `import rrhhService`). `rrhhService.js` extendido con `actualizarTurno` y `eliminarTurno`. El módulo activo tiene: CRUD completo (crear/editar/eliminar), tabla con columna Refrigerio, side-panel con cálculo de horas efectivas en tiempo real, días laborables con selección visual, toggle "cruza medianoche". |
| 12/05/2026 | **Asignaciones funcionales multirol (migracion 070):** nueva tabla `usuarios_asignaciones` con rol, categoria, nivel jerarquico, jefe funcional, alcance y bandera principal. Backfill automatico desde `usuarios_empresas`. Triggers mantienen sincronizada la asignacion principal. Nuevas funciones `usuario_puede_ver_registro` y jerarquia basada en asignaciones. UI de Usuarios mantiene el flujo simple y agrega un bloque colapsado de asignaciones adicionales opcionales para empresas grandes o estructuras matriciales. |
| 12/05/2026 | **Jerarquia transversal de roles y usuarios (migracion 069):** `roles.nivel_jerarquico` y `usuarios_empresas.jefe_user_id` permiten estructura por equipos en cualquier area. Nueva regla: direccion/admin ve tenant completo, jefatura/supervisor ve subordinados recursivos y asesor/operativo ve registros propios. UI de Roles agrega Categoria + Nivel; UI de Usuarios agrega Jefe directo. Selectores de responsables filtran por categoria de rol. |
| 12/05/2026 | **Módulo Campañas de Marketing (migración 068):** tabla `campanas` con estados Borrador/Activa/Pausada/Finalizada. `campana_id` añadido a `leads` y `oportunidades` (nullable, viaja al convertir). Marketing Automation reemplazado con CRUD completo: KPIs globales, tabla con Activar/Pausar/Reactivar, panel lateral crear/editar, ficha de campaña con métricas (CPL, ROI, ingreso atribuido). BIComercial añade tab "Por campaña" con barras comparativas y tabla de atribución. Formulario de nuevo lead añade selector "Campaña de origen" (solo campañas Activas). |
| 12/05/2026 | **Módulo API Keys (migración 067):** tabla `api_keys` con hash SHA-256, permisos modulo:accion, estado activo/inactivo. CRUD completo con visualización one-time de la key raw. Edge Function `api-prospectos` en Deno valida key vía RPC `validar_api_key` e inserta leads con `registrado_desde = 'api'`. Sidebar: sección "Integraciones" nueva visible para todos los tenants. |
| 12/05/2026 | **Hardening multitenant (migraciones 062–066):** columna `es_plataforma boolean` en `empresas` para identificar al tenant dueño de la plataforma — reemplaza comparación hardcodeada `id = 'emp_tideo'` en frontend y funciones RLS. Log de accesos cross-tenant `superadmin_accesos` (append-only, fire-and-forget). `usuario_es_superadmin_plataforma()` y `usuario_tiene_empresa()` refactorizadas para requerir `es_plataforma = true` en el bypass. `usuario_es_admin_empresa()` corregida para usar `es_admin_empresa = true` del rol (no `es_superadmin`). RLS aplicada a 17 tablas de finanzas/operaciones/soporte/auditoría con `CREATE TABLE IF NOT EXISTS` en migración 065. |
| 12/05/2026 | **Explicación columnas `leads`:** documentado que `fuente` = canal de marketing (Referido, LinkedIn, etc.) y `registrado_desde` = canal técnico de entrada (backoffice, api, campo). `campana` (texto legacy) coexiste con `campana_id` (FK). `responsable_id` guarda el UUID del usuario asignado y `responsable` conserva el nombre visible como snapshot. `dias_sin_actividad` es un campo existente sin lógica activa. |
| 12/05/2026 | **Responsable comercial normalizado:** formularios de creación de leads guardan `responsable_id` y `responsable`. Al convertir, el UUID se propaga a cuenta y oportunidad. Migración `072_backfill_responsable_id_crm.sql` rellena históricos por coincidencia única de nombre dentro del tenant. |
| 12/05/2026 | **CRUD directo en tarjetas de Leads:** cada tarjeta muestra acciones de editar y eliminar. Editar reutiliza el panel de lead y persiste en Supabase. Eliminar borra el lead; migración `073_leads_delete_set_null.sql` ajusta FKs para conservar oportunidades, agenda y actividades con `lead_id = null`. |
| 12/05/2026 | **Estandarización fase 1 de formularios principales:** CRM & Marketing queda excluido del quick-create global basado en texto. Cada pantalla usa acción primaria explícita local. Pipeline y Agenda Comercial agregan side-panel oficial para "Nueva oportunidad" y "Nuevo evento". |
| 12/05/2026 | **Migraciones auxiliares CRM (071-076):** `071_roles_categoria` añade campo `categoria` a roles. `074_leads_dias_sin_actividad_logic` activa lógica de días sin actividad en leads. `075_leads_delete_policy` agrega política de eliminación directa para leads. `076_rpc_eliminar_lead_crm` crea RPC que elimina lead y dependencias en una transacción. Las migraciones 072 y 073 están documentadas en entradas anteriores. |
| 29/04/2026 | Backend mínimos para deploy beta: RLS por permisos funcionales para Operaciones, Compras, Finanzas, RRHH, Customer Success, IA y Maestros; permisos admin sembrados para pantallas críticas; auditoría DB transversal para inserts/updates de módulos fuera de CRM/Comercial; aprobación de Hoja de Costeo y creación de Cotización atomizada vía RPC `aprobar_hoja_costeo_y_crear_cotizacion`. Migración `024_backend_minimos_deploy_beta.sql`. |
| 29/04/2026 | Hoja de Costeo: persistencia robusta mediante RPC `crear_hoja_costeo` con `security definer`. La creación ya no depende del insert directo desde frontend; el backend valida acceso al tenant y permiso funcional `hoja_costeo/crear`, inserta la fila y retorna el registro persistido. El formulario mantiene los datos y muestra error visible si Supabase rechaza la operación. Migración `023_rpc_crear_hoja_costeo.sql`. |
| 29/04/2026 | RLS permisos: `usuario_puede` ahora concede bypass global a Superadmin TIDEO activo, completando el acceso operativo de plataforma a cualquier pantalla de cualquier tenant. Esto corrige persistencia de Hoja de Costeo, Cotizaciones y OS Cliente cuando el registro lo crea soporte/plataforma en tenants donde TIDEO no tiene membresía directa. Migración `022_superadmin_global_permissions.sql`. |
| 29/04/2026 | RLS plataforma: Superadmin TIDEO ahora tiene acceso operativo a cualquier tenant sin depender de membresía directa por empresa. Se actualiza `usuario_tiene_empresa` para considerar rol `es_superadmin` activo, corrigiendo persistencia de documentos creados por soporte/plataforma en tenants nuevos. Migración `021_superadmin_tenant_data_access.sql`. |
| 29/04/2026 | Corrección multitenant: al cambiar a un tenant nuevo en modo Supabase se limpian las colecciones de negocio si la base devuelve cero registros, evitando que aparezcan datos demo en tenants recién creados. Hoja de Costeo ahora permite edición mientras no esté aprobada, incluyendo estado en revisión, y cada guardado genera nueva versión visible en la ficha. Backend agrega columnas `version` e `historial_versiones` en `hojas_costeo` mediante migración `020_hojas_costeo_versionado.sql`. |
| 29/04/2026 | Plataforma SaaS: alta operativa de tenants desde Superadmin TIDEO sin dependencia de pagos. El formulario Nueva empresa / tenant ahora captura datos de empresa y admin inicial. Backend agrega RPC `crear_tenant_con_admin`, función `usuario_es_superadmin_plataforma`, policies RLS para creación/edición de empresas, roles y membresías por superadmin, auditoría de alta de tenant y migración `019_platform_tenant_admin.sql`. La pantalla Empresas / Tenants muestra tenants reales de Supabase y métricas operativas, no MRR ni plan obligatorio. |
| 29/04/2026 | Agenda Comercial y Actividades Comerciales conectadas a Supabase. Nuevas tablas `agenda_comercial` y `actividades_comerciales` con RLS por tenant y permisos funcionales. Agenda soporta vistas Mes/Semana/Día/Lista, registra `registrado_por` y filtra por rol: vendedor ve su agenda, jefe/admin ve equipo. Al marcar un evento como realizado, se captura resultado/proxima accion y se crea automaticamente una Actividad Comercial completada vinculada al cliente, lead u oportunidad. Actividades persiste creación y cambios de estado del Kanban. Pipeline agrega timeline comercial por oportunidad: agenda, actividades, hoja de costeo, cotizaciones y OS Cliente con navegación directa. Desde una oportunidad se puede agendar seguimiento y el evento nace con `oportunidad_id`, apareciendo en Agenda y Timeline. Migraciones `016_agenda_comercial.sql` y `017_actividades_comerciales.sql`. |
| 29/04/2026 | Hoja de Costeo: nuevo documento interno entre Oportunidad y Cotización. Secciones: mano de obra, materiales, servicios terceros, logística. Cálculo automático de precio sugerido por margen objetivo. Flujo: borrador → en revisión → aprobada → genera cotización pre-rellenada. Nuevo ítem en sidebar COMERCIAL. Botón "Crear Hoja de Costeo" en panel de Pipeline. Migración 015_hojas_costeo.sql. Actualización modelo de datos (tabla hojas_costeo + columna hoja_costeo_id en cotizaciones). Cierre backend beta CRM + Comercial: RLS por permisos para cuentas, contactos, leads, oportunidades, agenda, actividades, hojas de costeo, cotizaciones y OS Cliente; auditoría básica DB por trigger; migración 018_backend_crm_comercial_hardening.sql; setup combinado regenerado. |
| 28/04/2026 | Arquitectura de entidades: separación Maestros Base vs módulos transaccionales. Flujo Lead → Cuenta corregido (Lead primero, siempre). Formulario nueva cuenta en dos momentos (comercial + financiero). Formulario lead con RUC/Razón social/Industria. Proveedores con ciclo de vida, homologación y evaluación. Sección COMPRAS nueva en sidebar con 5 módulos. Flujo completo de compras: cotización → comparativo → OC/OS → recepción → CxP + evaluación proveedor. Sección RRHH nueva en sidebar. Control de Asistencia con turnos por trabajador y cálculo automático de tardanzas. Nómina Básica con cálculo completo (bruto, AFP/ONP, IR 5ta, cargas empresa), boleta PDF y cierre de período con egreso en finanzas. Separación Préstamos al Personal vs Financiamiento y Deuda. Módulo Financiamiento y Deuda con tabla de amortización automática, conexión de intereses al ER y reporte de deuda a 12 meses. |
| 27/04/2026 | Wiring F3 completo (13 rutas). BI Financiero nuevo. Dashboard F3 + CS 360° en cuentas. RRHH Admin reportes. Planner Agenda CS. IA historial auditado. Presupuesto vs Real. Tickets mejorado. RRHH Operativo 3 tabs. BI Comercial y BI Operativo completos. Bug fix CSS (tab-bar→tabs, card-header→card-head). |
| Anterior | Núcleo multitenant, CRM, OT, administración financiera, operaciones extendidas, compras básico, inventario, Customer Success, IA. |


## REGLAS TRANSVERSALES DE NÓMINA Y ASISTENCIA (ACTUALIZADO 10-JUN-2026)
- **Días esperados por tramo**: Para régimen general, equivale a los días laborables del turno asignado menos los feriados nacionales (no son ni laborables ni faltas). Para régimen minero, equivale a los días de trabajo efectivos del ciclo que caen en el tramo. Para suspensión perfecta, es cero.
- **Etiqueta de Régimen 'Mixto'**: Cuando un trabajador transita entre regímenes o tramos (ej. Minero a General, o Suspensión Perfecta), el resumen de nómina lo categoriza como 'Mixto (Minero -> General)', reflejando su realidad mensual en vez de ocultar tramos.
- **Invariante de Asistencia**: Asistencias nunca pueden superar a Días Esperados. El cálculo reconcilia múltiples tramos para asegurar que no existan ratios absurdos como '29/22'. Las asistencias son días reales laborados dentro de los esperados.
- **Días computables**: Exclusivo para mostrar la porción del régimen minero. Para 'Mixtos', se muestra explícitamente como 'X (mina)' para no confundir la base.


---

## 9. Tablas de Soporte Organizacional y Minero (Nuevas)

### `niveles_jerarquicos`
Niveles de jerarquía definidos por tenant para el modelado profundo del organigrama.
- `id`, `empresa_id`, `nombre`, `peso_relativo`

### `roster_minero_ajustes`
Ajustes manuales y revisiones al roster minero generado.
- `id`, `empresa_id`, `roster_snapshot_id`, `personal_id`, `ajuste_dias`, `notas`, `estado`

### `personal_asignaciones_um`
Relación entre personal y unidades mineras (Sedes con `tipo_um_asignaciones`).
- `id`, `empresa_id`, `personal_id`, `sede_id`, `fecha_inicio`, `fecha_fin`

### `ingresos_extraordinarios`
Gestión de ingresos no recurrentes acoplados a nómina.
- `id`, `empresa_id`, `personal_id`, `concepto`, `monto`, `periodo_aplicacion`, `estado`
