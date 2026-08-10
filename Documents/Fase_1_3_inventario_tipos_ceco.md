# Fase 1.3 — Inventario y propuesta de normalización de tipos CECO

Consulta read-only ejecutada antes de modificar cualquier fila.

| Tenant (hash) | Tipo actual | Cantidad |
| --- | --- | ---: |
| `31b6eb07de4d0e9433aa5dc29d9d7240` | area_funcional | 68 |
| `31b6eb07de4d0e9433aa5dc29d9d7240` | areas | 18 |
| `31b6eb07de4d0e9433aa5dc29d9d7240` | cliente | 32 |
| `31b6eb07de4d0e9433aa5dc29d9d7240` | componente | 16 |
| `31b6eb07de4d0e9433aa5dc29d9d7240` | equipo | 82 |
| `31b6eb07de4d0e9433aa5dc29d9d7240` | fabricacion | 2 |
| `31b6eb07de4d0e9433aa5dc29d9d7240` | proyecto | 53 |
| `31b6eb07de4d0e9433aa5dc29d9d7240` | temporal | 4 |
| `4429d48d4ea15def23f1e3f2d8ddbbdf` | area_funcional | 1 |
| `7e581b060559f50db7d0de79766def26` | area_funcional | 38 |
| `7e581b060559f50db7d0de79766def26` | proyecto | 41 |
| `a191684822eb15df11a56d89c3cd9654` | area_funcional | 1 |
| `a191684822eb15df11a56d89c3cd9654` | areas | 18 |
| `a191684822eb15df11a56d89c3cd9654` | cliente | 32 |
| `a191684822eb15df11a56d89c3cd9654` | componente | 16 |
| `a191684822eb15df11a56d89c3cd9654` | equipo | 82 |
| `a191684822eb15df11a56d89c3cd9654` | fabricacion | 2 |
| `a191684822eb15df11a56d89c3cd9654` | proyecto | 44 |
| `fc2a09a3ecc3daed2dcbf0e6b9e9f26f` | area_funcional | 12 |
| `fc2a09a3ecc3daed2dcbf0e6b9e9f26f` | temporal | 1 |
| `fe783d921a5f63d4621626ae69c2adaf` | area_funcional | 57 |
| `fe783d921a5f63d4621626ae69c2adaf` | proyecto | 9 |
| `fe783d921a5f63d4621626ae69c2adaf` | temporal | 3 |

## Conjunto normalizado aprobado

| Tipo actual | Tipo propuesto | Criterio |
| --- | --- | --- |
| `area_funcional` | `area_funcional` | Área organizativa u operativa permanente. |
| `areas` | `area_funcional` | Es el plural del mismo concepto; no agrega semántica. |
| `cliente` | `area_funcional` | Describe destinatario, no ciclo de vida finito. |
| `componente` | `area_funcional` | Describe objeto técnico; el valor original se preserva antes de consolidar. |
| `equipo` | `area_funcional` | Describe activo; el valor original se preserva antes de consolidar. |
| `fabricacion` | `area_funcional` | Describe capacidad/proceso; el valor original se preserva antes de consolidar. |
| `proyecto` | `proyecto` | Centro de duración acotada. |
| `temporal` | `temporal` | Centro transitorio. |

La migración 420 preparada preserva primero `tipo_original` para las 632
filas y, dentro de la misma transacción, normaliza el tipo y crea el check
de tres valores. No se ha aplicado ni modificado ninguna fila remota.
