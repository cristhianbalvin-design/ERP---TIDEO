-- Consolida almacenes bajo inventario.
-- El DELETE se renombra y ajusta en sitio: asi no coexisten dos politicas DELETE
-- ni existe una ventana, aun dentro de esta transaccion, sin politica DELETE.

do $preflight$
declare
  v_total integer;
  v_log integer;
  v_mst integer;
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'almacenes'
     and c.relrowsecurity is true
  ) then
    raise exception 'ALMACENES_RLS_PREFLIGHT: public.almacenes no tiene RLS habilitado.';
  end if;

  select count(*) into v_total
    from pg_policies
   where schemaname = 'public'
     and tablename = 'almacenes';

  select count(*) into v_log
    from pg_policies
   where schemaname = 'public'
     and tablename = 'almacenes'
     and policyname in (
       'log_almacenes_select',
       'log_almacenes_insert',
       'log_almacenes_update'
     );

  select count(*) into v_mst
    from pg_policies
   where schemaname = 'public'
     and tablename = 'almacenes'
     and policyname in (
       'mst_almacenes_select',
       'mst_almacenes_insert',
       'mst_almacenes_update',
       'mst_almacenes_delete'
     );

  if v_total <> 7 or v_log <> 3 or v_mst <> 4
     or exists (
       select 1
       from pg_policies
       where schemaname = 'public'
         and tablename = 'almacenes'
         and policyname = 'log_almacenes_delete'
     ) then
    raise exception
      'ALMACENES_RLS_PREFLIGHT: se esperaban 7 politicas (3 log, 4 mst, sin log DELETE); total=%, log=%, mst=%.',
      v_total, v_log, v_mst;
  end if;
end
$preflight$;

alter policy mst_almacenes_delete on public.almacenes
  rename to log_almacenes_delete;

alter policy log_almacenes_delete on public.almacenes
  using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'inventario', 'editar')
  );

drop policy mst_almacenes_select on public.almacenes;
drop policy mst_almacenes_insert on public.almacenes;
drop policy mst_almacenes_update on public.almacenes;

do $postflight$
declare
  v_total integer;
  v_log integer;
  v_mst integer;
begin
  select count(*) into v_total
    from pg_policies
   where schemaname = 'public'
     and tablename = 'almacenes';

  select count(*) into v_log
    from pg_policies
   where schemaname = 'public'
     and tablename = 'almacenes'
     and policyname in (
       'log_almacenes_select',
       'log_almacenes_insert',
       'log_almacenes_update',
       'log_almacenes_delete'
     );

  select count(*) into v_mst
    from pg_policies
   where schemaname = 'public'
     and tablename = 'almacenes'
     and policyname like 'mst_almacenes_%';

  if v_total <> 4 or v_log <> 4 or v_mst <> 0
     or not exists (
       select 1
       from pg_policies
       where schemaname = 'public'
         and tablename = 'almacenes'
         and policyname = 'log_almacenes_delete'
         and cmd = 'DELETE'
     ) then
    raise exception
      'ALMACENES_RLS_POSTFLIGHT: se esperaban 4 politicas log y 0 mst; total=%, log=%, mst=%.',
      v_total, v_log, v_mst;
  end if;
end
$postflight$;

select pg_notify('pgrst', 'reload schema');
