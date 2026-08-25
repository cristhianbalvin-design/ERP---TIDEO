-- 455 · Órdenes de trabajo: eliminar policy UPDATE permissive sin permiso.
--
-- DIFERENCIA #1 — ejecutar y confirmar antes de habilitar acciones de escritura
-- desde Operativo. Esta migración no recrea ops_ot_update: exige que la policy
-- estricta ya exista y que conserve permiso ot/editar + alcance societario.
--
-- IMPACTO A REVISAR ANTES DEL COMMIT REAL (solo lectura):
-- select
--   ue.empresa_id,
--   coalesce(e.nombre_comercial, e.razon_social) as empresa,
--   r.id as rol_id,
--   r.nombre as rol_nombre,
--   ue.user_id
-- from public.usuarios_empresas ue
-- join public.roles r on r.id = ue.rol_id
-- join public.empresas e on e.id = ue.empresa_id
-- where ue.estado = 'activo'
--   and coalesce(r.activo, true)
--   and not coalesce(r.es_admin_empresa, false)
--   and not coalesce(r.es_superadmin, false)
--   and not exists (
--     select 1
--     from public.permisos_roles pr
--     where pr.rol_id = ue.rol_id
--       and pr.pantalla = 'ot'
--       and coalesce(pr.puede_editar, false)
--   )
-- order by empresa, rol_nombre, ue.user_id;
--
-- DRY RUN MANUAL — ejecutar este cuerpo completo dentro de BEGIN/ROLLBACK:
-- begin;
--
-- select policyname, cmd, qual, with_check
-- from pg_policies
-- where schemaname = 'public'
--   and tablename = 'ordenes_trabajo'
--   and cmd = 'UPDATE'
-- order by policyname;
--
-- Ejecutar el cuerpo de esta migración.
--
-- select policyname, cmd, qual, with_check
-- from pg_policies
-- where schemaname = 'public'
--   and tablename = 'ordenes_trabajo'
--   and cmd = 'UPDATE'
-- order by policyname;
--
-- rollback;
--
-- APLICACIÓN MANUAL — después de revisar el dry run:
-- begin;
-- Ejecutar el cuerpo de esta migración.
-- commit;
--
-- POST-COMMIT ESPERADO:
-- exactamente una policy UPDATE: ops_ot_update, con usuario_puede(..., 'ot',
-- 'editar') y usuario_alcance_sociedades(...), tanto en USING como WITH CHECK.

set local lock_timeout = '15s';
set local statement_timeout = '5min';

-- Falla de forma segura si el juego estricto no está presente o fue alterado.
do $verificar_ops_ot_update_antes$
declare
  v_qual text;
  v_with_check text;
begin
  select qual, with_check
    into v_qual, v_with_check
  from pg_policies
  where schemaname = 'public'
    and tablename = 'ordenes_trabajo'
    and policyname = 'ops_ot_update'
    and cmd = 'UPDATE';

  if not found then
    raise exception
      'RLS_OT_PREFLIGHT: falta ops_ot_update; no es seguro retirar ordenes_trabajo_update.';
  end if;

  if strpos(coalesce(v_qual, ''), 'usuario_tiene_empresa') = 0
     or strpos(coalesce(v_qual, ''), 'usuario_puede') = 0
     or strpos(coalesce(v_qual, ''), '''ot''') = 0
     or strpos(coalesce(v_qual, ''), '''editar''') = 0
     or strpos(coalesce(v_qual, ''), 'usuario_alcance_sociedades') = 0
     or strpos(coalesce(v_with_check, ''), 'usuario_tiene_empresa') = 0
     or strpos(coalesce(v_with_check, ''), 'usuario_puede') = 0
     or strpos(coalesce(v_with_check, ''), '''ot''') = 0
     or strpos(coalesce(v_with_check, ''), '''editar''') = 0
     or strpos(coalesce(v_with_check, ''), 'usuario_alcance_sociedades') = 0 then
    raise exception
      'RLS_OT_PREFLIGHT: ops_ot_update no conserva empresa + permiso ot/editar + alcance societario en USING/WITH CHECK.';
  end if;
end;
$verificar_ops_ot_update_antes$;

-- Policy legacy de 065: es PERMISSIVE y no exige usuario_puede(..., 'ot',
-- 'editar'), por lo que neutraliza ops_ot_update mediante OR.
drop policy if exists ordenes_trabajo_update on public.ordenes_trabajo;

-- Después del DROP debe quedar únicamente la policy UPDATE estricta ya existente.
do $verificar_ops_ot_update_despues$
declare
  v_total_update integer;
begin
  select count(*)
    into v_total_update
  from pg_policies
  where schemaname = 'public'
    and tablename = 'ordenes_trabajo'
    and cmd = 'UPDATE';

  if v_total_update <> 1
     or not exists (
       select 1
       from pg_policies
       where schemaname = 'public'
         and tablename = 'ordenes_trabajo'
         and policyname = 'ops_ot_update'
         and cmd = 'UPDATE'
     ) then
    raise exception
      'RLS_OT_POSTFLIGHT: se esperaba únicamente ops_ot_update como policy UPDATE; se encontraron % policies.',
      v_total_update;
  end if;
end;
$verificar_ops_ot_update_despues$;

select pg_notify('pgrst', 'reload schema');
