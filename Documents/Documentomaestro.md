# ERP Modular Estándar para Empresas de Servicios con CRM Potenciado
## Documento Maestro Consolidado — TIDEO Tech & Strategy
### Arquitectura Multitenant SaaS · Última actualización: 29/04/2026

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

## 3. Estado de desarrollo — 28/04/2026

### 3.1 Resumen de progreso

| Área | Estado |
|------|--------|
| Módulos en prototipo (construidos) | 38 |
| Módulos en prompt pendiente de implementar | 15 |
| Stack técnico | React 18 + Vite 5 · Context API · CSS custom properties · Mock data pattern |
| Arquitectura | Multitenant SaaS funcional con selector de empresa y simulador de roles |

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
| Cuentas y Contactos | ✅ Implementado | Pendiente: expandir formulario alta, tab condiciones financieras, nota orientación flujo |
| Leads y Scoring | ✅ Implementado | Pendiente: agregar Razón Social, RUC, Industria al formulario |
| Pipeline y Oportunidades | ✅ Implementado | |
| Agenda Comercial | ✅ Implementado | Planificación de visitas y demos |
| Actividades Comerciales | ✅ Implementado | |
| Hoja de Costeo | ✅ Implementado | Documento interno entre Oportunidad y Cotización. Secciones: MO, materiales, servicios terceros, logística. Flujo: borrador → en revisión → aprobada → genera cotización pre-rellenada |
| Cotizaciones | ✅ Implementado | |
| OS Cliente | ✅ Implementado | |
| Marketing Automation | ✅ Implementado | |

#### Operaciones
| Módulo | Estado |
|--------|--------|
| Planner y Recursos (+ Agenda CS) | ✅ Implementado |
| Backlog | ✅ Implementado |
| Órdenes de Trabajo (OT) | ✅ Implementado |
| Partes Diarios | ✅ Implementado |
| Cierre Técnico y Calidad | ✅ Implementado |
| Soporte y Tickets | ✅ Implementado |

#### RRHH (sección nueva — pendiente de implementar)
| Módulo | Estado | Prompt |
|--------|--------|--------|
| Personal Operativo | ✅ Implementado (en Configuración) | Mover a sección RRHH |
| Personal Administrativo | ✅ Implementado (en Configuración) | Mover a sección RRHH |
| Control de Asistencia | ⏳ Pendiente | `prompt_asistencia_turnos.md` |
| Turnos y Horarios | ⏳ Pendiente | `prompt_asistencia_turnos.md` |
| Nómina Básica | ⏳ Pendiente | `prompt_nomina_basica.md` |
| Préstamos al Personal | ✅ Implementado (como "Préstamos y Pagos") | Mover a sección RRHH |

#### Logística
| Módulo | Estado |
|--------|--------|
| Almacenes / Inventario (+ Kardex) | ✅ Implementado |
| SOLPE Interna | ✅ Implementado |
| Transporte y Guías | ✅ Implementado |

#### Compras (sección nueva — pendiente de implementar)
| Módulo | Estado | Prompt |
|--------|--------|--------|
| Proveedores (completo + homologación + evaluación) | ⏳ Pendiente | `prompt_compras_p1_sidebar_proveedores.md` |
| Cotizaciones de Compra | ⏳ Pendiente | `prompt_compras_p2_flujo_completo.md` |
| Órdenes de Compra | ⏳ Pendiente | `prompt_compras_p2_flujo_completo.md` |
| Órdenes de Servicio Interna | ⏳ Pendiente | `prompt_compras_p2_flujo_completo.md` |
| Recepciones | ⏳ Pendiente | `prompt_compras_p2_flujo_completo.md` |

#### Administración y Finanzas
| Módulo | Estado | Notas |
|--------|--------|-------|
| Ventas | ✅ Implementado | |
| Caja Chica y Anticipos | ✅ Implementado | |
| Préstamos al Personal | ✅ Implementado | Renombrar y mover a sección RRHH |
| Financiamiento y Deuda | ⏳ Pendiente | `prompt_financiamiento_deuda.md` |
| Cuentas por Cobrar | ✅ Implementado | |
| Cuentas por Pagar | ✅ Implementado | |
| Facturación | ✅ Implementado | |
| Tesorería / Match Bancario | ✅ Implementado | |
| Estado de Resultados | ✅ Implementado | |
| Valorizaciones | ✅ Implementado | |
| Presupuesto vs Real | ✅ Implementado | |

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
| Roles y Permisos | ✅ Implementado | |
| Maestros Base | ✅ Implementado | Pendiente: corregir arquitectura (ver sección 5) |
| Catálogo de Servicios | ✅ Implementado | Pendiente: revisar si formulario es completo |
| Tarifarios | ✅ Implementado | |
| Parámetros Generales | ✅ Implementado | |

#### Plataforma SaaS (Superadmin TIDEO)
| Módulo | Estado |
|--------|--------|
| Empresas / Tenants | ✅ Implementado |
| Planes y Licencias | ✅ Implementado |
| Métricas SaaS | ✅ Implementado |

### 3.3 Prompts pendientes de ejecutar

| Prompt | Descripción | Orden de ejecución |
|--------|-------------|-------------------|
| `prompt_fix_maestros_rrhh.md` | Corrección arquitectura Maestros Base (eliminar Personal, agregar Especialidades/Tipos de servicio/Almacenes) | 1 |
| `prompt_fix_clientes_arquitectura.md` | Clientes solo lectura en Maestros Base, formulario nueva cuenta expandido, tab condiciones financieras | 2 |
| `prompt_fix_lead_cuenta_flujo.md` | Formulario lead con RUC/Razón social, convertir lead, flujo completo CRM | 3 |
| `prompt_compras_p1_sidebar_proveedores.md` | Sección COMPRAS en sidebar + módulo Proveedores completo con homologación | 4 |
| `prompt_compras_p2_flujo_completo.md` | Cotizaciones compra + OC + OS Interna + Recepciones | 5 |
| `prompt_asistencia_turnos.md` | Sección RRHH en sidebar + Control de Asistencia + Turnos y Horarios | 6 |
| `prompt_nomina_basica.md` | Módulo Nómina Básica con cálculo completo, boleta PDF y cierre de período | 7 |
| `prompt_financiamiento_deuda.md` | Financiamiento y Deuda + renombrar Préstamos al Personal | 8 |

### 3.4 Estructura de archivos fuente

| Archivo | Responsabilidad | Tamaño aprox. |
|---------|----------------|---------------|
| `src/App.jsx` | Router principal, switch de rutas | 30 KB |
| `src/data.js` | Todos los datasets mock (MOCK export) | 70 KB |
| `src/context.jsx` | Estado global, notificaciones, funciones de mutación | 20 KB |
| `src/shell.jsx` | Layout, sidebar, header, dark mode, simulador de roles | 11 KB |
| `src/pages_core.jsx` | Dashboard, CRM, Pipeline, BI Comercial, BI Operativo | 81 KB |
| `src/pages_ops.jsx` | OT, Partes, Planner, Tickets, RRHH Op., Cuentas (ficha) | 81 KB |
| `src/pages_admin.jsx` | Finanzas, RRHH Admin, Configuración | 59 KB |
| `src/pages_fin.jsx` | CxC, CxP, Facturación, Tesorería, ER, Presupuesto | 29 KB |
| `src/pages_bi_fin.jsx` | BI Financiero | 20 KB |
| `src/pages_ia.jsx` | IA Comercial, Operativa, Financiera + Historial | 37 KB |
| `src/pages_cs.jsx` | Customer Success completo | 46 KB |
| `src/icons.jsx` | Iconografía, helpers money/moneyD | 8.6 KB |

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

### 3.6 Deuda técnica conocida

| Ítem | Prioridad |
|------|-----------|
| `BarsChart` / `DonutChart` sin uso en `pages_core.jsx` (líneas 219-278) | Baja |
| OTs inline en BIOperativo — deben migrar a `MOCK.ots` | Media |
| Tickets sin MOCK en `Tickets` — deben migrar a `data.js` si se cruzan con CS | Baja |
| Costo hora en RRHH Operativo es hardcodeado — debe calcularse desde nómina al cerrar período | Media |

---

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
| Cargos | Maestros Base ✓ | Catálogo de referencia |
| Especialidades técnicas | Maestros Base ✓ | Catálogo de referencia |
| Materiales e insumos | Maestros Base ✓ | Catálogo de referencia |
| Almacenes y depósitos | Maestros Base ✓ | Catálogo de referencia |
| Tipos de servicio interno | Maestros Base ✓ | Catálogo de referencia |
| Monedas, impuestos, unidades | Maestros Base ✓ | Catálogo de referencia |

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
| Nombre del contacto | ✓ | |
| Nombre de empresa | ✓ | Nombre comercial |
| Razón social | — | Si se conoce |
| RUC / NIT | — | Si se tiene. Validar 11 dígitos si se ingresa |
| Industria | — | |
| Teléfono | — | |
| Email | — | |
| Fuente | ✓ | |
| Responsable comercial | ✓ | |
| Necesidad declarada | ✓ | |
| Presupuesto estimado | — | |
| Registrado desde | — | campo / web / formulario |

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
| Costo OT | ¿Cuánto costó esa OT? | Partes diarios | Por OT |

El **costo hora real** se calcula en nómina: `(Sueldo bruto + cargas sociales) ÷ horas laborables`. Ese valor actualiza el campo COSTO/HORA en la ficha del técnico al cerrar el período de nómina y es el que se imputa a las OTs.

---

## 6. Estructura del sidebar — arquitectura final

```
BUSINESS INTELLIGENCE
  Dashboard General
  BI Comercial
  BI Operativo
  BI Financiero

CRM & MARKETING
  Cuentas y Contactos
  Leads y Scoring
  Marketing Automation
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

RRHH                          ← SECCIÓN NUEVA
  Personal Operativo
  Personal Administrativo
  Control de Asistencia
  Turnos y Horarios
  Nómina
  Préstamos al Personal

LOGÍSTICA
  Almacenes
  SOLPE Interna
  Transporte y Guías

COMPRAS                       ← SECCIÓN NUEVA
  Proveedores
  Cotizaciones (compra)
  Órdenes de Compra
  Órdenes de Servicio
  Recepciones

ADMINISTRACIÓN
  Ventas
  Caja Chica y Anticipos
  Financiamiento y Deuda      ← NUEVO (reemplaza Préstamos y Pagos)
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
  Roles y Permisos
  Maestros Base
  Catálogo de Servicios
  Tarifarios
  Parámetros

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
    Registrar asistencia diaria (entrada / salida / tardanza / falta)
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

**Comprador:** Foto de factura → IA extrae datos → Confirmar → Vincular a OT → Queda "pendiente revisión backoffice".

**Vendedor:** Agenda y próximos eventos → Ficha cliente → Click-to-call → Actividad post-reunión → Crear lead desde tarjeta.

**Supervisor:** Aprobar partes con un tap → Estado de OTs en tiempo real.

**Gerencia:** KPIs del día → Aprobar cotizaciones y descuentos → Ficha de cliente.

---

## 8. Detalle funcional de módulos

---

### 8.1 Plataforma — Gestión de Empresas / Tenants

Registro operativo de empresa: razón social, nombre comercial, RUC/NIT, país, moneda base, zona horaria y estado. La creación de tenant la realiza **Superadmin TIDEO** desde Plataforma, sin depender del módulo de pagos o planes comerciales. Al crear el tenant se genera automáticamente el rol **Admin Empresa** para ese entorno y se vincula el usuario admin si el email ya existe en Supabase Auth. Si el usuario Auth todavía no existe, el tenant queda creado y el admin queda pendiente de vinculación. Acceso modo soporte con log obligatorio. Métricas por tenant.

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
- Materiales e insumos con código de barras
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
| OT | `ubicacion_gps` | GPS al iniciar parte |
| OT | `direccion_ejecucion` | Dirección del trabajo |
| Compras/Gastos | `imagen_comprobante` | URL del comprobante |
| Compras/Gastos | `origen_registro` | campo / backoffice |
| Compras/Gastos | `datos_extraidos_ia` | JSON extracción IA |
| Leads | `registrado_desde` | campo / web / formulario |

---

### 8.6 CRM — Cuentas y Contactos

Fuente de verdad del cliente. Clasificación, industria, segmento, responsable comercial y CS. Contactos con rol. Relación muchos-a-muchos. Vista 360° con tabs: Resumen, Oportunidades, Cotizaciones, OS Cliente, OTs, Facturas, Cobranza, Actividades, Contactos, **Customer Success 360°** (health score + dimensiones + onboarding + renovación + NPS), **Condiciones comerciales** (solo con `ver_finanzas`: condición de pago, límite crédito, riesgo, datos fiscales). Indicador "Condiciones pendientes" si faltan datos financieros.

---

### 8.7 CRM — Leads

Kanban por estado: Nuevo → En contacto → Calificado → Convertido → Descartado. Card con badge de fuente, urgencia, días sin actividad y badge "Campo" si `registrado_desde = campo`. Botón "Convertir" → modal que muestra datos que viajan y crea Cuenta + Contacto + Oportunidad en una operación. Nota: *"¿En prospección? Crea un Lead — la cuenta se genera al convertirlo."*

---

### 8.8 CRM — Pipeline y Oportunidades

Kanban: Prospección → Calificación → Propuesta → Negociación → Ganada → Perdida. Panel lateral con timeline de actividades. Motivo de pérdida obligatorio. Forecast ponderado. Conversión a cotización y OS Cliente.

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

---

### 8.12 Partes Diarios

Por OT: técnico, fecha, actividades, horas, avance, materiales, evidencias. Aprobación del supervisor. Badge "Campo" si registrado desde móvil con GPS.

---

### 8.13 Planner y Recursos

Calendario visual. Vista por técnico, cuadrilla, sede. Validación de disponibilidad. Alertas de conflicto. Reprogramación con motivo. **Tab Agenda CS:** renovaciones pendientes, onboardings en progreso, planes con alertas, NPS pendientes.

---

### 8.14 RRHH — Personal Operativo

Ficha completa: cargo, especialidad, turno asignado, costo hora (normal y extra). 3 tabs: Personal (tabla con avatar y datos), Disponibilidad (grilla semanal 5d × 6 técnicos), Documentos (SCTR/Médico/EPP/Licencia con semáforo). Sección "Datos de nómina" visible solo con `ver_finanzas`: sueldo base, AFP/ONP, hijos, régimen. Formulario alta: + Nuevo técnico con todos los campos.

---

### 8.15 RRHH — Personal Administrativo

2 tabs: Personal (ficha completa: contrato, vacaciones, licencias, permisos), Reportes (headcount por área, contratos por vencer, ranking vacaciones, solicitudes pendientes). Formulario alta: + Nuevo colaborador.

---

### 8.16 RRHH — Turnos y Horarios

Catálogo de turnos de la empresa. Campos por turno: nombre, hora entrada, hora salida, tolerancia de tardanza (minutos), cruza medianoche (toggle), días laborables o variables, minutos de refrigerio. Cálculo automático de horas efectivas. Los turnos se asignan en la ficha de cada trabajador.

**Turnos base sugeridos:** Mañana (8-17), Tarde (14-23), Noche (22-6), Campo (6-18, variable), Administrativo (9-18).

---

### 8.17 RRHH — Control de Asistencia

Registro manual: seleccionar trabajador, fecha, hora de entrada, hora de salida. El sistema calcula automáticamente tardanza (comparando contra turno + tolerancia) y horas extra (exceso sobre hora de salida).

**Estados automáticos:** Completo (verde), Tardanza (naranja), Horas extra (cyan), Falta (rojo), Falta justificada (rojo con borde). Justificación: checkbox simple sin flujo de aprobación.

**4 tabs:** Vista diaria (tabla del día), Vista semanal (grilla), Vista mensual (resumen por trabajador con totales), Resumen por trabajador (detalle + impacto referencial en nómina + exportar Excel).

**Registro masivo:** modal con todos los trabajadores del día en una sola grilla.

---

### 8.18 RRHH — Nómina Básica

**Módulo para Perú — configurable por país en versiones futuras.**

**⚠ Disclaimer permanente:** *"Los cálculos son referenciales. Valida con tu contador antes de procesar pagos."*

**Flujo de cálculo:**
1. Remuneración bruta = sueldo base − descuento faltas − descuento tardanzas + horas extra (×1.25) + asignación familiar.
2. Descuentos trabajador = AFP (13.24% aprox.) o ONP (13%) + cuota préstamo + anticipo + judicial.
3. Retención IR 5ta = aplica si ingreso anual > 7 UIT (S/36,050 en 2026). Escala progresiva.
4. Neto a pagar = bruto − descuentos − IR.
5. Cargas empresa = ESSALUD (9%) + CTS (1/12) + Gratificación (1/6) + Vacaciones (1/12).
6. Costo real empresa = bruto + cargas.
7. Costo hora real = costo real ÷ horas laborables del mes.

**Cierre de período** → registra 2 egresos en Administración/Gastos: planilla (neto) + cargas sociales. Actualiza costo hora de cada técnico. Genera boletas en PDF.

**4 tabs:** Resumen del período (tabla consolidada), Detalle por trabajador (desglose completo), Cargas empresa (ESSALUD, CTS, gratificación, vacaciones), Historial de períodos.

---

### 8.19 RRHH — Préstamos al Personal

Préstamos que la empresa otorga a sus trabajadores. Naturaleza: activo (nos deben). Se descuenta en nómina. Tabla con empleado, monto, cuotas, avance pagado, estado. Toggle "Descontar automáticamente en nómina". No confundir con financiamiento recibido.

---

### 8.20 SOLPE Interna

Origen de toda necesidad de compra. Desde OT o parte diario. Clasificación, urgencia, centro de costo. Flujo visual: Borrador → Solicitada → Aprobada → Atendida. Al aprobarse, Compras la recibe y genera el proceso de cotización.

---

### 8.21 Inventario y Almacenes

Stock disponible, reservado y mínimo por almacén. Entradas, salidas, consumos por OT, transferencias, ajustes, devoluciones. Kardex en panel lateral. Alertas de stock crítico. Lote/serie/vencimiento. Inventario físico. Código de barras (campo móvil F2).

---

### 8.22 Compras — Proveedores

Ciclo de vida: Potencial → En evaluación → Homologado → Observado/Bloqueado → Inactivo. Solo homologados aparecen en selectores de OC. Ficha con 6 tabs: Resumen, Condiciones financieras (visible con `ver_finanzas`: condición de pago, banco, CCI, retención), Documentos (SCTR/póliza/certificaciones con semáforo de vencimiento), Evaluaciones (homologación + post-OC con score acumulado), Historial OC, Contactos.

**Evaluación de homologación:** capacidad técnica, documentación, solidez financiera, referencias, precio competitivo. Score ponderado → aprobado o rechazado.

**Evaluación post-OC:** cumplió plazo, calidad, precio, comunicación → actualiza score acumulado del proveedor.

---

### 8.23 Compras — Cotizaciones

Wizard 3 pasos: 1) Origen (SOLPE o libre) + descripción + tipo (bien/servicio) + fecha límite. 2) Selección de proveedores homologados a consultar. 3) Confirmar y crear proceso.

Detalle con tabs: Respuestas de proveedores (card por proveedor con estado), Comparativo (tabla lado a lado con ★ al mejor precio + recomendación automática), Resultado (proveedor ganador + justificación + link a OC/OS).

---

### 8.24 Compras — Órdenes de Compra

Para bienes. Vinculada a SOLPE y proceso de cotización. Ítems con cantidad, precio unitario, subtotal. IGV, total. Plazo de entrega. Seguimiento por timeline. Estados: Emitida → Confirmada → En tránsito → Recibida parcial → Cerrada.

---

### 8.25 Compras — Órdenes de Servicio Interna

Para servicios tercerizados. Mismo patrón que OC pero con alcance, entregables y criterios de conformidad. Cierre = conformidad aprobada (no recepción física). Estados: Emitida → Confirmada → En ejecución → Pendiente conformidad → Cerrada.

---

### 8.26 Compras — Recepciones

Confirmar que lo pedido llegó y en qué condición. Verificación ítem por ítem (pedido vs recibido). Tipo: total, parcial u observada. Al confirmar: actualiza OC, ingresa bienes a inventario (si es compra), genera CxP, crea evaluación post-servicio en ficha del proveedor.

---

### 8.27 Costos por OT

Costo estimado vs real. Mano de obra (desde parte diario × costo hora real), materiales (desde inventario), servicios terceros, logística, gastos. Margen bruto y porcentual. Visible solo con `ver_costos`.

---

### 8.28 Valorización

Agrupar OTs cerradas por cliente/período. Aplicar tarifas, descuentos, penalidades, impuestos. Flujo de aprobación. Control de OTs valorizadas y pendientes. PDF.

---

### 8.29 Facturación

Desde valorización aprobada o OS Cliente. Datos fiscales, impuestos, vencimiento. Notas de crédito/débito. Exportación para facturación electrónica externa.

---

### 8.30 Tesorería y Match Bancario

Bancos y cuentas. Ingresos vinculados a CxC/anticipo. Egresos vinculados a CxP/gasto/préstamo/cuota de financiamiento. Match bancario: conciliar movimiento bancario con CxC (créditos) o CxP/gasto (débitos). Flujo de caja proyectado vs real.

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
RESULTADO OPERATIVO
GASTOS FINANCIEROS
  Intereses de préstamos (desde cuotas de financiamiento pagadas)
RESULTADO NETO → margen %
```

Filtros: período, cliente, proyecto, centro de costo. Drill-down por categoría. Comparativo período anterior.

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

Por proyecto/centro de costo. Aprobación con cadena visual (4 aprobadores con estado). Comparación real vs presupuesto con variaciones absolutas y porcentuales. Alertas por desviación. Proyección de cierre.

---

### 8.34 Customer Success — módulos completos

**Onboarding:** activación al ganar oportunidad. Checklist configurable, reunión de arranque, hitos con alertas, satisfacción inicial.

**Planes de Éxito:** objetivos del cliente, periodicidad de revisión, seguimiento de adopción, alertas de riesgo temprano.

**Health Score:** 5 dimensiones ponderadas: uso de plataforma, soporte, NPS, finanzas, relación CS. Semáforo: saludable >70 / observación 50-70 / riesgo 30-50 / crítico <30. Alerta automática al caer bajo umbral.

**Renovaciones:** alertas 90/60/30 días antes. Oportunidad en pipeline automática. Regla: cliente con deuda vencida se evalúa antes de upsell.

**Fidelización y NPS:** encuestas automáticas post-servicio, promotores/neutros/detractores, referidos vinculados al cliente fuente, casos de éxito con autorización.

---

### 8.35 IA — Módulos completos con historial auditado

**IA Comercial:** resumen de cliente/oportunidad, siguiente mejor acción, redacción asistida, clasificación de leads, predicción de cierre, recomendación de servicios.

**IA Operativa:** resumen de OT, borrador desde descripción libre, clasificación de tickets, detección de demoras, alertas de SLA. **Campo (F1):** extracción de datos de facturas con foto.

**IA Financiera:** desviaciones de costo, alerta de margen bajo, priorización de cobranza, explicación de variaciones.

**Historial auditado en cada módulo:** Fecha | Acción (badge) | Entidad | Recomendación (90 chars) | Acción tomada | Usuario.

**Regla:** La IA asiste, no aprueba. Toda acción de IA queda en `ia_logs`.

---

### 8.36 Vistas de Campo Móviles — PWA

Instalable desde el browser. Rutas mobile-first. Acceso a cámara. Sincronización offline básica. Solo con `acceso_campo = true`.

**Técnico:** OTs del día → GPS al iniciar → parte en 4 pasos (actividad / materiales / avance / fotos) → reportar restricción.

**Comprador:** foto → IA extrae (proveedor, número, fecha, monto, IGV) → confirmar → vincular a OT → queda "pendiente revisión backoffice".

**Vendedor:** ficha cliente con click-to-call → actividad post-reunión → lead desde tarjeta.

**Supervisor:** aprobar partes → mapa de OTs con semáforo SLA.

**Gerencia:** KPIs del día → aprobar cotizaciones.

**F2 pendiente:** checklist de seguridad, confirmación de traslado, aprobación SOLPE, escaneo código de barras.

---

## 9. Modelo de datos multitenant

### 9.1 Tablas de plataforma (sin empresa_id)
```
empresas, planes, monedas, paises, zonas_horarias, versiones_plataforma
```

### 9.2 Tablas de acceso y permisos
```
usuarios, usuarios_empresas (rol_id, acceso_campo, perfil_campo),
roles, permisos_roles (9 acciones por pantalla), permisos_especiales, auditoria
```

### 9.3 Tablas de negocio (todas con empresa_id)

**CRM:** cuentas, contactos, relacion_cuenta_contacto, leads, oportunidades, etapas_pipeline, actividades_comerciales, health_score_cliente.

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
Todo `empresa_id` implícito. RLS en base de datos. Sin acceso cruzado entre tenants. Superadmin con log de auditoría.

### 10.2 Roles y permisos
Sin permiso "Ver" → pantalla no aparece en sidebar. Permisos de costos/precios/finanzas independientes. Sin `acceso_campo` → no accede a PWA. Rol Admin no eliminable si es el único activo.

### 10.3 CRM y comercial
Lead requiere fuente y responsable. Oportunidad perdida requiere motivo. OT facturable requiere OS Cliente. Descuento sobre límite requiere aprobación. No duplicar facturación por el mismo alcance.

### 10.4 Compras
Solo proveedores homologados en selectores de OC. Bloqueados no aparecen. Toda recepción actualiza: OC + inventario (si bien) + CxP + evaluación proveedor.

### 10.5 RRHH y nómina
Nómina ≠ costo de OT. Son dos mediciones independientes. Solo los **intereses** de financiamiento son gasto financiero en ER. El capital reduce el pasivo. Préstamos al personal ≠ financiamiento recibido.

### 10.6 Campo
`origen_registro = campo` en todo registro de campo. GPS automático al iniciar parte. Gasto de campo queda "pendiente revisión backoffice". Datos IA en `datos_extraidos_ia` para auditoría.

### 10.7 Auditoría
No eliminar → anular con motivo y usuario. Modificaciones críticas registran valor anterior, nuevo, fecha, IP. IA logs registran todas las acciones por recomendación de IA.

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

**Componentes clave:** Dark mode toggle (sun/moon). Simulador de roles en header. Selector de empresa activa. Breadcrumb de flujo en pantallas de detalle. Badges semánticos por estado. Badge "📱 Campo". Badge "🤖 Extraído por IA". Badge "⚠ Condiciones pendientes". Badge "⚠ Condiciones financieras pendientes".

---

## 13. Exclusiones

- Integración con facturación electrónica externa por país (se cotiza aparte).
- Integración con sistema contable externo (se cotiza aparte).
- Integración bancaria automática (se cotiza aparte).
- Exportación PDT SUNAT, integración AFP/ESSALUD en línea (nómina avanzada, se cotiza aparte).
- App móvil nativa iOS/Android — campo se resuelve con PWA.
- Balance general completo (requiere contabilidad de partida doble — versión futura).
- Planilla/nómina con liquidaciones de cese complejas, régimen MYPE diferenciado, utilidades (versión futura).
- Hardware, tablets, impresoras.
- Migración histórica masiva no definida.
- Asesoría tributaria, contable o laboral.
- ERP personalizado para rubros específicos (producto separado de TIDEO).

---

## 14. Historial de cambios

| Fecha | Cambios principales |
|-------|---------------------|
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
