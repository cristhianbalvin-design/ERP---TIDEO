# Instrucciones para Gemini / Antigravity

> Mismo contenido que `AGENTS.md`; mantén ambos archivos iguales salvo este encabezado.

La fuente de verdad de las reglas del repositorio es **`CLAUDE.md`** en la raíz. Léelo completo antes de empezar; este archivo solo resume lo que no se puede omitir.

## 1. Catálogo de pantallas y manual de Aria (obligatorio)

**Todo desarrollo (pantalla, botón, flujo o permiso nuevo o modificado) se registra en el catálogo canónico y en su ficha del manual de Aria en el mismo cambio.** Detalle en `CLAUDE.md` §8.

- Pantalla nueva, movida o retirada: actualiza su entrada en `catalogo/pantallas.json`.
- Estado de la pantalla: `activa` solo si lee datos reales; si solo usa mock (`data.js`, `ZAHORY_SAC_DATA`, `*MOCK*`) o datos fijos, `maqueta`. `npm run verificar:catalogo` lo comprueba contra el código.
- Cambio en una pantalla que tiene ficha en `docs/manual-pantallas/`: revisa la ficha y ejecuta `node scripts/generar-manual-pantallas.mjs --actualizar-huellas`.
- Si cambió el catálogo, las fichas o las herramientas `asistente_*`: `node scripts/manual/catalogo.mjs generar` y `node scripts/generar-manual-pantallas.mjs`.
- Si cambia el contenido de algún `_sincronizar.sql`: sube en 1 la `revision` de `catalogo/sincronizacion.json` y regenera. Aplica los `_sincronizar.sql` en Supabase solo desde `main` actualizado; la base rechaza revisiones viejas y bloquea escrituras directas en esas tablas.
- Antes de cerrar: `npm run verificar:catalogo` y `npm run test:manual`. El workflow `catalogo-aria.yml` bloquea el PR si una ruta del código no está en el catálogo o si una ficha quedó desactualizada. Para escribir o revisar una ficha: `npm run manual:extraer -- <clave del catálogo>`.

## 2. Reglas de trabajo

- Trabaja solo en la rama que te indiquen; si tu rama es anterior al catálogo, trae `origin/main` antes de seguir.
- Si eres Codex trabajando desde un worktree: no ejecutes comandos git que escriban (add, commit, checkout, reset, stash); deja los cambios sin commitear.
- Nunca `git add .`; siempre archivos por nombre.
- Archivos en UTF-8 sin mojibake (`CLAUDE.md` §5). Ediciones acotadas; no reescribas archivos completos.
- Pantallas nuevas o rediseños: sistema de diseño dx (`CLAUDE.md` §7 y `docs/diseno/SISTEMA_DISENO.md`), mock aprobado antes de codificar.
- SQL y migraciones: protocolo de `CLAUDE.md` §6 (bloque de comprobación con `RAISE EXCEPTION`, verificación posterior; nada destructivo sin autorización).
- Informa con evidencia literal (archivo:línea, salida de comandos). No declares algo hecho sin haberlo verificado.
