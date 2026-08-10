# Fase 1.2 — CECOs sin naturaleza económica asignada

La migración 419 no asigna valores a registros existentes. Como aún no se aplica, la columna no existe en la base actual; por ello este reporte contabiliza cada CECO existente que quedará con `naturaleza_economica = NULL` inmediatamente después de aplicar la migración.

| Tenant (hash) | CECOs sin naturaleza post-419 |
|---|---:|
| `31b6eb07de4d0e9433aa5dc29d9d7240` | 275 |
| `4429d48d4ea15def23f1e3f2d8ddbbdf` | 1 |
| `7e581b060559f50db7d0de79766def26` | 79 |
| `a191684822eb15df11a56d89c3cd9654` | 195 |
| `fc2a09a3ecc3daed2dcbf0e6b9e9f26f` | 13 |
| `fe783d921a5f63d4621626ae69c2adaf` | 69 |

**Total:** 632 CECOs pendientes de clasificación manual. No se propone ni se ejecuta ninguna asignación automática.
