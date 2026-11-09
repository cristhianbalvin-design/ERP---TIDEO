-- Demo PRUEBA · 19 Borrar respaldo previo a la carga demo y el esquema auxiliar demo_seed (autorizado por Cristhian 2026-11-09)
-- Ya ejecutado en producción como migración demo_prueba_borrar_respaldos.
drop schema if exists respaldo_prueba_20261108 cascade;
drop schema if exists demo_seed cascade;
do $$ begin
  if exists (select 1 from pg_namespace where nspname in ('respaldo_prueba_20261108', 'demo_seed')) then
    raise exception 'los esquemas siguen existiendo';
  end if;
  if (select count(*) from public.facturas where empresa_id = 'emp_2000000000') < 33 then
    raise exception 'datos del demo afectados';
  end if;
end $$;
