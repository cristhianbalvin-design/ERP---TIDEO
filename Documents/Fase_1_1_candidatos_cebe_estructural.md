# Fase 1.1 — Candidatos CEBE estructural

Reporte read-only para revisión manual. No reclasifica registros.

Se aplicaron dos señales independientes:

- **Señal fuerte:** código o nombre con vocabulario administrativo/corporativo.
- **Señal de revisión:** `meta_ingresos` nula o igual a cero. Por sí sola no
  decide una reclasificación.

| Tenant (hash) | Candidatos por meta cero | Candidatos con señal fuerte |
| --- | ---: | --- |
| `31b6eb07de4d0e9433aa5dc29d9d7240` | 22 | `CEBE-000` — TIDEO Corporativo / Común |
| `4429d48d4ea15def23f1e3f2d8ddbbdf` | 1 | — |
| `7e581b060559f50db7d0de79766def26` | 11 | `CEBE-ADM-001` — General administrativo |
| `a191684822eb15df11a56d89c3cd9654` | 0 | — |
| `fc2a09a3ecc3daed2dcbf0e6b9e9f26f` | 7 | `CEBE-000` — TIDEO Corporativo / Común |
| `fe783d921a5f63d4621626ae69c2adaf` | 13 | `CEBE-001` — GERENCIAL |

Los cuatro candidatos con señal fuerte requieren decisión del tenant. Los
cincuenta y cuatro casos con meta cero son una lista de revisión amplia, no
una instrucción de cambio automático.
