# Checklist De Conexion Supabase

## Antes De Pedir Llaves

- Revisar que los SQL compilen en un proyecto Supabase limpio.
- Confirmar si usaremos Supabase CLI o SQL Editor manual para la primera carga.
- Crear usuarios reales en Auth para reemplazar UUID demo.
- Validar RLS con al menos dos usuarios de tenants distintos.
- Definir variables `.env.local` sin commitearlas.

## Variables Frontend

```env
VITE_DATA_MODE=supabase
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Estado local:
- `.env.local` creado con `VITE_DATA_MODE=supabase`.
- `.gitignore` protege `.env`, `.env.*` y permite versionar solo `.env.example`.
- Build frontend OK en modo Supabase.
- Prueba de red contra Supabase OK, pero el proyecto remoto aun no tiene `public.empresas`.

## Dependencia Frontend

Instalada para poder activar la conexion real:

```powershell
npm install @supabase/supabase-js
```

La app ya tiene preparada la capa `src/lib/supabaseClient.js`. Para usarla en runtime faltan las variables del proyecto Supabase en `.env.local`.

## Modo De Datos

Por defecto la app corre con mocks:

```env
VITE_DATA_MODE=mock
```

Para activar repositorios Supabase:

```env
VITE_DATA_MODE=supabase
```

El primer modulo preparado para este cambio es Financiamiento y Deuda mediante `createFinanciamientosDataSource`.

`src/context.jsx` ya carga en modo lectura:
- `financiamientos`
- `tabla_amortizacion`
- `pagos_financiamiento`
- `compras_gastos`
- `movimientos_tesoreria`

Los pagos avanzados, abonos persistidos y recalculos transaccionales quedan para una fase posterior mediante RPC/edge function. En este paso no se configuro pasarela ni automatizacion de pagos.

## No Solicitar Para Frontend

```env
SUPABASE_SERVICE_ROLE_KEY=
```

La service role key solo debe existir en backend o scripts privados.

## Pruebas Minimas De RLS

1. Usuario de `emp_001` puede leer `fin_001`.
2. Usuario de `emp_001` no puede leer `fin_101`.
3. Usuario de `emp_002` puede leer `fin_101`.
4. Usuario no asociado a una empresa no lee tablas transaccionales.
5. Insercion con `empresa_id` distinto al tenant activo debe fallar.
6. Usuario sin permiso `financiamiento.ver` no puede leer `financiamientos`.
7. Usuario sin permiso `tesoreria.ver` no puede leer `movimientos_tesoreria`.
8. Usuario sin permiso financiero no puede leer `compras_gastos` de categoria financiera.
9. Usuario sin permiso `ots.ver` no puede leer `ordenes_trabajo`.
10. Usuario sin permiso `proveedores.ver` no puede leer `proveedores`.
11. Usuario sin permiso `nomina.ver_finanzas` no puede leer `periodos_nomina`.
12. Usuario sin permiso `ia_financiera.ver` no puede leer logs de IA financiera.

## Funciones RLS Clave

```sql
public.usuario_tiene_empresa(target_empresa_id text)
public.usuario_puede(target_empresa_id text, target_pantalla text, target_accion text)
public.usuario_es_admin_empresa(target_empresa_id text)
```

`usuario_tiene_empresa` valida aislamiento tenant.  
`usuario_puede` valida permisos por rol/pantalla/accion.  
`usuario_es_admin_empresa` queda disponible para acciones administrativas.

## Primer Modulo A Conectar

Financiamiento y Deuda.

Motivo:
- Ya tiene servicio propio.
- Tiene registros dependientes: amortizacion, pagos, gastos financieros y tesoreria.
- Valida multimoneda y reglas contables.

## Siguiente Bloqueo

Ejecutar `supabase/generated/tideo_erp_setup.sql` en el SQL Editor del proyecto Supabase.

Sin ese setup, el frontend ya llega al proyecto, pero Supabase responde que no existen las tablas base.

## Auth Frontend Minimo

Estado:
- `src/AuthGate.jsx` agregado para login/signup con Supabase Auth.
- `src/context.jsx` escucha la sesion real y carga datos financieros solo con usuario autenticado.
- `supabase/migrations/008_auth_frontend_access.sql` agregado para policies de lectura de plataforma.

Orden para activar lectura real:
1. Crear usuario desde la pantalla de la app o desde Supabase Auth.
2. Ejecutar `supabase/migrations/008_auth_frontend_access.sql`.
3. En el bloque final comentado de esa migracion, reemplazar el email por el usuario real y ejecutarlo para vincularlo a `emp_001`.
4. Iniciar sesion en la app.
