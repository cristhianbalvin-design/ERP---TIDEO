# ERP Modular Est├índar para Empresas de Servicios con CRM Potenciado
## Documento Maestro Consolidado ÔÇö TIDEO Tech & Strategy
### Arquitectura Multitenant SaaS · Última actualización: 15/05/2026

---

## 1. Datos de la empresa proponente

**Empresa:** TIDEO Tech & Strategy
**Especialidad:** Transformaci├│n digital, automatizaci├│n de procesos, anal├¡tica, inteligencia artificial aplicada y desarrollo de plataformas empresariales a medida.
**Enfoque:** Primero se dise├▒a el proceso comercial, operativo y financiero; luego se implementa la tecnolog├¡a que lo soporta.
**Contacto:** cristhianbalvin@gmail.com | **Web:** cristhianbalvin.com
**Stack:** React 18 + Vite 5 ┬À Supabase ┬À Vercel ┬À Context API ┬À agentes de IA.
**Modelo comercial:** SaaS multitenant ÔÇö usuarios ilimitados seg├║n plan contratado por empresa.

---

## 2. Prop├│sito del documento

Este documento es el **├║nico maestro de referencia** del ERP. Consolida arquitectura, m├│dulos, flujos, reglas de negocio, modelo de datos multitenant, estado de desarrollo, indicadores, roles y fases de implementaci├│n. Se actualiza en cada sesi├│n de desarrollo relevante.

El ERP opera como plataforma **SaaS multitenant**: una sola instalaci├│n sirve a m├║ltiples empresas clientes con datos completamente aislados. TIDEO administra la plataforma global; cada empresa administra su propio entorno.

---

## 3. Estado de desarrollo — 12/05/2026

### 3.1 Resumen de progreso

| Área | Estado |
|------|--------|
| Módulos implementados (construidos) | ~63 |
| Módulos en prompt pendiente de implementar | 3 |
| Stack técnico | React 18 + Vite 5 · Context API · CSS custom properties · Supabase |
| Arquitectura | Multitenant SaaS funcional con selector de empresa y simulador de roles |
| Migraciones SQL aplicadas en Supabase | 078 (última confirmada: leads_campos_reactivacion) |
| Migraciones creadas pendientes de aplicar | 079 opp_historial_etapas |

### 3.2 Inventario completo de m├│dulos

#### Business Intelligence
| M├│dulo | Estado |
|--------|--------|
| Dashboard General | Ô£à Implementado |
| BI Comercial | Ô£à Implementado |
| BI Operativo | Ô£à Implementado |
| BI Financiero | Ô£à Implementado |
| BI Customer Success | Ô£à Implementado |

#### CRM y Comercial
| M├│dulo | Estado | Notas |
|--------|--------|-------|
| Cuentas y Contactos | Ô£à Implementado | Pendiente: expandir formulario alta, tab condiciones financieras, nota orientaci├│n flujo |
| Leads y Scoring | Ô£à Implementado | Pendiente: agregar Raz├│n Social, RUC, Industria al formulario |
| Pipeline y Oportunidades | ✔ Implementado | Timeline: movimientos entre etapas registrados en `opp_historial_etapas` (migr. 079 pendiente de aplicar) |
| Agenda Comercial | Ô£à Implementado | Planificaci├│n de visitas y demos |
| Actividades Comerciales | Ô£à Implementado | |
| Hoja de Costeo | Ô£à Implementado | Documento interno entre Oportunidad y Cotizaci├│n. Secciones: MO, materiales, servicios terceros, log├¡stica. Flujo: borrador ÔåÆ en revisi├│n ÔåÆ aprobada ÔåÆ genera cotizaci├│n pre-rellenada |
| Cotizaciones | Ô£à Implementado | |
| OS Cliente | Ô£à Implementado | |
| Marketing Automation — Campañas | ✔ Implementado | CRUD completo: crear/editar/pausar/reactivar campañas. Métricas: leads atribuidos, tasa conversión, ingreso atribuido, CPL, ROI. Ficha de campaña con leads detallados. `campana_id` viaja en leads → oportunidades. |

#### Operaciones
| M├│dulo | Estado |
|--------|--------|
| Planner y Recursos (+ Agenda CS) | Ô£à Implementado |
| Backlog | Ô£à Implementado |
| ├ôrdenes de Trabajo (OT) | Ô£à Implementado |
| Partes Diarios | Ô£à Implementado |
| Cierre T├®cnico y Calidad | Ô£à Implementado |
| Soporte y Tickets | Ô£à Implementado |

#### RRHH
| M├│dulo | Estado | Notas |
|--------|--------|-------|
| Personal Operativo | Ô£à Implementado (en Configuraci├│n) | Mover a secci├│n RRHH |
| Personal Administrativo | Ô£à Implementado (en Configuraci├│n) | Mover a secci├│n RRHH |
| Control de Asistencia | ✔ Implementado | 4 tabs: diaria, semanal, mensual, resumen. Tardanzas y horas extra automáticas. Registro masivo. |
| Turnos y Horarios | ✔ Implementado | Módulo standalone `pages_turnos.jsx`. CRUD completo: crear/editar/eliminar con side-panel. Campos: nombre, entrada/salida, tolerancia, cruza medianoche, días laborables (o variables), refrigerio. Preview de horas efectivas en tiempo real. |
| Nómina Básica | ✔ Implementado | Cálculo completo: bruto, AFP/ONP, IR 5ta, cargas empresa. Cierre de período → egresos en finanzas. |
| Pr├®stamos al Personal | Ô£à Implementado (como "Pr├®stamos y Pagos") | Mover a secci├│n RRHH |

#### Log├¡stica
| M├│dulo | Estado |
|--------|--------|
| Almacenes / Inventario (+ Kardex) | Ô£à Implementado |
| SOLPE Interna | Ô£à Implementado |
| Transporte y Gu├¡as | Ô£à Implementado |

#### Compras
| Módulo | Estado | Notas |
|--------|--------|--------|
| Proveedores (completo + homologación + evaluación) | ✔ Implementado | Ciclo de vida + 6 tabs: Resumen, Condiciones, Documentos, Evaluaciones, Historial OC, Contactos |
| Cotizaciones de Compra | ✔ Implementado | Wizard 3 pasos. Cuadro comparativo. Selección proveedor ganador |
| Órdenes de Compra | ✔ Implementado | Para bienes. Timeline de seguimiento por estados |
| Órdenes de Servicio Interna | ✔ Implementado | Para servicios tercerizados. Conformidad como cierre |
| Recepciones | ✔ Implementado | Verificación ítem por ítem. Genera CxP + evaluación proveedor |

#### Administraci├│n y Finanzas
| M├│dulo | Estado | Notas |
|--------|--------|-------|
| Ventas | Ô£à Implementado | |
| Caja Chica y Anticipos | Ô£à Implementado | |
| Pr├®stamos al Personal | Ô£à Implementado | Renombrar y mover a secci├│n RRHH |
| Financiamiento y Deuda | ✔ Implementado | `pages_fin_deuda.jsx`. Tabla de amortización automática. Intereses → ER. Reporte de deuda 12 meses. |
| Cuentas por Cobrar | Ô£à Implementado | |
| Cuentas por Pagar | Ô£à Implementado | |
| Facturaci├│n | Ô£à Implementado | |
| Tesorer├¡a / Match Bancario | Ô£à Implementado | |
| Estado de Resultados | Ô£à Implementado | |
| Valorizaciones | Ô£à Implementado | |
| Presupuesto vs Real | Ô£à Implementado | |

#### Customer Success
| M├│dulo | Estado |
|--------|--------|
| Onboarding | Ô£à Implementado |
| Planes de ├ëxito | Ô£à Implementado |
| Health Score | Ô£à Implementado |
| Renovaciones | Ô£à Implementado |
| Fidelizaci├│n y NPS | Ô£à Implementado |
| BI Customer Success | Ô£à Implementado |

#### Inteligencia Artificial
| M├│dulo | Estado |
|--------|--------|
| IA Comercial + Historial auditado | Ô£à Implementado |
| IA Operativa + Historial auditado | Ô£à Implementado |
| IA Financiera + Historial auditado | Ô£à Implementado |

#### Configuraci├│n
| M├│dulo | Estado | Notas |
|--------|--------|-------|
| Usuarios | Ô£à Implementado | |
| Roles y Permisos | Ô£à Implementado | |
| Maestros Base | Ô£à Implementado | Pendiente: corregir arquitectura (ver secci├│n 5) |
| Cat├ílogo de Servicios | Ô£à Implementado | Pendiente: revisar si formulario es completo |
| Tarifarios | Ô£à Implementado | |
| Par├ímetros Generales | Ô£à Implementado | |

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

| Prompt | Descripci├│n | Orden de ejecuci├│n |
|--------|-------------|-------------------|
| `prompt_fix_maestros_rrhh.md` | Correcci├│n arquitectura Maestros Base (eliminar Personal, agregar Especialidades/Tipos de servicio/Almacenes) | 1 |
| `prompt_fix_clientes_arquitectura.md` | Clientes solo lectura en Maestros Base, formulario nueva cuenta expandido, tab condiciones financieras | 2 |
| `prompt_fix_lead_cuenta_flujo.md` | Formulario lead con RUC/Raz├│n social, convertir lead, flujo completo CRM | 3 |

### 3.4 Estructura de archivos fuente

| Archivo | Responsabilidad | Tamaño aprox. |
|---------|----------------|---------------|
| `src/App.jsx` | Router principal, switch de rutas | 44 KB |
| `src/data.js` | Todos los datasets mock (MOCK export) | 108 KB |
| `src/context.jsx` | Estado global, funciones de mutación, CRM sync, historial etapas, asistencia, planner | 153 KB |
| `src/shell.jsx` | Layout, sidebar, header, dark mode, simulador de roles | 26 KB |
| `src/pages_core.jsx` | Dashboard, CRM, Leads, Pipeline, Campañas, BI Comercial, BI Operativo | 228 KB |
| `src/pages_ops.jsx` | OT, Partes, Planner, Tickets, RRHH, Compras, Cuentas 360° | 319 KB |
| `src/pages_admin.jsx` | Configuración, Usuarios, Roles, Maestros, Tesorería, ER, CxC, CxP | 149 KB |
| `src/pages_turnos.jsx` | Turnos y Horarios (CRUD completo, standalone) | 12 KB |
| `src/pages_api_keys.jsx` | API Keys — generación, permisos, revocación, one-time display | 16 KB |
| `src/pages_fin.jsx` | CxC, CxP, Facturación, Tesorería, Presupuesto | 63 KB |
| `src/pages_bi_fin.jsx` | BI Financiero | 20 KB |
| `src/pages_ia.jsx` | IA Comercial, Operativa, Financiera + Historial auditado | 54 KB |
| `src/pages_cs.jsx` | Customer Success completo | 46 KB |
| `src/icons.jsx` | Iconografía, helpers money/moneyD | 8.6 KB |
| `src/lib/hierarchy.js` | ROLE_CATEGORIES, HIERARCHY_LEVELS, getAssignableUsers, getPotentialManagers | 4.9 KB |
| `src/pages_extra.jsx` | Cotizaciones, Valorizaciones, Inventario, Hoja de Costeo | 51 KB |
| `src/pages_fin_deuda.jsx` | Financiamiento y Deuda (standalone) | 28 KB |
| `src/pages_mobile.jsx` | Vistas de campo móvil (MobileFieldView, PWA) | 80 KB |
| `src/lib/dataMode.js` | VITE_DATA_MODE switch (supabase/mock) | 0.6 KB |
| `src/lib/currency.js` | Helpers de formateo de moneda | 2.2 KB |
| `src/services/crmService.js` | loadCrmFromSupabase, normalización, inserts CRM | 23 KB |
| `src/services/rrhhService.js` | Personal, turnos, asistencia, nómina | 20 KB |
| `src/services/comprasService.js` | Proveedores, procesos, OC, OS, recepciones | 13 KB |
| `src/services/financiamientosService.js` | Financiamientos, amortización, pagos | 10 KB |
| `src/services/maestrosService.js` | Catálogos, materiales, especialidades | 9.9 KB |
| `src/services/plannerService.js` | Planner, cuadrillas, asignaciones | 6.7 KB |
| `src/services/finanzasService.js` | CxC, CxP, facturas, caja chica | 5.3 KB |
| `src/services/operacionesService.js` | OTs, partes, tickets | 6.2 KB |
| `src/services/estadoResultadosService.js` | Cálculo ER, agrupación por categoría | 4.2 KB |
| `src/services/rolesService.js` | Roles, permisos por pantalla | 4.5 KB |
| `src/services/campanasService.js` | CRUD campañas, métricas de atribución | 2.2 KB |
| `src/services/usuariosService.js` | Usuarios, membresías, perfiles | 2.4 KB |
| `src/services/apiKeysService.js` | Generación tdk_ key, hash SHA-256, CRUD api_keys | 2 KB |
| `src/services/tesoreriaService.js` | Movimientos de tesorería, match bancario | 1.5 KB |
| `src/services/plataformaService.js` | Empresas/tenants, métricas SaaS | 1.7 KB |

### 3.5 Convenciones t├®cnicas cr├¡ticas

**CSS ÔÇö clases correctas:**
```jsx
// CORRECTO
<div className="tabs"><div className={'tab '+(activo?'active':'')}>Label</div></div>
<div className="card-head"><h3>T├¡tulo</h3></div>

// INCORRECTO ÔÇö estas clases NO existen en styles.css
<div className="tab-bar"><button className="tab-btn">...</button></div>
<div className="card-header"><span className="card-title">...</span></div>
```

**JSX:** Variables derivadas (`reduce`, `filter`, `map`) se declaran antes del `return`, nunca como IIFEs dentro del JSX.

**Mock data:** `export const MOCK = { ...datasets }` en `data.js`. Consumo v├¡a context (`useApp()`) o importaci├│n directa.

**Moneda:** `money(n)` y `moneyD(n)` desde `icons.jsx`. Local en `pages_bi_fin.jsx`: `const S = n => 'S/ ' + n.toLocaleString('es-PE')`.

### 3.6 Deuda t├®cnica conocida

| ├ìtem | Prioridad |
|------|-----------|
| `BarsChart` / `DonutChart` sin uso en `pages_core.jsx` (l├¡neas 219-278) | Baja |
| OTs inline en BIOperativo ÔÇö deben migrar a `MOCK.ots` | Media |
| Tickets sin MOCK en `Tickets` ÔÇö deben migrar a `data.js` si se cruzan con CS | Baja |
| Costo hora en RRHH Operativo es hardcodeado ÔÇö debe calcularse desde n├│mina al cerrar per├¡odo | Media |

---

## 4. Arquitectura Multitenant

### 4.1 Modelo de tenancy

Multitenant con aislamiento por `empresa_id` (row-level isolation). Toda consulta lleva filtro impl├¡cito `WHERE empresa_id = :empresa_activa`. RLS (Row Level Security en Supabase) aplica en la capa de base de datos.

```
TIDEO (Superadmin)
  Ôö£ÔöÇÔöÇ Empresa A ÔåÆ datos, usuarios, roles, config propios
  Ôö£ÔöÇÔöÇ Empresa B ÔåÆ datos, usuarios, roles, config propios
  ÔööÔöÇÔöÇ Empresa C ÔåÆ datos, usuarios, roles, config propios
```

### 4.2 Niveles de acceso

| Nivel | Qui├®n | Alcance |
|-------|-------|---------|
| Superadmin TIDEO | Equipo TIDEO | Todas las empresas, config global, m├®tricas, soporte |
| Admin Empresa | Due├▒o / Gerente | Todo su entorno: usuarios, roles, m├│dulos, datos |
| Usuario Empresa | Colaboradores | Solo lo que su rol permita |
| Usuario Campo | T├®cnicos, vendedores, compradores en campo | Vistas m├│viles seg├║n perfil |

### 4.3 Reglas de tenancy

- Archivos en rutas aisladas: `/{empresa_id}/modulo/archivo`.
- Suspensi├│n conserva datos, bloquea acceso. Cancelaci├│n retiene datos 90 d├¡as.
- Superadmin TIDEO: cada acceso a un tenant queda en log de auditor├¡a. 2FA obligatorio.
- Selector de empresa en login si el usuario pertenece a m├ís de una.

---

## 5. Arquitectura de entidades ÔÇö reglas de dise├▒o

### 5.1 Regla general

**Los m├│dulos transaccionales son la fuente de verdad. Maestros Base es de referencia.**

| Tipo de dato | Fuente de verdad | Maestros Base |
|-------------|-----------------|---------------|
| Clientes / Cuentas | Cuentas y Contactos (CRM) | Solo lectura + link |
| Proveedores | Compras ÔåÆ Proveedores | Solo lectura + link |
| Personal operativo | RRHH ÔåÆ Personal Operativo | No aplica |
| Personal administrativo | RRHH ÔåÆ Personal Administrativo | No aplica |
| Cargos | Maestros Base Ô£ô | Cat├ílogo de referencia |
| Especialidades t├®cnicas | Maestros Base Ô£ô | Cat├ílogo de referencia |
| Materiales e insumos | Maestros Base Ô£ô | Cat├ílogo de referencia |
| Almacenes y dep├│sitos | Maestros Base Ô£ô | Cat├ílogo de referencia |
| Tipos de servicio interno | Maestros Base Ô£ô | Cat├ílogo de referencia |
| Monedas, impuestos, unidades | Maestros Base Ô£ô | Cat├ílogo de referencia |

### 5.2 Flujo del cliente ÔÇö regla de origen

**El flujo normal de prospecci├│n siempre empieza en Lead, nunca en Cuenta:**

```
Primer contacto con prospecto
          Ôåô
       LEAD
  (nombre, empresa, RUC si se sabe,
   tel├®fono, necesidad, fuente)
          Ôåô
     Calificar
          Ôåô
     CONVERTIR ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÉ
          Ôåô                Ôåô                 Ôåô
      CUENTA           CONTACTO         OPORTUNIDAD
   (Prospecto)       (vinculado)       (para trabajar)
          Ôåô
   Finanzas completa condiciones
   en tab "Condiciones comerciales"
   (condici├│n de pago, l├¡mite cr├®dito,
    riesgo financiero, datos fiscales)
```

**Crear Cuenta directamente** solo cuando el cliente ya te contact├│ para comprar (salta la etapa de prospecci├│n).

### 5.3 Formulario de Lead ÔÇö campos requeridos

| Campo | Obligatorio | Notas |
|-------|-------------|-------|
| Nombre del contacto | Ô£ô | |
| Nombre de empresa | Ô£ô | Nombre comercial |
| Raz├│n social | ÔÇö | Si se conoce |
| RUC / NIT | ÔÇö | Si se tiene. Validar 11 d├¡gitos si se ingresa |
| Industria | ÔÇö | |
| Tel├®fono | ÔÇö | |
| Email | ÔÇö | |
| Fuente | ✔ | Canal de marketing (Referido, LinkedIn, Formulario web, Evento/Feria, etc.) |
| Campaña de origen | — | `campana_id` FK a campanas. Selector muestra solo campañas Activas. Nulo = orgánico/referido. |
| Responsable comercial | ✔ | |
| Necesidad declarada | ✔ | |
| Presupuesto estimado | — | |
| Registrado desde | — | backoffice / campo / api |

### 5.4 Formulario de cuenta ÔÇö dos momentos

**Momento 1 ÔÇö Alta comercial** (lo que sabe el vendedor al crear):
Nombre comercial*, Raz├│n social, RUC, Pa├¡s*, Tipo*, Industria*, Tama├▒o, Fuente, Responsable comercial*, Direcci├│n, Tel├®fono, Email, Notas.

**Momento 2 ÔÇö Condiciones financieras** (tab en la ficha, solo con permiso `ver_finanzas`):
Condici├│n de pago, l├¡mite de cr├®dito, moneda, requiere OC, riesgo financiero, clasificaci├│n interna, cuenta bancaria del cliente, datos fiscales completos.

### 5.5 Flujo del proveedor

El proveedor no tiene etapa de prospecci├│n. Nace directamente en **Compras ÔåÆ Proveedores** con ciclo de vida propio:

```
Potencial ÔåÆ En evaluaci├│n ÔåÆ Homologado ÔåÆ (Observado / Bloqueado) ÔåÆ Inactivo
```

Solo proveedores **Homologados** pueden recibir OC. Los **Observados** aparecen con advertencia. Los **Bloqueados** no aparecen en selectores.

### 5.6 Separaci├│n de pr├®stamos

| Tipo | Naturaleza | M├│dulo | Secci├│n sidebar | Impacto ER |
|------|-----------|--------|----------------|-----------|
| Pr├®stamos al personal | Activo (nos deben) | RRHH ÔåÆ Pr├®stamos al Personal | RRHH | No (recuperaci├│n de activo) |
| Financiamiento recibido | Pasivo (debemos) | Admin ÔåÆ Financiamiento y Deuda | ADMINISTRACI├ôN | S├¡ (intereses = gasto financiero) |

**Regla contable:** al pagar una cuota de financiamiento, el **capital** reduce el pasivo (no es gasto), el **inter├®s** se registra como gasto financiero en el ER, y el egreso total aparece en Tesorer├¡a.

### 5.7 Separaci├│n n├│mina vs costos de OT

Dos mediciones independientes del mismo trabajador:

| Medici├│n | Pregunta que responde | Fuente | Per├¡odo |
|---------|----------------------|--------|---------|
| N├│mina | ┬┐Cu├ínto le pago este mes? | Control de asistencia | Mensual |
| Costo OT | ┬┐Cu├ínto cost├│ esa OT? | Partes diarios | Por OT |

El **costo hora real** se calcula en n├│mina: `(Sueldo bruto + cargas sociales) ├À horas laborables`. Ese valor actualiza el campo COSTO/HORA en la ficha del t├®cnico al cerrar el per├¡odo de n├│mina y es el que se imputa a las OTs.

---

## 6. Estructura del sidebar ÔÇö arquitectura final

```
BUSINESS INTELLIGENCE
  Dashboard General
  BI Comercial
  BI Operativo
  BI Financiero

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
  ├ôrdenes de Trabajo
  Partes Diarios
  Cierre y Calidad
  Soporte y Tickets

RRHH                          ÔåÉ SECCI├ôN NUEVA
  Personal Operativo
  Personal Administrativo
  Control de Asistencia
  Turnos y Horarios
  N├│mina
  Pr├®stamos al Personal

LOG├ìSTICA
  Almacenes
  SOLPE Interna
  Transporte y Gu├¡as

COMPRAS                       ÔåÉ SECCI├ôN NUEVA
  Proveedores
  Cotizaciones (compra)
  ├ôrdenes de Compra
  ├ôrdenes de Servicio
  Recepciones

ADMINISTRACI├ôN
  Ventas
  Caja Chica y Anticipos
  Financiamiento y Deuda      ÔåÉ NUEVO (reemplaza Pr├®stamos y Pagos)
  Cuentas por Cobrar
  Cuentas por Pagar
  Facturaci├│n
  Tesorer├¡a / Match
  Estado de Resultados
  Valorizaciones
  Presupuesto vs Real

CUSTOMER SUCCESS
  Onboarding
  Planes de ├ëxito
  Health Score
  Renovaciones
  Fidelizaci├│n y NPS
  BI Customer Success

INTELIGENCIA ARTIFICIAL
  IA Comercial
  IA Operativa
  IA Financiera

CAMPO M├ôVIL
  Vistas de Campo

CONFIGURACI├ôN
  Usuarios
  Roles y Permisos
  Maestros Base
  Cat├ílogo de Servicios
  Tarifarios
  Par├ímetros

PLATAFORMA (solo Superadmin TIDEO)
  Empresas / Tenants
  Planes y Licencias
  M├®tricas SaaS
```

---

## 7. Visi├│n general y flujos

### 7.1 Flujo comercial completo

```
Lead ÔåÆ [Convertir] ÔåÆ Cuenta (Prospecto) + Contacto + Oportunidad
         Ôåô
    Hoja de Costeo [OPCIONAL ÔÇö recomendado]
    (estimaci├│n interna: MO + materiales + servicios terceros + log├¡stica)
    (calcula precio sugerido al cliente aplicando margen objetivo)
    (flujo: borrador ÔåÆ en revisi├│n ÔåÆ aprobada ÔåÆ genera cotizaci├│n pre-rellenada)
         Ôåô
    Cotizaci├│n (pre-rellenada desde HC o creada manualmente)
    (versionada, con aprobaci├│n de descuentos)
         Ôåô
    OS Cliente (control de saldos: ejecutado / valorizado / facturado)
         Ôåô
    OT ÔåÆ Parte Diario ÔåÆ Cierre T├®cnico ÔåÆ Remisi├│n/Conformidad
    (OT muestra costo estimado de HC vs costo real de ejecuci├│n)
         Ôåô
    Valorizaci├│n ÔåÆ Factura ÔåÆ CxC ÔåÆ Cobranza ÔåÆ Match Bancario
         Ôåô
    Customer Success ÔåÆ Renovaci├│n / Upsell
```

### 7.2 Flujo de compras completo

```
SOLPE Interna (desde OT o ├írea interna)
         Ôåô
    Compras recibe SOLPE aprobada
         Ôåô
    Selecciona proveedores homologados
         Ôåô
    Solicita cotizaci├│n ÔåÆ Registra respuestas
         Ôåô
    Cuadro comparativo ÔåÆ Selecciona ganador
         Ôåô
    OC (bienes) o OS Interna (servicios)
         Ôåô
    Proveedor entrega / ejecuta
         Ôåô
    Recepci├│n (bienes) o Conformidad (servicios)
         Ôåô
    Ingreso a inventario (bienes) + CxP generada + Evaluaci├│n proveedor
```

### 7.3 Flujo de RRHH y n├│mina

```
Configurar turnos y horarios
         Ôåô
    Asignar turno a cada trabajador
         Ôåô
    Registrar asistencia diaria (entrada / salida / tardanza / falta)
         Ôåô
    Al cierre del per├¡odo:
    Calcular n├│mina:
      Remuneraci├│n bruta = sueldo base - faltas - tardanzas + horas extra
      Descuentos trabajador = AFP/ONP + pr├®stamo + anticipo
      Retenci├│n IR 5ta (si aplica)
      Neto a pagar al trabajador
    Cargas empresa = ESSALUD + CTS + gratificaci├│n + vacaciones (mensualizadas)
    Costo hora real = (bruto + cargas) ├À horas laborables
         Ôåô
    Cerrar per├¡odo:
      ÔåÆ Egreso planilla en Administraci├│n ÔåÆ Gastos
      ÔåÆ Egreso cargas sociales en Administraci├│n ÔåÆ Gastos
      ÔåÆ Actualizar costo hora en ficha del t├®cnico
      ÔåÆ Boletas de pago disponibles
```

### 7.4 Flujo de financiamiento

```
Registrar pr├®stamo recibido (banco / tercero / leasing)
  ÔåÆ Monto, tasa, plazo, d├¡a de pago, tipo de cuota
  ÔåÆ Tabla de amortizaci├│n generada autom├íticamente
         Ôåô
    Cada cuota:
      Capital ÔåÆ reduce saldo del pr├®stamo (no es gasto)
      Inter├®s ÔåÆ gasto financiero en Estado de Resultados
      Total ÔåÆ egreso en Tesorer├¡a vinculado al pr├®stamo
         Ôåô
    Reporte de deuda: saldo total, cuotas del mes,
    proyecci├│n 12 meses, distribuci├│n por tipo de acreedor
```

### 7.5 Flujo de campo (PWA)

**T├®cnico:** OTs del d├¡a con direcci├│n ÔåÆ Iniciar OT (GPS autom├ítico) ÔåÆ Parte diario en 4 pasos ÔåÆ Fotos ÔåÆ Avance ÔåÆ Reportar restricci├│n.

**Comprador:** Foto de factura ÔåÆ IA extrae datos ÔåÆ Confirmar ÔåÆ Vincular a OT ÔåÆ Queda "pendiente revisi├│n backoffice".

**Vendedor:** Agenda y pr├│ximos eventos ÔåÆ Ficha cliente ÔåÆ Click-to-call ÔåÆ Actividad post-reuni├│n ÔåÆ Crear lead desde tarjeta.

**Supervisor:** Aprobar partes con un tap ÔåÆ Estado de OTs en tiempo real.

**Gerencia:** KPIs del d├¡a ÔåÆ Aprobar cotizaciones y descuentos ÔåÆ Ficha de cliente.

---

## 8. Detalle funcional de m├│dulos

---

### 8.1 Plataforma ÔÇö Gesti├│n de Empresas / Tenants

Registro operativo de empresa: raz├│n social, nombre comercial, RUC/NIT, pa├¡s, moneda base, zona horaria y estado. La creaci├│n de tenant la realiza **Superadmin TIDEO** desde Plataforma, sin depender del m├│dulo de pagos o planes comerciales. Al crear el tenant se genera autom├íticamente el rol **Admin Empresa** para ese entorno y se vincula el usuario admin si el email ya existe en Supabase Auth. Si el usuario Auth todav├¡a no existe, el tenant queda creado y el admin queda pendiente de vinculaci├│n. Acceso modo soporte con log obligatorio. M├®tricas por tenant.

---

### 8.2 Plataforma ÔÇö Planes y Licencias

Definici├│n de planes con m├│dulos incluidos y l├¡mites. M├│dulo no incluido ÔåÆ no aparece en sidebar. Alertas de uso. Upgrade/downgrade con registro.

---

### 8.3 Plataforma ÔÇö M├®tricas SaaS

Tenants activos, MRR, ARR, uso por tenant, tenants en riesgo, distribuci├│n por plan, tasa de retenci├│n y churn de la plataforma.

---

### 8.4 Constructor de Roles

Crear roles con nombre libre. Clonar. Matriz de permisos por pantalla: Ver | Crear | Editar | Anular | Aprobar | Exportar | Ver costos | Ver precios | Ver finanzas. Permisos especiales: `aprobar_descuentos`, `aprobar_compras_hasta`, `ver_salario_personal`, `anular_documentos`, `acceso_campo`, `perfil_campo`. Vista previa de c├│mo ve la app ese rol. Sin permiso "Ver" ÔåÆ pantalla no aparece en sidebar.

---

### 8.5 Maestros Base

**Cat├ílogos de referencia correctos (con formulario de alta):**
- Clientes y contactos ÔåÆ **solo lectura**, fuente de verdad en Cuentas y Contactos
- Proveedores ÔåÆ **solo lectura**, fuente de verdad en Compras ÔåÆ Proveedores
- Sedes y ubicaciones GPS
- Cargos de la empresa
- Especialidades t├®cnicas (con ├írea y si requiere certificaci├│n)
- Materiales e insumos con c├│digo de barras
- Almacenes y dep├│sitos (con tipo: Central / Sede / M├│vil / Tr├ínsito)
- Tipos de servicio interno (con clasificaci├│n y si es facturable)
- Monedas, impuestos y unidades

**Campos especiales en maestros:**

| Tabla | Campo | Prop├│sito |
|-------|-------|-----------|
| Personal | `numero_celular` | Click-to-call desde campo |
| Personal | `perfil_campo` | t├®cnico / compras / vendedor / supervisor / gerencia |
| Personal | `acceso_app_campo` | Habilita PWA |
| Materiales | `codigo_barras` | Escaneo en campo |
| OT | `ubicacion_gps` | GPS al iniciar parte |
| OT | `direccion_ejecucion` | Direcci├│n del trabajo |
| Compras/Gastos | `imagen_comprobante` | URL del comprobante |
| Compras/Gastos | `origen_registro` | campo / backoffice |
| Compras/Gastos | `datos_extraidos_ia` | JSON extracci├│n IA |
| Leads | `registrado_desde` | campo / web / formulario |

---

### 8.6 CRM ÔÇö Cuentas y Contactos

Fuente de verdad del cliente. Clasificaci├│n, industria, segmento, responsable comercial y CS. Contactos con rol. Relaci├│n muchos-a-muchos. Vista 360┬░ con tabs: Resumen, Oportunidades, Cotizaciones, OS Cliente, OTs, Facturas, Cobranza, Actividades, Contactos, **Customer Success 360┬░** (health score + dimensiones + onboarding + renovaci├│n + NPS), **Condiciones comerciales** (solo con `ver_finanzas`: condici├│n de pago, l├¡mite cr├®dito, riesgo, datos fiscales). Indicador "Condiciones pendientes" si faltan datos financieros.

---

### 8.7 CRM ÔÇö Leads

Kanban por estado: Nuevo ÔåÆ En contacto ÔåÆ Calificado ÔåÆ Convertido ÔåÆ Descartado. Card con badge de fuente, urgencia, d├¡as sin actividad y badge "Campo" si `registrado_desde = campo`. Bot├│n "Convertir" ÔåÆ modal que muestra datos que viajan y crea Cuenta + Contacto + Oportunidad en una operaci├│n. Nota: *"┬┐En prospecci├│n? Crea un Lead ÔÇö la cuenta se genera al convertirlo."*

---

### 8.8 CRM ÔÇö Pipeline y Oportunidades

Kanban: Prospecci├│n ÔåÆ Calificaci├│n ÔåÆ Propuesta ÔåÆ Negociaci├│n ÔåÆ Ganada ÔåÆ Perdida. Panel lateral con timeline de actividades. Motivo de p├®rdida obligatorio. Forecast ponderado. Conversi├│n a cotizaci├│n y OS Cliente.

---

### 8.8b Hoja de Costeo

Documento interno entre la Oportunidad y la Cotizaci├│n. No es un paso obligatorio, pero es el mecanismo formal para calcular si un trabajo es rentable antes de comprometerse con el cliente.

**Qui├®n la crea:** el vendedor experimentado, el ├írea t├®cnica, o ambos en colaboraci├│n. El campo "Responsable del costeo" registra qui├®n estim├│ sin bloquear el flujo.

**Estructura de costos:**

| Secci├│n | Qu├® incluye |
|---------|-------------|
| Mano de obra | T├®cnicos, supervisores, d├¡as de trabajo, costo d├¡a/persona |
| Materiales | Insumos, repuestos, equipos consumibles |
| Servicios de terceros | Subcontratos, gr├║as, laboratorios, especialistas externos |
| Log├¡stica y vi├íticos | Transporte, alojamiento, vi├íticos, fletes |

**C├ílculo autom├ítico:**
- `costo_total` = suma de las 4 secciones
- `precio_sugerido_sin_igv` = `costo_total / (1 - margen_objetivo_pct / 100)`
- `precio_sugerido_total` = `precio_sugerido_sin_igv ├ù 1.18`
- El resumen muestra el margen real calculado contra el margen objetivo

**Estados:** Borrador ÔåÆ En revisi├│n ÔåÆ Aprobada

**Al aprobar:** genera autom├íticamente una Cotizaci├│n en estado Borrador con los ├¡tems pre-rellenados (precios calculados con el margen objetivo aplicado por ├¡tem). El vendedor puede ajustar antes de enviar al cliente.

**Trazabilidad:** la Cotizaci├│n generada guarda `hoja_costeo_id`. En la OT asociada, el campo `costoEst` toma el `costo_total` de la HC para el comparativo estimado vs real al cierre.

**Permisos requeridos:** `ver_costos` para ver montos. Aprobaci├│n puede requerir `aprobar` seg├║n configuraci├│n del rol.

---

### 8.9 Cotizaciones

Desde oportunidad. Cat├ílogo + tarifarios con auto-relleno. C├ílculo en tiempo real. Versionado con historial. Aprobaci├│n de descuentos con alerta si supera l├¡mite del rol. PDF. Conversi├│n a OS Cliente. Estados: Borrador ÔåÆ Enviada ÔåÆ En negociaci├│n ÔåÆ Aprobada ÔåÆ Rechazada ÔåÆ Vencida ÔåÆ Convertida.

---

### 8.10 OS Cliente

Vinculada a cotizaci├│n. Panel de saldos: total aprobado / ejecutado / valorizado / facturado / pendiente. Asociaci├│n a m├║ltiples OTs. Tabs: OTs, Valorizaciones, Facturas, Historial. Breadcrumb de flujo en pantallas de detalle.

---

### 8.11 OT ÔÇö Orden de Trabajo

Tipos: cliente, interna, tercerizada, garant├¡a, correctiva, preventiva, emergencia, proyecto. Facturable / no facturable. Asociaci├│n a OS Cliente, proyecto, centro de costo. `direccion_ejecucion` y `ubicacion_gps`. Tareas, materiales, servicios terceros, gastos, evidencias, conformidad. Cierre t├®cnico y econ├│mico. Costo real y margen. PDF. Estados con badges de color.

---

### 8.12 Partes Diarios

Por OT: t├®cnico, fecha, actividades, horas, avance, materiales, evidencias. Aprobaci├│n del supervisor. Badge "Campo" si registrado desde m├│vil con GPS.

---

### 8.13 Planner y Recursos

Calendario visual. Vista por t├®cnico, cuadrilla, sede. Validaci├│n de disponibilidad. Alertas de conflicto. Reprogramaci├│n con motivo. **Tab Agenda CS:** renovaciones pendientes, onboardings en progreso, planes con alertas, NPS pendientes.

---

### 8.14 RRHH ÔÇö Personal Operativo

Ficha completa: cargo, especialidad, turno asignado, costo hora (normal y extra). 3 tabs: Personal (tabla con avatar y datos), Disponibilidad (grilla semanal 5d ├ù 6 t├®cnicos), Documentos (SCTR/M├®dico/EPP/Licencia con sem├íforo). Secci├│n "Datos de n├│mina" visible solo con `ver_finanzas`: sueldo base, AFP/ONP, hijos, r├®gimen. Formulario alta: + Nuevo t├®cnico con todos los campos.

---

### 8.15 RRHH ÔÇö Personal Administrativo

2 tabs: Personal (ficha completa: contrato, vacaciones, licencias, permisos), Reportes (headcount por ├írea, contratos por vencer, ranking vacaciones, solicitudes pendientes). Formulario alta: + Nuevo colaborador.

---

### 8.16 RRHH ÔÇö Turnos y Horarios

Cat├ílogo de turnos de la empresa. Campos por turno: nombre, hora entrada, hora salida, tolerancia de tardanza (minutos), cruza medianoche (toggle), d├¡as laborables o variables, minutos de refrigerio. C├ílculo autom├ítico de horas efectivas. Los turnos se asignan en la ficha de cada trabajador.

**Turnos base sugeridos:** Ma├▒ana (8-17), Tarde (14-23), Noche (22-6), Campo (6-18, variable), Administrativo (9-18).

---

### 8.17 RRHH ÔÇö Control de Asistencia

Registro manual: seleccionar trabajador, fecha, hora de entrada, hora de salida. El sistema calcula autom├íticamente tardanza (comparando contra turno + tolerancia) y horas extra (exceso sobre hora de salida).

**Estados autom├íticos:** Completo (verde), Tardanza (naranja), Horas extra (cyan), Falta (rojo), Falta justificada (rojo con borde). Justificaci├│n: checkbox simple sin flujo de aprobaci├│n.

**4 tabs:** Vista diaria (tabla del d├¡a), Vista semanal (grilla), Vista mensual (resumen por trabajador con totales), Resumen por trabajador (detalle + impacto referencial en n├│mina + exportar Excel).

**Registro masivo:** modal con todos los trabajadores del d├¡a en una sola grilla.

---

### 8.18 RRHH ÔÇö N├│mina B├ísica

**M├│dulo para Per├║ ÔÇö configurable por pa├¡s en versiones futuras.**

**ÔÜá Disclaimer permanente:** *"Los c├ílculos son referenciales. Valida con tu contador antes de procesar pagos."*

**Flujo de c├ílculo:**
1. Remuneraci├│n bruta = sueldo base ÔêÆ descuento faltas ÔêÆ descuento tardanzas + horas extra (├ù1.25) + asignaci├│n familiar.
2. Descuentos trabajador = AFP (13.24% aprox.) o ONP (13%) + cuota pr├®stamo + anticipo + judicial.
3. Retenci├│n IR 5ta = aplica si ingreso anual > 7 UIT (S/36,050 en 2026). Escala progresiva.
4. Neto a pagar = bruto ÔêÆ descuentos ÔêÆ IR.
5. Cargas empresa = ESSALUD (9%) + CTS (1/12) + Gratificaci├│n (1/6) + Vacaciones (1/12).
6. Costo real empresa = bruto + cargas.
7. Costo hora real = costo real ├À horas laborables del mes.

**Cierre de per├¡odo** ÔåÆ registra 2 egresos en Administraci├│n/Gastos: planilla (neto) + cargas sociales. Actualiza costo hora de cada t├®cnico. Genera boletas en PDF.

**4 tabs:** Resumen del per├¡odo (tabla consolidada), Detalle por trabajador (desglose completo), Cargas empresa (ESSALUD, CTS, gratificaci├│n, vacaciones), Historial de per├¡odos.

---

### 8.19 RRHH ÔÇö Pr├®stamos al Personal

Pr├®stamos que la empresa otorga a sus trabajadores. Naturaleza: activo (nos deben). Se descuenta en n├│mina. Tabla con empleado, monto, cuotas, avance pagado, estado. Toggle "Descontar autom├íticamente en n├│mina". No confundir con financiamiento recibido.

---

### 8.20 SOLPE Interna

Origen de toda necesidad de compra. Desde OT o parte diario. Clasificaci├│n, urgencia, centro de costo. Flujo visual: Borrador ÔåÆ Solicitada ÔåÆ Aprobada ÔåÆ Atendida. Al aprobarse, Compras la recibe y genera el proceso de cotizaci├│n.

---

### 8.21 Inventario y Almacenes

Stock disponible, reservado y m├¡nimo por almac├®n. Entradas, salidas, consumos por OT, transferencias, ajustes, devoluciones. Kardex en panel lateral. Alertas de stock cr├¡tico. Lote/serie/vencimiento. Inventario f├¡sico. C├│digo de barras (campo m├│vil F2).

---

### 8.22 Compras ÔÇö Proveedores

Ciclo de vida: Potencial ÔåÆ En evaluaci├│n ÔåÆ Homologado ÔåÆ Observado/Bloqueado ÔåÆ Inactivo. Solo homologados aparecen en selectores de OC. Ficha con 6 tabs: Resumen, Condiciones financieras (visible con `ver_finanzas`: condici├│n de pago, banco, CCI, retenci├│n), Documentos (SCTR/p├│liza/certificaciones con sem├íforo de vencimiento), Evaluaciones (homologaci├│n + post-OC con score acumulado), Historial OC, Contactos.

**Evaluaci├│n de homologaci├│n:** capacidad t├®cnica, documentaci├│n, solidez financiera, referencias, precio competitivo. Score ponderado ÔåÆ aprobado o rechazado.

**Evaluaci├│n post-OC:** cumpli├│ plazo, calidad, precio, comunicaci├│n ÔåÆ actualiza score acumulado del proveedor.

---

### 8.23 Compras ÔÇö Cotizaciones

Wizard 3 pasos: 1) Origen (SOLPE o libre) + descripci├│n + tipo (bien/servicio) + fecha l├¡mite. 2) Selecci├│n de proveedores homologados a consultar. 3) Confirmar y crear proceso.

Detalle con tabs: Respuestas de proveedores (card por proveedor con estado), Comparativo (tabla lado a lado con Ôÿà al mejor precio + recomendaci├│n autom├ítica), Resultado (proveedor ganador + justificaci├│n + link a OC/OS).

---

### 8.24 Compras ÔÇö ├ôrdenes de Compra

Para bienes. Vinculada a SOLPE y proceso de cotizaci├│n. ├ìtems con cantidad, precio unitario, subtotal. IGV, total. Plazo de entrega. Seguimiento por timeline. Estados: Emitida ÔåÆ Confirmada ÔåÆ En tr├ínsito ÔåÆ Recibida parcial ÔåÆ Cerrada.

---

### 8.25 Compras ÔÇö ├ôrdenes de Servicio Interna

Para servicios tercerizados. Mismo patr├│n que OC pero con alcance, entregables y criterios de conformidad. Cierre = conformidad aprobada (no recepci├│n f├¡sica). Estados: Emitida ÔåÆ Confirmada ÔåÆ En ejecuci├│n ÔåÆ Pendiente conformidad ÔåÆ Cerrada.

---

### 8.26 Compras ÔÇö Recepciones

Confirmar que lo pedido lleg├│ y en qu├® condici├│n. Verificaci├│n ├¡tem por ├¡tem (pedido vs recibido). Tipo: total, parcial u observada. Al confirmar: actualiza OC, ingresa bienes a inventario (si es compra), genera CxP, crea evaluaci├│n post-servicio en ficha del proveedor.

---

### 8.27 Costos por OT

Costo estimado vs real. Mano de obra (desde parte diario ├ù costo hora real), materiales (desde inventario), servicios terceros, log├¡stica, gastos. Margen bruto y porcentual. Visible solo con `ver_costos`.

---

### 8.28 Valorizaci├│n

Agrupar OTs cerradas por cliente/per├¡odo. Aplicar tarifas, descuentos, penalidades, impuestos. Flujo de aprobaci├│n. Control de OTs valorizadas y pendientes. PDF.

---

### 8.29 Facturaci├│n

Desde valorizaci├│n aprobada o OS Cliente. Datos fiscales, impuestos, vencimiento. Notas de cr├®dito/d├®bito. Exportaci├│n para facturaci├│n electr├│nica externa.

---

### 8.30 Tesorer├¡a y Match Bancario

Bancos y cuentas. Ingresos vinculados a CxC/anticipo. Egresos vinculados a CxP/gasto/pr├®stamo/cuota de financiamiento. Match bancario: conciliar movimiento bancario con CxC (cr├®ditos) o CxP/gasto (d├®bitos). Flujo de caja proyectado vs real.

---

### 8.31 Estado de Resultados

```
INGRESOS
  Ventas de servicios
COSTO DE VENTAS
  Mano de obra | Materiales | Servicios terceros
UTILIDAD BRUTA ÔåÆ margen %
GASTOS OPERATIVOS
  Administrativos | Comerciales | Log├¡sticos
  Planilla per├¡odo (desde n├│mina cerrada)
  Cargas sociales (desde n├│mina cerrada)
RESULTADO OPERATIVO
GASTOS FINANCIEROS
  Intereses de pr├®stamos (desde cuotas de financiamiento pagadas)
RESULTADO NETO ÔåÆ margen %
```

Filtros: per├¡odo, cliente, proyecto, centro de costo. Drill-down por categor├¡a. Comparativo per├¡odo anterior.

---

### 8.32 Financiamiento y Deuda

**Naturaleza: pasivo de la empresa** (nos prestaron, debemos devolver).

Tipos: bancario, tercero (persona natural/empresa), leasing, l├¡nea de cr├®dito revolvente.

**Tabla de amortizaci├│n generada autom├íticamente** al crear: cuota por cuota con capital, inter├®s, total y saldo. Sistema franc├®s (cuota fija), alem├ín (cuota decreciente) o bullet.

**Al pagar cuota:** capital ÔåÆ reduce saldo del pr├®stamo. Inter├®s ÔåÆ gasto financiero en ER. Total ÔåÆ egreso en Tesorer├¡a.

**Reporte de deuda:** saldo total vigente, cuotas del mes (capital + inter├®s), proyecci├│n 12 meses por mes, distribuci├│n por tipo de acreedor, detalle por pr├®stamo con barra de avance.

**Alertas:** cuota pr├│xima a vencer (7 d├¡as) en Dashboard y notificaciones.

---

### 8.33 Presupuesto vs Real

Por proyecto/centro de costo. Aprobaci├│n con cadena visual (4 aprobadores con estado). Comparaci├│n real vs presupuesto con variaciones absolutas y porcentuales. Alertas por desviaci├│n. Proyecci├│n de cierre.

---

### 8.34 Customer Success ÔÇö m├│dulos completos

**Onboarding:** activaci├│n al ganar oportunidad. Checklist configurable, reuni├│n de arranque, hitos con alertas, satisfacci├│n inicial.

**Planes de ├ëxito:** objetivos del cliente, periodicidad de revisi├│n, seguimiento de adopci├│n, alertas de riesgo temprano.

**Health Score:** 5 dimensiones ponderadas: uso de plataforma, soporte, NPS, finanzas, relaci├│n CS. Sem├íforo: saludable >70 / observaci├│n 50-70 / riesgo 30-50 / cr├¡tico <30. Alerta autom├ítica al caer bajo umbral.

**Renovaciones:** alertas 90/60/30 d├¡as antes. Oportunidad en pipeline autom├ítica. Regla: cliente con deuda vencida se eval├║a antes de upsell.

**Fidelizaci├│n y NPS:** encuestas autom├íticas post-servicio, promotores/neutros/detractores, referidos vinculados al cliente fuente, casos de ├®xito con autorizaci├│n.

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

**IA Comercial:** resumen de cliente/oportunidad, siguiente mejor acci├│n, redacci├│n asistida, clasificaci├│n de leads, predicci├│n de cierre, recomendaci├│n de servicios.

**IA Operativa:** resumen de OT, borrador desde descripci├│n libre, clasificaci├│n de tickets, detecci├│n de demoras, alertas de SLA. **Campo (F1):** extracci├│n de datos de facturas con foto.

**IA Financiera:** desviaciones de costo, alerta de margen bajo, priorizaci├│n de cobranza, explicaci├│n de variaciones.

**Historial auditado en cada m├│dulo:** Fecha | Acci├│n (badge) | Entidad | Recomendaci├│n (90 chars) | Acci├│n tomada | Usuario.

**Regla:** La IA asiste, no aprueba. Toda acci├│n de IA queda en `ia_logs`.

---

### 8.36 Vistas de Campo M├│viles ÔÇö PWA

Instalable desde el browser. Rutas mobile-first. Acceso a c├ímara. Sincronizaci├│n offline b├ísica. Solo con `acceso_campo = true`.

**T├®cnico:** OTs del d├¡a ÔåÆ GPS al iniciar ÔåÆ parte en 4 pasos (actividad / materiales / avance / fotos) ÔåÆ reportar restricci├│n.

**Comprador:** foto ÔåÆ IA extrae (proveedor, n├║mero, fecha, monto, IGV) ÔåÆ confirmar ÔåÆ vincular a OT ÔåÆ queda "pendiente revisi├│n backoffice".

**Vendedor:** ficha cliente con click-to-call ÔåÆ actividad post-reuni├│n ÔåÆ lead desde tarjeta.

**Supervisor:** aprobar partes ÔåÆ mapa de OTs con sem├íforo SLA.

**Gerencia:** KPIs del d├¡a ÔåÆ aprobar cotizaciones.

**F2 pendiente:** checklist de seguridad, confirmaci├│n de traslado, aprobaci├│n SOLPE, escaneo c├│digo de barras.

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

**CRM:** cuentas, contactos, relacion_cuenta_contacto, leads (+campana_id), oportunidades (+campana_id), campanas, etapas_pipeline, actividades_comerciales, health_score_cliente, lead_historial_estados (append-only, cargada en boot desde Supabase), opp_historial_etapas (append-only, migración 079 pendiente de aplicar).

**Integraciones:** api_keys (empresa_id, key_hash, descripcion, permisos text[], activo, creado_por, ultimo_uso_en).

**Comercial:** hojas_costeo (con secciones jsonb: mano_obra, materiales, servicios_terceros, logistica + totales calculados + margen_objetivo_pct + responsable_costeo + cotizacion_id), cotizaciones (+ hoja_costeo_id para trazabilidad), historial_versiones_cotizacion, os_cliente, condiciones_comerciales.

**Operaciones:** backlog, ordenes_trabajo (+ubicacion_gps, direccion_ejecucion), partes_diarios, evidencias, conformidad_cliente, remisiones, valorizaciones.

**Inventario y compras:** almacenes, stock, movimientos_inventario, kardex, solpe_interna, proveedores, documentos_proveedor, evaluaciones_proveedor, contactos_proveedor, procesos_compra, ordenes_compra, ordenes_servicio, recepciones, conformidad_proveedor, traslados_logisticos.

**RRHH:** personal_operativo (+turno_id, sueldo_base, sistema_pensionario), personal_administrativo, turnos, registros_asistencia, periodos_nomina, detalle_nomina, prestamos_personal.

**Financiamiento:** financiamientos, tabla_amortizacion, pagos_financiamiento.

**Finanzas:** costos_ot, ventas, compras_gastos (+imagen_comprobante, origen_registro, datos_extraidos_ia), caja_chica, anticipos, facturas, cxc, cobranzas, cxp, pagos, flujo_caja, presupuestos.

**Customer Success:** onboardings, planes_exito, health_scores, churn_planes, renovaciones, nps_encuestas, referidos, casos_exito.

**IA:** ia_logs.

**Maestros:** servicios, familias_servicios, tarifarios, materiales (+codigo_barras), especialidades_tecnicas, tipos_servicio_interno, almacenes_depositos, centros_costo, sedes, proyectos.

---

## 10. Reglas transversales

### 10.1 Tenancy
Todo `empresa_id` impl├¡cito. RLS en base de datos. Sin acceso cruzado entre tenants. Superadmin con log de auditor├¡a.

### 10.2 Roles y permisos
Sin permiso "Ver" ÔåÆ pantalla no aparece en sidebar. Permisos de costos/precios/finanzas independientes. Sin `acceso_campo` ÔåÆ no accede a PWA. Rol Admin no eliminable si es el ├║nico activo.

**Jerarquia transversal:** cada rol tiene `categoria` (admin, comercial, operaciones, finanzas, RRHH, compras, logistica, customer_success u otro) y `nivel_jerarquico` (direccion, jefatura, supervisor, asesor, operativo o soporte). Cada usuario puede tener `jefe_user_id` como jefe directo dentro del tenant. Direccion/admin ve todo el tenant; jefatura y supervisores ven su equipo recursivo; asesores/operativos ven solo sus propios movimientos. Esta regla aplica a toda la plataforma, no solo al area comercial.

**Modelo World Class de asignaciones (migración 070):** el cargo laboral no define permisos. El usuario pertenece al tenant en `usuarios_empresas`; el rol define permisos; y `usuarios_asignaciones` define donde aplica ese rol. La asignacion principal se crea automaticamente desde el rol principal (trigger `trg_usuarios_empresas_sync_asignacion_principal`) para mantener simple la experiencia. Las asignaciones adicionales son opcionales y permiten estructuras matriciales: una persona puede operar en Comercial y Proyectos, o Finanzas y Operaciones, con jefe funcional y alcance por tenant, area, equipo, sede, proyecto o centro de costo.

**Alcances válidos en `usuarios_asignaciones.alcance_tipo`:** `tenant` (todo el tenant), `area`, `equipo`, `sede`, `proyecto`, `centro_costo`, `custom`.

**Regla de visibilidad por `usuario_alcance_jerarquico`:** la función devuelve `'tenant'` si el usuario tiene rol dirección/admin; `'equipo'` si tiene jefatura/supervisor; `'propio'` en cualquier otro caso. Toda RLS que dependa de jerarquía debe llamar a esta función en lugar de comparar `nivel_jerarquico` directamente, para que la sincronización con `usuarios_asignaciones` sea la fuente de verdad.

**Sincronización bidireccional:** `usuarios_empresas` sigue siendo la membresía oficial. El trigger `trg_usuarios_empresas_sync_asignacion_principal` crea/actualiza/desactiva la asignación principal en `usuarios_asignaciones` cuando cambia el rol o el estado del usuario en `usuarios_empresas`. El backfill de la migración 070 copia todos los usuarios activos existentes.

### 10.3 CRM y comercial
Lead requiere fuente y responsable. Oportunidad perdida requiere motivo. OT facturable requiere OS Cliente. Descuento sobre l├¡mite requiere aprobaci├│n. No duplicar facturaci├│n por el mismo alcance.

### 10.4 Compras
Solo proveedores homologados en selectores de OC. Bloqueados no aparecen. Toda recepci├│n actualiza: OC + inventario (si bien) + CxP + evaluaci├│n proveedor.

### 10.5 RRHH y n├│mina
N├│mina Ôëá costo de OT. Son dos mediciones independientes. Solo los **intereses** de financiamiento son gasto financiero en ER. El capital reduce el pasivo. Pr├®stamos al personal Ôëá financiamiento recibido.

### 10.6 Campo
`origen_registro = campo` en todo registro de campo. GPS autom├ítico al iniciar parte. Gasto de campo queda "pendiente revisi├│n backoffice". Datos IA en `datos_extraidos_ia` para auditor├¡a.

### 10.7 Auditor├¡a
No eliminar ÔåÆ anular con motivo y usuario. Modificaciones cr├¡ticas registran valor anterior, nuevo, fecha, IP. IA logs registran todas las acciones por recomendaci├│n de IA.

---

## 11. Indicadores clave

**CRM:** leads por fuente (campo vs web), conversi├│n por etapa, ciclo de venta, motivos de p├®rdida.

**Comercial:** pipeline, forecast ponderado, tasa de cierre, ventas por vendedor/servicio.

**Operativo:** OTs por estado, SLA, productividad t├®cnica, partes campo vs backoffice.

**Compras:** SOLPEs pendientes, lead time de proveedores, score de proveedores, stock cr├¡tico.

**RRHH:** asistencia promedio %, tardanzas por t├®cnico, horas extra por per├¡odo, costo hora real vs estimado.

**Financiero:** margen por OT/cliente/servicio, facturaci├│n, CxC/CxP vencidas, flujo de caja, ER mensual, deuda total vigente, cuotas del mes.

**Customer Success:** health score promedio, churn, retenci├│n, NPS, renovaciones pr├│ximas.

**Plataforma TIDEO:** MRR, ARR, tenants activos, churn de plataforma, distribuci├│n por plan.

---

## 12. Sistema de dise├▒o

```css
--color-navy: #1A2B4A;     /* dominante, sidebar, headers */
--color-slate: #607D8B;    /* secundario, bordes, texto muted */
--color-white: #FFFFFF;    /* fondos modo claro */
--color-green: #4CAF50;    /* acciones primarias, estados OK */
--color-orange: #FF9800;   /* alertas, pendientes */
--color-purple: #9C27B0;   /* Customer Success */
--color-cyan: #00BCD4;     /* KPIs, gr├íficas, mes actual en BI */
--dark-bg: #0D1B2E;        /* fondo oscuro */
--dark-surface: #162038;   /* tarjetas en modo oscuro */
--dark-border: #243554;    /* bordes en modo oscuro */
--dark-text: #E8EDF5;      /* texto en modo oscuro */
```

**Tipograf├¡a:** Sora (headings) + DM Sans (body). No usar Inter, Roboto ni System UI.

**Componentes clave:** Dark mode toggle (sun/moon). Simulador de roles en header. Selector de empresa activa. Breadcrumb de flujo en pantallas de detalle. Badges sem├ínticos por estado. Badge "­ƒô▒ Campo". Badge "­ƒñû Extra├¡do por IA". Badge "ÔÜá Condiciones pendientes". Badge "ÔÜá Condiciones financieras pendientes".

---

## 13. Exclusiones

- Integraci├│n con facturaci├│n electr├│nica externa por pa├¡s (se cotiza aparte).
- Integraci├│n con sistema contable externo (se cotiza aparte).
- Integraci├│n bancaria autom├ítica (se cotiza aparte).
- Exportaci├│n PDT SUNAT, integraci├│n AFP/ESSALUD en l├¡nea (n├│mina avanzada, se cotiza aparte).
- App m├│vil nativa iOS/Android ÔÇö campo se resuelve con PWA.
- Balance general completo (requiere contabilidad de partida doble ÔÇö versi├│n futura).
- Planilla/n├│mina con liquidaciones de cese complejas, r├®gimen MYPE diferenciado, utilidades (versi├│n futura).
- Hardware, tablets, impresoras.
- Migraci├│n hist├│rica masiva no definida.
- Asesor├¡a tributaria, contable o laboral.
- ERP personalizado para rubros espec├¡ficos (producto separado de TIDEO).

---

## 14. Historial de cambios

| Fecha | Cambios principales |
|-------|---------------------|
| 15/05/2026 | **Persistencia de Timeline — Leads y Oportunidades (migraciones 077-079):** `lead_historial_estados` existía en Supabase (migr. 077) pero no se cargaba al iniciar — corregido en `loadCrmFromSupabase` de `crmService.js`. `opp_historial_etapas` creada como tabla append-only (migr. 079 **pendiente de aplicar en SQL Editor**). `actualizarEtapaOportunidad` en `context.jsx` registra el movimiento optimísticamente y persiste en Supabase en paralelo. El timeline del Pipeline y de Cuentas 360° ahora muestran cambios de etapa persistidos. |
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
| 29/04/2026 | Backend mínimos para deploy beta: RLS por permisos funcionales para Operaciones, Compras, Finanzas, RRHH, Customer Success, IA y Maestros; permisos admin sembrados para pantallas cr├¡ticas; auditor├¡a DB transversal para inserts/updates de m├│dulos fuera de CRM/Comercial; aprobaci├│n de Hoja de Costeo y creaci├│n de Cotizaci├│n atomizada v├¡a RPC `aprobar_hoja_costeo_y_crear_cotizacion`. Migraci├│n `024_backend_minimos_deploy_beta.sql`. |
| 29/04/2026 | Hoja de Costeo: persistencia robusta mediante RPC `crear_hoja_costeo` con `security definer`. La creaci├│n ya no depende del insert directo desde frontend; el backend valida acceso al tenant y permiso funcional `hoja_costeo/crear`, inserta la fila y retorna el registro persistido. El formulario mantiene los datos y muestra error visible si Supabase rechaza la operaci├│n. Migraci├│n `023_rpc_crear_hoja_costeo.sql`. |
| 29/04/2026 | RLS permisos: `usuario_puede` ahora concede bypass global a Superadmin TIDEO activo, completando el acceso operativo de plataforma a cualquier pantalla de cualquier tenant. Esto corrige persistencia de Hoja de Costeo, Cotizaciones y OS Cliente cuando el registro lo crea soporte/plataforma en tenants donde TIDEO no tiene membres├¡a directa. Migraci├│n `022_superadmin_global_permissions.sql`. |
| 29/04/2026 | RLS plataforma: Superadmin TIDEO ahora tiene acceso operativo a cualquier tenant sin depender de membres├¡a directa por empresa. Se actualiza `usuario_tiene_empresa` para considerar rol `es_superadmin` activo, corrigiendo persistencia de documentos creados por soporte/plataforma en tenants nuevos. Migraci├│n `021_superadmin_tenant_data_access.sql`. |
| 29/04/2026 | Correcci├│n multitenant: al cambiar a un tenant nuevo en modo Supabase se limpian las colecciones de negocio si la base devuelve cero registros, evitando que aparezcan datos demo en tenants reci├®n creados. Hoja de Costeo ahora permite edici├│n mientras no est├® aprobada, incluyendo estado en revisi├│n, y cada guardado genera nueva versi├│n visible en la ficha. Backend agrega columnas `version` e `historial_versiones` en `hojas_costeo` mediante migraci├│n `020_hojas_costeo_versionado.sql`. |
| 29/04/2026 | Plataforma SaaS: alta operativa de tenants desde Superadmin TIDEO sin dependencia de pagos. El formulario Nueva empresa / tenant ahora captura datos de empresa y admin inicial. Backend agrega RPC `crear_tenant_con_admin`, funci├│n `usuario_es_superadmin_plataforma`, policies RLS para creaci├│n/edici├│n de empresas, roles y membres├¡as por superadmin, auditor├¡a de alta de tenant y migraci├│n `019_platform_tenant_admin.sql`. La pantalla Empresas / Tenants muestra tenants reales de Supabase y m├®tricas operativas, no MRR ni plan obligatorio. |
| 29/04/2026 | Agenda Comercial y Actividades Comerciales conectadas a Supabase. Nuevas tablas `agenda_comercial` y `actividades_comerciales` con RLS por tenant y permisos funcionales. Agenda soporta vistas Mes/Semana/D├¡a/Lista, registra `registrado_por` y filtra por rol: vendedor ve su agenda, jefe/admin ve equipo. Al marcar un evento como realizado, se captura resultado/proxima accion y se crea automaticamente una Actividad Comercial completada vinculada al cliente, lead u oportunidad. Actividades persiste creaci├│n y cambios de estado del Kanban. Pipeline agrega timeline comercial por oportunidad: agenda, actividades, hoja de costeo, cotizaciones y OS Cliente con navegaci├│n directa. Desde una oportunidad se puede agendar seguimiento y el evento nace con `oportunidad_id`, apareciendo en Agenda y Timeline. Migraciones `016_agenda_comercial.sql` y `017_actividades_comerciales.sql`. |
| 29/04/2026 | Hoja de Costeo: nuevo documento interno entre Oportunidad y Cotizaci├│n. Secciones: mano de obra, materiales, servicios terceros, log├¡stica. C├ílculo autom├ítico de precio sugerido por margen objetivo. Flujo: borrador ÔåÆ en revisi├│n ÔåÆ aprobada ÔåÆ genera cotizaci├│n pre-rellenada. Nuevo ├¡tem en sidebar COMERCIAL. Bot├│n "Crear Hoja de Costeo" en panel de Pipeline. Migraci├│n 015_hojas_costeo.sql. Actualizaci├│n modelo de datos (tabla hojas_costeo + columna hoja_costeo_id en cotizaciones). Cierre backend beta CRM + Comercial: RLS por permisos para cuentas, contactos, leads, oportunidades, agenda, actividades, hojas de costeo, cotizaciones y OS Cliente; auditor├¡a b├ísica DB por trigger; migraci├│n 018_backend_crm_comercial_hardening.sql; setup combinado regenerado. |
| 28/04/2026 | Arquitectura de entidades: separaci├│n Maestros Base vs m├│dulos transaccionales. Flujo Lead ÔåÆ Cuenta corregido (Lead primero, siempre). Formulario nueva cuenta en dos momentos (comercial + financiero). Formulario lead con RUC/Raz├│n social/Industria. Proveedores con ciclo de vida, homologaci├│n y evaluaci├│n. Secci├│n COMPRAS nueva en sidebar con 5 m├│dulos. Flujo completo de compras: cotizaci├│n ÔåÆ comparativo ÔåÆ OC/OS ÔåÆ recepci├│n ÔåÆ CxP + evaluaci├│n proveedor. Secci├│n RRHH nueva en sidebar. Control de Asistencia con turnos por trabajador y c├ílculo autom├ítico de tardanzas. N├│mina B├ísica con c├ílculo completo (bruto, AFP/ONP, IR 5ta, cargas empresa), boleta PDF y cierre de per├¡odo con egreso en finanzas. Separaci├│n Pr├®stamos al Personal vs Financiamiento y Deuda. M├│dulo Financiamiento y Deuda con tabla de amortizaci├│n autom├ítica, conexi├│n de intereses al ER y reporte de deuda a 12 meses. |
| 27/04/2026 | Wiring F3 completo (13 rutas). BI Financiero nuevo. Dashboard F3 + CS 360┬░ en cuentas. RRHH Admin reportes. Planner Agenda CS. IA historial auditado. Presupuesto vs Real. Tickets mejorado. RRHH Operativo 3 tabs. BI Comercial y BI Operativo completos. Bug fix CSS (tab-barÔåÆtabs, card-headerÔåÆcard-head). |
| Anterior | N├║cleo multitenant, CRM, OT, administraci├│n financiera, operaciones extendidas, compras b├ísico, inventario, Customer Success, IA. |
