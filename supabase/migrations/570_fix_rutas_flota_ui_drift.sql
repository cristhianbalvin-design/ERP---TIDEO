-- Correccion del drift entre la migracion reconstruida 569 y la UI de Rutas.
-- No toca RLS, politicas, triggers ni datos de las tablas existentes.

do $fix_ruta_paradas_estado$
begin
  if to_regclass('public.ruta_paradas') is null then
    raise exception '570_PREFLIGHT: falta public.ruta_paradas';
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid='public.ruta_paradas'::regclass
      and conname='ruta_paradas_estado_check'
  ) then
    alter table public.ruta_paradas drop constraint ruta_paradas_estado_check;
  end if;

  alter table public.ruta_paradas
    add constraint ruta_paradas_estado_check
    check (estado in ('pendiente','en_curso','completada','omitida'));
end
$fix_ruta_paradas_estado$;

alter table public.mantenimientos_flota
  add column if not exists gasto_id text;

alter table public.mantenimientos_flota
  add column if not exists proximo_mantenimiento_km integer;

do $fix_mantenimiento_km$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid='public.mantenimientos_flota'::regclass
      and conname='mantenimientos_flota_proximo_mantenimiento_km_check'
  ) then
    alter table public.mantenimientos_flota
      add constraint mantenimientos_flota_proximo_mantenimiento_km_check
      check (proximo_mantenimiento_km is null or proximo_mantenimiento_km >= 0);
  end if;
end
$fix_mantenimiento_km$;

do $postflight_rutas_flota_fix$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid='public.ruta_paradas'::regclass
      and conname='ruta_paradas_estado_check'
      and pg_get_constraintdef(oid) ilike '%omitida%'
      and pg_get_constraintdef(oid) not ilike '%cancelada%'
  ) then
    raise exception '570_POSTFLIGHT: ruta_paradas.estado no fue corregido a omitida';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='mantenimientos_flota'
      and column_name='gasto_id'
  ) then
    raise exception '570_POSTFLIGHT: falta mantenimientos_flota.gasto_id';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='mantenimientos_flota'
      and column_name='proximo_mantenimiento_km'
  ) then
    raise exception '570_POSTFLIGHT: falta mantenimientos_flota.proximo_mantenimiento_km';
  end if;
end
$postflight_rutas_flota_fix$;

select pg_notify('pgrst','reload schema');
