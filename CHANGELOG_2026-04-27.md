# Changelog ERP TIDEO — 27 de Abril 2026

> Sesión de desarrollo: **6 sprints + 1 bug fix session** completados en una jornada.
> Stack: React 18 + Vite 5 · Context API · CSS custom properties · Mock data pattern.

---

## Resumen ejecutivo

| Área | Antes | Después |
|---|---|---|
| Módulos activos con contenido real | ~22 | **38** |
| Archivos fuente modificados | — | **12 de 16** |
| Nuevos archivos creados | — | **1** (`pages_bi_fin.jsx`) |
| Rutas F3 conectadas en App.jsx | 0 | **13** |
| Bugs de CSS corregidos | — | **8 ocurrencias** |

---

## Archivos modificados

| Archivo | Modificado | Tamaño |
|---|---|---|
| `src/App.jsx` | 27/04 20:13 | 30 KB |
| `src/data.js` | 27/04 20:12 | 70 KB |
| `src/context.jsx` | 27/04 19:13 | 20 KB |
| `src/shell.jsx` | 27/04 19:20 | 11 KB |
| `src/pages_bi_fin.jsx` | 27/04 12:41 | 20 KB — **NUEVO** |
| `src/pages_core.jsx` | 27/04 17:35 | 81 KB |
| `src/pages_fin.jsx` | 27/04 18:03 | 29 KB |
| `src/pages_admin.jsx` | 27/04 20:14 | 59 KB |
| `src/pages_ops.jsx` | 27/04 20:14 | 81 KB |
| `src/pages_ia.jsx` | 27/04 17:19 | 37 KB |
| `src/pages_cs.jsx` | 27/04 10:40 | 46 KB |
| `src/icons.jsx` | 26/04 09:41 | 8.6 KB |

---

## Sprint 1 — Wiring F3 + Infraestructura de datos

### `src/App.jsx`
- Añadidos 13 imports nuevos para módulos F3
- Añadidos 13 cases en el switch de rutas:
  - `rrhh_admin` → `<RRHHAdmin/>`
  - `metricas_saas` → `<MetricasSaaS/>`
  - `cs_onboarding` → `<CSOnboarding/>`
  - `cs_planes` → `<CSPlanes/>`
  - `cs_health` → `<CSHealthScore/>`
  - `cs_renovaciones` → `<CSRenovaciones/>`
  - `cs_fidelizacion` → `<CSFidelizacion/>`
  - `bi_cs` → `<BICustomerSuccess/>`
  - `ia_comercial` → `<IAComercial/>`
  - `ia_operativa` → `<IAOperativa/>`
  - `ia_financiera` → `<IAFinanciera/>`
  - `bi_financiero` → `<BIFinanciero/>`
  - `parametros` → `<Parametros/>`

### `src/data.js`
Añadidos los siguientes datasets al export `MOCK`:

| Dataset | Descripción | Registros |
|---|---|---|
| `personalAdmin` | Colaboradores administrativos con ficha completa | 6 |
| `vacacionesSolicitudes` | Solicitudes de vacaciones con estado | 4 |
| `licencias` | Licencias médicas y permisos | 3 |
| `solicitudesRRHH` | Solicitudes internas (cambio turno, préstamo, etc.) | 5 |
| `onboardings` | Procesos de onboarding de clientes con checklist e hitos | 3 |
| `planesExito` | Planes de éxito CS con objetivos y alertas | 3 |
| `healthScoresDetalle` | Health scores por dimensión (uso, soporte, NPS, finanzas, relación) | 4 |
| `churnPlanes` | Señales de churn por cliente | 2 |
| `renovaciones` | Contratos próximos a vencer con responsable CS | 4 |
| `npsEncuestas` | Encuestas NPS con respuestas | 4 |
| `referidos` | Programa de referidos | 2 |
| `casosExito` | Casos de éxito documentados | 2 |
| `iaLogs` | Historial de acciones IA auditadas | 6 |
| `biFinanciero` | Dataset completo para BI Financiero (ver Sprint 2) | — |
| `metricasSaaS` | Métricas de plataforma SaaS (MRR, churn, planes) | — |

Cambios adicionales en `data.js`:
- `roles.finanzas.permisos.ver` actualizado para incluir `bi_financiero`, `presupuestos`, `valorizacion`
- `iaLogs` pre-poblado con 6 registros: 2 comerciales, 2 operativos, 2 financieros

### `src/context.jsx`
- Estado `notificaciones` pre-poblado con **6 notificaciones F3** (4 no leídas):
  - Logística Altiplano: health score crítico (28 pts)
  - Planta Industrial Norte: NPS pendiente de respuesta
  - Minera Andes SAC: renovación en 45 días
  - Facilities Lima: onboarding al 85%
  - Ticket TK-0105: SLA vencido
  - RRHH: 2 contratos próximos a vencer
- Añadida función `markNotificacionesRead()`
- Estado para módulos CS: `onboardings`, `planesExito`, `renovaciones`, `npsEncuestas`

### `src/shell.jsx`
- Añadido `{ key: 'bi_financiero', label: 'BI Financiero', icon: I.trend }` a sección Business Intelligence
- Secciones **Customer Success** e **Inteligencia Artificial** ya presentes y funcionales

---

## Sprint 2 — BI Financiero (archivo nuevo)

### `src/pages_bi_fin.jsx` — NUEVO ARCHIVO

Componente `BIFinanciero` con **6 KPIs** y **4 tabs**:

**KPIs header:**
- Ingresos del mes, Gastos, Margen bruto %, Margen neto %, EBITDA, Flujo libre

**Tab: Rentabilidad**
- Gráfico de barras 6 meses: ingresos vs. costo vs. margen
- Tabla de margen por cliente (barra horizontal + %)
- Mix de servicios por ingresos

**Tab: CxC / CxP**
- Pirámide de antigüedad CxC (0-30, 31-60, 61-90, +90 días) con alerta si mora >90 > 0
- Tabla CxP: proveedores próximos a vencer ordenados por días

**Tab: Flujo de Caja**
- Tabla semanal proyectado vs. real (8 semanas)
- Resumen de cobros/pagos confirmados del mes

**Tab: Presupuesto vs Real**
- Tabla P&L con barra de ejecución % por partida
- Interpretación textual del estado presupuestal

**Helpers locales:**
- `S(n)` — formateador S/ peruano
- `P(n)` — formateador porcentaje con signo
- `vc(v)` — color según variación (verde/rojo)
- `vi(v)` — ícono flecha según variación

---

## Sprint 3 — Dashboard F3 + CS 360° en Cuentas + Notificaciones

### `src/pages_core.jsx` — `Dashboard`
Añadida sección F3 al final del dashboard principal:

**Card: Customer Health Portfolio**
- Distribución semáforo (verde/amarillo/rojo) contada desde `MOCK.healthScoresDetalle`
- Lista de cuentas en riesgo (score < 50): nombre, score, tendencia

**Card: Renovaciones próximas**
- Top 3 renovaciones ordenadas por `dias_restantes`
- Badge de urgencia por días restantes (rojo ≤30, naranja ≤60, verde)

### `src/pages_ops.jsx` — `Cuentas`
Añadida pestaña **"Customer Success"** al panel de detalle de cuenta:
- Health Score con gauge visual (score numérico + semáforo)
- 5 barras dimensionales (uso_plataforma, soporte, nps, finanzas, relacion_cs)
- Progress bar de Onboarding con % de checklist completado
- Plan de Éxito: objetivos con estado
- Renovación: días restantes + responsable CS
- NPS: último score + fecha + comentario del cliente

---

## Sprint 4 — RRHH Reportes + Planner Agenda CS + IA Audit Log

### `src/pages_admin.jsx` — `RRHHAdmin`
- Añadido estado `view` (`'personal'` | `'reportes'`)
- Tabs de navegación entre vistas
- **Vista Reportes** con 4 secciones:
  1. Headcount por área (barras CSS proporcionales)
  2. Contratos próximos a vencer (tabla con badge de urgencia)
  3. Ranking vacaciones disponibles (ordenado descendente)
  4. Solicitudes internas pendientes de atención

Variables computadas antes del `return` para evitar IIFEs en JSX:
- `porArea`, `maxArea`, `contratosVencer`, `vacRanking`, `solPend`

### `src/pages_ops.jsx` — `Planner`
- Añadido estado `plannerTab` (`'tecnicos'` | `'cs'`)
- **Tab "Técnicos"**: calendario semanal existente (sin cambios)
- **Tab "Agenda CS"** con 4 secciones:
  1. Renovaciones pendientes de contacto (tabla con días y estado)
  2. Onboardings en progreso (barras de % por cliente)
  3. Planes de éxito con alertas activas
  4. NPS pendientes de respuesta
- Badge de alerta en tab "Agenda CS" con count de items urgentes

### `src/pages_ia.jsx` — Historial IA
Añadido componente `IaHistorial({ tipo })`:
- Filtra `iaLogs` del context por tipo (`'comercial'` | `'operativa'` | `'financiera'`)
- Tabla: Fecha | Acción (badge) | Entidad | Recomendación (truncada 90 chars) | Acción tomada (badge) | Usuario
- Renderizado al final de `IAComercial`, `IAOperativa`, `IAFinanciera`

---

## Bug Fix Session — CSS Classes incorrectas

### Problema identificado
Las clases CSS `.tab-bar` y `.tab-btn` **no existen** en `styles.css`. Las clases correctas son:
- `.tabs` (contenedor `<div>`)
- `.tab` (elemento individual `<div>`, no `<button>`)
- `.tab.active` (`border-bottom-color: var(--cyan); font-weight: 600`)

Adicionalmente, `.card-header` y `.card-title` tampoco existen. La clase correcta es `.card-head` con `<h3>` adentro.

### Correcciones aplicadas

**`src/pages_admin.jsx` — RRHHAdmin tabs:**
```jsx
// Antes (roto)
<div className="tab-bar">
  <button className={'tab-btn '+(view==='personal'?'active':'')}>Personal</button>
</div>

// Después (correcto)
<div className="tabs">
  <div className={'tab '+(view==='personal'?'active':'')}>Personal</div>
</div>
```

**`src/pages_admin.jsx` — Reportes card headers** (4 ocurrencias):
```jsx
// Antes
<div className="card-header"><span className="card-title">...</span></div>
// Después
<div className="card-head"><h3>...</h3></div>
```

**`src/pages_ops.jsx` — Planner tabs:**
- Mismo patrón `tab-bar`/`tab-btn` → `tabs`/`tab` con `<div>`

**`src/pages_ops.jsx` — Agenda CS card headers** (4 ocurrencias):
- `card-header`/`card-title` → `card-head`/`h3`

---

## Sprint 5 — Presupuestos + Tickets + RRHH Operativo

### `src/pages_fin.jsx` — `Presupuestos`
Antes: header vacío con texto "En construcción".
Ahora: módulo completo con:

**4 KPIs:** Presupuesto total, Ejecutado, Variación neta, Ejecución global %

**Tab: Control de Gastos**
- Tabla con todas las partidas presupuestales
- Barra de ejecución % coloreada (verde/naranja/rojo según umbral)
- Badge estado: OK / En límite / Excedido
- Footer con totales: presupuesto total, ejecutado, variación
- Alerta visual si hay partidas excedidas

**Tab: Flujo de Aprobación**
- Cadena visual de aprobación con línea conectora
- 4 aprobadores: Director General ✓, Gerente Finanzas ✓, Gerente Operaciones ✓, Contabilidad (en revisión)
- Comentario por aprobador con borde de color según estado

### `src/pages_ops.jsx` — `Tickets`
Antes: 3 tickets hardcodeados, sin KPIs, sin tabs.
Ahora:

**7 tickets** con campos completos: prioridad, categoría, canal (email/portal/llamada), SLA, asignado, fecha

**4 KPIs:** Total, Abiertos, SLA en riesgo/vencido, Resueltos

**4 Tabs:** Todos / Abiertos / En Proceso / Resueltos (filtro reactivo)

**Tabla enriquecida:** 9 columnas incluyendo canal con emoji y badge de SLA coloreado

### `src/pages_ops.jsx` — `RRHH_Operativo`
Antes: 4 personas hardcodeadas, tabla única.
Ahora:

**6 técnicos** con especialidad, costo/hora, turno actual, y 4 documentos por persona (SCTR, Médico, EPP, Licencia)

**4 KPIs:** Total personal, Disponibles hoy, Docs con alerta, Costo/hora campo total

**3 Tabs:**

| Tab | Contenido |
|---|---|
| **Personal** | Tabla completa con avatar, cargo, especialidad, costo/hr, turno, estado |
| **Disponibilidad** | Grilla semanal (5 días × 6 técnicos) con OT asignada / disponible / vacaciones + leyenda de colores |
| **Documentos** | Tabla SCTR / Médico / EPP / Licencia por técnico + estado global (OK / Revisión / Vencido) |

### `src/pages_ia.jsx` — `IaHistorial` (bug fix)
- `card-header` → `card-head`
- `card-title` → `<h3>`

---

## Sprint 6 — BI Comercial + BI Operativo

### `src/pages_core.jsx` — `BIComercial`
Antes: header vacío con "En construcción".
Ahora: dashboard completo derivado de `MOCK.oportunidades`, `MOCK.leads`, `MOCK.cuentas`.

**4 KPIs:** Forecast pipeline (ponderado), Tasa de cierre %, Ticket promedio, Leads activos

**Tab: Pipeline**
- Embudo de ventas: 6 etapas (Prospección → Calificación → Propuesta → Negociación → Ganada → Perdida) con barra proporcional al valor, count y monto total por etapa
- Tabla de oportunidades abiertas ordenada por forecast descendente: etapa, responsable, fuente, monto est., forecast, fecha cierre

**Tab: Leads y Fuentes**
- Barras horizontales de leads por fuente de origen
- Cards de urgencia: alta / media / baja con conteo
- Tabla detallada de todos los leads con badge de estado

**Tab: Rendimiento Comercial**
- Gráfico de barras verticales: ventas cerradas últimos 6 meses (Nov–Abr) con el mes actual en cian
- Forecast por responsable: barras horizontales con count de opps y monto total
- Tabla de análisis de competencia: todas las opps con competidor registrado, con barra de probabilidad coloreada

### `src/pages_core.jsx` — `BIOperativo`
Antes: header vacío con "En construcción".
Ahora: dashboard completo derivado de `MOCK.ots`, `MOCK.partes`, `MOCK.backlog`.
Datos de mes enriquecidos con 4 OTs adicionales inline para representar un mes completo (6 OTs total).

**5 KPIs:** OTs del mes, Completadas, Avance promedio %, SLA cumplido %, Horas campo

**Tab: OTs y Ejecución**
- Gráfico de barras dobles: total vs. completadas por mes (Nov–Abr), mes actual resaltado en cian
- Breakdown de OTs por tipo (Preventiva/Correctiva/Proyectiva) con barras de colores
- Tabla completa de OTs del mes: tipo, responsable, barra de avance con color reactivo, badge SLA, estado

**Tab: Recursos**
- Barras de OTs por técnico: segmento cerradas (verde) + en curso (cian), con horas registradas
- Eficiencia de costo por OT cerrada: barra real/estimado % con umbral de color
- Promedio de eficiencia de costo al pie
- Tabla de partes diarios: OT vinculada, técnico, horas, avance, estado

**Tab: Backlog y Alertas**
- Cards de backlog por prioridad (alta/media/baja) con conteo
- Panel de OTs con SLA en riesgo (con estado verde "sin alertas" si todo OK)
- Tabla de requerimientos pendientes de programación

---

## Inventario completo de módulos — Estado al 27/04/2026

### Business Intelligence
| Módulo | Estado | Tabs | Datos |
|---|---|---|---|
| Dashboard General | ✅ Completo | — | Context + MOCK |
| BI Comercial | ✅ **Nuevo** | 3 | oportunidades, leads, cuentas |
| BI Operativo | ✅ **Nuevo** | 3 | ots, partes, backlog |
| BI Financiero | ✅ **Nuevo** | 4 | MOCK.biFinanciero |
| BI Customer Success | ✅ Completo | 4 | healthScores, renovaciones, nps |

### CRM & Comercial
| Módulo | Estado |
|---|---|
| Cuentas y Contactos | ✅ Completo + tab CS 360° |
| Leads y Scoring | ✅ Completo (Kanban) |
| Pipeline | ✅ Completo |
| Actividades | ✅ Completo |
| Cotizaciones | ✅ Completo (editor + detalle) |
| OS Cliente | ✅ Completo |
| Marketing Automation | ✅ Completo |

### Operaciones
| Módulo | Estado | Novedades |
|---|---|---|
| Planner y Recursos | ✅ Completo | + tab Agenda CS |
| Backlog | ✅ Completo | — |
| Órdenes de Trabajo | ✅ Completo | — |
| Partes Diarios | ✅ Completo | — |
| Cierre Técnico | ✅ Completo | — |
| Soporte y Tickets | ✅ **Mejorado** | KPIs + tabs + 7 tickets |
| RRHH Operativo | ✅ **Mejorado** | KPIs + 3 tabs (Personal/Disp./Docs) |

### Logística
| Módulo | Estado |
|---|---|
| Almacenes / Inventario | ✅ Completo (panel lateral Kardex) |
| SOLPE Interna | ✅ Completo |
| Transporte y Guías | ✅ Completo |

### Administración y Finanzas
| Módulo | Estado | Novedades |
|---|---|---|
| Cuentas por Cobrar | ✅ Completo | — |
| Cuentas por Pagar | ✅ Completo | — |
| Facturación | ✅ Completo | — |
| Tesorería / Match | ✅ Completo | — |
| Estado de Resultados | ✅ Completo | — |
| Valorizaciones | ✅ Completo | — |
| Ventas | ✅ Completo | — |
| Caja Chica | ✅ Completo | — |
| Préstamos | ✅ Completo | — |
| Compras y Proveedores | ✅ Completo | — |
| **Presupuesto vs Real** | ✅ **Nuevo** | 2 tabs + cadena de aprobación |

### Customer Success
| Módulo | Estado |
|---|---|
| Onboarding | ✅ Completo |
| Planes de Éxito | ✅ Completo |
| Health Score | ✅ Completo |
| Renovaciones | ✅ Completo |
| Fidelización y NPS | ✅ Completo |
| BI Customer Success | ✅ Completo |

### Inteligencia Artificial
| Módulo | Estado | Novedades |
|---|---|---|
| IA Comercial | ✅ Completo | + Historial/Auditoría |
| IA Operativa | ✅ Completo | + Historial/Auditoría |
| IA Financiera | ✅ Completo | + Historial/Auditoría |

### RRHH & Configuración
| Módulo | Estado | Novedades |
|---|---|---|
| RRHH Administrativo | ✅ Completo | + tab Reportes (4 secciones) |
| RRHH Operativo | ✅ **Mejorado** | 3 tabs + docs técnicos |
| Roles y Permisos | ✅ Completo | — |
| Usuarios | ✅ Completo | — |
| Maestros Base | ✅ Completo | — |
| Catálogo Servicios | ✅ Completo | — |
| Tarifarios | ✅ Completo | — |

### Plataforma SaaS (Superadmin)
| Módulo | Estado |
|---|---|
| Empresas / Tenants | ✅ Completo |
| Planes y Licencias | ✅ Completo |
| Métricas SaaS | ✅ Completo |

---

## Patrones y convenciones consolidadas

### CSS — clases correctas (crítico)
```
CORRECTO:   <div className="tabs">
              <div className={'tab '+(activo?'active':'')}>Label</div>
            </div>

INCORRECTO: <div className="tab-bar">       ← NO EXISTE
              <button className="tab-btn">  ← NO EXISTE
            </div>

CORRECTO:   <div className="card-head"><h3>Título</h3></div>
INCORRECTO: <div className="card-header"><span className="card-title"> ← NO EXISTEN
```

### JSX — computación antes del return
Variables derivadas de datos (`reduce`, `filter`, `map`) deben declararse **antes del `return`**, nunca como IIFEs `(() => {})()` dentro del JSX.

### Mock data pattern
Todos los datasets de Fase 3 siguen el patrón:
```js
// En data.js — export individual
export const nombreDataset = [...];

// En el export MOCK
export const MOCK = { ..., nombreDataset, ... };

// Consumo en componentes
const { nombreDataset } = useApp();   // vía context
// o
import { MOCK } from './data.js';     // directo (solo lectura)
```

### Formateo de moneda
```js
money(n)   // S/ 1,234  — función del helpers de icons.jsx
moneyD(n)  // para decimales
// Local (solo en pages_bi_fin.jsx):
const S = n => 'S/ ' + n.toLocaleString('es-PE');
```

---

## Deuda técnica conocida

| Item | Descripción | Prioridad |
|---|---|---|
| `BarsChart` y `DonutChart` | Helper components en `pages_core.jsx` (líneas 219–278) que no son usados por ningún componente activo. Pueden eliminarse. | Baja |
| `styles.css` sin cambios | No se añadieron estilos nuevos en toda la sesión — todos los componentes usan `style={{}}` inline. Candidatos a extraer: `kpi-grid` override de columns, grid layouts del Presupuesto. | Media |
| Datos de OTs en `BIOperativo` | Se usan 4 OTs inline hardcodeadas para completar el mes. Deberían estar en `MOCK.ots` con datos más ricos. | Media |
| Tickets sin MOCK | Los 7 tickets de `Tickets` son inline. Si se necesita cruce con CS o CRM, deberían migrar a `data.js`. | Baja |

---

*Generado automáticamente · ERP TIDEO · Sesión 27/04/2026*
