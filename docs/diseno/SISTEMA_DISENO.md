# Sistema de diseño dx-ui — ERP TIDEO (Operaciones)

Guía obligatoria para crear o rediseñar pantallas de `operaciones-app`. Quien la use (persona, Claude o Codex) **combina las clases de esta guía y no inventa estilos**. Si algo falta, se agrega a la base compartida (sección 3), no a la pantalla.

Pantalla de referencia en código: el listado de Diagnóstico Técnico (`DiagnosticoTecnicoPage.jsx`, bloque `section.dx-ui.dx-list`). Los modales del mismo módulo usan el lenguaje `dx-modal` / `dx-*` y son la referencia para ventanas.

## 1. Regla de oro

1. Toda pantalla nueva o rediseñada usa las clases `dx-ui-*` de la sección 3 y las variables `--dx-ui-*` de la sección 2.
2. Las reglas propias de una pantalla llevan el prefijo `dx-<pantalla>-` (por ejemplo `dx-list-type`) y solo definen lo que es específico de esa pantalla: columnas, áreas de la vista móvil y contenido particular.
3. No se definen colores, tipografías ni radios sueltos en una pantalla. Si hace falta un tono nuevo, se agrega como variable `--dx-ui-*` con valor claro y oscuro.
4. Primero un mock aprobado por Cristhian; después el código.

## 2. Variables de diseño

Se declaran en `.dx-ui` (raíz de cada pantalla) y se redefinen en `[data-theme='dark'] .dx-ui`. La app transforma ese selector para el shadow root; no uses `:host` ni toques el cargador.

| Uso | Variable | Claro |
|---|---|---|
| Texto fuerte, botón primario | `--dx-ui-navy` | `#1A2B4A` |
| Foco y acentos | `--dx-ui-cyan` | `#00ACC1` |
| Texto sobre cian | `--dx-ui-cyan-fg` | `#0B4F5A` |
| Fondo cian suave | `--dx-ui-cyan-bg` | `#E0F7FA` |
| Violeta (Mantenimiento) | `--dx-ui-violet` / `--dx-ui-violet-bg` | `#5B3A8C` / `#F0EAFB` |
| Ámbar (borrador) | `--dx-ui-amber-fg` / `-bg` / `-dot` | `#8A4B00` / `#FFF3E0` / `#E08A00` |
| Verde (emitido) | `--dx-ui-green-fg` / `-bg` | `#14633A` / `#E3F6EA` |
| Rojo y gris (estados) | `--dx-ui-red-*`, `--dx-ui-gray-*` | ver `zahory.css` |
| Texto secundario | `--dx-ui-gray` | `#6B7280` |
| Texto normal | `--dx-ui-ink` | `#1F2937` |
| Líneas | `--dx-ui-line`, `--dx-ui-line-soft` | `#E4E7EB`, `#EEF0F3` |
| Borde de campos | `--dx-ui-border` | `#C9CFD8` |
| Fondo de cabecera de tabla | `--dx-ui-head` | `#F8F9FA` |
| Fondo de tarjeta | `--dx-ui-card` | `#FFFFFF` |
| Hover de fila | `--dx-ui-hover` | `#F6FBFC` |

Tipografía: **Sora** para títulos y números destacados, **DM Sans** para texto. Radios: tarjetas 14 px, chips 10 px, campos y botones 8 px, iconos 9 px, píldoras 999 px. Alturas: campos y botones 40 px, filas 68 px mínimo, cabecera de tabla 38 px.

## 3. Componentes base (en `zahory.css`, sección "DX-UI base")

| Clase | Qué es |
|---|---|
| `dx-ui` | Raíz de la pantalla: variables, fuente, ancho completo |
| `dx-ui-summary` + `dx-ui-chip` (`b` número, `span` etiqueta) | Tarjetas de resumen arriba del listado |
| `dx-ui-card` | Tarjeta principal; es el contenedor de la consulta de ancho (`@container`) |
| `dx-ui-toolbar` (`h2`), `dx-ui-count`, `dx-ui-search` (`input`) | Barra superior: título, contador y buscador |
| `dx-ui-head`, `dx-ui-row` | Cabecera y filas en cuadrícula; las columnas salen de `--dx-ui-cols` |
| `dx-ui-icon` + `is-cyan` / `is-violet` | Icono cuadrado por categoría |
| `dx-ui-pill` + `is-amber` / `is-green` / `is-red` / `is-gray` / `is-cyan` | Estado con punto de color |
| `dx-ui-arrow` | Flecha de "abrir" al final de la fila |
| `dx-ui-empty` | Mensaje de cargando, vacío y sin resultados |

## 4. Esqueleto de una pantalla de listado

1. `section.dx-ui.dx-<pantalla>` como raíz.
2. `div.dx-ui-summary` con 2 a 4 `div.dx-ui-chip` (`b` + `span`).
3. `div.dx-ui-card` con `div.dx-ui-toolbar` (`h2`, `span.dx-ui-count`, `label.dx-ui-search` con icono y `input`).
4. `div.dx-ui-head.dx-<pantalla>-cols` (con `aria-hidden`) y filas `div.dx-ui-row.dx-<pantalla>-cols` con `role="button"`, `tabIndex={0}` y manejo de Enter y Espacio.
5. En el CSS de la pantalla: `.dx-<pantalla>-cols { --dx-ui-cols: …; }` con las columnas de escritorio y, dentro de `@container (max-width:760px)`, las columnas y áreas de la vista de tarjeta.
6. Estados: cargando, vacío y sin coincidencias con `div.dx-ui-empty`.

## 5. Responsive, accesibilidad y modo oscuro

- **Responsive:** el corte a tarjetas se hace con `@container (max-width:760px)` sobre `dx-ui-card`, **nunca** con `@media` sobre la ventana: la barra lateral ocupa 240 px y la ventana no representa el espacio real. Ninguna columna puede invadir a otra en ningún ancho; el texto largo se recorta con puntos suspensivos.
- **Accesibilidad:** filas clicables con `role="button"`, `tabIndex`, Enter y Espacio; `aria-label` en buscadores y botones de icono; foco visible.
- **Modo oscuro:** solo mediante las variables; no se escriben colores claros fijos en las reglas de la pantalla.

## 6. Cómo trabajar una pantalla nueva o un rediseño

1. Diagnóstico en solo lectura: leer la pantalla actual en `origin/main` (el checkout local puede estar atrasado) y una pantalla ya rediseñada.
2. Mock HTML autocontenido con los datos reales; aprobación de Cristhian; revisión a varios anchos.
3. Rama limpia desde `origin/main` actualizado; los comandos git que escriben los ejecuta Cristhian.
4. Implementación con Codex con prompt Contexto → Objetivo → Restricciones → Checklist, lista cerrada de archivos, sin red y con STOP.
5. Verificación independiente: `git diff` y `git status`, sin ruido de fin de línea (`git diff --stat` igual a `git diff --ignore-space-at-eol --stat`), y revisión en el preview de Vercel del PR a 375, 800, 901, 1000, 1100 y 1280 px, buscador, teclado, modo oscuro y móvil.
6. Commit, push y PR solo con autorización de Cristhian.

## 7. Datos técnicos del repo que evitan errores

- Las pantallas de Operaciones viven en `operaciones-app/src/zahory-mock/pages/` y sus estilos en `operaciones-app/src/zahory-mock/styles/zahory.css`, no en `operaciones-app/src/styles.css`.
- La app se renderiza dentro de un shadow root (`.ops-zahory-host`). Para inspeccionar o medir en el navegador hay que entrar por `shadowRoot`.
- `zahory.css` se carga como una sola cadena (`?inline`) en `ZahoryScreenHost.jsx`; un archivo CSS nuevo exige tocar ese cargador, por eso la base compartida vive dentro de `zahory.css`.
- Los JSX tienen finales de línea mezclados (CRLF y LF): ediciones acotadas, sin reescribir archivos completos. Todo en UTF-8 con acentos correctos.
- Los nombres reales de clientes no aparecen en plantillas ni en datos de ejemplo.

## 8. Qué no hacer

- No agregar librerías, fuentes ni colores fuera de la sección 2 sin aprobación.
- No cambiar clases ni estilos de otras pantallas mientras se trabaja una.
- No afirmar un resultado visual sin haberlo medido o visto en el navegador.
