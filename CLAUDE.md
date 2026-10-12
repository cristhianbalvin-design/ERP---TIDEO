# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. UTF-8 Encoding — Never Corrupt Spanish Characters

**This project uses Spanish. Encoding corruption has happened before and must never recur.**

- All source files are UTF-8. Never write Mojibake sequences like `Ã©`, `Ã³`, `Â·`, `â€"` instead of `é`, `ó`, `·`, `—`.
- **Never rewrite an entire file in a single operation.** Large rewrites (hundreds or thousands of lines at once) are the primary cause of encoding corruption in this codebase. Use surgical edits (Edit tool) instead.
- If you must generate a large block of code with Spanish strings, output it in small chunks and verify encoding after each.
- Valid Spanish characters to use directly: `á é í ó ú ü ñ Á É Í Ó Ú Ü Ñ ¿ ¡ — – · ×`.
- If you see Mojibake in the codebase, stop and report it before making any other change.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## 6. Flujo Claude (líder técnico) + Codex (desarrollador)

**Aplica cuando el trabajo lo coordina Claude desde un chat del Project "ERP TIDEO Estandard" y lo ejecuta Codex vía el puente codexmcp.**

### Roles
- Claude: diagnostica, redacta prompts, revisa y verifica. Cristhian decide.
- Codex: ejecuta. Su informe no es evidencia hasta que se verifica con salida literal (archivo:línea, salida de comandos) o leyendo el repo directamente.

### Ciclo de trabajo
1. Diagnóstico en solo lectura. Termina con STOP.
2. Cristhian decide el alcance.
3. Implementación en escritura acotada (`workspace-write`, sin red), con lista cerrada de archivos permitidos.
4. Claude verifica por su cuenta: lee los archivos, ejecuta las pruebas y revisa el estado de git.
5. Correcciones agrupadas en un solo prompt. Si Codex omite algo, se reporta y se corrige.

### Estructura de cada prompt a Codex
Contexto → Objetivo → Restricciones → Checklist. Sin código dentro del prompt. Pedir evidencia literal y cerrar con STOP.

### Autonomía (reemplaza las prohibiciones anteriores, 2026-10-11)
Tras aprobar Cristhian el alcance, Claude trabaja en bucle (implementar → verificar → corregir) hasta cumplir el checklist, sin confirmaciones intermedias. Mientras Codex trabaja, Claude consulta `codex_job` hasta que termine. El único STOP del ciclo es el del diagnóstico, salvo las compuertas de abajo.

**Libre, sin preguntar**
- Lecturas, SELECT, pruebas, lint, build, `git status`, `git diff` y consultas de solo lectura al conector Supabase.
- Crear la rama de la feature (cada tarea en su propia rama, desde `origin/main` actualizado), `git add` por nombre de archivo (nunca `git add .`) y commits en esa rama. Codex puede ejecutar estos comandos git.
- SQL y migraciones directo en producción, solo en el proyecto Supabase "ERP - Tideo" (`atqwyjfidfoepthygfoo`), nunca en "Web Principal - Tideo". Cada cambio lleva un bloque de comprobación con `RAISE EXCEPTION` para revertirse solo si falla, y se verifica con SELECT después. El `.sql` de la migración se commitea en la rama.
- Migraciones aditivas (tablas, columnas, funciones, índices, políticas). Todo `CREATE OR REPLACE` de una función existente parte de `pg_get_functiondef` de la versión remota vigente, con diff; para `generar_cxp_centralizado` se ejecuta siempre `scripts/regression_cxp_centralizado_20260924.sql`.

**Requiere OK explícito de Cristhian**
- `DROP`, `TRUNCATE`, `DELETE` o `UPDATE` masivo sin `WHERE` acotado, y cambios de RLS que reduzcan acceso.
- `merge`, `push`, `supabase db push`, `stash`, `reset`, `clean`, `checkout` fuera de la rama de la feature, `worktree add` y desplegar edge functions.
- Instalar paquetes o dar red a Codex.

**Claude avisa y se detiene** si cambia el alcance, si algo afecta datos de otros tenants, o si un error persiste tras 3 intentos.

### SQL y base de datos
Todo trabajo apunta a producción; no existe proyecto de desarrollo ni branches de Supabase. Claude aplica el SQL con `apply_migration` o `execute_sql` según la sección Autonomía, con auto-reversión por `RAISE EXCEPTION` y verificación posterior. Los cambios destructivos se entregan como `BEGIN … ROLLBACK` y el COMMIT lo ejecuta Cristhian.

### Entorno
Windows / PowerShell: usar `Select-String`, no `grep`. Los PDF llevan la marca TIDEO. Las pruebas de la herramienta se hacen en un worktree descartable, nunca en la carpeta principal.

## 7. Sistema de diseño de pantallas (dx-ui)

Toda pantalla nueva o rediseñada de `operaciones-app` sigue **`docs/diseno/SISTEMA_DISENO.md`**. Léelo completo antes de escribir una línea de JSX o CSS.

- Se construye combinando las clases `dx-ui-*` y las variables `--dx-ui-*` de `operaciones-app/src/zahory-mock/styles/zahory.css` (sección "DX-UI base"). No se inventan colores, tipografías ni radios por pantalla.
- Las reglas propias de una pantalla llevan el prefijo `dx-<pantalla>-` y solo definen columnas, áreas móviles y contenido específico.
- El corte a tarjetas usa `@container (max-width:760px)` sobre `dx-ui-card`, nunca `@media`.
- Si falta algo en la base, se agrega a la base compartida, no a la pantalla.
- Referencia de código: el listado de `DiagnosticoTecnicoPage.jsx`. Primero un mock aprobado por Cristhian y después el código; verificación a 375, 800, 901, 1000, 1100 y 1280 px, claro y oscuro.

## 8. Manual de pantallas de Aria

Cuando se modifique una pantalla del piloto (Tesorería, Caja Chica o Compras / Gastos), revisa y actualiza la ficha correspondiente en `docs/manual-pantallas/` en el mismo cambio. Actualiza `revision` al commit que contiene la revisión, y ejecuta `node scripts/verificar-manual-pantallas.mjs` antes de cerrar el PR. Si cambian las fichas, regenera y revisa la migración con `node scripts/generar-manual-pantallas.mjs`.
