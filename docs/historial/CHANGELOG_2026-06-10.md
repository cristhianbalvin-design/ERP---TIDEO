# Changelog ERP TIDEO — 10 de Junio 2026
## 11/06/2026 - Fase 1C RRHH Habilitaciones

- Reporte de habilitaciones rediseñado en RRHH Operativo: columnas dinámicas desde tipos habilitantes activos, semáforo por celda desde `calcular_habilitaciones_personal`, estado global `no_habilitado` / `alerta` / `habilitado` / `sin_configurar` y KPIs clickeables.
- Previsualizador básico inline para documentos de personal: PDF e imágenes, metadatos, descarga fresca, validar/rechazar con motivo y reemplazo contextual.
- Signed URLs de `documentos-privados` reducidas a 600 segundos y renovación automática del visor cada 8 minutos.
- Mock actualizado con estados completos del semáforo y un PDF + una imagen previsualizables.

> **Sesión WMS — Almacenes e Inventario Capa 1 + Capa 2**
> Motor de movimientos inmutable, kardex valorizado a costo promedio ponderado, trazabilidad lote/serie/vencimiento, entrada manual, recepción→inventario corregida, consumo OT corregido, transferencias entre almacenes, ajuste de inventario, reserva de stock, punto de reorden → SOLPE.

---

## Diagnóstico previo (hallazgos)

| Problema | Causa raíz |
|---|---|
| DIFESMAQ con 0 SKUs | `getInventario()` lee tabla `stock`. Los materiales importados no tenían registros en `stock`. |
| Botón "Registrar Entrada" sin acción | Sin onClick handler |
| Kardex panel hardcodeado | Datos de prueba fijos, no leía Supabase |
| `registrarEntradaInventario` no actualizaba costo promedio | Faltaba lógica de promedio ponderado |
| Flujo recepción crea SKUs genéricos | Usaba `CMP-{timestamp}-{idx}` desconectados del catálogo |
| `consumirInventario` sin costo_unitario ni created_by | Implementación incompleta |
| Transferencias y ajustes sin implementar | Solo botones sin handler |
| Kardex sin campos: lote, serie, vencimiento, saldo, USD, anulación | Schema incompleto |

---

## Archivos creados

| Archivo | Descripción |
|---|---|
| `supabase/schemas/009_wms_motor.sql` | Migración: amplía kardex, materiales, stock; crea tabla `inventario_conteos` |
| `src/services/inventarioService.js` | Motor WMS completo: movimientos, kardex, transferencias, ajustes, conteo, reserva |
| `CHANGELOG_2026-06-10.md` | Este archivo |

## Archivos modificados

| Archivo | Cambios |
|---|---|
| `src/services/comprasService.js` | `registrarEntradaInventario` delega al motor WMS; `getInventario` usa `getStockCompleto` |
| `src/context.jsx` | Import inventarioService; fix flujo recepción→inventario; fix consumo OT con costo promedio; nuevas acciones WMS |
| `src/pages_extra.jsx` | Componente `Inventario` completamente reescrito con modales funcionales y kardex real |

---

## Sprint 1 — SQL Migration (009_wms_motor.sql)

### `materiales`
- `tipo_control text DEFAULT 'sin_control'` — 'sin_control' | 'lote' | 'serie'
- `stock_maximo numeric(14,2)`
- `punto_reorden numeric(14,2)`
- `costo_promedio_usd numeric(14,2)`

### `kardex`
- `motivo text` — subtipo semántico del movimiento
- `lote`, `serie`, `vencimiento` — trazabilidad de lote/serie
- `saldo_cantidad` — saldo físico después del movimiento
- `costo_total`, `costo_unitario_usd`, `costo_total_usd` — valor y columnas USD paralelas
- `anulado boolean DEFAULT false` — inmutabilidad: nunca se borra
- `anulado_por`, `anulado_motivo`, `anulado_at` — trazabilidad de anulación
- `proveedor_id`, `nro_documento` — trazabilidad de origen

### `stock`
- `fisico numeric(14,2) DEFAULT 0` — físico real = disponible + reservado

### Nueva tabla: `inventario_conteos`
- Soporta conteo total y cíclico por zona/artículo
- `items jsonb` con teórico vs. físico por ítem
- Al cerrar genera ajustes automáticos por diferencia

---

## Sprint 2 — inventarioService.js (motor principal)

### Funciones de escritura (inmutables)
- `registrarMovimiento(empresaId, mov)` — motor de bajo nivel: inserta kardex, actualiza stock, recalcula costo_promedio
- `registrarEntrada(empresaId, form, usuarioId)` — entrada manual con validaciones de lote/serie
- `registrarSalida(empresaId, form, usuarioId)` — salida con validación de disponibilidad
- `registrarTransferencia(empresaId, form, usuarioId)` — salida origen + entrada destino con conservación de costo
- `registrarAjuste(empresaId, form, usuarioId)` — ajuste calculando delta teórico vs. físico
- `anularMovimiento(kardexId, motivo, usuarioId)` — marcado como anulado + movimiento inverso
- `iniciarConteo / cerrarConteo` — conteo físico con generación automática de ajustes
- `reservarStock / liberarReserva` — estado físico/reservado/disponible como primera clase
- `registrarEntradaDesdeRecepcion` — búsqueda de material en catálogo, actualización de costo promedio ponderado
- `registrarConsumoOT` — consumo OT con costo promedio vigente y created_by

### Funciones de lectura
- `getStockCompleto(empresaId)` — JOIN stock × materiales × almacenes con todos los campos WMS
- `getKardex(empresaId, materialId, almacenId)` — historial real, sin anulados
- `getMaterialesBajoReorden(empresaId)` — materiales por debajo del punto de reorden
- `getStockEnTransito(empresaId)` — OCs emitidas no recibidas (stock esperado)

### Costeo separable (preparado para capa 3)
La función `calcularNuevoCostoPromedio` es el punto de inyección para valuaciones alternativas. El motor llama esta función al registrar entradas; una capa 3 puede reemplazarla sin tocar el motor de movimientos.

---

## Sprint 3 — comprasService.js

- `registrarEntradaInventario`: delega a `registrarEntradaDesdeRecepcion` del motor WMS
- `getInventario`: delega a `getStockCompleto` del motor WMS
- Eliminada la implementación inline que creaba SKUs genéricos y no actualizaba costo_promedio

---

## Sprint 4 — context.jsx

### Flujo recepción → inventario (fix)
- Antes: inyectaba entradas locales con `CMP-{timestamp}` sin trazabilidad al catálogo
- Después: llama `registrarEntradaDesdeRecepcion` que busca el material por código en catálogo, crea si no existe, actualiza costo_promedio ponderado
- En modo mock: mantiene comportamiento anterior para demo

### Flujo consumo OT (fix)
- Antes: `consumirInventario` sin costo_unitario, sin created_by, sin saldo
- Después: `registrarConsumoOTSvc` graba costo_unitario al promedio vigente, created_by del authUser, saldo_cantidad

### Nuevas acciones WMS
- `recargarInventario` — recarga stock desde Supabase
- `registrarEntradaManualCtx` — expone modal de entrada manual
- `registrarTransferenciaCtx` — expone modal de transferencia
- `registrarAjusteCtx` — expone modal de ajuste
- `reservarStockCtx` — reserva stock para OT
- `getKardexMaterialCtx` — lee kardex real de Supabase
- `iniciarConteoCtx / cerrarConteoCtx` — conteo físico

---

## Sprint 5 — pages_extra.jsx (Componente Inventario)

### Componente Inventario (reescrito)
- **Estado de carga explícito**: carga inventario al montar si Supabase configurado
- **Estado vacío con CTA**: sin stock registrado → botón "Primera Entrada"
- **KPIs con umbrales reales**: "Bajo reorden" usa `punto_reorden` || `stock_minimo`, no hardcoded <=5
- **Tabla mejorada**: columnas Físico / Disponible / Reservado separadas; columna Control (LOTE/SERIE)
- **Colores de fila**: rojo si agotado, naranja si bajo reorden (umbral real del material)

### ModalEntradaManual (nuevo)
- Motivos: Saldo Inicial, Ajuste Positivo, Devolución OT, Compra Directa sin OC
- Validaciones: cantidad > 0, lote requerido si tipo_control='lote', serie=1 si tipo_control='serie'
- Campo Nro. Documento visible solo en Compra Directa sin OC
- Selección de moneda PEN/USD

### ModalTransferencia (nuevo)
- Muestra disponible del SKU seleccionado
- Valida que origen ≠ destino
- Valida que cantidad ≤ disponible

### ModalAjuste (nuevo)
- Ingresa cantidad física contada; calcula delta vs. teórico
- Muestra diferencia con color: verde (entrada) / rojo (salida)
- Motivos: manual, merma, robo, error de ingreso, conteo físico
- Observación obligatoria

### PanelKardex (reescrito)
- Kardex real desde Supabase (loading / vacío / error explícitos)
- Tab "Movimientos KARDEX": fecha, tipo, motivo, referencia, cantidad con signo, costo unitario, saldo
- Tab "Detalles": min/max/reorden/código de barras/vencimiento
- Stock en 3 filas: físico / disponible / reservado con umbral de reorden
- Botón SOLPE visible solo cuando bajo punto de reorden
- Alerta de vencimiento si aplica

---

## Reglas transversales implementadas

| Regla | Implementación |
|---|---|
| **Libro inmutable** | `anulado=false` por defecto; anulación = flag + movimiento inverso |
| **No-borrado** | No hay DELETE en ninguna función del motor |
| **Costo promedio ponderado** | `calcularNuevoCostoPromedio` en cada entrada |
| **PEN/USD paralelo** | `costo_unitario` (PEN), `costo_unitario_usd` (USD) — columnas independientes |
| **Sin fallback silencioso** | Validaciones con throw visible en UI |
| **Reserva como primera clase** | `fisico`, `disponible`, `reservado` en `stock` |
| **Primero en vencer, primero en salir** | Estructura de datos preparada (lote+vencimiento); lógica FIFO en capa 3 |
| **Multitenant** | `empresa_id` en todas las tablas |

---

## Pendientes verticales — Capa 3 (anotados para fusión ERP especializado)

> Estos ítems son valuaciones especializadas para minería/activos intensivos. **No se implementan** en el SaaS base. El motor de movimientos los soportará sin reescritura gracias al costeo separable.

- [ ] Costo aterrizado (FOB + flete + seguro + arancel + IGV + flete local)
- [ ] Estados de valuación de componente C1/C2/C3 (nuevo / recuperado / dañado)
- [ ] Costo aterrizado automático desde DUA de importación
- [ ] Pasaporte del equipo / componentes instalados y retirados
- [ ] Flujo de venta de repuestos (catálogo → cotización → orden de venta → guía de despacho)

## Superficie analítica y móvil (faseable — continuación)

- [ ] Análisis ABC / rotación / stock muerto (días sin actividad)
- [ ] PWA móvil con escaneo de código de barras
- [ ] Conteo físico: UI completa (pantalla Conteos con flujo abierto → en proceso → cerrado)
- [ ] Stock en tránsito visible en pantalla Almacenes

---

## Sección 3.1 — Migraciones aplicadas

| Migración | Estado |
|---|---|
| `001_platform.sql` | ✅ Aplicada |
| `002_access.sql` | ✅ Aplicada |
| `003_business_core.sql` | ✅ Aplicada |
| `004_finance.sql` | ✅ Aplicada |
| `005_operations.sql` | ✅ Aplicada |
| `006_purchasing_inventory.sql` | ✅ Aplicada |
| `007_hr_cs_ai.sql` | ✅ Aplicada |
| `008_maestros_base.sql` | ✅ Aplicada |
| `009_wms_motor.sql` | ⏳ **Pendiente de aplicar en Supabase** |
| `010_maestro_activos.sql` | ⏳ **Pendiente de aplicar en Supabase** — tabla `activos` con RLS |
| `011_limpiar_activos_de_materiales.sql` | ⏳ **Ejecutar manualmente** — limpieza del grupo "01 - ACTIVO FIJO" en materiales (ver instrucciones en el archivo) |

---

## Sección 9.3 — Modelo de datos WMS

### stock
```
id, empresa_id, material_id, almacen_id
fisico        -- cantidad física real en el almacén
disponible    -- fisico - reservado (lo que se puede consumir)
reservado     -- apartado para OTs pendientes de consumo
lote, serie, vencimiento  -- control de trazabilidad
```

### kardex (motor inmutable)
```
id, empresa_id, material_id, almacen_id
tipo          -- 'entrada' | 'salida' | 'ajuste' | 'transferencia_salida' | 'transferencia_entrada'
motivo        -- subtipo: saldo_inicial, compra_directa, consumo_ot, ajuste_conteo, etc.
cantidad, costo_unitario, costo_total   -- en PEN
costo_unitario_usd, costo_total_usd    -- en USD (paralelo, nunca mezclado)
moneda        -- moneda de origen de la transacción
saldo_cantidad -- saldo físico después del movimiento
lote, serie, vencimiento
referencia_tipo, referencia_id  -- trazabilidad al documento origen
nro_documento, proveedor_id
anulado, anulado_por, anulado_motivo, anulado_at  -- inmutabilidad
created_by    -- usuario autenticado que registró
```

### materiales (ampliado)
```
tipo_control  -- 'sin_control' | 'lote' | 'serie'
stock_minimo, stock_maximo, punto_reorden
costo_promedio (PEN), costo_promedio_usd (USD)
codigo_barras
```

### inventario_conteos
```
id, empresa_id, codigo, nombre
tipo          -- 'total' | 'ciclico'
almacen_id, zona, estado
items jsonb   -- [{ material_id, almacen_id, teorico, fisico, diferencia, lote, serie }]
ajustes_generados boolean
creado_por, cerrado_por, cerrado_at
```

### activos (maestro de activos — separado de materiales)
```
id, empresa_id, codigo, nombre
tipo_categoria  -- equipo | vehiculo | mueble | inmueble | intangible | otro
marca, modelo, placa_serie    -- identificación física
ubicacion, estado             -- operativo | en_mantenimiento | dado_baja
centro_costo_id               -- FK centros_costo (objeto de costo por defecto)
responsable_id (uuid), responsable_nombre
fecha_alta date
valor_adquisicion, moneda, vida_util_anos  -- base para depreciación referencial lineal
documentos jsonb              -- [{tipo, nombre, fecha_vencimiento, dias_alerta, archivo_url}]
                              -- tipos: SOAT, Póliza todo riesgo, Revisión técnica, etc.
observacion
-- Baja con trazabilidad (inmutable: nunca eliminar)
baja_motivo, baja_at, baja_por uuid
created_by, created_at, updated_at
```

**Depreciación referencial lineal** (no es contabilidad de partida doble; es solo referencia operativa):
- `valor_actual_est = valor_adquisicion - (valor_adquisicion / vida_util_anos*12) * meses_vividos`
- Se calcula en el frontend al vuelo. No se almacena (evita desincronización).

**PENDIENTE VERTICAL (CMMS):** pasaporte de componentes instalados/retirados, horómetro telemétrico,
gestión de garantías. Se implementarán en la fusión con el ERP especializado.

---

## Sección 10 — Reglas transversales

1. **Motor inmutable**: Los movimientos del kardex nunca se borran ni editan. Una corrección es un movimiento inverso con `anulado=true` en el original.
2. **Costeo promedio ponderado separable**: `calcularNuevoCostoPromedio()` es el punto de inyección. Capa 3 puede sobreescribir sin tocar el motor.
3. **PEN y USD paralelos**: `costo_unitario` (PEN) y `costo_unitario_usd` (USD) son columnas independientes. El tipo de cambio es solo referencial para display.
4. **No-borrado**: Todo se anula con motivo y usuario. Sin DELETE en el motor.
5. **Primero en vencer, primero en salir (FIFO por vencimiento)**: La estructura de datos (lote + vencimiento) está preparada. La sugerencia de salida por vencimiento se implementa en capa 3.
6. **Reserva como estado nativo**: `stock.fisico`, `stock.disponible`, `stock.reservado` son columnas reales, no calculadas en la app.
7. **Punto de reorden → SOLPE sugerida**: Al cruzar `punto_reorden` se propone SOLPE al módulo de Compras existente.
8. **Aislamiento multitenant**: `empresa_id` en todas las tablas + RLS en Supabase.
9. **Separación activo vs material**: Un activo (equipo, vehículo, maquinaria) vive en la tabla `activos`. Un material (repuesto, consumible, insumo) vive en `materiales`. Nunca deben compartir maestro. El activo se opera, deprecia y asigna a CECO; el material se stockea, consume y valoriza a promedio. Los repuestos de un activo sí son materiales; el equipo en sí es un activo.
10. **No-borrado con anulación previa en limpieza de maestro mal cargado**: Si se detectan materiales incorrectamente catalogados como activos, el procedimiento es: (1) anular todos sus movimientos de kardex con motivo explícito, (2) eliminar sus registros de stock (resumen), (3) eliminar el registro maestro. Si hay referencias que impidan la eliminación, desactivar el registro y reportarlo. El kardex nunca se borra.
11. **Depreciación referencial no contable**: La depreciación lineal en el maestro de activos es una referencia operativa (valor estimado actual, % depreciado). No es contabilidad de partida doble ni genera asientos. Las valuaciones formales son responsabilidad del módulo contable externo.

---

## Sección 14 — Sesión: Maestro de Activos + Limpieza de Materiales (2026-06-10)

### Contexto y diagnóstico previo

El maestro de materiales tenía registros incorrectamente cargados bajo el grupo **"01 - ACTIVO FIJO"** (volquetes, maquinaria, equipos). Esto causaba contaminación en el WMS recién construido: los activos aparecían con cantidad, costo promedio y kardex, distorsionando el valor de inventario y los SKUs activos.

> La verificación real de cuántos materiales están en el grupo "01 - ACTIVO FIJO" y si tienen kardex/stock activo se realiza ejecutando el **PASO 1** del script `011_limpiar_activos_de_materiales.sql` en el SQL Editor de Supabase antes de proceder a la limpieza.

### Archivos creados (esta sesión)

| Archivo | Descripción |
|---|---|
| `supabase/schemas/010_maestro_activos.sql` | Tabla `activos`: maestro horizontal, RLS multitenant, índices |
| `supabase/schemas/011_limpiar_activos_de_materiales.sql` | Script de limpieza con guardrails: verificación → anulación kardex → eliminación stock → eliminación/desactivación materiales |
| `src/services/activosService.js` | CRUD completo (crear, actualizar, dar de baja) + importación masiva con validación fila por fila |

### Archivos modificados (esta sesión)

| Archivo | Cambios |
|---|---|
| `src/context.jsx` | Import activosService; estado `activos`; carga en useEffect de empresa; acciones CRUD + import; exposición en context value |
| `src/pages_fin.jsx` | `ActivosFijos` completamente reescrita: tab "Maestro" (nuevo, tabla `activos`) + tab "Desde Compras" (preservado) |

### Funcionalidades implementadas

**Maestro de Activos (tabla `activos`):**
- Registro: código, nombre, tipo/categoría, marca, modelo, placa/serie, ubicación, estado, CECO, responsable, fecha alta
- Valor y depreciación: valor adquisición, vida útil, depreciación referencial lineal calculada al vuelo
- Documentos con semáforo de vencimiento (SOAT, pólizas, revisiones técnicas) con alerta visual verde/amarillo/rojo
- Alta, edición y baja con estados explícitos. Baja = desactivar con motivo, nunca eliminar.

**Carga masiva por plantilla Excel:**
- Plantilla descargable con 15 columnas (incluyendo ejemplo)
- Importación con validación fila por fila: código y nombre obligatorios; centro de costo resuelto por código o nombre; estado validado contra lista fija
- Reporte de errores detallado (fila inválida = error visible, no insertada a medias)
- Resultado con conteo de creados / actualizados / errores

**Limpieza de materiales mal cargados:**
- Script SQL con guardrails en 5 pasos: diagnóstico → anular kardex con motivo → eliminar stock → eliminar materiales → reporte final
- Los materiales que no puedan eliminarse quedan desactivados (`estado = 'inactivo'`) con nota explicativa
- El kardex nunca se borra: se marca `anulado = true` con `anulado_motivo = 'limpieza_maestro_activos_20260610_material_mal_catalogado'`

### Pendientes CMMS (verticales — anotados)

> Capacidades pesadas de CMMS para la fusión con ERP especializado. **No implementadas** en la base horizontal.

- [ ] Pasaporte de componentes instalados/retirados por activo
- [ ] Horómetro telemétrico (horas reales de operación)
- [ ] Gestión de garantías con alertas
- [ ] Plan de mantenimiento preventivo (PM) generador de OTs
- [ ] Historial de fallas y MTBF

### Instrucciones de aplicación en Supabase

1. Aplicar `010_maestro_activos.sql` en el SQL Editor de Supabase
2. Ejecutar el **PASO 1** de `011_limpiar_activos_de_materiales.sql` y revisar los NOTICE
3. Confirmar conteos en los logs, luego ejecutar los PASOS 2-5 del mismo script
4. Recargar la aplicación: los activos ya no aparecen en el WMS; el maestro de activos está limpio

---

## Sección 15 — Correctivo: Badge habilitacional usa `es_habilitante`, no `obligatorio` (2026-06-10)

### Problema

El badge "Estado habilitacional" en la ficha de colaborador mostraba **"En regla"** (verde) para trabajadores con todos los documentos habilitantes en estado `falta`. El motor BD (`calcular_habilitaciones_personal`) devolvía el estado correcto; el error estaba en el frontend.

### Causa raíz

En `agruparFilasMotorBD` (y su espejo mock `calcHabilitacionesMock`), el cálculo de `estado_global` filtraba por `d.obligatorio` en lugar de `d.es_habilitante`. Si el cargo configura los tipos habilitantes con `obligatorio: false` (o sin definir), el array `obs` quedaba vacío → `obs.some(...)` siempre `false` → `estado_global = 'en_regla'`.

### Corrección (pages_ops.jsx — 3 ediciones quirúrgicas)

| Función | Cambio |
|---|---|
| `agruparFilasMotorBD` | Filtra `h.docs.filter(d => d.es_habilitante)` en vez de `d.obligatorio`; agrega check `if (!habDocs.length) → 'sin_requisitos'` |
| `calcHabilitacionesMock` | Filtra `docs.filter(d => d.tipo?.es_habilitante)` en vez de `d.obligatorio` |
| `GLOBAL_LABEL` (reporte) | `critico` → `'No habilitado'` (alinea label con badge "No habilitado para campo") |

### Motor BD — sin cambios

`calcular_habilitaciones_personal` devuelve `es_habilitante` y `estado` por fila. El frontend solo dejó de ignorar el campo.

### Criterios verificados

- Búsqueda de `d.obligatorio` en cálculo de `estado_global` → eliminado de ambas rutas (BD y mock)
- Badge de colaboradores con todos los habilitantes en `falta` → muestra **"No habilitado para campo"** en rojo
- Reporte de habilitaciones → muestra **"No habilitado"** en rojo para los mismos colaboradores
- No hay comparaciones `fecha_vencimiento vs Date.now()` en la lógica de estado documentario
