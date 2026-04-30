-- TIDEO ERP - RLS smoke tests
-- Ejecutar despues de aplicar schemas, policies y seeds.
-- En SQL Editor, correr bloque por bloque y revisar resultados esperados.

-- ============================================================
-- Helper: simular auth.uid() en SQL Editor
-- ============================================================
-- Supabase auth.uid() lee request.jwt.claim.sub. Estos settings permiten
-- simular usuarios autenticados durante una sesion SQL.

-- Usuario admin emp_001
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Debe ver financiamientos de emp_001.
select 'emp_001 admin ve fin_001' as prueba, count(*) as resultado
from public.financiamientos
where id = 'fin_001';

-- No debe ver financiamiento de emp_002.
select 'emp_001 admin NO ve fin_101' as prueba, count(*) as resultado
from public.financiamientos
where id = 'fin_101';

-- Debe ver movimientos de tesoreria emp_001.
select 'emp_001 admin ve tesoreria' as prueba, count(*) as resultado
from public.movimientos_tesoreria
where empresa_id = 'emp_001';

-- ============================================================
-- Usuario finanzas emp_001
-- ============================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Debe ver financiamientos por permiso financiero.
select 'finanzas emp_001 ve financiamientos' as prueba, count(*) as resultado
from public.financiamientos
where empresa_id = 'emp_001';

-- Debe ver compras_gastos financieros.
select 'finanzas emp_001 ve gastos financieros' as prueba, count(*) as resultado
from public.compras_gastos
where empresa_id = 'emp_001'
  and categoria = 'Gastos financieros';

-- No debe ver datos de emp_002.
select 'finanzas emp_001 NO ve emp_002' as prueba, count(*) as resultado
from public.financiamientos
where empresa_id = 'emp_002';

-- ============================================================
-- Usuario admin emp_002
-- ============================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Debe ver solo financiamiento de emp_002.
select 'admin emp_002 ve fin_101' as prueba, count(*) as resultado
from public.financiamientos
where id = 'fin_101';

-- No debe ver financiamientos emp_001.
select 'admin emp_002 NO ve emp_001' as prueba, count(*) as resultado
from public.financiamientos
where empresa_id = 'emp_001';

-- ============================================================
-- Usuario sin tenant
-- ============================================================
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009999', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- No debe ver ninguna tabla transaccional.
select 'sin tenant no ve financiamientos' as prueba, count(*) as resultado
from public.financiamientos;

select 'sin tenant no ve cuentas' as prueba, count(*) as resultado
from public.cuentas;
