-- Backlog: las políticas antiguas backlog_select/insert/update (solo usuario_tiene_empresa) anulaban
-- las ops_backlog_* que exigen usuario_puede(empresa,'backlog',accion): cualquier miembro del tenant
-- podía leer, crear y editar hallazgos por la API aunque su rol no tuviera permiso de Backlog.
-- Autorizado por Cristhian 2026-11-14. Probado antes con transacción revertida:
-- rol sin permiso (Asesor Comercial) ver=0 / insertar=NO / editar=0; rol con permiso (Técnico Operativo) sin cambios.
drop policy if exists backlog_select on public.backlog;
drop policy if exists backlog_insert on public.backlog;
drop policy if exists backlog_update on public.backlog;

do $$
begin
  if exists (select 1 from pg_policy where polrelid='public.backlog'::regclass and polname in ('backlog_select','backlog_insert','backlog_update')) then
    raise exception 'Quedan políticas antiguas en backlog';
  end if;
  if (select count(*) from pg_policy where polrelid='public.backlog'::regclass and polname in ('ops_backlog_select','ops_backlog_insert','ops_backlog_update','backlog_delete')) <> 4 then
    raise exception 'Faltan las políticas ops_backlog_* o backlog_delete';
  end if;
end $$;
