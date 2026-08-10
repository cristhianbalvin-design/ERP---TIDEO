# Fase 1.3 — Reporte de consolidación aprobada de tipos CECO

Consulta read-only previa a la migración. El universo verificado al momento
del reporte es de 632 CECOs; la migración 420 no depende de ese conteo y
aborta únicamente si aparece un tipo fuera del mapeo aprobado.

| Tenant (hash) | Tipo origen | Tipo destino | Filas |
| --- | --- | --- | ---: |
| `31b6eb07de4d0e9433aa5dc29d9d7240` | areas | area_funcional | 18 |
| `31b6eb07de4d0e9433aa5dc29d9d7240` | cliente | area_funcional | 32 |
| `31b6eb07de4d0e9433aa5dc29d9d7240` | componente | area_funcional | 16 |
| `31b6eb07de4d0e9433aa5dc29d9d7240` | equipo | area_funcional | 82 |
| `31b6eb07de4d0e9433aa5dc29d9d7240` | fabricacion | area_funcional | 2 |
| `a191684822eb15df11a56d89c3cd9654` | areas | area_funcional | 18 |
| `a191684822eb15df11a56d89c3cd9654` | cliente | area_funcional | 32 |
| `a191684822eb15df11a56d89c3cd9654` | componente | area_funcional | 16 |
| `a191684822eb15df11a56d89c3cd9654` | equipo | area_funcional | 82 |
| `a191684822eb15df11a56d89c3cd9654` | fabricacion | area_funcional | 2 |

Totales a cambiar: 150 filas en cada uno de dos tenants, 300 filas en total.
Los 332 CECO restantes ya están en `area_funcional`, `proyecto` o `temporal`.

Antes de cada uno de los 300 cambios, la migración copia el tipo actual en
`tipo_original` para las 632 filas. Esa columna queda protegida por trigger:
no se permite editarla ni informarla en filas nuevas.
