\set ON_ERROR_STOP on
\encoding UTF8
set client_encoding = 'UTF8';
set lock_timeout = '5s';
set statement_timeout = '120s';
begin;
\ir ../supabase/migrations/20260926204955_obtener_mis_compras_campo.sql

select p.proname as funcion,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'obtener_mis_compras_campo';

select set_config('request.jwt.claim.sub', '67b0e438-8712-40c0-ae60-006fbdd3c577', true);
select jsonb_array_length(public.obtener_mis_compras_campo('emp_2000000000')) as compras_visibles_tecnico;

rollback;
select to_regprocedure('public.obtener_mis_compras_campo(text)') as funcion_persistente;
