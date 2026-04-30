# Supabase - TIDEO ERP

## Proposito

Esta carpeta contiene la base inicial para migrar el prototipo React + mocks hacia Supabase con arquitectura SaaS multitenant. Los SQL estan separados por dominio para facilitar revision, ejecucion controlada y evolucion por fases.

## Orden De Ejecucion

Ejecutar los archivos en este orden:

1. `schemas/001_platform.sql`
2. `schemas/002_access.sql`
3. `schemas/003_business_core.sql`
4. `schemas/004_finance.sql`
5. `schemas/005_operations.sql`
6. `schemas/006_purchasing_inventory.sql`
7. `schemas/007_hr_cs_ai.sql`
8. `policies/000_access_rls.sql`
9. `policies/001_tenant_rls.sql`
10. `policies/002_domain_rls.sql`
11. `policies/003_role_permissions.sql`
12. `policies/004_domain_permissions.sql`
13. `seeds/001_demo_tenants.sql`

## Generar Un SQL Combinado

Tambien puedes generar un unico archivo ordenado para probar en SQL Editor:

```powershell
powershell -ExecutionPolicy Bypass -File supabase/scripts/build_combined_sql.ps1
```

Salida:

```text
supabase/generated/tideo_erp_setup.sql
```

## Llaves Necesarias Para Frontend

Cuando conectemos la app React, solo se necesitara:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

No usar `service_role` en el frontend. Esa llave solo debe usarse en backend, scripts privados o entornos controlados.

## Notas De Seguridad

- Todas las tablas transaccionales tienen `empresa_id`.
- RLS usa `public.usuario_tiene_empresa(empresa_id)`.
- `usuarios_empresas.user_id` debe coincidir con `auth.uid()`.
- Las politicas actuales validan pertenencia al tenant. El siguiente endurecimiento debe incorporar permisos por rol y pantalla.

## Pendiente Antes De Produccion

- Agregar migraciones formales con Supabase CLI.
- Reemplazar IDs demo por usuarios reales de `auth.users`.
- Agregar tests de RLS: usuario tenant A no puede leer tenant B.
- Afinar constraints de estados por modulo.
- Agregar triggers `updated_at`.
- Agregar auditoria automatica para operaciones criticas.

## Pruebas Manuales

Despues de aplicar el SQL combinado en un proyecto de desarrollo, usar:

```text
supabase/tests/rls_smoke_tests.sql
```

Estas pruebas simulan usuarios demo y verifican aislamiento por tenant y permisos financieros basicos.
