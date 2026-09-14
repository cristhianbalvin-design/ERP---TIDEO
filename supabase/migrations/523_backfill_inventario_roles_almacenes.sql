-- Backfill puntual previo a retirar la ruta RLS de Maestros para almacenes.
-- Solo cubre los dos roles confirmados en producción y no concede anular,
-- aprobar, exportar, costos, finanzas ni permisos_extra.

do $preflight$
declare
  v_roles integer;
  v_permisos integer;
begin
  select count(*)
    into v_roles
    from public.roles r
   where (r.empresa_id, r.id) in (
     ('emp_20541435833', 'rol_emp_20541435833_comercial_asesor'),
     ('emp_20606120487', 'rol_emp_20606120487_op533')
   )
     and r.activo is true;

  if v_roles <> 2 then
    raise exception 'INVENTARIO_BACKFILL_PREFLIGHT: se esperaban 2 roles activos y se encontraron %.', v_roles;
  end if;

  select count(*)
    into v_permisos
    from public.permisos_roles pr
   where pr.pantalla = 'inventario'
     and pr.rol_id in (
       'rol_emp_20541435833_comercial_asesor',
       'rol_emp_20606120487_op533'
     );

  if v_permisos <> 2 then
    raise exception 'INVENTARIO_BACKFILL_PREFLIGHT: se esperaban 2 filas inventario y se encontraron %.', v_permisos;
  end if;
end
$preflight$;

update public.permisos_roles pr
set puede_ver = true,
    puede_crear = true,
    puede_editar = true,
    updated_at = now()
from public.roles r
where r.id = pr.rol_id
  and pr.pantalla = 'inventario'
  and (r.empresa_id, r.id) in (
    ('emp_20541435833', 'rol_emp_20541435833_comercial_asesor'),
    ('emp_20606120487', 'rol_emp_20606120487_op533')
  );

do $postflight$
declare
  v_permisos integer;
begin
  select count(*)
    into v_permisos
    from public.permisos_roles pr
   where pr.pantalla = 'inventario'
     and pr.rol_id in (
       'rol_emp_20541435833_comercial_asesor',
       'rol_emp_20606120487_op533'
     )
     and pr.puede_ver is true
     and pr.puede_crear is true
     and pr.puede_editar is true;

  if v_permisos <> 2 then
    raise exception 'INVENTARIO_BACKFILL_POSTFLIGHT: se esperaban 2 permisos inventario con ver/crear/editar y se encontraron %.', v_permisos;
  end if;
end
$postflight$;

select pg_notify('pgrst', 'reload schema');
