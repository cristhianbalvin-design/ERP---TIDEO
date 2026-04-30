# Scripts Supabase

## Generar SQL Combinado

Desde la raiz del proyecto:

```powershell
powershell -ExecutionPolicy Bypass -File supabase/scripts/build_combined_sql.ps1
```

Esto genera:

```text
supabase/generated/tideo_erp_setup.sql
```

Ese archivo concatena schemas, politicas y seeds en el orden correcto para una primera carga manual en SQL Editor de Supabase.

## Uso Recomendado

1. Revisar los archivos individuales en `supabase/schemas`, `supabase/policies` y `supabase/seeds`.
2. Ejecutar el script de combinado.
3. Abrir `supabase/generated/tideo_erp_setup.sql`.
4. Probar primero en un proyecto Supabase limpio de desarrollo.
5. Reemplazar UUID demo de `usuarios_empresas` por usuarios reales de Supabase Auth.
6. Ejecutar pruebas de RLS documentadas en `supabase/CHECKLIST_CONEXION.md`.

## Nota

El SQL combinado es un artefacto generado. Si se cambia algun schema, politica o seed, volver a ejecutar el script.

## Validacion Estatica

Desde la raiz del proyecto:

```powershell
powershell -ExecutionPolicy Bypass -File supabase/scripts/validate_sql_static.ps1
```

Esta validacion revisa:

- Que existan todos los archivos esperados.
- Que no haya tablas duplicadas.
- Que las tablas con `empresa_id` tengan RLS habilitado.
- Que las tablas con `empresa_id` tengan una policy tenant.
- Que el SQL combinado contenga todos los marcadores de fuente.

## Permisos Por Rol

`policies/003_role_permissions.sql` agrega funciones reutilizables:

- `usuario_puede(empresa_id, pantalla, accion)`
- `usuario_es_admin_empresa(empresa_id)`

La primera aplicacion fuerte esta en tablas financieras criticas: financiamientos, tabla de amortizacion, pagos, compras/gastos y movimientos de tesoreria.
