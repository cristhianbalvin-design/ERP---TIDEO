# Tests SQL Supabase

## Proposito

Estos archivos son pruebas manuales de humo para ejecutar despues de cargar `supabase/generated/tideo_erp_setup.sql` en un proyecto Supabase de desarrollo.

## Orden

1. Ejecutar `supabase/generated/tideo_erp_setup.sql`.
2. Abrir `tests/rls_smoke_tests.sql`.
3. Ejecutar bloque por bloque en SQL Editor.
4. Confirmar que los resultados esperados coinciden.

## Usuarios Demo

Los seeds usan UUID demo:

- `00000000-0000-0000-0000-000000000001`: admin `emp_001`.
- `00000000-0000-0000-0000-000000000002`: finanzas `emp_001`.
- `00000000-0000-0000-0000-000000000003`: admin `emp_002`.

En un proyecto Supabase real, estos UUID deben reemplazarse por usuarios existentes de `auth.users`.
