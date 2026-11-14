-- Vincula una OT recién creada con su origen de Confiabilidad (hallazgo del backlog y/o programa PM).
-- crear_orden_trabajo inserta una lista cerrada de columnas; esta función se llama justo después
-- para no modificar esa función. Al actualizar la OT se disparan los triggers de backlog (en_ot) y PM (OT activa).
create function public.conf_vincular_ot_origen(p_empresa_id text, p_ot_id text, p_backlog_id text, p_pm_programa_id uuid)
returns void language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_ot public.ordenes_trabajo;
begin
  if not (public.usuario_puede(p_empresa_id, 'ot', 'crear') or public.usuario_puede(p_empresa_id, 'ots', 'crear')) then
    raise exception 'No tiene permiso para vincular la OT.' using errcode = '42501';
  end if;
  select * into v_ot from public.ordenes_trabajo where id = p_ot_id and empresa_id = p_empresa_id for update;
  if not found then raise exception 'OT inexistente o de otra empresa.' using errcode = '22023'; end if;
  if p_backlog_id is not null then
    if not exists (select 1 from public.backlog where id = p_backlog_id and empresa_id = p_empresa_id) then
      raise exception 'Hallazgo inexistente o de otra empresa.' using errcode = '22023';
    end if;
    if v_ot.backlog_id is not null and v_ot.backlog_id <> p_backlog_id then
      raise exception 'La OT ya está vinculada a otro hallazgo.' using errcode = '22023';
    end if;
  end if;
  if p_pm_programa_id is not null then
    if not exists (select 1 from public.conf_pm_programas where id = p_pm_programa_id and empresa_id = p_empresa_id
                   and activo_id is not distinct from v_ot.equipo_id) then
      raise exception 'Programa PM inexistente, de otra empresa o de otro equipo.' using errcode = '22023';
    end if;
    if v_ot.pm_programa_id is not null and v_ot.pm_programa_id <> p_pm_programa_id then
      raise exception 'La OT ya está vinculada a otro programa PM.' using errcode = '22023';
    end if;
  end if;
  update public.ordenes_trabajo
     set backlog_id = coalesce(p_backlog_id, backlog_id),
         pm_programa_id = coalesce(p_pm_programa_id, pm_programa_id),
         updated_at = now()
   where id = v_ot.id;
end $$;
revoke all on function public.conf_vincular_ot_origen(text, text, text, uuid) from public, anon;
grant execute on function public.conf_vincular_ot_origen(text, text, text, uuid) to authenticated;

do $$ begin
  if to_regprocedure('public.conf_vincular_ot_origen(text,text,text,uuid)') is null then raise exception 'Falta conf_vincular_ot_origen'; end if;
  if has_function_privilege('anon','public.conf_vincular_ot_origen(text,text,text,uuid)','execute') then raise exception 'Privilegios incorrectos'; end if;
end $$;
