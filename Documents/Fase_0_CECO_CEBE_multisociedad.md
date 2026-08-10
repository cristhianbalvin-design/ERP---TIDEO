# Fase 0 — Preparación y control de migraciones

Fecha de verificación: 2026-08-10. Alcance: solo lectura sobre el proyecto
Supabase enlazado, excepto por la creación local de los artefactos de esta fase.
No se aplicó ninguna migración ni se modificaron datos remotos.

## 0.1 Unicidad societaria

Artefactos preparados, sin ejecutar:

- `supabase/migrations/417_unicidad_societaria_ceco_cebe.sql`
- `supabase/tests/417_unicidad_societaria_ceco_cebe_verificacion.sql`

La migración crea primero índices únicos `NULLS NOT DISTINCT` sobre
`(empresa_id, sociedad_id, codigo)` para ambos maestros y valida sus propiedades
antes de retirar las restricciones antiguas de `(empresa_id, codigo)`. Así un
tenant sin multisociedad no puede repetir un código con `sociedad_id IS NULL`,
y dos sociedades distintas del mismo tenant sí pueden reutilizarlo.

Resultado literal de compatibilidad:

```text
server_version_num=170006
PostgreSQL 17.6
```

Resultado literal del preflight de colisiones de CECO/CEBE por
`(empresa_id, sociedad_id, codigo)`:

```json
[]
```

## 0.2 Conciliación del registro de migraciones

El historial remoto llega hasta la versión 403; las versiones locales que no
figuran en `supabase_migrations.schema_migrations` se evaluaron contra el
esquema efectivo. La ausencia en ese registro no implica por sí sola que una
migración no se haya aplicado manualmente.

| Versión | Veredicto | Evidencia de esquema / motivo |
| --- | --- | --- |
| 319 | aplicada | La estructura de vigencia contractual está presente; verificación previa de la función de vigencia. |
| 324 | indeterminable | Quedan 7 códigos administrativos fuera de `ADM-<número>`; no permite saber si son posteriores al backfill o si este no se ejecutó. |
| 340 | aplicada | Existe `public.ingresos_extraordinarios`. |
| 346 | parcial | Se observaron campos asociados, pero la evidencia previa no identifica todas las columnas y objetos que la migración debía crear ni demuestra el total esperado. Queda fuera del registro selectivo. |
| 350 | aplicada | El check vigente contiene `Interno_Empresa`. |
| 351 | aplicada | El check vigente contiene `Capital_Propio`. |
| 358 | indeterminable | Su función importadora fue reemplazada por versiones posteriores. |
| 359 | indeterminable | Su función importadora fue reemplazada por versiones posteriores. |
| 360 | aplicada | `facturas.centro_beneficio_id` existe. |
| 361 | aplicada | Existe `public.servicio_precios_cliente`. |
| 362 | indeterminable | Su función importadora fue reemplazada por versiones posteriores. |
| 363 | no aplicada | El propio archivo declara explícitamente que nunca se aplicó y es un no-op descartado. |
| 395 | parcial | Persisten 10 de 11 políticas esperadas; `tenant_guias` ya no existe con esa definición. |
| 396 | aplicada | `sociedad_id` existe en `os_clientes`, `ordenes_trabajo` y `valorizaciones`; 402 amplió después la derivación de OT. |
| 397 | indeterminable | Sus rutas de escritura fueron sustituidas por migraciones posteriores. |
| 398 | aplicada | `crear_asignacion_jornada` conserva el marcador `JORNADA_HUECO_INVALIDO`. |
| 399 | indeterminable | `eliminar_asignacion_jornada` fue redefinida en versiones posteriores. |
| 400 | indeterminable | Los `DROP ... IF EXISTS` no dejan una huella que pruebe que las funciones existieron antes. |
| 401 | indeterminable | La misma RPC fue redefinida posteriormente. |
| 402 | aplicada | La función de derivación de OT contiene el marcador `v_sociedad_os_id`. |
| 404 | aplicada | Existen `usuarios_alcance_sociedades` y las fronteras societarias verificadas. |
| 405 | indeterminable | Los privilegios de sus funciones fueron modificados más adelante por 411/412. |
| 406 | aplicada | Ambas funciones masivas vigentes incluyen la validación de sociedad derivada. |
| 407 | aplicada | Existe el trigger de identidad societaria. |
| 408 | aplicada | Las tres tablas laborales verificadas tienen `sociedad_id`. |
| 409 | aplicada | Existe `trg_roles_sembrar_permiso_consolidado` y 73 filas especiales con `ver_consolidado_grupo`. |
| 410 | aplicada | Existe la tabla de tickets y la firma cerrada de `registrar_postulacion_publica`. |
| 411 | indeterminable | Sus ACL fueron continuadas por 412. |
| 412 | aplicada | La política de privilegios por defecto para funciones de `postgres` permanece en el esquema. |
| 413 | aplicada | Existe `generar_notificaciones_documentarias`. |
| 414 | aplicada | La RPC afectada conserva el rechazo de rutas legacy multisociedad. |
| 415 | aplicada | `crear_solicitud_rrhh` conserva el rechazo explícito para tenant multisociedad. |
| 416 | aplicada | Existen la función validadora y los 33 triggers `zz_validar_sociedad_obligatoria`. |
| 417 | no aplicada | Nueva migración preparada en esta fase; no se ejecutó. |

Resultados literales complementarios:

```json
{
  "migration_319_vigencia_efectiva": true,
  "migration_416": {"trigger_count": 33, "validator_function": true},
  "migration_351_check": true,
  "migration_346_columns": 3,
  "migration_340_table": true,
  "migration_360_column": true,
  "migration_361_table": true,
  "migration_398_marker": true,
  "migration_402_marker": true,
  "migration_406_markers": {"cxc": true, "cxp": true},
  "migration_409_objects": {"trigger": true, "permission_rows": 73},
  "migration_410_objects": {"tickets_table": true, "registrar_signature": true},
  "migration_414_marker": true,
  "migration_415_marker": true
}
```

El ACL por defecto que sustenta el veredicto de 412 quedó así:

```text
<global> / funciones: {postgres=X/postgres}
public   / funciones: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
```

La versión 417 y los veredictos `no aplicada`, `parcial` e
`indeterminable` quedan expresamente fuera del registro selectivo.

## Hallazgos ajenos al alcance actual — registrados, sin intervención

1. **Migración 395 / aislamiento RLS:** de las once políticas de aislamiento
   que esa migración definía, la política original `tenant_guias` no está
   presente. No se modifica en esta tarea.
2. **Migración 324 / códigos administrativos:** hay siete filas en
   `personal_administrativo` con código fuera del patrón `ADM-<número>`.
   No se normalizan ni se modifican en esta tarea.
